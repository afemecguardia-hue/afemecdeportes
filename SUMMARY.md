## Objective
- Complete migration of AFEMEC Deportes web app from Supabase to Oracle Cloud Autonomous Database with a Node.js REST API layer + oracledb

## Important Details
- Project deployed at `C:\Users\user\Desktop\afemecdeportes666`
- Oracle Instant Client installed at `C:\oracle\instantclient\instantclient_23_0`
- Wallet files copied to `C:\oracle\instantclient\instantclient_23_0\network\admin\`
- TNS_ADMIN must be set to wallet directory for connections to work
- Login works: all users (`admin`, `veedor`, `caja`) have password `admin`
- All Oracle columns are UPPERCASE; the API transforms responses to lowercase via `lowerKeys()` to match `app.js` expectations
- FK join column aliasing uses `FK_` prefix to avoid collisions with `t.*` column names
- telefono column was missing from titulares, conyuges, hijos — added as VARCHAR2(50)
- Old PostgREST join syntax with space before paren (e.g. `socios (id,nombre)`) is now supported

## Work State
### Completed
- Cloned repo from GitHub to `C:\Users\user\Desktop\afemecdeportes666`
- Installed Oracle Instant Client 23 at `C:\oracle\instantclient\instantclient_23_0`
- Extracted wallet files to Instant Client `network\admin\`
- Ran `npm install` (oracledb, express, cors)
- Created `api/db.js` — Oracle pool (thick mode) with TNS_ADMIN setup
- Created `api/server.js` — Express REST API with FK joins, filters, upsert, SSE, lowerKeys() transform
- Created `db.js` — Client-side Supabase-compatible wrapper (OracleQuery, etc.)
- Modified `index.html` — Supabase CDN → `<script src="db.js">`
- Modified `app.js` — `supabaseClient = oracleClient`
- Updated `package.json` with oracledb/express/cors deps
- Fixed FK join column aliasing — uses `FK_ALIAS_COL` prefix to avoid `t.*` collision and case-insensitive matching
- Fixed regex patterns in `parseSelectWithJoins` — allows optional whitespace before `(` for old PostgREST syntax
- Added `telefono VARCHAR2(50)` to titulares, conyuges, hijos tables
- Reset all user passwords to `admin` (SHA-256 hash)
- Verified API works: simple queries, FK joins with `*` and specific columns, `.or()` filters, count queries, upserts
- Fixed `allCols` empty-string leading comma bug causing ORA-00936 when select has only FK joins
- Both servers running: API on port 3046, static on port 3045

### What's Running
- API server: `http://localhost:3046/api/rest/...`
- Static server: `http://localhost:3045/index.html`

### Pending / Next Steps
1. ~~Debug the `hijo:hijos(*)` FK join error~~ ✅ Fixed
2. Verify full inscription flow works end-to-end in the browser
3. Test admin socios panel (cargarListadoSocios, toggleHabilitado)
4. Test `importar-csv.html` page
5. Test any remaining pages/features that might hit PostgREST syntax not yet handled

## Relevant Files
- `C:\Users\user\Desktop\afemecdeportes666\api\db.js`: Oracle connection pool with thick mode + TNS_ADMIN
- `C:\Users\user\Desktop\afemecdeportes666\api\server.js`: Express REST API, all routes, FK joins, lowerKeys()
- `C:\Users\user\Desktop\afemecdeportes666\db.js`: Client-side Supabase-compatible query wrapper
- `C:\Users\user\Desktop\afemecdeportes666\app.js`: Main app — replaced supabase.createClient() with oracleClient
- `C:\Users\user\Desktop\afemecdeportes666\index.html`: Replaced Supabase CDN with db.js
- `C:\Users\user\Desktop\afemecdeportes666\importar-csv.html`: Rewritten for Oracle API
- `C:\Users\user\Desktop\afemecdeportes666\package.json`: Updated with oracledb, express, cors
- `C:\oracle\instantclient\instantclient_23_0\network\admin\`: Wallet files (tnsnames.ora, cwallet.sso, ewallet.p12, sqlnet.ora)
