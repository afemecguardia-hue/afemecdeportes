require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Servir archivos estáticos (HTML, CSS, JS) desde la carpeta raíz
app.use(express.static(path.join(__dirname, '.')));

// Configuración de la base de datos (Ajustar con tus datos del hosting)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'afemec_db'
};

let db = mysql.createConnection(dbConfig);

db.connect(err => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
});

// Ruta para guardar atletas
app.post('/api/registro', (req, res) => {
    const { ci, nombre, edad, tipo, parentesco } = req.body;
    const sql = "INSERT INTO atletas (ci, nombre, edad, tipo, parentesco) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [ci, nombre, edad, tipo, parentesco], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Atleta guardado en la base de datos correctamente' });
    });
});

// Ruta para obtener todos los atletas (para el Excel)
app.get('/api/atletas', (req, res) => {
    db.query("SELECT * FROM atletas ORDER BY fecha DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Ruta para que cualquier otra petición cargue el index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor AFEMEC corriendo en http://localhost:${PORT}`));