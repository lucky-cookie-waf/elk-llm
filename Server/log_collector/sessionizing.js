// sessionizing.js (Idempotent / ESM)
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import UAParser from 'ua-parser-js';

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

function mapClassifierLabel(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s === 'malicious' || s === 'attack' || s === 'bad') return 'MALICIOUS';
  if (s === 'benign' || s === 'normal' || s === 'good') return 'NORMAL';
  return null;
}

async function classifySession(sessionSummary) {
  try {
    const { data } = await axios.post(CLASSIFIER_ENDPOINT, { session: sessionSummary }, { timeout: 5000 });
    if (data && data.label) return { label: data.label, confidence: data.confidence ?? null };
  } catch {}
  return heuristicLabel([...(sessionSummary.paths || []), ...(sessionSummary.samples || [])]);
}

async function run() {
  console.log('[*] Sessionizing start');

  const active = new Map(); // key = `${remote_port}|${agent_group}`
  let batchNo = 0;
  let lastId = 0; // 커서

  async function flushSession(key) {
    const s = active.get(key);
    if (!s) return;

    const summary = {
      port: s.port ?? null,
      user_agent: s.user_agent ?? null,
      start_time: s.start,
      end_time: s.end,
      count: s.count,
      paths: Array.from(s.paths).slice(0, 100),
      methods: Array.from(s.methods),
      samples: Array.from(s.samples).slice(0, 50),
    };

    const clf = await classifySession(summary);
    const label = mapClassifierLabel(clf?.label);
    const sessionIdStr = `${s.port ?? 'NA'}|${s.agent_group}|${s.start.toISOString()}`;

    await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          session_id: sessionIdStr,
          ip_address: s.remote_host ?? null,    // 참고용으로 유지
          user_agent: s.user_agent ?? null,
          start_time: s.start,
          end_time: s.end,
          label,
        },
        select: { id: true }
      });

      if (s.rawLogIds.length) {
        await tx.rawLog.updateMany({
          where: { id: { in: s.rawLogIds } },
          data:  { sessionId: created.id },
        });
      }
    });

    active.delete(key);
  }

  while (true) {
    batchNo += 1;

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
        remote_port: true,       // ✅ 클라이언트 포트
        remote_host: true,
        user_agent: true,
        method: true,
        uri: true,
        request_body: true,
        // local_port: true,     // 필요 시 사용
      },
    });

    if (rows.length === 0) break;

    // 이번 배치의 마지막 타임스탬프(닫힌 세션 판정용)
    const lastRowTs = rows[rows.length - 1].timestamp;
    const batchLastTs = lastRowTs instanceof Date ? lastRowTs : new Date(lastRowTs);

    for (const r of rows) {
      const t = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
      if (Number.isNaN(t.getTime())) continue;

      const ua = r.user_agent || '';
      const agent_group = makeAgentGroup(ua);
      const clientPort = r.remote_port ?? null;

      // ✅ 조건1: (remote_port + OS/브라우저)
      const key = `${clientPort ?? 'NA'}|${agent_group}`;

      let s = active.get(key);
      if (!s) {
        s = {
          remote_host: r.remote_host ?? null,
          user_agent: ua || null,
          agent_group,
          port: clientPort,            // ✅ 포트 저장
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

      // ✅ 조건2: 30분 비활성 시 끊기
      const gapMs = t.getTime() - s.lastSeen.getTime();
      if (gapMs > INACTIVITY_MINUTES * 60 * 1000) {
        await flushSession(key);
        s = {
          remote_host: r.remote_host ?? null,
          user_agent: ua || null,
          agent_group,
          port: clientPort,
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

    // 배치 경계에서 "닫힌 세션"만 flush (진행 중 세션은 유지)
    const WINDOW_MS = INACTIVITY_MINUTES * 60 * 1000;
    for (const key of Array.from(active.keys())) {
      const s = active.get(key);
      if (!s) continue;
      if (batchLastTs.getTime() - s.lastSeen.getTime() >= WINDOW_MS) {
        await flushSession(key);
      }
    }

    // 커서 업데이트
    lastId = rows[rows.length - 1].id;
    console.log(`[*] batch=${batchNo}, processed+=${rows.length}, lastId=${lastId}, active=${active.size}`);
  }

  // 남은 세션 전부 flush
  for (const key of Array.from(active.keys())) {
    await flushSession(key);
  }

  console.log('[*] Sessionizing done.');
}

// ✅ 반드시 실행 호출 필요!
run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

