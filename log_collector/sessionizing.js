// sessionizing.js (Idempotent / ESM)
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { UAParser } from 'ua-parser-js';

const prisma = new PrismaClient();

// ===== 설정 =====
const INACTIVITY_MINUTES = 30;                          // 세션 타임아웃(분)
const BATCH_SIZE = 1000;                                // RawLog 배치 크기
const CLASSIFIER_ENDPOINT = 'http://localhost:8000/classify'; // 분류기(미동작 시 휴리스틱)

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

function heuristicLabel(sampleTexts) {
  const text = (sampleTexts || []).join(' ').toLowerCase();
  const xss = /(<script|onerror=|onload=|<img|<iframe|javascript:)/i.test(text);
  const sqli = /('|%27|--|\bunion\b|\bselect\b|\bdrop\b|\binsert\b|\border by\b)/i.test(text);
  if (xss || sqli) return { label: 'MALICIOUS', confidence: 0.6 };
  return { label: 'NORMAL', confidence: 0.55 };
}

// 분류기 라벨 → Prisma enum(sessionLabel)로 매핑
function mapClassifierLabel(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s === 'malicious' || s === 'attack' || s === 'bad') return 'MALICIOUS';
  if (s === 'benign' || s === 'normal' || s === 'good') return 'NORMAL';
  return null; // unknown/미분류 시 null 저장
}

async function classifySession(sessionSummary) {
  try {
    const { data } = await axios.post(CLASSIFIER_ENDPOINT, { session: sessionSummary }, { timeout: 5000 });
    if (data && data.label) return { label: data.label, confidence: data.confidence ?? null };
  } catch { /* 분류기 실패 시 휴리스틱 사용 */ }
  return heuristicLabel([...(sessionSummary.paths || []), ...(sessionSummary.samples || [])]);
}

async function run() {
  console.log('[*] Sessionizing start');

  // 진행 중 세션 상태: key = `${remote_host}|${agent_group}`
  const active = new Map();
  let processed = 0;
  let batchNo = 0;

  // 세션 확정 저장 + RawLog FK 연결 (트랜잭션)
  async function flushSession(key) {
    const s = active.get(key);
    if (!s) return;

    const summary = {
      ip: s.remote_host || null,
      user_agent: s.user_agent || null,
      start_time: s.start, // Date
      end_time: s.end,     // Date
      count: s.count,
      paths: Array.from(s.paths).slice(0, 100),
      methods: Array.from(s.methods),
      samples: Array.from(s.samples).slice(0, 50),
    };

    const clf = await classifySession(summary);
    const label = mapClassifierLabel(clf?.label); // 'MALICIOUS' | 'NORMAL' | null

    // 사람이 보는 세션 문자열(재현 가능하게)
    const sessionIdStr = `${s.remote_host || 'unknown'}|${s.agent_group}|${s.start.toISOString()}`;

    await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          session_id: sessionIdStr,          // String @unique
          ip_address: s.remote_host || null, // String?
          user_agent: s.user_agent || null,  // String?
          start_time: s.start,               // Date
          end_time: s.end,                   // Date
          label,                             // enum sessionLabel?
        },
        select: { id: true }
      });

      if (s.rawLogIds.length) {
        await tx.rawLog.updateMany({
          where: { id: { in: s.rawLogIds } },
          data:  { sessionId: created.id },  // ✅ FK 채움 → 다음 실행 때 자동 제외됨
        });
      }
    });

    active.delete(key);
  }

  // 배치 루프: "아직 세션에 속하지 않은 RawLog만" 처리 ⇒ idempotent
  while (true) {
    batchNo += 1;

    const rows = await prisma.rawLog.findMany({
      where: { sessionId: null },           // ✅ 핵심: 이미 처리된 로그 제외
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        timestamp: true,     // DateTime
        remote_host: true,   // 클라이언트 IP
        user_agent: true,    // UA
        method: true,
        uri: true,
        request_body: true,
      },
    });

    if (rows.length === 0) break;

    for (const r of rows) {
      processed++;

      // Prisma DateTime → JS Date
      const t = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
      if (Number.isNaN(t.getTime())) continue;

      const ua = r.user_agent || '';
      const agent_group = makeAgentGroup(ua);
      const key = `${r.remote_host || 'unknown'}|${agent_group}`;

      let s = active.get(key);
      if (!s) {
        s = {
          remote_host: r.remote_host || null,
          user_agent: ua || null,
          agent_group,
          start: t,
          end: t,
          lastSeen: t,
          count: 0,
          paths: new Set(),
          methods: new Set(),
          samples: new Set(),
          rawLogIds: [],
        };
        active.set(key, s);
      }

      // 타임아웃이면 이전 세션 플러시 후 새 세션 시작
      const gapMs = t.getTime() - s.lastSeen.getTime();
      if (gapMs > INACTIVITY_MINUTES * 60 * 1000) {
        await flushSession(key);
        s = {
          remote_host: r.remote_host || null,
          user_agent: ua || null,
          agent_group,
          start: t,
          end: t,
          lastSeen: t,
          count: 0,
          paths: new Set(),
          methods: new Set(),
          samples: new Set(),
          rawLogIds: [],
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
    }

    // 배치 경계에서 로그 출력만
    const lastId = rows[rows.length - 1].id;
    console.log(`[*] batch=${batchNo}, processed+=${rows.length}, lastId=${lastId}`);
  }

  // 남은 세션 전부 플러시
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
