//src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const setupSwagger = require("./config/swagger");


const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const healthRoutes = require('./routes/health');


const app = express();
const PORT = process.env.PORT || 3000;

setupSwagger(app); // chama o swagger aqui

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/device', deviceRoutes);
app.use('/VerifyHealth', healthRoutes);


app.get('/', (req, res) => {
  res.json({ message: 'API doc-it Backend funcionando!' });
});

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
  console.log("Swagger disponível em /api-docs");
});
