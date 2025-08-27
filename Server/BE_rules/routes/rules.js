const express = require('express');
const router = express.Router();
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const cap = (n, max) => Math.min(Math.max(Number(n) || 0, 0), max);
const parseDate = (s) => (s ? new Date(String(s)) : null);
const isValidDate = (d) => d instanceof Date && !isNaN(d);

router.get('/rules', async (req, res) => {
  try {
    const limit = cap(req.query.limit ?? 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = (req.query.q || '').toString().trim().toLowerCase();

    const rule_id = req.query.rule_id ? Number(req.query.rule_id) : undefined;
    const phase = req.query.phase ? Number(req.query.phase) : undefined;
    const action = req.query.action ? String(req.query.action) : undefined;
    const severity = req.query.severity_level ? String(req.query.severity_level) : undefined;

    const since = parseDate(req.query.since);
    const until = parseDate(req.query.until);
    if ((req.query.since && !isValidDate(since)) || (req.query.until && !isValidDate(until))) {
      return res.status(400).json({ error: 'Invalid date for since/until' });
    }

    const conds = [];
    if (q) {
      const pattern = `%${q}%`;
      conds.push(
        Prisma.sql`(lower(r."rule_name") LIKE ${pattern}
                 OR lower(r."target")    LIKE ${pattern}
                 OR lower(r."operator")  LIKE ${pattern})`
      );
    }
    if (rule_id !== undefined) conds.push(Prisma.sql`r."rule_id" = ${rule_id}`);
    if (phase !== undefined)   conds.push(Prisma.sql`r."phase" = ${phase}`);
    if (action)                conds.push(Prisma.sql`r."action" = ${action}`);
    if (severity)              conds.push(Prisma.sql`r."severity_level" = ${severity}`);
    if (since)                 conds.push(Prisma.sql`r."created_at" >= ${since}`);
    if (until)                 conds.push(Prisma.sql`r."created_at" <= ${until}`);

    const whereSQL = conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, Prisma.sql` AND `)}`
      : Prisma.empty;

    const orderSQL = Prisma.sql`ORDER BY r."created_at" DESC, r."id" DESC`;

    const [items, countRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        SELECT r.* FROM "Rule" r
        ${whereSQL}
        ${orderSQL}
        LIMIT ${limit} OFFSET ${offset};
      `),
      prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Rule" r
        ${whereSQL};
      `),
    ]);

    const total = Number(countRows?.[0]?.count || 0);
    res.json({ items, total, limit, offset });
  } catch (err) {
    console.error('[GET /rules] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
