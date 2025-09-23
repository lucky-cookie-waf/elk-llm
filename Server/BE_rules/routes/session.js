// CommonJS (Node.js) - 세션 API 라우터
// 사용: app.use('/sessions', require('./src/routes/session'));

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ─────────────── 유틸 ───────────────
function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function toDateOrNull(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * 세션 라벨 노멀라이즈
 * - 스키마 enum: NORMAL | SQL_INJECTION | CODE_INJECTION | PATH_TRAVERSAL | MALICIOUS
 * - 다양한 입력(소문자/하이픈/스페이스/약칭) 허용
 */
function normalizeLabel(label) {
  if (!label) return null;
  const s = String(label).trim().toUpperCase().replace(/[\s-]+/g, '_');
  const ALLOWED = new Set([
    'NORMAL',
    'MALICIOUS',
    'SQL_INJECTION',
    'CODE_INJECTION',
    'PATH_TRAVERSAL',
  ]);
  if (ALLOWED.has(s)) return s;

  // 약칭 매핑
  if (s === 'SQL') return 'SQL_INJECTION';
  if (s === 'CODE') return 'CODE_INJECTION';
  if (s === 'PATH' || s === 'TRAVERSAL') return 'PATH_TRAVERSAL';
  return null;
}

// ─────────────── 목록: GET /sessions ───────────────
// 쿼리:
//  - label: NORMAL | MALICIOUS | SQL_INJECTION | CODE_INJECTION | PATH_TRAVERSAL
//  - page: 기본 1
//  - pageSize: 기본 20 (최대 200)
//  - sort: start_time|end_time|created_at (기본 end_time)
//  - order: asc|desc (기본 desc)
//  - ip, ua: 부분검색
//  - startFrom, endTo: 기간 필터(ISO datetime 문자열; start_time 기준)
router.get('/', async (req, res) => {
  try {
    const page = toInt(req.query.page, 1);
    const pageSize = Math.min(toInt(req.query.pageSize, 20), 200);
    const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const sortKey = ['start_time', 'end_time', 'created_at'].includes(String(req.query.sort))
      ? req.query.sort
      : 'end_time';

    const label = normalizeLabel(req.query.label);
    const ipQuery = req.query.ip ? String(req.query.ip).trim() : null;
    const uaQuery = req.query.ua ? String(req.query.ua).trim() : null;

    const startFrom = toDateOrNull(req.query.startFrom);
    const endTo = toDateOrNull(req.query.endTo);

    const where = {
      ...(label ? { label } : {}),
      ...(ipQuery ? { ip_address: { contains: ipQuery, mode: 'insensitive' } } : {}),
      ...(uaQuery ? { user_agent: { contains: uaQuery, mode: 'insensitive' } } : {}),
      ...(startFrom || endTo
        ? {
            start_time: {
              ...(startFrom ? { gte: startFrom } : {}),
              ...(endTo ? { lte: endTo } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        // 안정 정렬: primary + id
        orderBy: [{ [sortKey]: order }, { id: order }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          session_id: true,
          ip_address: true,
          user_agent: true,
          start_time: true,
          end_time: true,
          created_at: true,
          label: true,
          confidence: true,
          classification: true,
          _count: { select: { rawLogs: true } },
        },
      }),
    ]);

    const data = rows.map((s) => {
      const durationMs = new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
      return {
        id: s.id,
        session_id: s.session_id,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        start_time: s.start_time,
        end_time: s.end_time,
        created_at: s.created_at,
        label: s.label,             // NORMAL | ... | MALICIOUS | null
        confidence: s.confidence,   // HIGH | LOW | null
        classification: s.classification,
        requests: s._count.rawLogs, // RawLog 개수
        durationMs,
      };
    });

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort: { key: sortKey, order },
      filters: {
        label: label ?? 'ALL',
        ip: ipQuery,
        ua: uaQuery,
        startFrom: startFrom?.toISOString() ?? null,
        endTo: endTo?.toISOString() ?? null,
      },
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ─────────────── 상세: GET /sessions/:id ───────────────
// 쿼리:
//  - limit: 반환 최대개수 (기본 200, 최대 1000)
//  - order: asc|desc (기본 asc, timestamp 기준)
//  - cursorId: 커서 페이지네이션용 RawLog.id (이후/이전 페이지 탐색)
router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid session id' });

    const limit = Math.min(toInt(req.query.limit, 200), 1000);
    const order = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const cursorId = req.query.cursorId ? Number.parseInt(req.query.cursorId, 10) : null;

    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        session_id: true,
        ip_address: true,
        user_agent: true,
        start_time: true,
        end_time: true,
        created_at: true,
        label: true,
        confidence: true,
        classification: true,
        _count: { select: { rawLogs: true } },
      },
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });

    // 안정 정렬: timestamp + id (같은 timestamp 다수 방지)
    const orderBy = [{ timestamp: order }, { id: order }];

    const rawLogs = await prisma.rawLog.findMany({
      where: { sessionId: id },
      orderBy,
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: {
        id: true,
        timestamp: true,
        method: true,
        uri: true,
        host: true,
        remote_host: true,
        user_agent: true,
        http_version: true,
        matched_rules: true,  // Json
        audit_summary: true,  // Json
        // request_body: true, // 필요 시 열기
        // response_body: true,
      },
    });

    // 다음 페이지 커서(마지막 id)
    const nextCursor = rawLogs.length === limit ? rawLogs[rawLogs.length - 1].id : null;

    const uniq = (arr) => Array.from(new Set(arr)).filter(Boolean);
    const uniquePaths = uniq(rawLogs.map((r) => r.uri)).slice(0, 100);
    const uniqueMethods = uniq(rawLogs.map((r) => r.method)).slice(0, 10);
    const durationMs = new Date(session.end_time).getTime() - new Date(session.start_time).getTime();

    res.json({
      session: {
        id: session.id,
        session_id: session.session_id,
        ip_address: session.ip_address,
        user_agent: session.user_agent,
        start_time: session.start_time,
        end_time: session.end_time,
        created_at: session.created_at,
        label: session.label,
        confidence: session.confidence,
        classification: session.classification,
        requests: session._count.rawLogs,
        durationMs,
      },
      summary: {
        uniquePathsCount: uniquePaths.length,
        uniqueMethods,
        samplePaths: uniquePaths,
      },
      rawLogs: {
        totalKnown: session._count.rawLogs,
        returned: rawLogs.length,
        nextCursor, // ← 프론트는 이걸로 더 불러오기
        order,
        items: rawLogs,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch session detail' });
  }
});

module.exports = router;

/* 테스트
# 악성만, 기간 필터 + 최신 end_time 기준
curl "http://localhost:3000/sessions?label=MALICIOUS&startFrom=2025-09-01T00:00:00Z&endTo=2025-09-23T00:00:00Z&page=1&pageSize=20&sort=end_time&order=desc"

# 특정 세션 상세 (RawLog 500개, 오름차순)
curl "http://localhost:3000/sessions/123?limit=500&order=asc"

# 다음 페이지 (커서)
curl "http://localhost:3000/sessions/123?limit=500&order=asc&cursorId=<응답.nextCursor>"
*/
