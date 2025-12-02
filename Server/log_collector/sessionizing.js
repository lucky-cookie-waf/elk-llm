// sessionizing.js (Idempotent / ESM, schema.prisma 기반 최신 버전)
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import UAParser from 'ua-parser-js';

const prisma = new PrismaClient();

// ===== 설정 =====
const INACTIVITY_MINUTES = 30;
const BATCH_SIZE = 1000;
const CLASSIFIER_ENDPOINT =
  process.env.CLASSIFIER_ENDPOINT || 'http://ai_classifier:3002/api/classify';
const DEBUG_CLASSIFIER = process.env.DEBUG_CLASSIFIER === '1';
// 분류 API 타임아웃(ms) — 서버(INFER_TIMEOUT_MS)보다 조금 짧게 권장
const CLASSIFIER_TIMEOUT_MS = Number(process.env.CLASSIFIER_TIMEOUT_MS || 120000);

// ===== 유틸 =====
function makeAgentGroup(uaString) {
  try {
    const parsed = new UAParser(uaString || '').getResult();
    const os = (parsed.os?.name || 'Unknown').replace(/\s+/g, '');
    const br = (parsed.browser?.name || 'Unknown').replace(/\s+/g, '');
    return `${os}_${br}`;
  } catch {
    return 'Unknown_Unknown';
  }
}

function toSessionLabelEnum(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('sql')) return 'SQL_INJECTION';
  if (s.includes('code')) return 'CODE_INJECTION';
  if (s.includes('path') || s.includes('traversal')) return 'PATH_TRAVERSAL';
  if (s.includes('normal') || s.includes('benign')) return 'NORMAL';
  return 'MALICIOUS';
}

function toConfidenceEnum(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'high') return 'HIGH';
  if (s === 'low') return 'LOW';
  return null;
}

