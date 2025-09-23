const express = require('express');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));


app.use(require('./routes/rules'));
app.use(require('./routes/dashboard')); // 대시보드 API

app.use('/session', require('./routes/session'));
app.use('/rawlog', require('./routes/rawlog'));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

//옵션: 404 핸들러
//app.use((req, res) => res.status(404).json({ error: "Not found"}));
//옵션: 에러 헨들러
/*app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({error: 'Internal Server Error'});
});*/

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`BE_rules up on :${port}`));
