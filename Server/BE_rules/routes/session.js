// routes/session.js
// 사용: app.use('/session', require('./routes/session'));
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ─────────────── util ───────────────
function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function toDateOrNull(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}
function normalizeLabel(label) {
  if (!label) return null;
  const s = String(label).trim().toUpperCase().replace(/[\s-]+/g, '_');
  const ALLOWED = new Set(['NORMAL','MALICIOUS','SQL_INJECTION','CODE_INJECTION','PATH_TRAVERSAL']);
  if (ALLOWED.has(s)) return s;
  if (s === 'SQL') return 'SQL_INJECTION';
  if (s === 'CODE') return 'CODE_INJECTION';
  if (s === 'PATH' || s === 'TRAVERSAL') return 'PATH_TRAVERSAL';
  return null;
}

// ─────────────── 목록: GET /session ───────────────
router.get('/', async (req, res) => {
  try {
    const page = toInt(req.query.page, 1);
    const pageSize = Math.min(toInt(req.query.pageSize, 20), 200);
    const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const sortKey = ['start_time', 'end_time', 'created_at'].includes(String(req.query.sort)) ? req.query.sort : 'end_time';

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
        ? { start_time: { ...(startFrom ? { gte: startFrom } : {}), ...(endTo ? { lte: endTo } : {}) } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
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
        label: s.label,
        confidence: s.confidence,
        classification: s.classification,
        requests: s._count.rawLogs,
        durationMs,
      };
    });

    res.json({
      page, pageSize, total,
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

// ─────────────── 상세: GET /session/:id ───────────────
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

    const orderBy = [{ timestamp: order }, { id: order }];

    // 🔹 RawLog 전체 19개 필드 선택
    const rawLogs = await prisma.rawLog.findMany({
      where: { sessionId: id },
      orderBy,
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: {
        id: true,
        transaction_id: true,
        timestamp: true,
        remote_host: true,
        remote_port: true,
        local_host: true,
        local_port: true,
        method: true,
        uri: true,
        http_version: true,
        host: true,
        user_agent: true,
        request_headers: true,
        request_body: true,
        response_headers: true,
        response_body: true,
        matched_rules: true,
        audit_summary: true,
        full_log: true,
        created_at: true,
        sessionId: true,
      },
    });

    const nextCursor = rawLogs.length === limit ? rawLogs[rawLogs.length - 1].id : null;
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
      rawLogs: {
        totalKnown: session._count.rawLogs,
        returned: rawLogs.length,
        nextCursor,
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
