const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/__ping', (_req, res) => res.json({ ok: true }));

router.get('/', async (req, res) => {
  try {
    const sessionId = parseInt(String(req.query.sessionId ?? ''), 10);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'sessionId (number) is required' });
    }

    const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const pageSize = Math.min(parseInt(req.query.pageSize ?? '200', 10), 1000);
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const sortKey = ['timestamp', 'created_at', 'id'].includes(String(req.query.sort))
      ? String(req.query.sort)
      : 'id';

    const [total, rows] = await Promise.all([
      prisma.rawLog.count({ where: { sessionId } }),
      prisma.rawLog.findMany({
        where: { sessionId },
        orderBy: { [sortKey]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          transaction_id: true,
          timestamp: true,
          remote_host: true,
          remote_port: true,
          local_host: true,
          local_port: true,
          matched_rules: true,
          full_log: true,
          created_at: true,
          sessionId: true,
        },
      }),
    ]);

    res.json({
      page, pageSize, total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort: { key: sortKey, order },
      data: rows,
    });
  } catch (e) {
    console.error('[GET /rawlog] error:', e);
    res.status(500).json({ error: 'Failed to fetch rawlogs' });
  }
});

module.exports = router;
