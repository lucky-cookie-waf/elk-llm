const express = require('express');
const router = express.Router();
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

/** 공통 유틸 */
const cap = (n, max) => Math.min(Math.max(Number(n) || 0, 0), max);
const parseDate = (s) => (s ? new Date(String(s)) : null);
const isValidDate = (d) => d instanceof Date && !isNaN(d);

/** ===== 1) 상단 카드 ===== */

router.get('/stats/overview', async (req, res) => {
  try {
    // [수정] nowCountRow 쿼리에서 날짜 필터링을 제거하여 전체 공격 수를 집계합니다.
    const nowCountRow = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "Session"
      WHERE "label" <> 'NORMAL'
    `;
    const nowCnt = Number(nowCountRow?.[0]?.c || 0);
    
    // wowChangePct 계산을 위한 로직은 그대로 유지합니다.
    const to = parseDate(req.query.to) || new Date();
    const from = parseDate(req.query.from) || new Date(to.getTime() - 7 * 864e5);
    if ((req.query.from && !isValidDate(from)) || (req.query.to && !isValidDate(to))) {
      return res.status(400).json({ error: 'Invalid date for from/to' });
    }
    const spanMs = to - from;
    const prevFrom = new Date(from.getTime() - spanMs);
    const prevTo   = from;

    const prevCountRow = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "Session"
      WHERE "label" <> 'NORMAL'
        AND "start_time" >= ${prevFrom}
        AND "start_time" <  ${prevTo}
    `;
    const prevCnt = Number(prevCountRow?.[0]?.c || 0);

    const wowChangePct = prevCnt ? ((nowCnt - prevCnt) / prevCnt) * 100 : 100;

    res.json({
      totalAttacks: nowCnt,
      wowChangePct: Number(wowChangePct.toFixed(1)),
      period: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (err) {
    console.error('[GET /dashboard/stats/overview] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/stats/recent-attack', async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT MAX("start_time") AS latest_at
      FROM "Session"
      WHERE "label" <> 'NORMAL'
    `;
    res.json({ latestAt: rows?.[0]?.latest_at || null });
  } catch (err) {
    console.error('[GET /dashboard/stats/recent-attack] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** ===== 2) 공격 추세(그래프) ===== */
router.get('/attacks/trend', async (req, res) => {
  try {
    const to = parseDate(req.query.to) || new Date();
    const from = parseDate(req.query.from) || new Date(to.getTime() - 30 * 864e5);
    if ((req.query.from && !isValidDate(from)) || (req.query.to && !isValidDate(to))) {
      return res.status(400).json({ error: 'Invalid date for from/to' });
    }
    const groupBy = (req.query.groupBy === 'hour') ? 'hour' : 'day';
    const attackType = req.query.attackType ? String(req.query.attackType) : null;

    const conds = [
      Prisma.sql`"start_time" >= ${from}`,
      Prisma.sql`"start_time" < ${to}`,
      Prisma.sql`"label" <> 'NORMAL'`
    ];
    if (attackType) conds.push(Prisma.sql`"label" = ${attackType}`);

    const rows = await prisma.$queryRaw`
      SELECT date_trunc(${groupBy}, "start_time") AS ts, COUNT(*)::int AS cnt
      FROM "Session"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY 1
      ORDER BY 1
    `;

    const max = rows.reduce((m, r) => Math.max(m, Number(r.cnt)), 0);
    res.json({ points: rows.map(r => ({ ts: r.ts, count: Number(r.cnt) })), max });
  } catch (err) {
    console.error('[GET /dashboard/attacks/trend] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** ===== 3) Attack Details 목록 ===== */
router.get('/attacks', async (req, res) => {
  try {
    const limit = cap(req.query.limit ?? 12, 200);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;

    let from = null, to = null;
    const year  = req.query.year ? Number(req.query.year) : null;
    const month = req.query.month ? Number(req.query.month) : null;
    if (year && month) {
      from = new Date(year, month - 1, 1);
      to   = new Date(year, month, 1);
    } else {
      to   = parseDate(req.query.to)   || new Date();
      from = parseDate(req.query.from) || new Date(to.getTime() - 30 * 864e5);
      if ((req.query.from && !isValidDate(from)) || (req.query.to && !isValidDate(to))) {
        return res.status(400).json({ error: 'Invalid date for from/to' });
      }
    }

    const attackType = req.query.attackType ? String(req.query.attackType) : null;
    const ip = req.query.ip ? String(req.query.ip) : null;

    const whereConds = [
      Prisma.sql`"start_time" >= ${from}`, 
      Prisma.sql`"start_time" < ${to}`,
      Prisma.sql`"label" <> 'NORMAL'`,
    ];
    if (attackType) whereConds.push(Prisma.sql`"label" = ${attackType}`);
    if (ip) whereConds.push(Prisma.sql`"ip_address" = ${ip}`);
    if (cursor) whereConds.push(Prisma.sql`"id" < ${cursor}`);

    const items = await prisma.$queryRaw`
      SELECT "id","label","ip_address","user_agent","start_time","confidence"
      FROM "Session"
      WHERE ${Prisma.join(whereConds, ' AND ')}
      ORDER BY "id" DESC
      LIMIT ${limit}
    `;

    const ids = items.map(it => it.id);
    let statusBySid = new Map();
    if (ids.length) {
      const statusRows = await prisma.$queryRaw`
        SELECT DISTINCT ON (rl."sessionId")
               rl."sessionId" AS sid,
               COALESCE(
                 (rl.audit_summary->>'response_status')::int,
                 (rl.response_headers->>':status')::int
               ) AS status_code
        FROM "RawLog" AS rl
        WHERE rl."sessionId" IN (${Prisma.join(ids)})
        ORDER BY rl."sessionId", rl."timestamp" DESC
      `;
      statusBySid = new Map(statusRows.map(r => [Number(r.sid), r.status_code ? Number(r.status_code) : null]));
    }

    res.json({
      items: items.map(it => ({
        sessionId : it.id,
        attackType: it.label,
        ip        : it.ip_address,
        userAgent : it.user_agent,
        statusCode: statusBySid.get(it.id) ?? null,
        time      : it.start_time,
        confidence: it.confidence,
      })),
      nextCursor: items.length ? String(items[items.length - 1].id) : null,
      limit,
    });
  } catch (err) {
    console.error('[GET /dashboard/attacks] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** ===== 4) 세션 상세 ===== */
router.get('/attacks/:sessionId', async (req, res) => {
  try {
    const sid = Number(req.params.sessionId);
    if (!sid) return res.status(400).json({ error: 'Invalid sessionId' });

    const session = await prisma.session.findUnique({
      where: { id: sid },
      select: {
        id: true,
        session_id: true,
        label: true,
        confidence: true,
        ip_address: true,
        user_agent: true,
        start_time: true,
        end_time: true,
        created_at: true,
      },
    });

    const logs = await prisma.rawLog.findMany({
      where: { sessionId: sid },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        timestamp: true,
        method: true,
        uri: true,
        request_headers: true,
        request_body: true,
        response_headers: true,
        response_body: true,
        matched_rules: true,
        audit_summary: true,
      },
    });

    const matchedRules = [...new Set(
      logs.flatMap(l => Array.isArray(l.matched_rules) ? l.matched_rules : [])
    )];

    res.json({ session, logs, matchedRules });
  } catch (err) {
    console.error('[GET /dashboard/attacks/:sessionId] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;