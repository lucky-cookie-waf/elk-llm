const express = require('express');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(require('./routes/rules'));  

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.use('/session', require('./routes/session'));

app.use('/rawlog', require('./routes/rawlog'));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`BE_rules up on :${port}`));
