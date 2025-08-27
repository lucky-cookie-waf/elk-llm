// CommonJS (Node.js) - 세션 API 라우터
// 사용: app.use('/session', require('./src/routes/session'));

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ─────────────── 유틸 ───────────────
function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function normalizeLabel(label) {
  if (!label) return null;
  const s = String(label).toUpperCase();
  return s === 'NORMAL' || s === 'MALICIOUS' ? s : null;
}

// ─────────────── 목록: GET /sessions ───────────────
// 쿼리:
//  - label: NORMAL | MALICIOUS (없으면 전체)
//  - page: 기본 1
//  - pageSize: 기본 20 (최대 200)
//  - sort: start_time|end_time|created_at (기본 end_time)
//  - order: asc|desc (기본 desc)
//  - ip, ua: 부분검색
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

    const where = {
      ...(label ? { label } : {}),
      ...(ipQuery ? { ip_address: { contains: ipQuery, mode: 'insensitive' } } : {}),
      ...(uaQuery ? { user_agent: { contains: uaQuery, mode: 'insensitive' } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        orderBy: { [sortKey]: order },
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
        label: s.label,             // 'NORMAL' | 'MALICIOUS' | null
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
      filters: { label: label ?? 'ALL', ip: ipQuery, ua: uaQuery },
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ─────────────── 상세: GET /sessions/:id ───────────────
// 쿼리:
//  - limit: RawLog 반환 최대개수 (기본 200, 최대 1000)
router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid session id' });

    const limit = Math.min(toInt(req.query.limit, 200), 1000);

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
        _count: { select: { rawLogs: true } },
      },
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const rawLogs = await prisma.rawLog.findMany({
      where: { sessionId: id },
      orderBy: { id: 'desc' },
      take: limit,
      select: {
        id: true,
        timestamp: true,
        method: true,
        uri: true,
        host: true,
        remote_host: true,
        user_agent: true,
        http_version: true,
        matched_rules: true,  // Json?
        audit_summary: true,  // Json?
        // 필요 시 대용량/민감 필드 열기
        // request_body: true,
        // response_body: true,
      },
    });

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
        items: rawLogs,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch session detail' });
  }
});

module.exports = router;

/*테스트
# 악성만, 최신 end_time 기준
curl "http://localhost:3000/sessions?label=MALICIOUS&page=1&pageSize=20&sort=end_time&order=desc"

# 특정 세션 상세 (RawLog 500개까지)
curl "http://localhost:3000/sessions/123?limit=500"
*/