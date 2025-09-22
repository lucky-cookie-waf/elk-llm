// sessionizing.js (Idempotent / ESM)
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
// 기본 ON, 환경변수로 '0'을 주면 가드 기능 OFF
const USE_ANY_HIT_GUARD = process.env.USE_ANY_HIT_GUARD !== '0';

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

// ★ 공격 태그/차단 여부 뽑기
function extractSignals(row) {
  const ad = row.audit_summary || {};
  const messages = Array.isArray(row.matched_rules) ? row.matched_rules : [];
  const disruptive = !!(ad && ad.intervention && ad.intervention.disruptive);

  const tagSet = new Set();
  for (const m of messages) {
    const tags = (m && (m.tags || m.TAGS || m.tag)) || [];
    const arr = Array.isArray(tags) ? tags : [tags];
    for (const t of arr) {
      if (!t) continue;
      const tt = String(t).toLowerCase();
      if (tt.includes('sqli') || tt.includes('sql')) tagSet.add('sqli');
      if (tt.includes('xss')) tagSet.add('xss');
      if (tt.includes('rce') || tt.includes('code')) tagSet.add('code');
      if (tt.includes('traversal') || tt.includes('path') || tt.includes('lfi'))
        tagSet.add('path');
    }
  }
  return { disruptive, tagSet };
}

// ★ 태그로 라벨 추론(Any-hit 가드용)
function labelFromTags(tagSet) {
  if (tagSet.has('sqli')) return 'SQL_INJECTION';
  if (tagSet.has('path')) return 'PATH_TRAVERSAL';
  if (tagSet.has('code') || tagSet.has('xss')) return 'CODE_INJECTION';
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
      { timeout: 5000 }
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

  // ★ key를 remote_host + agent_group로 교체 (remote_port 제거)
  const active = new Map(); // key = `${remote_host}|${agent_group}`
  let batchNo = 0;
  let lastId = 0;

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
      // ★ 공격 신호 요약
      blockedCount: s.blockedCount,
      attackTags: Array.from(s.attackTags),
    };

    // 분류기에 보낼 요청 배열
    const aiRequests =
      (s.preview && s.preview.length)
        ? s.preview
        : Array.from(s.samples).slice(0, 3).map(txt => ({
            request_http_method: 'GET',
            request_http_request: (txt.split(' ')[1] || '/'),
            request_body: '',
            user_agent: s.user_agent || ''
          }));

    // ★ Any-hit 가드: 공격 신호가 있으면 우선 라벨 확정
    let guardLabel = null;
    if (USE_ANY_HIT_GUARD) {
      if (s.blockedCount > 0) {
        // 차단이 있었는데 공격 태그가 있으면 해당 태그 라벨, 없으면 MALICIOUS으로 방어적 분류
        guardLabel = labelFromTags(s.attackTags) || 'MALICIOUS';
      } else {
        // 차단이 없어도 공격 태그가 있으면 해당 라벨
        guardLabel = labelFromTags(s.attackTags);
      }
    }

    let label, confidence, classifier_raw, classification;
    if (guardLabel) {
      label = guardLabel;
      confidence = 'HIGH';
      classifier_raw = JSON.stringify({ guard: summary });
      classification = 'guard:auto';
    } else {
      // 가드 없으면 분류기 호출
      const res = await classifySession(aiRequests, summary);
      label = res.label;
      confidence = res.confidence;
      classifier_raw = res.classifier_raw;
      classification = res.classification;
    }

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

    // ★ 공격 신호 필드(matched_rules, audit_summary)도 함께 읽어오기
    const rows = await prisma.rawLog.findMany({
      where: {
        sessionId: null,
        id: { gt: lastId },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        timestamp: true,
        remote_host: true,
        remote_port: true,    // (키에는 안 씀, 참고용)
        user_agent: true,
        method: true,
        uri: true,
        request_body: true,
        matched_rules: true,  // ★
        audit_summary: true,  // ★ (intervention.disruptive 등)
      },
    });

    if (rows.length === 0) break;

    const lastRowTs = rows[rows.length - 1].timestamp;
    const batchLastTs = lastRowTs instanceof Date ? lastRowTs : new Date(lastRowTs);

    for (const r of rows) {
      const t = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
      if (Number.isNaN(t.getTime())) continue;

      const ua = r.user_agent || '';
      const agent_group = makeAgentGroup(ua);

      // ★ 세션 키: remote_host + agent_group
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
          // ★ 공격 신호 누적
          blockedCount: 0,
          attackTags: new Set(),
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
          blockedCount: 0,
          attackTags: new Set(),
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

      // ★ 공격 신호 누적
      const sig = extractSignals(r);
      if (sig.disruptive) s.blockedCount += 1;
      for (const ttag of sig.tagSet) s.attackTags.add(ttag);

      // 분류기 프리뷰(최대 3개)
      if (s.preview.length < 3) {
        s.preview.push({
          request_http_method: r.method || 'GET',
          request_http_request: r.uri || '',
          request_body: r.request_body || '',
          user_agent: s.user_agent || ''
        });
      }
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

    lastId = rows[rows.length - 1].id;
    console.log(`[*] batch=${batchNo}, processed+=${rows.length}, lastId=${lastId}, active=${active.size}`);
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
