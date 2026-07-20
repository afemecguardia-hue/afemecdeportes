const API_URL = ''; // Mismo origen (sin puerto fijo)

class OracleQuery {
    constructor(table) {
        this.table = table;
        this.params = {};
        this.filters = [];
        this._single = false;
        this._maybeSingle = false;
        this._countOnly = false;
        this._selectCols = '*';
    }

    select(cols, opts) {
        if (typeof cols === 'string') this._selectCols = cols;
        else if (cols === '*') this._selectCols = '*';
        if (opts) {
            if (opts.count === 'exact' && opts.head === true) this._countOnly = true;
        }
        return this;
    }

    eq(col, val) { this.params[col] = 'eq.' + val; return this; }
    neq(col, val) { this.params[col] = 'neq.' + val; return this; }
    gte(col, val) { this.params[col] = 'gte.' + val; return this; }
    lte(col, val) { this.params[col] = 'lte.' + val; return this; }

    in(col, vals) {
        if (!vals || !vals.length) { this.params[col] = 'in.()'; return this; }
        this.params[col] = 'in.(' + vals.join(',') + ')';
        return this;
    }

    ilike(col, pattern) { this.params[col] = 'ilike.' + pattern; return this; }

    or(expr) { this.params['or'] = 'or.' + expr; return this; }

    order(col, opts) {
        const ascending = opts && opts.ascending !== undefined ? opts.ascending : true;
        this.params.order = JSON.stringify({ column: col, ascending });
        return this;
    }

    limit(n) { this.params.limit = String(n); return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._maybeSingle = true; return this; }

    async then(resolve, reject) {
        try {
            const result = await this._execute();
            resolve(result);
        } catch (err) {
            if (reject) reject(err);
            else resolve({ data: null, error: { message: err.message } });
        }
    }

    async _execute() {
        const params = { ...this.params };
        params.select = this._selectCols;
        if (this._single) params._single = 'true';
        if (this._maybeSingle) params._maybeSingle = 'true';
        if (this._countOnly) { params.count = 'exact'; params.head = 'true'; }

        const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        const url = `${API_URL}/api/rest/${this.table}?${qs}`;
        const resp = await fetch(url);
        const json = await resp.json();
        return json;
    }
}

class OracleInsertQuery {
    constructor(table, data) {
        this.table = table;
        this.data = data;
        this._returnData = false;
    }

    select(cols) { this._returnData = true; return this; }

    async then(resolve, reject) {
        try {
            const url = `${API_URL}/api/rest/${this.table}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.data)
            });
            const json = await resp.json();
            resolve(json);
        } catch (err) {
            if (reject) reject(err);
            else resolve({ data: null, error: { message: err.message } });
        }
    }
}

class OracleUpdateQuery {
    constructor(table, data) {
        this.table = table;
        this.data = data;
        this.params = {};
    }

    eq(col, val) { this.params[col] = 'eq.' + val; return this; }

    async then(resolve, reject) {
        try {
            const qs = Object.entries(this.params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
            const url = `${API_URL}/api/rest/${this.table}?${qs}`;
            const resp = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.data)
            });
            const json = await resp.json();
            resolve(json);
        } catch (err) {
            if (reject) reject(err);
            else resolve({ data: null, error: { message: err.message } });
        }
    }
}

class OracleDeleteQuery {
    constructor(table) {
        this.table = table;
        this.params = {};
    }

    eq(col, val) { this.params[col] = 'eq.' + val; return this; }

    async then(resolve, reject) {
        try {
            const qs = Object.entries(this.params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
            const url = `${API_URL}/api/rest/${this.table}?${qs}`;
            const resp = await fetch(url, { method: 'DELETE' });
            const json = await resp.json();
            resolve(json);
        } catch (err) {
            if (reject) reject(err);
            else resolve({ data: null, error: { message: err.message } });
        }
    }
}

class OracleUpsertQuery {
    constructor(table, data, opts) {
        this.table = table;
        this.data = data;
        this.opts = opts || {};
        this._selectCols = null;
    }

    select(cols) { this._selectCols = cols; return this; }

    async then(resolve, reject) {
        try {
            const rows = Array.isArray(this.data) ? this.data : [this.data];
            const url = `${API_URL}/api/rest/${this.table}/upsert`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows, onConflict: this.opts.onConflict || 'CI' })
            });
            const json = await resp.json();
            resolve(json);
        } catch (err) {
            if (reject) reject(err);
            else resolve({ data: null, error: { message: err.message } });
        }
    }
}

class OracleTable {
    constructor(name) {
        this.name = name;
    }

    select(cols, opts) { return new OracleQuery(this.name).select(cols, opts); }
    insert(data) { return new OracleInsertQuery(this.name, data); }
    update(data) { return new OracleUpdateQuery(this.name, data); }
    delete() { return new OracleDeleteQuery(this.name); }
    upsert(data, opts) { return new OracleUpsertQuery(this.name, data, opts); }
}

function oracleRpc(fnName) {
    return {
        async then(resolve, reject) {
            try {
                const url = `${API_URL}/api/rpc/${fnName}`;
                const resp = await fetch(url, { method: 'POST' });
                const json = await resp.json();
                resolve(json);
            } catch (err) {
                if (reject) reject(err);
                else resolve({ data: null, error: { message: err.message } });
            }
        }
    };
}

const OracleChannel = {
    _handlers: {},
    _intervals: {},

    channel(name) {
        if (!this._handlers[name]) this._handlers[name] = [];
        return {
            on(event, opts, callback) {
                if (typeof opts === 'function') { callback = opts; opts = {}; }
                OracleChannel._handlers[name].push({ event, opts, callback });
                return this;
            },
            subscribe() {
                const handlers = OracleChannel._handlers[name];
                if (!handlers) return;

                const isGlobal = name === 'estadisticas-realtime';
                const esUrl = isGlobal
                    ? `${API_URL}/api/events/global`
                    : null;

                if (isGlobal) {
                    const es = new EventSource(esUrl);
                    es.addEventListener('INSERT', (e) => {
                        const payload = JSON.parse(e.data);
                        handlers.filter(h => h.event === 'INSERT').forEach(h => h.callback(payload));
                    });
                    es.addEventListener('UPDATE', (e) => {
                        const payload = JSON.parse(e.data);
                        handlers.filter(h => h.event === 'UPDATE').forEach(h => h.callback(payload));
                    });
                    OracleChannel._intervals[name] = es;
                }

                const partidoMatch = name.match(/^partido-(.+)$/);
                if (partidoMatch) {
                    const pid = partidoMatch[1];
                    const es = new EventSource(`${API_URL}/api/events/partido/${pid}`);
                    es.addEventListener('UPDATE', (e) => {
                        const payload = JSON.parse(e.data);
                        handlers.filter(h => h.event === 'UPDATE').forEach(h => h.callback(payload));
                    });
                    es.addEventListener('INSERT', (e) => {
                        const payload = JSON.parse(e.data);
                        handlers.filter(h => h.event === 'INSERT').forEach(h => h.callback(payload));
                    });
                    OracleChannel._intervals[name] = es;
                }

                return this;
            }
        };
    },

    removeChannel(ch) {
        const name = ch._name;
        if (OracleChannel._intervals[name]) {
            OracleChannel._intervals[name].close();
            delete OracleChannel._intervals[name];
        }
    }
};

const oracleClient = {
    from(table) { return new OracleTable(table); },
    rpc: oracleRpc,
    channel(name) { return OracleChannel.channel(name); },
    removeChannel(ch) { OracleChannel.removeChannel(ch); }
};

window.supabase = oracleClient;
window.oracleClient = oracleClient;