// (백업) 텍스트 휴리스틱
function heuristicLabel(sampleTexts) {
  const text = (sampleTexts || []).join(' ').toLowerCase();
  const hasSQLi = /('|%27|--|\bunion\b|\bselect\b|\bdrop\b|\binsert\b|\border by\b)/i.test(text);
  const hasXSS = /(<script|onerror=|onload=|<img|<iframe|javascript:)/i.test(text);
  if (hasSQLi) return 'SQL_INJECTION';
  if (hasXSS) return 'CODE_INJECTION';
  return 'NORMAL';
}

// 분류 호출
async function classifySession(aiRequests, sessionSummaryForFallback) {
  try {
    if (!Array.isArray(aiRequests) || aiRequests.length === 0) {
      throw new Error('Empty aiRequests');
    }
    if (DEBUG_CLASSIFIER) {
      console.log('[clf:req]', CLASSIFIER_ENDPOINT, JSON.stringify(aiRequests[0]));
    }

    const { data } = await axios.post(
      CLASSIFIER_ENDPOINT,
      { session: aiRequests },
      { timeout: CLASSIFIER_TIMEOUT_MS }
    );

    const classificationRaw = data?.classification ?? null;
    const label = toSessionLabelEnum(classificationRaw);
    const confidence = toConfidenceEnum(data?.confidence);
    const classifier_raw = data?.raw_response ?? null;

    if (DEBUG_CLASSIFIER) {
      console.log('[clf:res]', { classification: classificationRaw, label, confidence });
    }
    return { label, confidence, classifier_raw, classification: classificationRaw };
  } catch (err) {
    if (DEBUG_CLASSIFIER) {
      const msg = err?.response
        ? `${err.response.status} ${JSON.stringify(err.response.data)}`
        : (err?.message || String(err));
      console.error('[clf:error]', msg);
    }
    const fb = heuristicLabel([
      ...((sessionSummaryForFallback?.paths) || []),
      ...((sessionSummaryForFallback?.samples) || [])
    ]);
    return {
      label: fb,
      confidence: 'LOW',
      classifier_raw: null,
      classification: null,
    };
  }
}

async function run() {
  console.log('[*] Sessionizing start');

  // key = remote_host + agent_group
  const active = new Map();
  let batchNo = 0;

  async function flushSession(key) {
    const s = active.get(key);
    if (!s) return;

    const summary = {
      ip: s.remote_host ?? null,
      user_agent: s.user_agent ?? null,
      start_time: s.start,
      end_time: s.end,
      count: s.count,
      paths: Array.from(s.paths).slice(0, 100),
      methods: Array.from(s.methods),
      samples: Array.from(s.samples).slice(0, 50),
    };

    // 분류기에 보낼 요청 배열 (실제 method/uri/body 기반)
    const aiRequests = s.rawLogs.map((r) => ({
      request_http_method: r.method || '',
      request_http_request: r.uri || '/',
      request_body: r.request_body || '',
      user_agent: s.user_agent || ''
    }));

    if (aiRequests.length === 0) {
      // 비어있는 세션은 그냥 버림
      active.delete(key);
      return;
    }

    const res = await classifySession(aiRequests, summary);
    const label = res.label;
    const confidence = res.confidence;
    const classifier_raw = res.classifier_raw;
    const classification = res.classification;

    // 세션 ID(결정적): ip + agent + start
    const sessionIdStr = `${s.remote_host || 'NA'}|${s.agent_group}|${s.start.toISOString()}`;

    await prisma.$transaction(async (tx) => {
      const sess = await tx.session.upsert({
        where: { session_id: sessionIdStr },
        update: {
          end_time: s.end,
          ip_address: s.remote_host ?? null,
          user_agent: s.user_agent ?? null,
          label,
          confidence,
          classifier_raw,
          classification,
        },
        create: {
          session_id: sessionIdStr,
          ip_address: s.remote_host ?? null,
          user_agent: s.user_agent ?? null,
          start_time: s.start,
          end_time: s.end,
          label,
          confidence,
          classifier_raw,
          classification,
        },
        select: { id: true }
      });

      if (s.rawLogIds.length) {
        await tx.rawLog.updateMany({
          where: { id: { in: s.rawLogIds } },
          data:  { sessionId: sess.id },
        });
      }
    });

    active.delete(key);
  }

  while (true) {
    batchNo += 1;

    // ➜ 크래시 내성을 위해 lastId 조건 제거
    // "아직 세션 할당 안 된 + 비차단(non-disruptive)" 로그만 매번 가장 오래된 것부터 처리
    const rows = await prisma.$queryRaw`
      SELECT
        r.id,
        r.timestamp,
        r.remote_host,
        r.remote_port,
        r.user_agent,
        r.method,
        r.uri,
        r.request_body,
        r.matched_rules,
        r.audit_summary,
        r.full_log
      FROM "RawLog" r
      WHERE r."sessionId" IS NULL
        AND NOT (
          -- ① 확정: transaction.interruption 존재 → 실제 차단
          COALESCE(r.full_log->'transaction', '{}'::jsonb) ? 'interruption'
          -- ② 보조: 개별 룰이 disruptive였거나, Access denied 문구가 남은 경우
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(r.matched_rules, '[]'::jsonb)) AS m
            WHERE (m->'details'->>'disruptive')::boolean = true
               OR COALESCE(m->>'message', m->>'msg','') ILIKE '%Access denied with code%'
          )
        )
      ORDER BY r.id ASC
      LIMIT ${BATCH_SIZE}
    `;

    if (rows.length === 0) break;

    const lastRowTs = rows[rows.length - 1].timestamp;
    const batchLastTs = lastRowTs instanceof Date ? lastRowTs : new Date(lastRowTs);

    for (const r of rows) {
      const t = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
      if (Number.isNaN(t.getTime())) continue;

      const ua = r.user_agent || '';
      const agent_group = makeAgentGroup(ua);

      // 세션 키: remote_host + agent_group
      const key = `${r.remote_host || 'NA'}|${agent_group}`;

      let s = active.get(key);
      if (!s) {
        s = {
          remote_host: r.remote_host ?? null,
          user_agent: ua || null,
          agent_group,
          start: t,
          end: t,
          lastSeen: t,
          count: 0,
          paths: new Set(),
          methods: new Set(),
          samples: new Set(),
          preview: [],
          rawLogIds: [],
          rawLogs: [],
        };
        active.set(key, s);
      }

      // 타임아웃으로 세션 절단
      const gapMs = t.getTime() - s.lastSeen.getTime();
      if (gapMs > INACTIVITY_MINUTES * 60 * 1000) {
        await flushSession(key);
        s = {
          remote_host: r.remote_host ?? null,
          user_agent: ua || null,
          agent_group,
          start: t,
          end: t,
          lastSeen: t,
          count: 0,
          paths: new Set(),
          methods: new Set(),
          samples: new Set(),
          preview: [],
          rawLogIds: [],
          rawLogs: [],
        };
        active.set(key, s);
      }

      // 세션 누적
      s.end = t;
      s.lastSeen = t;
      s.count += 1;
      if (r.uri) s.paths.add(r.uri);
      if (r.method) s.methods.add(r.method);
      const snippet = `${r.method || ''} ${r.uri || ''} ${(r.request_body || '').slice(0, 200)}`.trim();
      if (snippet) s.samples.add(snippet);
      s.rawLogIds.push(r.id);
      s.rawLogs.push({
        method: r.method,
        uri: r.uri,
        request_body: r.request_body,
      });
    }

    // 배치 경계에서 닫힌 세션 flush
    const WINDOW_MS = INACTIVITY_MINUTES * 60 * 1000;
    for (const key of Array.from(active.keys())) {
      const s = active.get(key);
      if (!s) continue;
      if (batchLastTs.getTime() - s.lastSeen.getTime() >= WINDOW_MS) {
        await flushSession(key);
      }
    }

    console.log(
      `[*] batch=${batchNo}, processed+=${rows.length}, active=${active.size}`
    );
  }

  // 남은 세션 전부 flush
  for (const key of Array.from(active.keys())) {
    await flushSession(key);
  }

  console.log('[*] Sessionizing done.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
