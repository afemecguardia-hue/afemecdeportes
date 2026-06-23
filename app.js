const SUPABASE_URL = 'https://mrshoeaovukolclsvypy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yc2hvZWFvdnVrb2xjbHN2eXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODAwNDAsImV4cCI6MjA5NzM1NjA0MH0.2mTVIaRy3KBRrcIHSiL6FC6SBz3f_hiicFSjTIkkThI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escCsv(str) {
    return '"' + String(str).replace(/"/g, '""') + '"';
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================
// NAVEGACIÓN
// ============================
function showSection(id) {
    document.querySelectorAll('main > section').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    const targetSection = document.getElementById(id);
    if (targetSection) {
        targetSection.style.display = 'block';
        setTimeout(() => targetSection.classList.add('active'), 10);
    }
    document.querySelectorAll('.main-nav .nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${id}`) || document.getElementById(`nav-${id}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (id === 'caja') actualizarListaCobros();
    if (id === 'admin') { cargarListadoSocios(); cargarEquiposAdmin(); }
}

// ============================
// INSCRIPCIÓN DE ATLETAS
// ============================
async function buscarSocioInscripcion() {
    const ci = document.getElementById('insc-ci').value.trim();
    if (!ci) return alert('Ingresá un número de CI');

    const { data: socio, error } = await supabaseClient
        .from('socios')
        .select('*')
        .eq('ci', ci)
        .maybeSingle();

    const resultado = document.getElementById('insc-resultado');
    if (error || !socio) {
        resultado.style.display = 'none';
        alert('Socio no encontrado');
        return;
    }
    if (!socio.habilitado) {
        resultado.style.display = 'none';
        alert('Socio deshabilitado. Contactá al administrador.');
        return;
    }

    const nombreCompleto = `${socio.nombre} ${socio.apellido}`.trim();
    document.getElementById('insc-nombre').textContent = nombreCompleto;
    document.getElementById('insc-ci-label').textContent = socio.ci;
    document.getElementById('insc-tipo').textContent = socio.tipo;
    resultado.style.display = 'block';

    // Cargar equipos
    const { data: equipos } = await supabaseClient.from('equipos').select('*').order('nombre');
    const select = document.getElementById('insc-equipo');
    select.innerHTML = '<option value="">Seleccionar equipo...</option>';
    equipos.forEach(e => {
        select.innerHTML += `<option value="${e.id}">${escHtml(e.nombre)}</option>`;
    });
}

async function inscribirAtleta() {
    const ci = document.getElementById('insc-ci-label').textContent;
    const equipoId = document.getElementById('insc-equipo').value;
    if (!equipoId) return alert('Seleccioná un equipo');

    // Obtener socio_id
    const { data: socio } = await supabaseClient
        .from('socios')
        .select('id')
        .eq('ci', ci)
        .single();

    if (!socio) return alert('Error: socio no encontrado');

    const { error } = await supabaseClient
        .from('atletas')
        .insert({ socio_id: socio.id, equipo_id: parseInt(equipoId) });

    if (error) {
        if (error.code === '23505') return alert('Este socio ya está inscripto en ese equipo');
        return alert('Error al inscribir: ' + error.message);
    }
    alert('✅ Atleta inscripto correctamente');
    document.getElementById('insc-resultado').style.display = 'none';
    document.getElementById('insc-ci').value = '';
}

// ============================
// VEEDOR (búsqueda + falta)
// ============================
async function buscarJugador() {
    const ci = document.getElementById('veedor-ci').value.trim();
    const { data: socio, error } = await supabaseClient
        .from('socios')
        .select('nombre, apellido, tipo')
        .eq('ci', ci)
        .maybeSingle();

    if (socio && !error) {
        const nombreCompleto = `${socio.nombre} ${socio.apellido}`.trim();
        document.getElementById('nombre-encontrado').innerText = `${nombreCompleto} (${socio.tipo})`;
        document.getElementById('resultado-busqueda').style.display = 'block';
    } else {
        alert('Jugador no encontrado');
    }
}

async function cargarFalta() {
    const ci = document.getElementById('veedor-ci').value.trim();
    const tipo = document.getElementById('tipo-falta').value;
    const monto = tipo === 'roja' ? 50000 : 20000;

    const { data: socio, error: err } = await supabaseClient
        .from('socios')
        .select('nombre, apellido')
        .eq('ci', ci)
        .maybeSingle();

    if (err || !socio) return alert('Jugador no encontrado');
    const nombreJugador = `${socio.nombre} ${socio.apellido}`.trim();

    const { error } = await supabaseClient.from('faltas').insert([
        { ci_jugador: ci, nombre_jugador: nombreJugador, tipo_falta: tipo, monto, pagado: false }
    ]);
    if (error) return alert('Error: ' + error.message);
    alert('✅ Falta cargada');
    if (document.getElementById('caja').style.display !== 'none') actualizarListaCobros();
    document.getElementById('resultado-busqueda').style.display = 'none';
    document.getElementById('veedor-ci').value = '';
}

// ============================
// CAJA
// ============================
async function actualizarListaCobros() {
    const lista = document.getElementById('lista-cobros');
    lista.innerHTML = "<tr><td colspan='5'>Cargando deudas...</td></tr>";

    const { data: faltas, error } = await supabaseClient
        .from('faltas').select('*').eq('pagado', false);

    if (error) return alert('Error: ' + error.message);
    lista.innerHTML = '';
    if (!faltas || faltas.length === 0) {
        lista.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--text-muted)'>No hay deudas pendientes</td></tr>";
    } else {
        faltas.forEach(f => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><strong>${escHtml(f.ci_jugador)}</strong></td>
                <td>${escHtml(f.nombre_jugador)}</td>
                <td><span class="badge badge-${escHtml(f.tipo_falta)}">Tarjeta ${escHtml(f.tipo_falta).toUpperCase()}</span></td>
                <td class="monto-col">${Number(f.monto).toLocaleString()} GS.</td>
                <td><button onclick="cobrarFalta('${f.id}')" class="btn-action">Cobrar</button></td>`;
            lista.appendChild(row);
        });
    }

    try {
        const { data: pagadas } = await supabaseClient
            .from('faltas').select('monto').eq('pagado', true);
        const total = pagadas ? pagadas.reduce((s, f) => s + (Number(f.monto) || 0), 0) : 0;
        document.getElementById('total-hoy').innerText = `${total.toLocaleString()} GS.`;
    } catch (e) { console.error(e); }
}

async function cobrarFalta(id) {
    const { error } = await supabaseClient.from('faltas').update({ pagado: true }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    actualizarListaCobros();
}

// ============================
// ADMIN: LISTADO DE SOCIOS
// ============================
async function cargarListadoSocios() {
    const tbody = document.getElementById('admin-socios-body');
    tbody.innerHTML = "<tr><td colspan='5'>Cargando...</td></tr>";

    const { data: socios, error } = await supabaseClient
        .from('socios')
        .select('*')
        .eq('tipo', 'titular')
        .order('apellido');

    if (error) return alert('Error: ' + error.message);

    tbody.innerHTML = '';
    socios.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = s.habilitado ? '' : 'row-disabled';
        tr.innerHTML = `
            <td>${escHtml(s.ci)}</td>
            <td>${escHtml(s.nombre)} ${escHtml(s.apellido)}</td>
            <td>
                <label class="toggle-switch">
                    <input type="checkbox" ${s.habilitado ? 'checked' : ''} onchange="toggleHabilitado(${s.id}, this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td><span class="badge-status-socio ${s.habilitado ? 'activo' : 'inactivo'}">${s.habilitado ? 'Habilitado' : 'Deshabilitado'}</span></td>
            <td>${new Date(s.created_at).toLocaleDateString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function toggleHabilitado(id, habilitado) {
    const { error } = await supabaseClient.from('socios').update({ habilitado }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    cargarListadoSocios();
}

// ============================
// ADMIN: EQUIPOS
// ============================
async function cargarEquiposAdmin() {
    const { data: equipos } = await supabaseClient.from('equipos').select('*').order('nombre');
    const select = document.getElementById('admin-equipo-filtro');
    select.innerHTML = '<option value="">Todos los equipos</option>';
    equipos.forEach(e => {
        select.innerHTML += `<option value="${e.id}">${escHtml(e.nombre)}</option>`;
    });
}

async function agregarEquipo() {
    const nombre = document.getElementById('admin-nuevo-equipo').value.trim();
    if (!nombre) return alert('Ingresá un nombre');
    const { error } = await supabaseClient.from('equipos').insert({ nombre });
    if (error) return alert('Error: ' + error.message);
    document.getElementById('admin-nuevo-equipo').value = '';
    cargarEquiposAdmin();
}

// ============================
// ADMIN: BÚSQUEDA POR CI
// ============================
async function buscarSocioAdmin() {
    const ci = document.getElementById('admin-buscar-ci').value.trim();
    if (!ci) return alert('Ingresá un CI');

    const { data: socio, error } = await supabaseClient
        .from('socios')
        .select('*')
        .eq('ci', ci)
        .maybeSingle();

    const resultado = document.getElementById('admin-busqueda-resultado');
    if (error || !socio) {
        resultado.style.display = 'none';
        alert('Socio no encontrado');
        return;
    }

    // Obtener equipo del atleta
    let equipoTexto = 'No inscripto';
    const { data: atleta } = await supabaseClient
        .from('atletas')
        .select('equipo_id')
        .eq('socio_id', socio.id)
        .maybeSingle();

    if (atleta) {
        const { data: eq } = await supabaseClient.from('equipos').select('nombre').eq('id', atleta.equipo_id).single();
        if (eq) equipoTexto = eq.nombre;
    }

    // Obtener familiares
    let familiaTexto = '';
    if (socio.tipo === 'titular') {
        const { data: fam } = await supabaseClient
            .from('socios')
            .select('nombre, apellido, tipo')
            .eq('familia_id', socio.id);
        if (fam && fam.length) {
            familiaTexto = fam.map(f => `${f.nombre} ${f.apellido} (${f.tipo})`).join(', ');
        }
        // También cónyuges que tengan familia_id distinto
        const { data: fam2 } = await supabaseClient
            .from('socios')
            .select('nombre, apellido, tipo')
            .eq('familia_id', socio.id);
        if (fam2 && fam2.length) {
            familiaTexto = fam2.map(f => `${f.nombre} ${f.apellido} (${f.tipo})`).join(', ');
        }
    } else {
        // Es adherente, buscar su titular
        if (socio.familia_id) {
            const { data: tit } = await supabaseClient.from('socios').select('nombre, apellido').eq('id', socio.familia_id).single();
            if (tit) familiaTexto = `Titular: ${tit.nombre} ${tit.apellido}`;
        }
    }

    document.getElementById('admin-busq-ci').textContent = socio.ci || 'N/A';
    document.getElementById('admin-busq-nombre').textContent = `${socio.nombre} ${socio.apellido}`.trim();
    document.getElementById('admin-busq-tipo').textContent = socio.tipo;
    document.getElementById('admin-busq-equipo').textContent = equipoTexto;
    document.getElementById('admin-busq-estado').textContent = socio.habilitado ? 'Habilitado' : 'Deshabilitado';
    document.getElementById('admin-busq-familia').textContent = familiaTexto || 'Sin familiares registrados';
    resultado.style.display = 'block';
}

// ============================
// LOGIN
// ============================
document.getElementById('form-login').addEventListener('submit', async function(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value.toLowerCase().trim();
    const pass = document.getElementById('login-pass').value;

    let userData = null;
    let fallback = false;

    try {
        const { data, error } = await supabaseClient.from('users').select('*').eq('username', user).single();
        if (error || !data) fallback = true;
        else userData = data;
    } catch (err) { fallback = true; }

    if (fallback) {
        const passHash = await hashPassword(pass);
        const localUsers = {
            'veedor': { role: 'veedor', username: 'veedor', passHash: '64f4dc20b9216cc602771ee195f9486da0db3dd3b402be04af583d7eec23d940' },
            'caja': { role: 'caja', username: 'caja', passHash: '64f4dc20b9216cc602771ee195f9486da0db3dd3b402be04af583d7eec23d940' },
            'admin': { role: 'admin', username: 'admin', passHash: '64f4dc20b9216cc602771ee195f9486da0db3dd3b402be04af583d7eec23d940' }
        };
        const localUser = localUsers[user];
        if (localUser && localUser.passHash === passHash) userData = { role: localUser.role, username: localUser.username };
    } else {
        const passHash = await hashPassword(pass);
        if (userData.password_hash !== passHash) userData = null;
    }

    if (userData) {
        localStorage.setItem('userRole', userData.role);
        localStorage.setItem('username', userData.username);

        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'block';

        document.getElementById('nav-veedor').style.display = 'none';
        document.getElementById('nav-caja').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';

        if (userData.role === 'veedor') {
            document.getElementById('nav-veedor').style.display = 'block';
            showSection('veedor');
        } else if (userData.role === 'caja') {
            document.getElementById('nav-caja').style.display = 'block';
            showSection('caja');
        } else if (userData.role === 'admin') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('nav-admin').style.display = 'block';
            showSection('admin');
        }
        alert(`Bienvenido al Panel de ${userData.role.toUpperCase()}`);
        this.reset();
    } else {
        alert('Usuario o contraseña incorrectos.');
    }
});

function logout() {
    localStorage.removeItem('userRole');
    localStorage.removeItem('username');
    location.reload();
}

// ============================
// INICIALIZACIÓN
// ============================
document.addEventListener('DOMContentLoaded', () => {
    showSection('registro');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const userRole = localStorage.getItem('userRole');
    if (userRole) {
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'block';

        if (userRole === 'veedor') {
            document.getElementById('nav-veedor').style.display = 'block';
            showSection('veedor');
        } else if (userRole === 'caja') {
            document.getElementById('nav-caja').style.display = 'block';
            showSection('caja');
        } else if (userRole === 'admin') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('nav-admin').style.display = 'block';
            showSection('admin');
        }
    } else {
        document.getElementById('nav-login').style.display = 'block';
        showSection('registro');
    }
});
