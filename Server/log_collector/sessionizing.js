// sessionizing.js (Single-log classification / Idempotent / ESM) — only PASSed-by-ModSec -> classify
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 1000);
const CLASSIFIER_ENDPOINT =
  process.env.CLASSIFIER_ENDPOINT || 'http://ai_classifier:3002/api/classify';
const DEBUG_CLASSIFIER = process.env.DEBUG_CLASSIFIER === '1';
const CLASSIFIER_TIMEOUT_MS = Number(process.env.CLASSIFIER_TIMEOUT_MS || 120000);

const MAX_BODY_CHARS = Number(process.env.MAX_BODY_CHARS || 300);
const MAX_UA_CHARS = Number(process.env.MAX_UA_CHARS || 120);

// ===== label/conf normalize (model_inference.py 호환) =====
function toSessionLabelEnum(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.startsWith('normal') || s.includes('benign')) return 'NORMAL';
  if (s.includes('sql')) return 'SQL_INJECTION';
  if (s.includes('code')) return 'CODE_INJECTION';
  if (s.includes('path') || s.includes('traversal')) return 'PATH_TRAVERSAL';
  if (s === 'attack' || s.includes('malicious')) return 'MALICIOUS';
  return 'MALICIOUS';
}

function toConfidenceEnum(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'high') return 'HIGH';
  if (s === 'medium') return 'LOW';
  if (s === 'low') return 'LOW';
  return null;
}

function normalizeClassifierResult(res) {
  const label =
    res?.classification != null
      ? toSessionLabelEnum(res.classification)
      : (res?.label || 'NORMAL');

  let confidence = toConfidenceEnum(res?.confidence);
  if (!confidence) confidence = 'LOW';

  return { ...res, label, confidence };
}

// (백업) 휴리스틱: "영구 실패(대개 4xx)" 때만 사용
function heuristicLabel(texts) {
  const text = (texts || []).join(' ').toLowerCase();
  const hasSQLi = /('|%27|--|\bunion\b|\bselect\b|\bdrop\b|\binsert\b|\border by\b)/i.test(text);
  const hasXSS = /(<script|onerror=|onload=|<img|<iframe|javascript:)/i.test(text);
  if (hasSQLi) return 'SQL_INJECTION';
  if (hasXSS) return 'CODE_INJECTION';
  return 'NORMAL';
}

async function classifySingleLog(aiRequest, fallbackTexts = []) {
  try {
    const { data } = await axios.post(
      CLASSIFIER_ENDPOINT,
      { session: [aiRequest] },
      { timeout: CLASSIFIER_TIMEOUT_MS }
    );

    return {
      classification: data?.classification ?? null,
      confidence: data?.confidence ?? null,
      classifier_raw: data?.raw_response ?? null,
    };
  } catch (err) {
    const status = err?.response?.status ?? null;
    const msg = err?.response
      ? `${err.response.status} ${JSON.stringify(err.response.data)}`
      : (err?.message || String(err));

    const isTimeout =
      String(err?.code || '').toUpperCase() === 'ECONNABORTED' ||
      /timeout/i.test(String(err?.message || ''));

    const isRetryable =
      isTimeout ||
      status === 429 ||
      (typeof status === 'number' && status >= 500) ||
      status == null;

    if (DEBUG_CLASSIFIER) console.error('[clf:error]', msg);

    if (isRetryable) {
      return { _retry: true, error: msg };
    }

    // 영구 실패(대개 4xx)면 휴리스틱으로 확정
    const fb = heuristicLabel(fallbackTexts);
    return {
      label: fb,
      confidence: 'LOW',
      classifier_raw: null,
      classification: null,
      error: msg,
    };
  }
}

async function run() {
  console.log('[*] Single-log classification start');

  let batchNo = 0;
  let lastId = 0;

  while (true) {
    batchNo += 1;

    // ✅ PASSed-by-ModSecurity 조건:
    // - audit_data.action.intercepted != true
    // - response.status not in (403,406)
    // - messages에 "access denied with code" 포함되지 않음
    const rows = await prisma.$queryRaw`
      SELECT
        r.id,
        r.timestamp,
        r.remote_host,
        r.user_agent,
        r.method,
        r.uri,
        r.request_body,
        r.full_log
      FROM "RawLog" r
      WHERE r."sessionId" IS NULL
        AND r.id > ${lastId}
        AND COALESCE((r.full_log->'audit_data'->'action'->>'intercepted')::boolean, false) = false
        AND COALESCE((r.full_log->'response'->>'status')::int, 200) NOT IN (403, 406)
        AND NOT (r.full_log::text ILIKE '%access denied with code%')
      ORDER BY r.id ASC
      LIMIT ${BATCH_SIZE}
    `;

    if (!Array.isArray(rows) || rows.length === 0) break;

    lastId = rows[rows.length - 1].id;

    for (const r of rows) {
      const t = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
      if (Number.isNaN(t.getTime())) continue;

      const ua = r.user_agent || '';

      const aiRequest = {
        request_http_method: (r.method || '').slice(0, 16),
        request_http_request: (r.uri || '/').slice(0, 2048),
        request_body: (r.request_body || '').slice(0, MAX_BODY_CHARS),
        user_agent: ua.slice(0, MAX_UA_CHARS),
      };

      const fallbackTexts = [
        `${r.method || ''} ${r.uri || ''}`.trim(),
        String(r.request_body || '').slice(0, 500),
      ];

      const res0 = await classifySingleLog(aiRequest, fallbackTexts);

      // ✅ HF/AI 일시 장애면 sessionId를 채우지 않고 다음 루프에서 재시도
      if (res0?._retry) {
        if (DEBUG_CLASSIFIER) console.log('[clf:retry]', { rawlog_id: r.id, error: res0.error });
        continue;
      }

      const res = normalizeClassifierResult(res0);

      const sessionIdStr = `log|${r.id}`;

      await prisma.$transaction(async (tx) => {
        const sess = await tx.session.upsert({
          where: { session_id: sessionIdStr },
          update: {
            start_time: t,
            end_time: t,
            ip_address: r.remote_host ?? null,
            user_agent: ua || null,
            label: res.label,
            confidence: res.confidence,
            classifier_raw: res.classifier_raw,
            classification: res.classification,
          },
          create: {
            session_id: sessionIdStr,
            ip_address: r.remote_host ?? null,
            user_agent: ua || null,
            start_time: t,
            end_time: t,
            label: res.label,
            confidence: res.confidence,
            classifier_raw: res.classifier_raw,
            classification: res.classification,
          },
          select: { id: true },
        });

        await tx.rawLog.update({
          where: { id: r.id },
          data: { sessionId: sess.id },
        });
      });
    }

    console.log(`[*] batch=${batchNo}, processed+=${rows.length}`);
  }

  console.log('[*] Single-log classification done.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });





