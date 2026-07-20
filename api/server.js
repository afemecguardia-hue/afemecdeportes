const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const { execute, closePool, getPool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

try { require('dotenv').config(); } catch {}
const PORT = process.env.PORT || process.env.API_PORT || 3046;

const FK_MAP = {
    atletas: {
        equipo: { table: 'equipos', fk: 'equipo_id', cols: ['id', 'nombre'] },
        socio: { table: 'titulares', fk: 'socio_id', cols: ['id', 'nombre', 'apellido', 'ci', 'habilitado', 'fecha_nacimiento'] },
        socios: { table: 'titulares', fk: 'socio_id', cols: ['id', 'nombre', 'apellido', 'ci', 'habilitado', 'fecha_nacimiento'] },
        categoria: { table: 'categorias_config', fk: 'categoria_id', cols: ['id', 'nombre'] }
    },
    conyuges: {
        titular: { table: 'titulares', fk: 'titular_id', cols: ['*'] }
    },
    hijo_titular: {
        hijo: { table: 'hijos', fk: 'hijo_id', cols: ['*'] },
        titular: { table: 'titulares', fk: 'titular_id', cols: ['*'] }
    }
};

const _tableColsCache = {};
async function getTableColumns(table) {
    if (_tableColsCache[table]) return _tableColsCache[table];
    try {
        const r = await execute(`SELECT column_name FROM user_tab_columns WHERE table_name = :1 ORDER BY column_id`, [table.toUpperCase()]);
        _tableColsCache[table] = r.rows.map(row => row.COLUMN_NAME);
    } catch {
        _tableColsCache[table] = ['ID'];
    }
    return _tableColsCache[table];
}

function parseFilters(query, startIdx) {
    const filters = [];
    const binds = {};
    let bindIdx = startIdx || 0;

    for (const [key, val] of Object.entries(query)) {
        if (['select', 'order', 'limit', 'head', 'count', '_single', '_maybeSingle'].includes(key)) continue;
        if (typeof val !== 'string') continue;

        if (val.startsWith('eq.')) {
            const v = val.slice(3);
            const b = `b${++bindIdx}`;
            filters.push(`${key} = :${b}`);
            if (v === 'true') binds[b] = 1;
            else if (v === 'false') binds[b] = 0;
            else { const numVal = Number(v); binds[b] = (!isNaN(numVal) && v !== '' && String(numVal) === v) ? numVal : v; }
        } else if (val.startsWith('neq.')) {
            const b = `b${++bindIdx}`;
            filters.push(`${key} != :${b}`);
            const nv = val.slice(4);
            if (nv === 'true') binds[b] = 1;
            else if (nv === 'false') binds[b] = 0;
            else binds[b] = nv;
        } else if (val.startsWith('gte.')) {
            const b = `b${++bindIdx}`;
            filters.push(`${key} >= :${b}`);
            binds[b] = val.slice(4);
        } else if (val.startsWith('lte.')) {
            const b = `b${++bindIdx}`;
            filters.push(`${key} <= :${b}`);
            binds[b] = val.slice(4);
        } else if (val.startsWith('in.')) {
            const vals = val.slice(3).replace(/^\(|\)$/g, '').split(',');
            const placeholders = vals.map((v) => {
                const b = `b${++bindIdx}`;
                const trimmed = v.trim();
                if (trimmed === 'true') { binds[b] = 1; return `:${b}`; }
                if (trimmed === 'false') { binds[b] = 0; return `:${b}`; }
                const numV = Number(trimmed);
                binds[b] = (!isNaN(numV) && trimmed !== '') ? numV : trimmed;
                return `:${b}`;
            });
            filters.push(`${key} IN (${placeholders.join(',')})`);
        } else if (val.startsWith('ilike.')) {
            const b = `b${++bindIdx}`;
            filters.push(`UPPER(${key}) LIKE UPPER(:${b})`);
            binds[b] = val.slice(6);
        } else if (val.startsWith('or.')) {
            const orParts = val.slice(3).split(',');
            const orConditions = orParts.map(part => {
                const dotIdx = part.indexOf('.');
                if (dotIdx === -1) return '1=1';
                const col = part.substring(0, dotIdx);
                const opVal = part.substring(dotIdx + 1);
                if (opVal.startsWith('eq.')) {
                    const b = `b${++bindIdx}`;
                    const v = opVal.slice(3);
                    if (v === 'true') binds[b] = 1;
                    else if (v === 'false') binds[b] = 0;
                    else { const numV = Number(v); binds[b] = (!isNaN(numV) && v !== '') ? numV : v; }
                    return `${col} = :${b}`;
                }
                return '1=1';
            });
            filters.push(`(${orConditions.join(' OR ')})`);
        }
    }
    return { filters, binds, lastIdx: bindIdx };
}

async function parseSelectWithJoins(selectStr, table) {
    if (!selectStr || selectStr === '*') return { columns: '*', joins: [], fkAliases: [] };

    const segments = [];
    let depth = 0, current = '';
    for (const ch of selectStr) {
        if (ch === '(') { depth++; current += ch; }
        else if (ch === ')') { depth--; current += ch; }
        else if (ch === ',' && depth === 0) { segments.push(current.trim()); current = ''; }
        else { current += ch; }
    }
    if (current.trim()) segments.push(current.trim());

    const plainCols = [];
    const joins = [];
    const fkAliases = [];
    const fkDefs = FK_MAP[table] || {};

    for (const seg of segments) {
        if (seg === '*') { plainCols.push('t.*'); continue; }

        const fkMatch1 = seg.match(/^(\w+):(\w+)\s*\((.+)\)$/);
        if (fkMatch1) {
            const [, alias, fkCol, innerCols] = fkMatch1;
            const fkDef = fkDefs[alias];
            if (fkDef) {
                const pfx = `FK_${alias.toUpperCase()}_`;
                if (innerCols === '*') {
                    const tblCols = await getTableColumns(fkDef.table);
                    const cols = tblCols.map(c => `${alias.toUpperCase()}.${c} AS ${pfx}${c}`);
                    joins.push({ alias: alias.toUpperCase(), table: fkDef.table, on: `t.${fkDef.fk} = ${alias.toUpperCase()}.ID`, cols });
                    fkAliases.push({ alias, innerCols: '*', prefix: pfx });
                } else {
                    const cols = innerCols.split(',').map(c => `${alias.toUpperCase()}.${c.trim()} AS ${pfx}${c.trim().toUpperCase()}`);
                    joins.push({ alias: alias.toUpperCase(), table: fkDef.table, on: `t.${fkDef.fk} = ${alias.toUpperCase()}.ID`, cols });
                    fkAliases.push({ alias, innerCols: innerCols.split(',').map(c => c.trim()), prefix: pfx });
                }
            }
            continue;
        }

        const fkMatch2 = seg.match(/^(\w+)\s*\((.+)\)$/);
        if (fkMatch2) {
            const [, alias, innerCols] = fkMatch2;
            const fkDef = fkDefs[alias];
            if (fkDef) {
                const pfx = `FK_${alias.toUpperCase()}_`;
                if (innerCols === '*') {
                    const tblCols = await getTableColumns(fkDef.table);
                    const cols = tblCols.map(c => `${alias.toUpperCase()}.${c} AS ${pfx}${c}`);
                    joins.push({ alias: alias.toUpperCase(), table: fkDef.table, on: `t.${fkDef.fk} = ${alias.toUpperCase()}.ID`, cols });
                    fkAliases.push({ alias, innerCols: '*', prefix: pfx });
                } else {
                    const cols = innerCols.split(',').map(c => `${alias.toUpperCase()}.${c.trim()} AS ${pfx}${c.trim().toUpperCase()}`);
                    joins.push({ alias: alias.toUpperCase(), table: fkDef.table, on: `t.${fkDef.fk} = ${alias.toUpperCase()}.ID`, cols });
                    fkAliases.push({ alias, innerCols: innerCols.split(',').map(c => c.trim()), prefix: pfx });
                }
            }
            continue;
        }

        if (seg === 'created_at') { plainCols.push('t.created_at'); continue; }
        if (seg === 'id') { plainCols.push('t.id'); continue; }
        plainCols.push('t.' + seg);
    }

    return { columns: plainCols.join(', '), joins, fkAliases };
}

async function buildSql(table, selectStr, filters, binds, orderParam, limitParam, startIdx) {
    const { columns, joins, fkAliases } = await parseSelectWithJoins(selectStr, table);
    const joinCols = joins.flatMap(j => j.cols);
    const allCols = [columns, ...joinCols].filter(c => c.trim());
    let sql = `SELECT ${allCols.join(', ')} FROM ${table} t`;
    let bindIdx = startIdx || 0;

    for (const j of joins) {
        sql += ` LEFT JOIN ${j.table} ${j.alias} ON ${j.on}`;
    }

    if (filters.length) sql += ` WHERE ${filters.join(' AND ')}`;

    if (orderParam) {
        try {
            const parsed = JSON.parse(orderParam);
            const dir = parsed.ascending === false ? 'DESC' : 'ASC';
            sql += ` ORDER BY t.${parsed.column || '1'} ${dir}`;
        } catch {
            sql += ` ORDER BY t.${orderParam} ASC`;
        }
    }

    if (limitParam) {
        sql += ` FETCH FIRST ${parseInt(limitParam)} ROWS ONLY`;
    }

    return { sql, fkAliases };
}

function flattenRow(row, fkAliases) {
    if (!fkAliases.length) return row;
    const result = {};
    const consumed = new Set();

    for (const fk of fkAliases) {
        const obj = {};
        let hasAny = false;
        if (fk.innerCols === '*') {
            for (const [k, v] of Object.entries(row)) {
                if (k.toUpperCase().startsWith(fk.prefix.toUpperCase())) {
                    const rawKey = k.slice(fk.prefix.length);
                    obj[rawKey] = v;
                    consumed.add(k);
                    hasAny = true;
                }
            }
        } else {
            for (const col of fk.innerCols) {
                const keyUpper = fk.prefix.toUpperCase() + col.toUpperCase();
                const keyOrig = fk.prefix + col;
                const val = row[keyUpper] !== undefined ? row[keyUpper] : row[keyOrig];
                if (val !== undefined) {
                    obj[col] = val;
                    consumed.add(keyUpper);
                    consumed.add(keyOrig);
                    hasAny = true;
                }
            }
        }
        result[fk.alias] = hasAny ? obj : null;
    }

    for (const [k, v] of Object.entries(row)) {
        if (!consumed.has(k)) result[k] = v;
    }
    return result;
}

function lowerKeys(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(lowerKeys);
    if (obj instanceof Date) {
        const y = obj.getFullYear();
        const m = String(obj.getMonth() + 1).padStart(2, '0');
        const d = String(obj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    if (obj.constructor !== Object) return obj;
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        result[k.toLowerCase()] = lowerKeys(v);
    }
    return result;
}

app.get('/api/rest/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const selectStr = req.query.select || '*';
        const { filters, binds, lastIdx } = parseFilters(req.query);
        const isCountOnly = req.query.count === 'exact' && req.query.head === 'true';

        if (isCountOnly) {
            const sql = `SELECT COUNT(*) as CNT FROM ${table}` + (filters.length ? ` WHERE ${filters.join(' AND ')}` : '');
            const result = await execute(sql, binds);
            return res.json({ count: result.rows[0]?.CNT || 0, error: null, data: null });
        }

        const { sql, fkAliases } = await buildSql(table, selectStr, filters, binds, req.query.order, req.query.limit, lastIdx);
        const result = await execute(sql, binds);
        let data = (result.rows || []).map(r => lowerKeys(flattenRow(r, fkAliases)));

        const wantsSingle = req.query._single === 'true';
        const wantsMaybeSingle = req.query._maybeSingle === 'true';

        if (wantsSingle) {
            if (data.length === 0) return res.json({ data: null, error: { message: 'Row not found', code: 'PGRST116' } });
            if (data.length > 1) return res.json({ data: null, error: { message: 'Multiple rows', code: 'PGRST116' } });
            data = data[0];
        } else if (wantsMaybeSingle) {
            data = data.length > 0 ? data[0] : null;
        }

        res.json({ data, error: null });
    } catch (err) {
        console.error('GET error:', err);
        res.status(500).json({ data: null, error: { message: err.message } });
    }
});

app.post('/api/rest/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const body = req.body;
        const rows = Array.isArray(body) ? body : [body];
        const inserted = [];

        for (const row of rows) {
            const cols = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null);
            if (!cols.length) continue;
            const vals = cols.map(c => row[c]);
            const placeholders = cols.map((_, i) => `:${i + 1}`);
            let sql;
            let binds;
            try {
                sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING id INTO :rid`;
                binds = [...vals, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }];
                const result = await execute(sql, binds, { autoCommit: true });
                inserted.push({ id: result.outBinds?.rid?.[0], ...row });
            } catch (e) {
                if (e.message && e.message.includes('RETURNING')) {
                    sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
                    binds = vals;
                    await execute(sql, binds, { autoCommit: true });
                    inserted.push(row);
                } else {
                    throw e;
                }
            }
        }

        res.json({ data: inserted.length === 1 ? inserted[0] : inserted, error: null });
    } catch (err) {
        console.error('POST error:', err);
        res.status(500).json({ data: null, error: { message: err.message } });
    }
});

app.patch('/api/rest/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const body = req.body;
        const { filters, binds, lastIdx } = parseFilters(req.query);
        if (!filters.length) return res.status(400).json({ data: null, error: { message: 'No filters' } });

        const setClauses = [];
        let bindIdx = lastIdx;
        const setBinds = {};
        for (const [k, v] of Object.entries(body)) {
            const b = `s${++bindIdx}`;
            setClauses.push(`${k} = :${b}`);
            setBinds[b] = v;
        }

        const allBinds = { ...binds, ...setBinds };
        const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${filters.join(' AND ')}`;
        await execute(sql, allBinds, { autoCommit: true });
        res.json({ data: null, error: null });
    } catch (err) {
        console.error('PATCH error:', err);
        res.status(500).json({ data: null, error: { message: err.message } });
    }
});

