const oracledb = require('oracledb');
const path = require('path');
try { require('dotenv').config(); } catch {}

const INSTANT_CLIENT_DIR = process.env.ORACLE_IC || 'C:\\oracle\\instantclient\\instantclient_23_0';
const WALLET_DIR = path.join(INSTANT_CLIENT_DIR, 'network', 'admin');

process.env.TNS_ADMIN = WALLET_DIR;

oracledb.initOracleClient({ libDir: INSTANT_CLIENT_DIR });

const dbConfig = {
    user: process.env.ORACLE_USER || 'admin',
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT || 'afemecdeportes_high',
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1
};

let pool = null;

async function getPool() {
    if (!pool) {
        if (!dbConfig.password) throw new Error('ORACLE_PASSWORD no configurada. Creá un archivo .env desde .env.example');
        pool = await oracledb.createPool(dbConfig);
        console.log('Oracle pool creado');
    }
    return pool;
}

async function execute(sql, binds = [], options = {}) {
    const p = await getPool();
    const conn = await p.getConnection();
    try {
        const defaultOpts = { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: true };
        const finalOpts = { ...defaultOpts, ...options };
        const result = await conn.execute(sql, binds, finalOpts);
        return result;
    } finally {
        await conn.close();
    }
}

async function closePool() {
    if (pool) {
        await pool.close(0);
        pool = null;
        console.log('Oracle pool cerrado');
    }
}

module.exports = { getPool, execute, closePool };
