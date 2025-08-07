import express from 'express';

const app = express()
const port = 5000;

app.get('/', (req, res) => {
    res.send('Hello from ModSecurity protected Express App!');
});

app.get('/attack', (req, res) => {
    const param = req.query.param || 'No parameter provided';
    res.send(`You requested with parameter: ${param}`);
});

app.get('/test', (req, res) => {
    res.send('This is a test endpoint');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Express app listening at http://localhost:${port}`);
});