app.delete('/api/rest/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const { filters, binds } = parseFilters(req.query);
        if (!filters.length) return res.status(400).json({ data: null, error: { message: 'No filters' } });
        const sql = `DELETE FROM ${table} WHERE ${filters.join(' AND ')}`;
        await execute(sql, binds, { autoCommit: true });
        res.json({ data: null, error: null });
    } catch (err) {
        console.error('DELETE error:', err);
        res.status(500).json({ data: null, error: { message: err.message } });
    }
});

app.post('/api/rest/:table/upsert', async (req, res) => {
    try {
        const { table } = req.params;
        const { rows, onConflict } = req.body;
        const conflictCol = (onConflict || 'CI').toUpperCase();
        const inserted = [];

        for (const row of rows) {
            const cols = Object.keys(row).filter(k => row[k] !== undefined);
            if (!cols.length) continue;
            const vals = cols.map(c => row[c]);
            const updateCols = cols.filter(c => c.toUpperCase() !== conflictCol);

            if (updateCols.length > 0) {
                const mergeUsing = cols.map((c, i) => `:${i + 1} AS ${c}`).join(', ');
                const mergeBinds = {};
                cols.forEach((c, i) => { mergeBinds[i + 1] = vals[i]; });
                const whenMatched = updateCols.map(c => `${c} = s.${c}`).join(', ');
                const sql = `MERGE INTO ${table} t USING (SELECT ${mergeUsing} FROM dual) s ON (t.${conflictCol} = s.${conflictCol}) WHEN MATCHED THEN UPDATE SET ${whenMatched} WHEN NOT MATCHED THEN INSERT (${cols.join(',')}) VALUES (${cols.map(c => `s.${c}`).join(',')})`;
                await execute(sql, mergeBinds, { autoCommit: true });
            } else {
                const placeholders = cols.map((_, i) => `:${i + 1}`);
                const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
                const binds = {};
                cols.forEach((c, i) => { binds[i + 1] = vals[i]; });
                await execute(sql, binds, { autoCommit: true });
            }
            inserted.push(row);
        }
        res.json({ data: inserted, error: null });
    } catch (err) {
        console.error('UPSERT error:', err);
        res.status(500).json({ data: null, error: { message: err.message } });
    }
});

