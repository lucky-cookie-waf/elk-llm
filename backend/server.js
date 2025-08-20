const express = require('express');
const morgan = require('morgan');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));


app.use('/session', require('./src/routes/session'));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`));
