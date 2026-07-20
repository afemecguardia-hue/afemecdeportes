const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const os = require('os');
try { require('dotenv').config(); } catch {}

// Si ORACLE_IC está definido, usar thick mode (requiere Instant Client instalado)
if (process.env.ORACLE_IC) {
    const WALLET_DIR = path.join(process.env.ORACLE_IC, 'network', 'admin');
    if (!fs.existsSync(WALLET_DIR)) {
        fs.mkdirSync(WALLET_DIR, { recursive: true });
    }
    process.env.TNS_ADMIN = WALLET_DIR;
    oracledb.initOracleClient({ libDir: process.env.ORACLE_IC });
    console.log('ORACLE_WALLET_TNS set?: ' + (process.env.ORACLE_WALLET_TNS ? 'YES (' + process.env.ORACLE_WALLET_TNS.length + ' chars)' : 'NO'));
    console.log('ORACLE_WALLET_PEM set?: ' + (process.env.ORACLE_WALLET_PEM ? 'YES (' + process.env.ORACLE_WALLET_PEM.length + ' chars)' : 'NO'));
    console.log('ORACLE_WALLET_SSO set?: ' + (process.env.ORACLE_WALLET_SSO ? 'YES (' + process.env.ORACLE_WALLET_SSO.length + ' chars)' : 'NO'));
    if (process.env.ORACLE_WALLET_TNS) {
        fs.writeFileSync(path.join(WALLET_DIR, 'tnsnames.ora'), Buffer.from(process.env.ORACLE_WALLET_TNS, 'base64').toString());
        console.log('tnsnames.ora escrito: ' + fs.statSync(path.join(WALLET_DIR, 'tnsnames.ora')).size + ' bytes');
    }
    if (process.env.ORACLE_WALLET_PEM) {
        fs.writeFileSync(path.join(WALLET_DIR, 'ewallet.pem'), Buffer.from(process.env.ORACLE_WALLET_PEM, 'base64').toString());
        console.log('ewallet.pem escrito: ' + fs.statSync(path.join(WALLET_DIR, 'ewallet.pem')).size + ' bytes');
    }
    if (process.env.ORACLE_WALLET_SSO) {
        fs.writeFileSync(path.join(WALLET_DIR, 'cwallet.sso'), Buffer.from(process.env.ORACLE_WALLET_SSO, 'base64'));
        console.log('cwallet.sso escrito: ' + fs.statSync(path.join(WALLET_DIR, 'cwallet.sso')).size + ' bytes');
    }
    // sqlnet.ora: usar el original del wallet si está en env var, si no generar uno
    if (process.env.ORACLE_WALLET_SQLNET) {
        fs.writeFileSync(path.join(WALLET_DIR, 'sqlnet.ora'), Buffer.from(process.env.ORACLE_WALLET_SQLNET, 'base64').toString());
        console.log('sqlnet.ora desde env var: ' + fs.statSync(path.join(WALLET_DIR, 'sqlnet.ora')).size + ' bytes');
    } else if (!fs.existsSync(path.join(WALLET_DIR, 'sqlnet.ora'))) {
        // Usar ?/network/admin igual que el wallet original
        const sqlnet = `WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="?/network/admin")))\nSSL_SERVER_DN_MATCH=yes\n`;
        fs.writeFileSync(path.join(WALLET_DIR, 'sqlnet.ora'), sqlnet);
        console.log('sqlnet.ora generado: ' + fs.statSync(path.join(WALLET_DIR, 'sqlnet.ora')).size + ' bytes');
    }
    // Forzar ORACLE_HOME para que coincida con el directorio de Instant Client
    process.env.ORACLE_HOME = process.env.ORACLE_IC;
    process.env.ORACLE_HOME_NAME = 'instantclient';
    console.log('Archivos en wallet dir:', fs.readdirSync(WALLET_DIR).join(', '));
    console.log('Oracle thick mode (Instant Client)');
} else {
    // Thin mode: extraer wallet de variable de entorno si existe
    process.env.TNS_ADMIN = process.env.TNS_ADMIN || path.join(os.tmpdir(), 'afemec_wallet');
    const walletDir = process.env.TNS_ADMIN;
    if (!fs.existsSync(walletDir)) {
        fs.mkdirSync(walletDir, { recursive: true });
        if (process.env.ORACLE_WALLET_TNS) {
            fs.writeFileSync(path.join(walletDir, 'tnsnames.ora'), Buffer.from(process.env.ORACLE_WALLET_TNS, 'base64').toString());
            console.log('tnsnames.ora extraído de env var');
        }
        if (process.env.ORACLE_WALLET_PEM) {
            fs.writeFileSync(path.join(walletDir, 'ewallet.pem'), Buffer.from(process.env.ORACLE_WALLET_PEM, 'base64').toString());
            console.log('ewallet.pem extraído de env var');
        }
        if (process.env.ORACLE_WALLET_P12) {
            fs.writeFileSync(path.join(walletDir, 'ewallet.p12'), Buffer.from(process.env.ORACLE_WALLET_P12, 'base64'));
            console.log('ewallet.p12 extraído de env var');
        }
        if (process.env.ORACLE_WALLET_SSO) {
            fs.writeFileSync(path.join(walletDir, 'cwallet.sso'), Buffer.from(process.env.ORACLE_WALLET_SSO, 'base64'));
            console.log('cwallet.sso extraído de env var');
        }
    }
    console.log('Oracle thin mode (no Instant Client)');
}

// Solo usar poolMin/poolMax en thin mode si no hay Instant Client
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
        console.log('Iniciando conexión a Oracle...');
        console.log('ORACLE_USER=' + dbConfig.user);
        console.log('ORACLE_CONNECT=' + dbConfig.connectString);
        console.log('TNS_ADMIN=' + process.env.TNS_ADMIN);
        try {
            pool = await oracledb.createPool(dbConfig);
            console.log('Oracle pool creado OK');
        } catch (e) {
            console.log('ERROR AL CREAR POOL: ' + e.message);
            console.log('CODE: ' + e.errorNum);
            console.log('STACK: ' + e.stack);
            throw e;
        }
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