app.post('/api/rpc/:function', async (req, res) => {
    try {
        const { function: fn } = req.params;
        const sql = `BEGIN ${fn}(); END;`;
        await execute(sql, [], { autoCommit: true });
        res.json({ data: null, error: null });
    } catch (err) {
        console.error('RPC error:', err);
        res.status(500).json({ data: null, error: { message: err.message } });
    }
});

let sseClients = { global: [], partidos: {} };

app.get('/api/events/global', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(':\n\n');
    const id = Date.now();
    sseClients.global.push({ id, res });
    req.on('close', () => { sseClients.global = sseClients.global.filter(c => c.id !== id); });
});

app.get('/api/events/partido/:id', (req, res) => {
    const pid = req.params.id;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(':\n\n');
    const cid = Date.now();
    if (!sseClients.partidos[pid]) sseClients.partidos[pid] = [];
    sseClients.partidos[pid].push({ id: cid, res });
    req.on('close', () => {
        if (sseClients.partidos[pid]) sseClients.partidos[pid] = sseClients.partidos[pid].filter(c => c.id !== cid);
    });
});

function broadcastGlobal(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.global.forEach(c => c.res.write(msg));
}

function broadcastPartido(partidoId, event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    if (sseClients.partidos[partidoId]) sseClients.partidos[partidoId].forEach(c => c.res.write(msg));
}

app._broadcastGlobal = broadcastGlobal;
app._broadcastPartido = broadcastPartido;

process.on('SIGTERM', async () => { await closePool(); process.exit(0); });
process.on('SIGINT', async () => { await closePool(); process.exit(0); });

app.listen(PORT, () => {
    console.log(`API Oracle escuchando en http://localhost:${PORT}`);
    getPool().then(() => console.log('Pool Oracle listo')).catch(e => console.error('Error pool:', e));
});

module.exports = app;
