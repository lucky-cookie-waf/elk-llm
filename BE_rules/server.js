const express = require('express');
require('dotenv').config();
const app = express();

app.use(express.json());
app.use(require('./routes/rules'));  // ← ./routes/rules.js

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`BE_rules up on :${port}`));
