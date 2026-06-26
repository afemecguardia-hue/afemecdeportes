const SUPABASE_URL = 'https://mrshoeaovukolclsvypy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yc2hvZWFvdnVrb2xjbHN2eXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODAwNDAsImV4cCI6MjA5NzM1NjA0MH0.2mTVIaRy3KBRrcIHSiL6FC6SBz3f_hiicFSjTIkkThI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let categoriasConfig = [];
let canchasList = [];
let equiposList = [];
let configFaltas = [];
let categoriaEquiposMap = {};

async function inicializarTablasAuxiliares() {
    try {
        const { data: cats } = await supabaseClient.from('categorias_config').select('*').order('edad_min');
        if (cats) categoriasConfig = cats;

        const { data: cnchs } = await supabaseClient.from('canchas').select('*').order('nombre');
        if (cnchs) canchasList = cnchs;

        const { data: eqs } = await supabaseClient.from('equipos').select('*').order('nombre');
        if (eqs) equiposList = eqs;

        const { data: cf } = await supabaseClient.from('config_faltas').select('*').order('id');
        if (cf && cf.length) configFaltas = cf;

        const { data: catEqs } = await supabaseClient.from('categoria_equipos').select('*');
        categoriaEquiposMap = {};
        if (catEqs) {
            catEqs.forEach(ce => {
                if (!categoriaEquiposMap[ce.categoria_id]) categoriaEquiposMap[ce.categoria_id] = [];
                categoriaEquiposMap[ce.categoria_id].push(ce.equipo_id);
            });
        }

        // Fallback por si la tabla está vacía o no existe
        if (!configFaltas.length) {
            configFaltas = [
                { tipo: 'amarilla', nombre: 'Tarjeta Amarilla', monto: 15000 },
                { tipo: 'azul', nombre: 'Tarjeta Azul (2 min)', monto: 15000 },
                { tipo: 'roja', nombre: 'Tarjeta Roja', monto: 30000 }
            ];
        }

        actualizarSelectsPartidos();
        cargarEstadisticas();
    } catch (e) {
        console.error('Error al inicializar datos auxiliares:', e);
        configFaltas = [
            { tipo: 'amarilla', nombre: 'Tarjeta Amarilla', monto: 15000 },
            { tipo: 'azul', nombre: 'Tarjeta Azul (2 min)', monto: 15000 },
            { tipo: 'roja', nombre: 'Tarjeta Roja', monto: 30000 }
        ];
    }
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

    if (id === 'veedor') {
        veedorCargarPartidos();
    }
    if (id === 'caja') {
        actualizarListaCobros();
        // Mostrar solo pagos de hoy por defecto
        const hoy = new Date().toISOString().slice(0,10);
        if (document.getElementById('hist-fecha-desde')) document.getElementById('hist-fecha-desde').value = hoy;
        cargarArqueo(hoy, hoy, '');
    }
    if (id === 'admin') {
        cargarListadoSocios();
        cargarEquiposAdmin();
        cargarCategoriasAdmin();
        cargarCanchasAdmin();
        cargarPartidosAdmin();
        cargarAdminAtletas();
        cargarConfigFaltasAdmin();
    }
    if (id === 'programacion') {
        cargarEstadisticas();
    }
}

// ============================
// INSCRIPCIÓN DE ATLETAS
// ============================
function limpiarCI(val) {
    return val.trim().replace(/[.,\s]/g, '');
}

async function buscarSocioInscripcion() {
    const ci = limpiarCI(document.getElementById('insc-ci').value);
    if (!ci) return alert('Ingresá un número de CI');

    const { data: socios, error } = await supabaseClient
        .from('socios')
        .select('*')
        .eq('ci', ci)
        .limit(1);

    const socio = socios && socios[0];
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

    // Guardamos el id del socio en data attributes
    resultado.dataset.socioId = socio.id;
    resultado.dataset.socioCi = socio.ci;

    const nombreCompleto = `${socio.nombre} ${socio.apellido}`.trim();
    document.getElementById('insc-nombre').textContent = nombreCompleto;
    document.getElementById('insc-ci-label').textContent = socio.ci;
    document.getElementById('insc-estado-label').textContent = socio.habilitado ? 'Habilitado' : 'Deshabilitado';

    // Contar atletas ya registrados bajo este titular
    const { data: familiaIds } = await supabaseClient
        .from('socios')
        .select('id')
        .eq('familia_id', socio.id);
    const ids = [socio.id, ...(familiaIds || []).map(f => f.id)];
    const { count: atletasCount, error: errCount } = await supabaseClient
        .from('atletas')
        .select('*', { count: 'exact', head: true })
        .in('socio_id', ids);

    const cupoMaximo = 6;
    const usados = atletasCount || 0;
    const disponibles = Math.max(0, cupoMaximo - usados);
    document.getElementById('insc-cupo-contador').textContent = `${usados} / ${cupoMaximo}`;

    const formAdh = document.getElementById('insc-formulario-adherente');
    const msgLleno = document.getElementById('insc-cupo-lleno-msg');

    if (usados >= cupoMaximo) {
        formAdh.style.display = 'none';
        msgLleno.style.display = 'block';
    } else {
        formAdh.style.display = 'block';
        msgLleno.style.display = 'none';
        
        // Cargar equipos en el selector con cupo
        const select = document.getElementById('insc-equipo');
        select.innerHTML = '<option value="">Seleccionar equipo...</option>';
        const cuposData = await Promise.all(equiposList.map(e =>
            supabaseClient.from('atletas').select('*', { count: 'exact', head: true }).eq('equipo_id', e.id)
        ));
        let allOptsHtml = '<option value="">Seleccionar equipo...</option>';
        equiposList.forEach((e, i) => {
            const cupo = e.cupo_maximo || 15;
            const usados = cuposData[i].count || 0;
            allOptsHtml += `<option value="${e.id}" ${usados >= cupo ? 'disabled' : ''}>${escHtml(e.nombre)} (${usados}/${cupo})</option>`;
        });
        select.innerHTML = allOptsHtml;
        select.dataset.allOptions = allOptsHtml;
        // Si ya hay una edad/categoría calculada, filtrar
        const edadTexto = document.getElementById('insc-atleta-edad-label').textContent;
        if (edadTexto !== '---') {
            const edad = parseInt(edadTexto);
            filtrarEquiposPorCategoria(edad);
        }
        
        // Limpiar campos
        document.getElementById('insc-atleta-nombre').value = '';
        document.getElementById('insc-atleta-ci').value = '';
        document.getElementById('insc-atleta-fecha-nac').value = '';
        document.getElementById('insc-atleta-telefono').value = '';
        document.getElementById('insc-atleta-edad-label').textContent = '---';
        document.getElementById('insc-atleta-categoria-label').textContent = '---';
        document.getElementById('insc-categoria-info').textContent = '';
        document.getElementById('insc-categoria-checkboxes').innerHTML = '';
    }

    resultado.style.display = 'block';
}

function calcularEdadDesdeFecha(fechaNac) {
    if (!fechaNac) return -1;
    const hoy = new Date();
    const nac = new Date(fechaNac + 'T12:00:00');
    if (isNaN(nac.getTime())) return -1;
    let edad = hoy.getFullYear() - nac.getFullYear();
    const mes = hoy.getMonth() - nac.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
}

function calcularCategoriaAutomatica(fechaVal) {
    const edad = calcularEdadDesdeFecha(fechaVal);
    const edadLabel = document.getElementById('insc-atleta-edad-label');
    const catLabel = document.getElementById('insc-atleta-categoria-label');
    if (edad < 0) {
        edadLabel.textContent = '---';
        catLabel.textContent = '---';
        document.getElementById('insc-categoria-info').textContent = '';
        document.getElementById('insc-categoria-checkboxes').innerHTML = '';
        restaurarTodosEquipos();
        return;
    }
    edadLabel.textContent = edad;
    // Un jugador puede jugar en categorías con edad_min <= su edad
    const catsMatch = categoriasConfig.filter(c => edad >= c.edad_min);
    const primaryCat = catsMatch.length > 0 ? catsMatch[catsMatch.length - 1] : null;
    const catNombre = primaryCat ? primaryCat.nombre : 'Sin Categoría';
    catLabel.textContent = catNombre;
    const cant = filtrarEquiposPorCategoria(edad);
    const infoEl = document.getElementById('insc-categoria-info');
    if (catsMatch.length > 0 && cant !== undefined) {
        const todasNombres = catsMatch.map(c => c.nombre).join(', ');
        infoEl.innerHTML = `Categorías habilitadas: <strong>${todasNombres}</strong> — <strong>${cant}</strong> equipo${cant !== 1 ? 's' : ''} disponible${cant !== 1 ? 's' : ''}`;
    } else if (cant === 0) {
        infoEl.innerHTML = 'Sin equipos asignados a las categorías habilitadas para esta edad';
    } else {
        infoEl.innerHTML = '';
    }
    renderizarCheckboxesCategoria(catsMatch);
}

function filtrarEquiposPorCategoria(edad) {
    const select = document.getElementById('insc-equipo');
    if (!select) return;
    const allHtml = select.dataset.allOptions;
    if (!allHtml) return;
    // Reunir equipos de TODAS las categorías habilitadas: edad_min <= edad del jugador
    const cats = categoriasConfig.filter(c => edad >= c.edad_min);
    const eqSet = new Set();
    cats.forEach(c => {
        (categoriaEquiposMap[c.id] || []).forEach(eqId => eqSet.add(eqId));
    });
    const eqPermitidos = [...eqSet];
    // No hay filtro → mostrar todos
    if (eqPermitidos.length === 0) {
        select.innerHTML = allHtml;
        return equiposList.length;
    }
    // Parsear opciones y filtrar
    const parser = document.createElement('div');
    parser.innerHTML = allHtml;
    const allOpts = parser.querySelectorAll('option');
    let filtered = '<option value="">Seleccionar equipo...</option>';
    let count = 0;
    allOpts.forEach(opt => {
        if (!opt.value) return;
        if (eqPermitidos.includes(opt.value)) {
            filtered += opt.outerHTML;
            count++;
        }
    });
    if (count === 0) {
        filtered += '<option value="" disabled selected class="placeholder-msg">No hay equipos para esta categoría</option>';
    }
    select.innerHTML = filtered;
    return count;
}

function restaurarTodosEquipos() {
    const select = document.getElementById('insc-equipo');
    if (!select) return;
    const allHtml = select.dataset.allOptions;
    if (allHtml) {
        select.innerHTML = allHtml;
    }
}

function renderizarCheckboxesCategoria(cats) {
    const container = document.getElementById('insc-categoria-checkboxes');
    container.innerHTML = '';
    if (cats.length === 0) return;
    cats.forEach(c => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:13px;padding:4px 10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;';
        label.innerHTML = `<input type="checkbox" value="${c.id}" checked> ${escHtml(c.nombre)}`;
        container.appendChild(label);
    });
}

function obtenerCategoriaParaEdad(edad) {
    const cats = categoriasConfig.filter(c => edad >= c.edad_min);
    const cat = cats.length > 0 ? cats[cats.length - 1] : null;
    return cat ? cat.nombre : 'Sin Categoría';
}

async function inscribirAtleta() {
    const resultado = document.getElementById('insc-resultado');
    const titularId = parseInt(resultado.dataset.socioId);
    
    const atletaNombre = document.getElementById('insc-atleta-nombre').value.trim();
    const atletaCi = limpiarCI(document.getElementById('insc-atleta-ci').value);
    const atletaFechaNac = document.getElementById('insc-atleta-fecha-nac').value;
    const atletaTelefono = document.getElementById('insc-atleta-telefono').value.trim();
    const atletaEdad = calcularEdadDesdeFecha(atletaFechaNac);
    const equipoId = document.getElementById('insc-equipo').value;

    if (!atletaNombre) return alert('Ingresá el nombre del atleta');
    if (!atletaCi) return alert('Ingresá la cédula del atleta');
    if (!atletaFechaNac || atletaEdad < 0) return alert('Ingresá una fecha de nacimiento válida');
    if (!equipoId) return alert('Seleccioná un equipo');

    // Obtener categorías checkeadas
    const checkboxes = document.querySelectorAll('#insc-categoria-checkboxes input[type="checkbox"]:checked');
    if (checkboxes.length === 0) return alert('Marcá al menos una categoría para inscribir al atleta');

    const catsSeleccionadas = [];
    checkboxes.forEach(cb => {
        const cat = categoriasConfig.find(c => c.id == cb.value);
        if (cat) catsSeleccionadas.push(cat);
    });

    // Verificar cupo por categoría
    for (const cat of catsSeleccionadas) {
        const maxPorCat = cat.jugadores_por_equipo || 0;
        if (maxPorCat > 0) {
            const { count: usados } = await supabaseClient
                .from('atletas')
                .select('*', { count: 'exact', head: true })
                .eq('equipo_id', equipoId)
                .eq('categoria_id', cat.id);
            if ((usados || 0) >= maxPorCat) {
                return alert(`El equipo ya tiene ${maxPorCat} jugadores en "${cat.nombre}". Límite alcanzado.`);
            }
        }
    }

    // Registrar atleta en socios (una sola vez)
    const catsNombre = catsSeleccionadas.map(c => c.nombre).join(', ');
    const socioInsert = {
        ci: atletaCi,
        nombre: atletaNombre,
        apellido: '',
        tipo: 'adherente',
        familia_id: titularId,
        edad: atletaEdad,
        categoria: catsNombre,
        habilitado: true
    };
    if (atletaFechaNac) socioInsert.fecha_nacimiento = atletaFechaNac;
    if (atletaTelefono) socioInsert.telefono = atletaTelefono;

    let nuevoSocio;
    let errSocio;

    ({ data: nuevoSocio, error: errSocio } = await supabaseClient
        .from('socios')
        .insert(socioInsert)
        .select()
        .single());

    if (errSocio && errSocio.message && errSocio.message.includes('column')) {
        delete socioInsert.fecha_nacimiento;
        delete socioInsert.telefono;
        ({ data: nuevoSocio, error: errSocio } = await supabaseClient
            .from('socios')
            .insert(socioInsert)
            .select()
            .single());
        if (errSocio) return alert('Error al registrar: ' + errSocio.message);
    } else if (errSocio) {
        return alert('Error al registrar datos del atleta: ' + errSocio.message);
    }

    if (errSocio) {
        return alert('Error al registrar datos del atleta: ' + errSocio.message);
    }

    // Inscribir en atletas para cada categoría seleccionada
    for (const cat of catsSeleccionadas) {
        const { error: errAtleta } = await supabaseClient
            .from('atletas')
            .insert({
                socio_id: nuevoSocio.id,
                equipo_id: equipoId,
                categoria_id: cat.id
            });
        if (errAtleta) {
            await supabaseClient.from('socios').delete().eq('id', nuevoSocio.id);
            if (errAtleta?.code === '23505') return alert(`El atleta ya está inscripto en ${cat.nombre} para este equipo`);
            return alert('Error al inscribir en ' + cat.nombre + ': ' + errAtleta.message);
        }
    }

    alert(`✅ Atleta inscripto correctamente en ${catsSeleccionadas.length} categoría(s): ${catsNombre}`);
    document.getElementById('insc-resultado').style.display = 'none';
    document.getElementById('insc-ci').value = '';
}

// ============================
// VEEDOR (búsqueda + falta)
// ============================
async function buscarJugador() {
    const ci = limpiarCI(document.getElementById('veedor-ci').value);
    const { data: socios, error } = await supabaseClient
        .from('socios')
        .select('id, nombre, apellido, tipo')
        .eq('ci', ci)
        .limit(1);

    const socio = socios && socios[0];
    if (error || !socio) {
        alert('Jugador no encontrado');
        return;
    }

    const { data: atleta, error: errAtleta } = await supabaseClient
        .from('atletas')
        .select('id')
        .eq('socio_id', socio.id)
        .limit(1);

    if (errAtleta || !atleta || atleta.length === 0) {
        alert('Este socio no está inscripto como atleta en ningún equipo. No se le pueden cargar tarjetas.');
        return;
    }

    const nombreCompleto = `${socio.nombre} ${socio.apellido}`.trim();
    document.getElementById('nombre-encontrado').innerText = `${nombreCompleto} (${socio.tipo})`;
    document.getElementById('resultado-busqueda').style.display = 'block';

    renderizarOpcionesFaltas();
}

function renderizarOpcionesFaltas() {
    const container = document.getElementById('veedor-card-options');
    const select = document.getElementById('tipo-falta');
    if (!container || !configFaltas.length) return;

    container.innerHTML = '';
    select.innerHTML = '';

    const colores = { 'amarilla': 'yellow', 'azul': 'blue', 'roja': 'red' };

    configFaltas.forEach((cfg, i) => {
        const colorClass = colores[cfg.tipo] || 'yellow';
        select.innerHTML += `<option value="${cfg.tipo}">${escHtml(cfg.nombre)}</option>`;

        const label = document.createElement('label');
        label.className = `card-option ${colorClass}`;
        label.innerHTML = `
            <input type="radio" name="falta-opt" value="${cfg.tipo}" ${i === 0 ? 'checked' : ''}>
            <span class="card-box"></span>
            <span class="card-text">${escHtml(cfg.nombre)} <br><small>${Number(cfg.monto).toLocaleString()} GS.</small></span>
        `;
        container.appendChild(label);
    });

    // Sync hidden select on radio change
    container.querySelectorAll('input[name="falta-opt"]').forEach(r => {
        r.addEventListener('change', () => {
            document.getElementById('tipo-falta').value = r.value;
        });
    });
    // Set initial value
    const checked = container.querySelector('input[name="falta-opt"]:checked');
    if (checked) document.getElementById('tipo-falta').value = checked.value;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function cargarFalta() {
    const ci = limpiarCI(document.getElementById('veedor-ci').value);
    const tipo = document.getElementById('tipo-falta').value;
    const cfg = configFaltas.find(c => c.tipo === tipo);
    const monto = cfg ? cfg.monto : 0;

    const { data: socios, error: err } = await supabaseClient
        .from('socios')
        .select('id, nombre, apellido')
        .eq('ci', ci)
        .limit(1);

    const socio = socios && socios[0];
    if (err || !socio) return alert('Jugador no encontrado');

    const { data: atleta } = await supabaseClient
        .from('atletas')
        .select('id')
        .eq('socio_id', socio.id)
        .limit(1);
    if (!atleta || atleta.length === 0) return alert('Este socio no está inscripto como atleta. No se le pueden cargar tarjetas.');

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
    lista.innerHTML = "<tr><td colspan='7'>Cargando deudas...</td></tr>";

    const { data: faltas, error } = await supabaseClient
        .from('faltas').select('*').eq('pagado', false).order('created_at', { ascending: false });

    if (error) return alert('Error: ' + error.message);
    lista.innerHTML = '';
    if (!faltas || faltas.length === 0) {
        lista.innerHTML = "<tr><td colspan='7' style='text-align:center;color:var(--text-muted)'>No hay deudas pendientes</td></tr>";
    } else {
        faltas.forEach(f => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><strong>${escHtml(f.ci_jugador)}</strong></td>
                <td>${escHtml(f.nombre_jugador)}</td>
                <td><span class="badge badge-${escHtml(f.tipo_falta)}">${escHtml(f.tipo_falta).toUpperCase()}</span></td>
                <td>${escHtml(f.categoria_nombre || '—')}</td>
                <td>${escHtml(f.equipo_nombre || '—')}</td>
                <td class="monto-col">${Number(f.monto).toLocaleString()} GS.</td>
                <td><button onclick="cobrarFalta('${f.id}')" class="btn-action" style="background:#10b981;color:white;padding:4px 12px;">Cobrar</button></td>`;
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
    const { error } = await supabaseClient.from('faltas').update({ pagado: true, pagado_at: new Date().toISOString() }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    actualizarListaCobros();
    const hoy = new Date().toISOString().slice(0,10);
    cargarArqueo(hoy, hoy, '');
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
// ADMIN: EQUIPOS (MODIFICADO CON LOGOS Y ELIMINACIÓN)
// ============================
async function cargarEquiposAdmin() {
    const { data: equipos, error } = await supabaseClient.from('equipos').select('*').order('nombre');
    if (error || !equipos) return;
    
    equiposList = equipos;

    // Mapear equipos a nombres de categorías desde datos ya cargados
    const eqCatsMap = {};
    Object.entries(categoriaEquiposMap).forEach(([catId, eqIds]) => {
        const cat = categoriasConfig.find(c => String(c.id) === catId || c.id === Number(catId));
        const nombre = cat ? cat.nombre : '?';
        eqIds.forEach(eqId => {
            if (!eqCatsMap[eqId]) eqCatsMap[eqId] = [];
            eqCatsMap[eqId].push(nombre);
        });
    });
    
    // Rellenar tabla en Admin
    const tbody = document.getElementById('admin-equipos-body');
    if (tbody) {
        tbody.innerHTML = '';
        equipos.forEach(e => {
            const safeLogoUrl = e.logo_url ? String(e.logo_url).replace(/["<>]/g, '') : '';
            const logoImg = safeLogoUrl 
                ? `<img src="${safeLogoUrl}" alt="Logo ${escHtml(e.nombre)}" style="max-height: 40px; max-width: 80px; border-radius: 4px; object-fit: contain;">`
                : `<div style="width:40px; height:40px; background:#e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="image" style="width:18px; height:18px;"></i></div>`;
            
            const idEquipo = String(e.id);
            const cupo = e.cupo_maximo || 15;
            const cats = eqCatsMap[e.id] || [];
            const catsHtml = cats.length > 0
                ? cats.map(c => `<span style="display:inline-block;padding:1px 8px;background:#eef2ff;color:#4338ca;border-radius:10px;font-size:11px;font-weight:600;">${escHtml(c)}</span>`).join(' ')
                : '<span style="color:var(--text-muted);font-size:12px;">—</span>';
            tbody.innerHTML += `<tr id="equipo-row-${idEquipo}">
                <td>${idEquipo.substring(0,8)}</td>
                <td id="equipo-logo-${idEquipo}">${logoImg}</td>
                <td id="equipo-nombre-${idEquipo}"><strong>${escHtml(e.nombre)}</strong></td>
                <td>
                    <input type="number" value="${cupo}" onchange="actualizarCupoEquipo('${idEquipo}', this.value)" style="width:60px; text-align:center; padding:4px; border:1px solid #e2e8f0; border-radius:4px;">
                </td>
                <td style="font-size:13px;">${catsHtml}</td>
                <td id="equipo-acciones-${idEquipo}">
                    <button onclick="editarEquipo('${idEquipo}')" class="btn-action" style="background:var(--primary-color); color:white; padding:4px 8px;">Editar</button>
                </td>
            </tr>`;
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    // Actualizar selectores
    actualizarSelectsPartidos();
}

async function agregarEquipo() {
    const nombre = document.getElementById('admin-nuevo-equipo').value.trim();
    if (!nombre) return alert('Ingresá un nombre');
    
    const fileInput = document.getElementById('admin-logo-equipo');
    let logoBase64 = '';
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        // Validar tamaño (máximo 500KB)
        if (file.size > 500 * 1024) {
            return alert('El logo es muy pesado. El tamaño máximo permitido es 500 KB.');
        }
        
        logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    const { error } = await supabaseClient.from('equipos').insert({ nombre, logo_url: logoBase64 });
    if (error) return alert('Error: ' + error.message);
    
    document.getElementById('admin-nuevo-equipo').value = '';
    fileInput.value = '';
    
    await cargarEquiposAdmin();
}

async function actualizarCupoEquipo(id, cupo) {
    const val = parseInt(cupo);
    if (isNaN(val) || val < 1) return alert('El cupo debe ser un número válido mayor a 0');
    const { error } = await supabaseClient.from('equipos').update({ cupo_maximo: val }).eq('id', id);
    if (error) return alert('Error al actualizar cupo: ' + error.message);
    await cargarEquiposAdmin();
}

async function editarEquipo(id) {
    try {
        id = String(id);
        const nombreCell = document.getElementById(`equipo-nombre-${id}`);
        const logoCell = document.getElementById(`equipo-logo-${id}`);
        const accionesCell = document.getElementById(`equipo-acciones-${id}`);
        if (!nombreCell || !logoCell || !accionesCell) {
            return alert('Error: no se encontraron los elementos del equipo');
        }
        const nombreActual = nombreCell.textContent.trim();

        nombreCell.innerHTML = `<input type="text" id="edit-equipo-nombre-${id}" value="${escHtml(nombreActual)}" style="width:100%;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">`;
        logoCell.innerHTML = `<input type="file" id="edit-equipo-logo-${id}" accept="image/*" style="font-size:12px;max-width:120px;">`;
        accionesCell.innerHTML = `
            <button onclick="guardarEquipo('${id}')" class="btn-action" style="background:#10b981;color:white;padding:4px 8px;">Guardar</button>
            <button onclick="cargarEquiposAdmin()" class="btn-action" style="background:#64748b;color:white;padding:4px 8px;">Cancelar</button>
        `;
    } catch (e) {
        alert('Error al editar: ' + e.message);
    }
}

async function guardarEquipo(id) {
    id = String(id);
    const nombre = document.getElementById(`edit-equipo-nombre-${id}`).value.trim();
    if (!nombre) return alert('El nombre no puede estar vacío');

    const fileInput = document.getElementById(`edit-equipo-logo-${id}`);
    let logo_url = undefined;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 500 * 1024) return alert('El logo es muy pesado. Máximo 500 KB.');
        logo_url = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    const updateData = { nombre };
    if (logo_url) updateData.logo_url = logo_url;

    const { error } = await supabaseClient.from('equipos').update(updateData).eq('id', id);
    if (error) return alert('Error al guardar: ' + error.message);
    await cargarEquiposAdmin();
}

// ============================
// ADMIN: CATEGORÍAS (NUEVO)
// ============================
async function cargarCategoriasAdmin() {
    const { data: categorias, error } = await supabaseClient.from('categorias_config').select('*').order('edad_min');
    if (error || !categorias) return;
    
    categoriasConfig = categorias;

    const { data: catEqs } = await supabaseClient.from('categoria_equipos').select('*');
    categoriaEquiposMap = {};
    if (catEqs) {
        catEqs.forEach(ce => {
            if (!categoriaEquiposMap[ce.categoria_id]) categoriaEquiposMap[ce.categoria_id] = [];
            categoriaEquiposMap[ce.categoria_id].push(ce.equipo_id);
        });
    }

    const { data: equipos } = await supabaseClient.from('equipos').select('id, nombre').order('nombre');
    
    const tbody = document.getElementById('admin-categorias-body');
    if (tbody) {
        tbody.innerHTML = '';
        categorias.forEach(c => {
            const jxe = c.jugadores_por_equipo || 0;
            const eqIds = categoriaEquiposMap[c.id] || [];
            const eqNombres = (equipos || [])
                .filter(e => eqIds.includes(e.id))
                .map(e => escHtml(e.nombre))
                .join(', ');
            const otrosEquipos = (equipos || []).filter(e => !eqIds.includes(e.id));

            tbody.innerHTML += `<tr>
                <td><strong>${escHtml(c.nombre)}</strong></td>
                <td>${c.edad_min} años</td>
                <td>${c.edad_max} años</td>
                <td>                    <input type="number" value="${jxe}" onchange="actualizarJugadoresPorEquipo('${c.id}', this.value)" style="width:60px; text-align:center; padding:4px; border:1px solid #e2e8f0; border-radius:4px;" min="0"></td>
                <td style="font-size:13px;">
                    ${eqNombres || '<span style="color:var(--text-muted);">—</span>'}
                    <button onclick="mostrarAsignarEquipos('${c.id}')" class="btn-action" style="background:#8b5cf6;color:white;padding:2px 8px;font-size:11px;margin-left:6px;">+</button>
                </td>
                <td>
                    <button onclick="eliminarCategoria('${c.id}')" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
                </td>
            </tr>`;
        });
    }
}

async function mostrarAsignarEquipos(catId) {
    const cat = categoriasConfig.find(c => c.id == catId);
    if (!cat) return;
    const eqIds = categoriaEquiposMap[catId] || [];
    const { data: equipos } = await supabaseClient.from('equipos').select('id, nombre').order('nombre');
    if (!equipos) return;
    const disponibles = equipos.filter(e => !eqIds.includes(e.id));
    const asignados = equipos.filter(e => eqIds.includes(e.id));

    let html = `<div class="modal-overlay" onclick="this.remove()">`;
    html += `<div class="modal" onclick="event.stopPropagation()" style="max-width:500px;">`;
    html += `<h3 style="margin-bottom:12px;">Equipos para ${escHtml(cat.nombre)}</h3>`;
    
    // Asignados
    html += `<h4 style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">Asignados</h4>`;
    if (asignados.length === 0) {
        html += `<p style="color:var(--text-muted);font-size:13px;">Ninguno</p>`;
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;">`;
        asignados.forEach(e => {
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f8fafc;border-radius:6px;">
                <span>${escHtml(e.nombre)}</span>
                <button onclick="quitarEquipoDeCategoria('${catId}','${e.id}','${escHtml(e.nombre)}')" class="btn-action" style="background:#ef4444;color:white;padding:2px 8px;font-size:11px;">Quitar</button>
            </div>`;
        });
        html += `</div>`;
    }

    // Disponibles
    if (disponibles.length > 0) {
        html += `<h4 style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Agregar equipo</h4>`;
        html += `<div style="display:flex;gap:6px;">`;
        html += `<select id="asignar-equipo-select" class="form-input" style="flex:1;">`;
        disponibles.forEach(e => {
            html += `<option value="${e.id}">${escHtml(e.nombre)}</option>`;
        });
        html += `</select>`;
        html += `<button onclick="asignarEquipoACategoria('${catId}')" class="btn-primary btn-sm" style="height:38px;">Agregar</button>`;
        html += `</div>`;
    } else {
        html += `<p style="color:var(--text-muted);font-size:13px;">Todos los equipos ya están asignados</p>`;
    }

    html += `<button onclick="this.closest('.modal-overlay').remove()" class="btn-action" style="background:#64748b;color:white;padding:6px 16px;margin-top:12px;">Cerrar</button>`;
    html += `</div></div>`;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);
}

async function asignarEquipoACategoria(catId) {
    const select = document.getElementById('asignar-equipo-select');
    const equipoId = select.value;
    if (!equipoId) return;
    const { error } = await supabaseClient.from('categoria_equipos').insert({ categoria_id: catId, equipo_id: equipoId });
    if (error) return alert('Error: ' + error.message);
    document.querySelector('.modal-overlay')?.remove();
    await cargarCategoriasAdmin();
}

async function quitarEquipoDeCategoria(catId, equipoId, nombre) {
    if (!confirm(`¿Quitar "${nombre}" de esta categoría?`)) return;
    const { error } = await supabaseClient.from('categoria_equipos').delete().eq('categoria_id', catId).eq('equipo_id', equipoId);
    if (error) return alert('Error: ' + error.message);
    await cargarCategoriasAdmin();
}

async function agregarCategoria() {
    const nombre = document.getElementById('admin-cat-nombre').value.trim();
    const edadMin = parseInt(document.getElementById('admin-cat-min').value);
    const edadMax = parseInt(document.getElementById('admin-cat-max').value);
    const jugadores = parseInt(document.getElementById('admin-cat-jugadores').value) || 0;

    if (!nombre) return alert('Ingresá el nombre de la categoría');
    if (isNaN(edadMin) || edadMin < 0) return alert('Edad mínima inválida');
    if (isNaN(edadMax) || edadMax < 0 || edadMax < edadMin) return alert('Edad máxima inválida');

    const existeColumna = categoriasConfig.length > 0 && 'jugadores_por_equipo' in categoriasConfig[0];
    const insertData = { nombre, edad_min: edadMin, edad_max: edadMax };
    if (existeColumna) insertData.jugadores_por_equipo = jugadores;

    const { error } = await supabaseClient.from('categorias_config').insert(insertData);

    if (error) return alert('Error al guardar categoría: ' + error.message);
    
    document.getElementById('admin-cat-nombre').value = '';
    document.getElementById('admin-cat-min').value = '';
    document.getElementById('admin-cat-max').value = '';
    document.getElementById('admin-cat-jugadores').value = '';
    
    await cargarCategoriasAdmin();
}

async function actualizarJugadoresPorEquipo(id, val) {
    const existeColumna = categoriasConfig.length > 0 && 'jugadores_por_equipo' in categoriasConfig[0];
    if (!existeColumna) return alert('La columna jugadores_por_equipo no existe en tu BD. Ejecutá en el SQL Editor de Supabase:\n\nALTER TABLE categorias_config ADD COLUMN jugadores_por_equipo INTEGER DEFAULT 0;');
    const num = parseInt(val);
    if (isNaN(num) || num < 0) return alert('Valor inválido');
    const { error } = await supabaseClient.from('categorias_config').update({ jugadores_por_equipo: num }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    await cargarCategoriasAdmin();
}

async function eliminarCategoria(id) {
    if (!confirm('¿Estás seguro de eliminar esta categoría?')) return;
    const { error } = await supabaseClient.from('categorias_config').delete().eq('id', id);
    if (error) return alert('Error al eliminar categoría: ' + error.message);
    await cargarCategoriasAdmin();
}

// ============================
// ADMIN: CANCHAS (NUEVO)
// ============================
async function cargarCanchasAdmin() {
    const { data: canchas, error } = await supabaseClient.from('canchas').select('*').order('nombre');
    if (error || !canchas) return;
    
    canchasList = canchas;
    
    const tbody = document.getElementById('admin-canchas-body');
    if (tbody) {
        tbody.innerHTML = '';
        canchas.forEach(c => {
            tbody.innerHTML += `<tr>
                <td>${c.id}</td>
                <td><strong>${escHtml(c.nombre)}</strong></td>
                <td>
                    <button onclick="eliminarCancha('${c.id}')" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
                </td>
            </tr>`;
        });
    }
}

async function agregarCancha() {
    const nombre = document.getElementById('admin-cancha-nombre').value.trim();
    if (!nombre) return alert('Ingresá el nombre de la cancha');

    const { error } = await supabaseClient.from('canchas').insert({ nombre });
    if (error) return alert('Error al guardar cancha: ' + error.message);
    
    document.getElementById('admin-cancha-nombre').value = '';
    await cargarCanchasAdmin();
}

async function eliminarCancha(id) {
    if (!confirm('¿Estás seguro de eliminar esta cancha?')) return;
    const { error } = await supabaseClient.from('canchas').delete().eq('id', id);
    if (error) return alert('Error al eliminar cancha: ' + error.message);
    await cargarCanchasAdmin();
}

// ============================
// ADMIN: ATLETAS (CONTROL DE INSCRIPTOS)
// ============================
async function cargarAdminAtletas() {
    document.getElementById('atletas-equipo-detalle').style.display = 'none';
    document.getElementById('atletas-categorias-container').style.display = 'block';

    // Totals
    const { count: adhCount } = await supabaseClient.from('socios').select('*', { count: 'exact', head: true }).in('tipo', ['conyuge', 'hijo', 'adherente']);
    const elAdh = document.getElementById('admin-total-adherentes');
    if (elAdh) elAdh.textContent = adhCount || 0;

    const { count: atlCount } = await supabaseClient.from('atletas').select('*', { count: 'exact', head: true });
    const elAtl = document.getElementById('admin-total-atletas');
    if (elAtl) elAtl.textContent = atlCount || 0;

    // Categorías → equipos → contadores
    const container = document.getElementById('atletas-categorias-container');
    container.innerHTML = '<p style="color:var(--text-muted);">Cargando...</p>';

    const { data: atletas } = await supabaseClient.from('atletas').select('id, equipo_id, categoria_id, socio_id');

    let html = '';
    for (const cat of categoriasConfig) {
        const eqIds = categoriaEquiposMap[cat.id] || [];
        if (eqIds.length === 0) continue;
        const equiposCat = equiposList.filter(e => eqIds.includes(e.id));
        if (equiposCat.length === 0) continue;

        html += `<div style="margin-bottom:1.5rem;">
            <h4 style="font-size:15px;font-weight:700;color:var(--primary-color);margin-bottom:0.5rem;">🏷️ ${escHtml(cat.nombre)}</h4>
            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">`;

        for (const eq of equiposCat) {
            const count = (atletas || []).filter(a => String(a.equipo_id) === String(eq.id) && a.categoria_id === cat.id).length;
            const max = cat.jugadores_por_equipo || 0;
            const pct = max > 0 ? Math.round((count / max) * 100) : 0;
            const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
            html += `<div class="kpi-card" style="flex:1;min-width:150px;padding:0.7rem 1rem;background:${color};cursor:pointer;" onclick="mostrarAtletasEquipo('${eq.id}',${cat.id},'${escHtml(eq.nombre)}','${escHtml(cat.nombre)}')">
                <div class="kpi-details">
                    <span class="kpi-label">${escHtml(eq.nombre)}</span>
                    <strong class="kpi-value" style="font-size:1.4rem;">${count}${max > 0 ? '/' + max : ''}</strong>
                </div>
            </div>`;
        }
        html += `</div></div>`;
    }

    if (!html) {
        html = '<p style="color:var(--text-muted);">No hay equipos asignados a categorías. Andá a Admin → Categorías para asignar.</p>';
    }
    container.innerHTML = html;
}

async function mostrarAtletasEquipo(equipoId, catId, eqNombre, catNombre) {
    document.getElementById('atletas-categorias-container').style.display = 'none';
    document.getElementById('atletas-equipo-detalle').style.display = 'block';
    document.getElementById('atletas-equipo-titulo').textContent = `${eqNombre} — ${catNombre}`;

    const tbody = document.getElementById('admin-atletas-body');
    tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';

    const { data: atletas, error } = await supabaseClient
        .from('atletas')
        .select(`
            id, created_at, categoria_id,
            socio:socio_id (id, ci, nombre, apellido, edad, fecha_nacimiento, familia_id),
            equipo:equipo_id (id, nombre)
        `)
        .eq('equipo_id', equipoId)
        .eq('categoria_id', catId)
        .order('created_at', { ascending: false });

    if (error || !atletas) {
        tbody.innerHTML = '<tr><td colspan="7">Error al cargar</td></tr>';
        return;
    }

    // Cargar nombres de titulares y partidos jugados
    const partidosCount = {};
    if (atletas.length > 0) {
        const cis = atletas.map(a => a.socio?.ci).filter(Boolean);
        if (cis.length > 0) {
            const { data: eventos } = await supabaseClient
                .from('partido_eventos')
                .select('jugador_ci, partido_id')
                .in('jugador_ci', cis);
            if (eventos) {
                eventos.forEach(ev => {
                    partidosCount[ev.jugador_ci] = (partidosCount[ev.jugador_ci] || 0) + 1;
                });
            }
        }
    }

    // Cargar titulares (familia_id → nombre)
    const famIds = atletas.map(a => a.socio?.familia_id).filter(Boolean);
    const famMap = {};
    if (famIds.length > 0) {
        const { data: titulares } = await supabaseClient.from('socios').select('id, nombre, apellido').in('id', famIds);
        if (titulares) {
            titulares.forEach(t => { famMap[t.id] = `${t.nombre} ${t.apellido}`.trim(); });
        }
    }

    tbody.innerHTML = '';
    atletas.forEach(a => {
        const s = a.socio || {};
        const edad = s.edad || calcularEdadDesdeFecha(s.fecha_nacimiento) || '—';
        const titular = famMap[s.familia_id] || '—';
        const pj = partidosCount[s.ci] || 0;
        const fechaNac = s.fecha_nacimiento || '';
        const edadCalc = fechaNac ? calcularEdadDesdeFecha(fechaNac) : (s.edad || '—');
        tbody.innerHTML += `<tr>
            <td>${escHtml(s.ci || '')}</td>
            <td><strong>${escHtml(s.nombre || '')} ${escHtml(s.apellido || '')}</strong></td>
            <td>${edadCalc}</td>
            <td>${escHtml(catNombre)}</td>
            <td>${escHtml(titular)}</td>
            <td>${pj}</td>
            <td><button onclick="eliminarAtletaAdmin('${a.id}')" class="btn-action" style="background:#ef4444;color:white;padding:4px 8px;">Eliminar</button></td>
        </tr>`;
    });

    if (atletas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><p style="color:var(--text-muted);text-align:center;">Sin atletas en este equipo/categoría</p></td></tr>';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function volverAtletasCategorias() {
    document.getElementById('atletas-equipo-detalle').style.display = 'none';
    document.getElementById('atletas-categorias-container').style.display = 'block';
}

async function eliminarAtletaAdmin(id) {
    if (!confirm('¿Estás seguro de eliminar este atleta del torneo?')) return;
    const { data: atleta } = await supabaseClient
        .from('atletas')
        .select('socio_id')
        .eq('id', id)
        .single();
    if (!atleta) return alert('Atleta no encontrado');

    const { error: errAtleta } = await supabaseClient.from('atletas').delete().eq('id', id);
    if (errAtleta) return alert('Error al eliminar atleta: ' + errAtleta.message);

    const { error: errSocio } = await supabaseClient.from('socios').delete().eq('id', atleta.socio_id);
    if (errSocio) return alert('Error al eliminar socio: ' + errSocio.message);

    alert('Atleta eliminado correctamente');
    cargarAdminAtletas();
}

// ============================
// ADMIN: CONFIGURACIÓN DE TARJETAS
// ============================
async function cargarConfigFaltasAdmin() {
    const { data: faltas, error } = await supabaseClient.from('config_faltas').select('*').order('id');
    if (error || !faltas) return;

    configFaltas = faltas;
    const tbody = document.getElementById('admin-tarjetas-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    faltas.forEach(f => {
        tbody.innerHTML += `<tr>
            <td><code>${escHtml(f.tipo)}</code></td>
            <td><strong>${escHtml(f.nombre)}</strong></td>
            <td class="monto-col">${Number(f.monto).toLocaleString()} GS.</td>
            <td>
                <button onclick="editarConfigFalta('${f.id}')" class="btn-action" style="background:#3b82f6; color:white; padding:4px 8px; margin-right:4px;">Editar</button>
                <button onclick="eliminarConfigFalta('${f.id}')" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
            </td>
        </tr>`;
    });
}

async function agregarConfigFalta() {
    const tipo = document.getElementById('admin-tarjeta-tipo').value.trim().toLowerCase();
    const nombre = document.getElementById('admin-tarjeta-nombre').value.trim();
    const monto = parseInt(document.getElementById('admin-tarjeta-monto').value);

    if (!tipo) return alert('Ingresá un identificador');
    if (!nombre) return alert('Ingresá un nombre');
    if (isNaN(monto) || monto < 0) return alert('Ingresá un monto válido');

    const { error } = await supabaseClient.from('config_faltas').insert({ tipo, nombre, monto });
    if (error) return alert('Error: ' + error.message);

    document.getElementById('admin-tarjeta-tipo').value = '';
    document.getElementById('admin-tarjeta-nombre').value = '';
    document.getElementById('admin-tarjeta-monto').value = '';
    await cargarConfigFaltasAdmin();
}

async function editarConfigFalta(id) {
    const nuevoMonto = prompt('Nuevo monto en GS.:');
    if (nuevoMonto === null) return;
    const monto = parseInt(nuevoMonto);
    if (isNaN(monto) || monto < 0) return alert('Monto inválido');

    const nuevoNombre = prompt('Nuevo nombre / concepto:');
    if (nuevoNombre === null) return;
    if (!nuevoNombre.trim()) return alert('Nombre inválido');

    const { error } = await supabaseClient.from('config_faltas').update({ nombre: nuevoNombre.trim(), monto }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    await cargarConfigFaltasAdmin();
}

async function eliminarConfigFalta(id) {
    if (!confirm('¿Estás seguro de eliminar este tipo de falta?')) return;
    const { error } = await supabaseClient.from('config_faltas').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    await cargarConfigFaltasAdmin();
}

// ============================
// CAJA: ARQUEO TOTAL
// ============================
async function cargarArqueo(fechaDesde, fechaHasta, ciBuscar) {
    const tbody = document.getElementById('arqueo-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

    // Construir query
    let query = supabaseClient.from('faltas').select('*').eq('pagado', true);
    if (fechaDesde) {
        query = query.gte('created_at', new Date(fechaDesde).toISOString());
    }
    if (fechaHasta) {
        query = query.lte('created_at', new Date(fechaHasta + 'T23:59:59').toISOString());
    }
    if (ciBuscar) {
        query = query.ilike('ci_jugador', `%${ciBuscar.trim()}%`);
    }
    query = query.order('created_at', { ascending: false });

    const { data: pagadas, error } = await query;

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    let total = 0;
    (pagadas || []).forEach(f => {
        total += Number(f.monto) || 0;
        const fechaPago = f.pagado_at ? new Date(f.pagado_at).toLocaleString() : new Date(f.created_at).toLocaleString();
        tbody.innerHTML += `<tr>
            <td style="font-size:12px;">${fechaPago}</td>
            <td><strong>${escHtml(f.ci_jugador)}</strong></td>
            <td>${escHtml(f.nombre_jugador)}</td>
            <td>${escHtml(f.categoria_nombre || '—')}</td>
            <td>${escHtml(f.equipo_nombre || '—')}</td>
            <td class="monto-col">${Number(f.monto).toLocaleString()} GS.</td>
        </tr>`;
    });

    if (pagadas && pagadas.length > 0) {
        tbody.innerHTML += `<tr style="font-weight:700; background:rgba(255,255,255,0.05);">
            <td colspan="5" style="text-align:right;">TOTAL COBRADO:</td>
            <td class="monto-col">${total.toLocaleString()} GS.</td>
        </tr>`;
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No hay cobros registrados</td></tr>';
    }

    const totalRecaudadoEl = document.getElementById('arqueo-total');
    if (totalRecaudadoEl) totalRecaudadoEl.textContent = `${total.toLocaleString()} GS.`;
}

function buscarHistoricoCobros() {
    const desde = document.getElementById('hist-fecha-desde')?.value;
    const hasta = document.getElementById('hist-fecha-hasta')?.value;
    const ci = document.getElementById('hist-ci')?.value;
    cargarArqueo(desde, hasta, ci);
}

function descargarArqueoExcel() {
    const rows = [];
    rows.push(['Fecha Pago', 'CI Jugador', 'Nombre', 'Categoría', 'Equipo', 'Monto (GS.)']);

    const tbody = document.getElementById('arqueo-body');
    if (!tbody) return;
    const trs = tbody.querySelectorAll('tr');
    trs.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 6) {
            rows.push([
                tds[0].textContent.trim(),
                tds[1].textContent.trim(),
                tds[2].textContent.trim(),
                tds[3].textContent.trim(),
                tds[4].textContent.trim(),
                tds[5].textContent.trim().replace(' GS.', '').replace(/\./g, '')
            ]);
        }
    });

    if (rows.length <= 1) return alert('No hay datos para exportar');

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Arqueo');

    const totalEl = document.getElementById('arqueo-total');
    if (totalEl) {
        const totalText = totalEl.textContent;
        XLSX.utils.sheet_add_aoa(ws, [['', '', '', '', 'TOTAL', totalText.replace(' GS.', '').replace(/\./g, '')]], { origin: -1 });
    }

    ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];

    XLSX.writeFile(wb, `Arqueo_AFEMEC_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ============================
// ADMIN: PARTIDOS (FIXTURE & MARCADORES - NUEVO)
// ============================
function actualizarSelectsPartidos() {
    const localSelect = document.getElementById('admin-partido-equipo-a');
    const visitSelect = document.getElementById('admin-partido-equipo-b');
    const canchaSelect = document.getElementById('admin-partido-cancha');
    const catSelect = document.getElementById('admin-partido-categoria');
    
    if (localSelect && visitSelect) {
        localSelect.innerHTML = '<option value="">Seleccionar Local...</option>';
        visitSelect.innerHTML = '<option value="">Seleccionar Visitante...</option>';
        equiposList.forEach(e => {
            localSelect.innerHTML += `<option value="${e.id}">${escHtml(e.nombre)}</option>`;
            visitSelect.innerHTML += `<option value="${e.id}">${escHtml(e.nombre)}</option>`;
        });
    }
    
    if (canchaSelect) {
        canchaSelect.innerHTML = '<option value="">Seleccionar Sede/Cancha...</option>';
        canchasList.forEach(c => {
            canchaSelect.innerHTML += `<option value="${c.id}">${escHtml(c.nombre)}</option>`;
        });
    }

    if (catSelect) {
        catSelect.innerHTML = '<option value="">Seleccionar categoría...</option>';
        categoriasConfig.forEach(c => {
            catSelect.innerHTML += `<option value="${c.id}">${escHtml(c.nombre)}</option>`;
        });
    }
}

async function cargarPartidosAdmin() {
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select('*')
        .order('fecha_hora', { ascending: true });

    if (error || !partidos) {
        const tbody = document.getElementById('admin-partidos-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">Error al cargar partidos</td></tr>';
        console.error('cargarPartidosAdmin error:', error);
        return;
    }
    
    // Build lookup maps for equipos and canchas
    const eqMap = {};
    equiposList.forEach(e => { eqMap[e.id] = e; });
    const canchaMap = {};
    canchasList.forEach(c => { canchaMap[c.id] = c; });
    
    const tbody = document.getElementById('admin-partidos-body');
    if (tbody) {
        tbody.innerHTML = '';
        if (partidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No hay partidos programados</td></tr>';
            return;
        }
        partidos.forEach(p => {
            const eqA = eqMap[p.equipo_a_id];
            const eqB = eqMap[p.equipo_b_id];
            if (!eqA || !eqB) return;
            const nomA = eqA.nombre || '?';
            const nomB = eqB.nombre || '?';
            const partidoStr = `${escHtml(nomA)} vs ${escHtml(nomB)}`;
            const fecha = new Date(p.fecha_hora).toLocaleString();
            const canchaNom = canchaMap[p.cancha_id]?.nombre || '—';
            
            const resultadoHTML = p.finalizado 
                ? `<strong style="font-size:16px;">${p.goles_a} - ${p.goles_b}</strong>`
                : `<div class="flex-row" style="gap:4px; justify-content:center;">
                     <input type="number" value="${p.goles_a}" id="goles-a-${p.id}" style="width:40px; padding:2px; text-align:center;">
                     <span>-</span>
                     <input type="number" value="${p.goles_b}" id="goles-b-${p.id}" style="width:40px; padding:2px; text-align:center;">
                   </div>`;
            
            let estadoHTML = '';
            if (p.finalizado) {
                estadoHTML = '<span class="badge" style="background:#d1fae5; color:#065f46;">Finalizado</span>';
            } else if (p.en_curso) {
                const tiempo = obtenerTiempoActual(p);
                estadoHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                        <span class="badge" style="background:#fee2e2; color:#991b1b; animation:pulse 1.5s infinite;">▶ EN VIVO</span>
                        <span id="timer-${p.id}" style="font-size:18px;font-weight:800;font-family:monospace;color:var(--primary-color);">${formatearTiempo(tiempo)}</span>
                        <span style="font-size:11px;color:var(--text-muted);font-weight:600;">${obtenerPeriodoLabel(p)}</span>
                    </div>`;
            } else {
                estadoHTML = '<span class="badge" style="background:#fef3c7; color:#92400e;">Programado</span>';
            }

            let accionesHTML = '';
            if (p.finalizado) {
                accionesHTML = `<button onclick="reabrirPartido('${p.id}')" class="btn-action" style="background:#3b82f6; color:white; padding:4px 8px;">Reabrir</button>`;
            } else if (p.en_curso) {
                accionesHTML = `
                    <button onclick="pausarPartido('${p.id}', null)" class="btn-action" style="background:#f59e0b; color:white; padding:4px 8px;">⏸ Pausa</button>
                    <button onclick="finalizarPartido('${p.id}')" class="btn-action" style="background:#dc2626; color:white; padding:4px 8px;">⏹ Finalizar</button>`;
            } else {
                if (p.periodo === 'entretiempo') {
                    const hasExtra = _extraTargets[p.id] ? true : false;
                    accionesHTML = `
                        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                            <input type="number" id="admin-extra-minutos-${p.id}" placeholder="+min" style="width:50px;padding:2px;text-align:center;font-size:12px;">
                            <button onclick="agregarTiempoAdicional('${p.id}')" class="btn-action" style="background:#3b82f6;color:white;padding:4px 8px;">+ Adicional</button>
                            ${hasExtra ? `<button onclick="reanudarPartido('${p.id}','1T')" class="btn-action" style="background:#f59e0b;color:white;padding:4px 8px;">▶ 1T Adicional</button>` : ''}
                            <button onclick="reanudarPartido('${p.id}','2T')" class="btn-action" style="background:#10b981;color:white;padding:4px 8px;">▶ Reanudar 2T</button>
                        </div>`;
                } else {
                    accionesHTML = `
                        <button onclick="habilitarPartido('${p.id}')" class="btn-action" style="background:#6366f1; color:white; padding:4px 8px;">✓ Habilitar</button>
                        <button onclick="actualizarMarcador('${p.id}', false)" class="btn-action" style="background:#f59e0b; color:white; padding:4px 8px;">Guardar</button>`;
                }
            }
            
            tbody.innerHTML += `<tr>
                <td style="font-size:12px;">${fecha}</td>
                <td><strong style="font-size:13px;">${partidoStr}</strong></td>
                <td style="text-align:center;">${resultadoHTML}</td>
                <td style="font-size:12px;">${escHtml(canchaNom)}</td>
                <td style="text-align:center;">${estadoHTML}</td>
                <td>
                    <div class="flex-row" style="gap:4px;flex-wrap:wrap;">
                        ${accionesHTML}
                        <button onclick="eliminarPartido('${p.id}')" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
                    </div>
                </td>
            </tr>`;
        });
    }
    partidos.filter(p => p.en_curso).forEach(p => arrancarTimerPartido(p.id));
}

async function programarPartido() {
    const eqA = document.getElementById('admin-partido-equipo-a').value;
    const eqB = document.getElementById('admin-partido-equipo-b').value;
    const fechaHora = document.getElementById('admin-partido-fecha').value;
    const canchaId = document.getElementById('admin-partido-cancha').value;
    const catId = document.getElementById('admin-partido-categoria').value;

    if (!eqA || !eqB || !fechaHora || !canchaId || !catId) {
        return alert('Por favor, completa todos los campos para programar el partido.');
    }
    if (eqA === eqB) {
        return alert('Un equipo no puede jugar contra sí mismo.');
    }

    const { error } = await supabaseClient.from('partidos').insert({
        equipo_a_id: eqA,
        equipo_b_id: eqB,
        fecha_hora: new Date(fechaHora).toISOString(),
        cancha_id: canchaId,
        categoria_id: parseInt(catId),
        finalizado: false
    });

    if (error) return alert('Error al programar partido: ' + error.message);
    
    document.getElementById('admin-partido-fecha').value = '';
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function actualizarMarcador(id, finalizar) {
    const golesA = parseInt(document.getElementById(`goles-a-${id}`).value) || 0;
    const golesB = parseInt(document.getElementById(`goles-b-${id}`).value) || 0;

    const { error } = await supabaseClient.from('partidos').update({
        goles_a: golesA,
        goles_b: golesB,
        finalizado: finalizar
    }).eq('id', id);

    if (error) return alert('Error al actualizar partido: ' + error.message);
    
    alert(finalizar ? '✅ Partido finalizado y marcador guardado' : '✅ Marcador actualizado');
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function finalizarPartido(id) {
    if (!confirm('¿Finalizar el partido?')) return;
    const { data: p } = await supabaseClient.from('partidos').select('*').eq('id', id).single();
    if (!p) return;
    const ahora = new Date();
    const inicio = new Date(p.inicio_periodo || ahora);
    const transcurrido = Math.floor((ahora - inicio) / 1000);
    const tiempoFinal = (p.tiempo_jugado || 0) + Math.max(0, transcurrido);

    // Contar goles desde partido_eventos
    const { data: golesEventos } = await supabaseClient.from('partido_eventos')
        .select('*')
        .eq('partido_id', id)
        .eq('tipo', 'gol');
    const golesA = (golesEventos || []).filter(e => String(e.equipo_id) === String(p.equipo_a_id)).length;
    const golesB = (golesEventos || []).filter(e => String(e.equipo_id) === String(p.equipo_b_id)).length;

    const { error } = await supabaseClient.from('partidos').update({
        finalizado: true,
        en_curso: false,
        periodo: 'finalizado',
        tiempo_jugado: tiempoFinal,
        inicio_periodo: null,
        goles_a: golesA,
        goles_b: golesB
    }).eq('id', id);
    if (error) return alert('Error: ' + error.message);

    // Obtener nombres de equipo y categoría
    const eqA = equiposList.find(e => e.id === p.equipo_a_id);
    const eqB = equiposList.find(e => e.id === p.equipo_b_id);
    const cat = categoriasConfig.find(c => c.id === p.categoria_id);
    const catNombre = cat?.nombre || '';

    // Obtener tarjetas del partido
    const { data: eventos } = await supabaseClient.from('partido_eventos')
        .select('*')
        .eq('partido_id', id)
        .in('tipo', ['tarjeta_amarilla', 'tarjeta_roja']);

    if (eventos && eventos.length > 0) {
        // Obtener montos de config_faltas
        const { data: configs } = await supabaseClient.from('config_faltas').select('*');
        const montoMap = {};
        (configs || []).forEach(c => { montoMap[c.tipo] = Number(c.monto) || 0; });

        for (const ev of eventos) {
            // Verificar si ya se insertó (por si finalizan dos veces)
            const { data: exist } = await supabaseClient.from('faltas')
                .select('id').eq('partido_id', id).eq('ci_jugador', ev.jugador_ci)
                .eq('tipo_falta', ev.tipo).limit(1);
            if (exist && exist.length > 0) continue;

            const eqNombre = String(ev.equipo_id) === String(p.equipo_a_id) ? (eqA?.nombre || '') : (eqB?.nombre || '');
            const monto = montoMap[ev.tipo] || (ev.tipo === 'tarjeta_roja' ? 30000 : 15000);
            await supabaseClient.from('faltas').insert({
                ci_jugador: ev.jugador_ci,
                nombre_jugador: ev.jugador_nombre,
                tipo_falta: ev.tipo,
                monto,
                partido_id: id,
                equipo_nombre: eqNombre,
                categoria_nombre: catNombre
            });
        }
    }

    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function reabrirPartido(id) {
    const { error } = await supabaseClient.from('partidos').update({
        finalizado: false,
        en_curso: false,
        periodo: 'primer_tiempo'
    }).eq('id', id);

    if (error) return alert('Error al reabrir partido: ' + error.message);
    
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

// ============================
// EVENTOS DE PARTIDO (goles, tarjetas)
// ============================
async function cargarEventosPartido(partidoId) {
    const { data: eventos, error } = await supabaseClient
        .from('partido_eventos')
        .select('*')
        .eq('partido_id', partidoId)
        .order('minuto');
    if (error) return [];
    return eventos || [];
}

async function agregarEventoPartido(partidoId, equipoId, tipo, jugadorNombre, jugadorCi, minuto) {
    const { error } = await supabaseClient.from('partido_eventos').insert({
        partido_id: partidoId,
        equipo_id: equipoId,
        tipo,
        jugador_nombre: jugadorNombre,
        jugador_ci: jugadorCi || '',
        minuto: parseInt(minuto) || 0
    });
    if (error) {
        if (error.message && error.message.includes('does not exist')) {
            alert('La tabla partido_eventos no existe. Ejecutá el CREATE TABLE en el SQL Editor de Supabase.');
        } else {
            alert('Error al registrar evento: ' + error.message);
        }
    }
}

function renderEventosPartido(eventos, equipoAId, equipoBId, equiposNombres) {
    const matchEvents = (eventos || []).filter(ev => ev.tipo === 'gol' || ev.tipo === 'tarjeta_amarilla' || ev.tipo === 'tarjeta_roja');
    if (!matchEvents.length) return '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Sin eventos registrados</div>';
    const iconos = { 'gol': '⚽', 'tarjeta_amarilla': '🟨', 'tarjeta_roja': '🟥' };
    let html = '<div style="font-size:13px;display:flex;flex-direction:column;gap:4px;padding:8px 0;">';
    matchEvents.forEach(ev => {
        const icono = iconos[ev.tipo] || '•';
        const eqNombre = String(ev.equipo_id) === String(equipoAId) ? equiposNombres.a : (String(ev.equipo_id) === String(equipoBId) ? equiposNombres.b : '');
        html += `<div style="display:flex;align-items:center;gap:6px;">
            <span>${icono}</span>
            <span style="font-weight:600;color:var(--text-muted);min-width:28px;">${ev.minuto}'</span>
            <span style="color:var(--primary-color);font-weight:600;">${escHtml(eqNombre)}</span>
            <span>${escHtml(ev.jugador_nombre)}</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

async function eliminarEventoPartido(id) {
    if (!confirm('¿Eliminar este evento?')) return;
    const { error } = await supabaseClient.from('partido_eventos').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
}

// ============================
// VEEDOR: GOLES / EVENTOS (roster-based)
// ============================
let _veedorPartidoActual = null;

async function veedorCargarPartidos() {
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select('id, fecha_hora, finalizado, categoria_id, equipo_a_id, equipo_b_id')
        .eq('finalizado', false)
        .order('fecha_hora', { ascending: false })
        .limit(30);

    if (error || !partidos) return alert('Error al cargar partidos');

    const select = document.getElementById('veedor-evento-partido');
    select.innerHTML = '<option value="">Seleccionar partido...</option>';
    partidos.forEach(p => {
        const eqA = equiposList.find(e => e.id === p.equipo_a_id);
        const eqB = equiposList.find(e => e.id === p.equipo_b_id);
        if (!eqA || !eqB) return;
        const fecha = new Date(p.fecha_hora).toLocaleDateString();
        const catNombre = (categoriasConfig.find(c => c.id === p.categoria_id) || {}).nombre || '';
        select.innerHTML += `<option value="${p.id}" data-eq-a="${eqA.id}" data-eq-b="${eqB.id}" data-cat="${p.categoria_id}" data-nom-a="${escHtml(eqA.nombre)}" data-nom-b="${escHtml(eqB.nombre)}">${fecha} - ${escHtml(eqA.nombre)} vs ${escHtml(eqB.nombre)} [${escHtml(catNombre)}]</option>`;
    });
    if (partidos.length > 0) {
        select.selectedIndex = 1;
        veedorCargarEquipos();
    }
    document.getElementById('veedor-equipos-section').style.display = 'block';
}

async function veedorCargarEquipos() {
    const select = document.getElementById('veedor-evento-partido');
    const opt = select.options[select.selectedIndex];
    if (!opt || !opt.value) {
        document.getElementById('veedor-equipos-section').style.display = 'none';
        return;
    }

    const eqAId = opt.dataset.eqA;
    const eqBId = opt.dataset.eqB;
    const nomA = opt.dataset.nomA;
    const nomB = opt.dataset.nomB;
    const catId = parseInt(opt.dataset.cat) || 0;
    const partidoId = opt.value;
    _veedorPartidoActual = { id: partidoId, eqAId, eqBId, nomA, nomB, catId };

    document.getElementById('veedor-nom-equipo-a').textContent = nomA;
    document.getElementById('veedor-nom-equipo-b').textContent = nomB;
    document.getElementById('veedor-equipos-section').style.display = 'block';

    // Load category config for titulares max
    let titularesMax = 11;
    if (categoriasConfig && catId) {
        const cat = categoriasConfig.find(c => c.id === catId);
        if (cat) titularesMax = cat.jugadores_por_equipo;
    }

    // Load players filtered by match category + events in parallel
    const [atletasA, atletasB, eventos] = await Promise.all([
        supabaseClient.from('atletas').select('socio_id, socios (id, nombre, apellido, ci)').eq('equipo_id', eqAId).eq('categoria_id', catId),
        supabaseClient.from('atletas').select('socio_id, socios (id, nombre, apellido, ci)').eq('equipo_id', eqBId).eq('categoria_id', catId),
        cargarEventosPartido(partidoId)
    ]);

    renderPlantelEquipo('veedor-lista-a', atletasA.data, eqAId, eventos, titularesMax);
    renderPlantelEquipo('veedor-lista-b', atletasB.data, eqBId, eventos, titularesMax);
    actualizarScoreVeedor(eventos, eqAId, eqBId);
    await veedorRecargarEventos();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Detener timer anterior si existe
    if (_veedorPartidoActual && _veedorPartidoActual.id !== partidoId) {
        detenerTimerPartido(_veedorPartidoActual.id);
    }
    // Cargar estado del partido (timer columns pueden no existir todavía)
    let matchData = { en_curso: false, tiempo_jugado: 0, periodo: 'primer_tiempo', inicio_periodo: null };
    let timerColumnsExist = true;
    try {
        const { data } = await supabaseClient.from('partidos').select('en_curso, tiempo_jugado, periodo, inicio_periodo').eq('id', partidoId).single();
        if (data) matchData = data;
    } catch (e) {
        timerColumnsExist = false;
    }
    const timerBar = document.getElementById('veedor-timer-bar');
    const btnIniciar = document.getElementById('veedor-btn-iniciar');
    const btnPausar = document.getElementById('veedor-btn-pausar');
    const btnFin1T = document.getElementById('veedor-btn-fin1t');
    const btnFinalizar = document.getElementById('veedor-btn-finalizar');
    if (timerBar) {
        timerBar.style.display = 'flex';
        if (matchData.en_curso) {
            if (btnIniciar) btnIniciar.style.display = 'none';
            if (btnPausar) btnPausar.style.display = 'inline-block';
            if (btnFin1T) btnFin1T.style.display = 'none';
            if (btnFinalizar) btnFinalizar.style.display = matchData.periodo === 'segundo_tiempo' ? 'inline-block' : 'none';
            actualizarDisplayTimer(partidoId, obtenerTiempoActual(matchData), matchData);
            arrancarTimerPartido(partidoId);
        } else if (timerColumnsExist) {
            if (matchData.periodo === 'entretiempo') {
                if (btnIniciar) btnIniciar.style.display = 'inline-block';
                if (btnPausar) btnPausar.style.display = 'none';
                if (btnFin1T) btnFin1T.style.display = 'none';
                if (btnFinalizar) btnFinalizar.style.display = 'none';
            } else if (matchData.periodo === 'segundo_tiempo') {
                if (btnIniciar) btnIniciar.style.display = 'inline-block';
                if (btnPausar) btnPausar.style.display = 'none';
                if (btnFin1T) btnFin1T.style.display = 'none';
                if (btnFinalizar) btnFinalizar.style.display = 'inline-block';
            } else if (matchData.periodo === 'primer_tiempo' && matchData.tiempo_jugado > 0) {
                if (btnIniciar) btnIniciar.style.display = 'none';
                if (btnPausar) btnPausar.style.display = 'none';
                if (btnFin1T) btnFin1T.style.display = 'inline-block';
                if (btnFinalizar) btnFinalizar.style.display = 'none';
            } else {
                if (btnIniciar) btnIniciar.style.display = 'inline-block';
                if (btnPausar) btnPausar.style.display = 'none';
                if (btnFin1T) btnFin1T.style.display = 'none';
                if (btnFinalizar) btnFinalizar.style.display = 'none';
            }
            const displayT = obtenerTiempoDisplay(matchData);
            actualizarDisplayTimer(partidoId, displayT, matchData);
        } else {
            if (btnIniciar) btnIniciar.style.display = 'none';
            if (btnPausar) btnPausar.style.display = 'none';
            if (btnFin1T) btnFin1T.style.display = 'none';
            if (btnFinalizar) btnFinalizar.style.display = 'none';
        }
    }
}

async function veedorFinPrimerTiempo() {
    if (!_veedorPartidoActual) return;
    const pid = _veedorPartidoActual.id;
    const { data: p } = await supabaseClient.from('partidos').select('tiempo_jugado').eq('id', pid).single();
    if (!p) return;
    // Guardar el tiempo del 1T y pasar a entretiempo
    await supabaseClient.from('partidos').update({
        tiempo_1t: p.tiempo_jugado || 0,
        periodo: 'entretiempo'
    }).eq('id', pid);
    const btnFin1T = document.getElementById('veedor-btn-fin1t');
    if (btnFin1T) btnFin1T.style.display = 'none';
    document.getElementById('veedor-btn-finalizar').style.display = 'none';
    // Mostrar Iniciar para 2T
    const btnIniciar = document.getElementById('veedor-btn-iniciar');
    if (btnIniciar) btnIniciar.style.display = 'inline-block';
    const pausa = document.getElementById('veedor-btn-pausar');
    if (pausa) pausa.style.display = 'none';
    // Actualizar display
    actualizarDisplayTimer(pid, 0, { periodo: 'entretiempo', tiempo_1t: p.tiempo_jugado || 0, tiempo_jugado: p.tiempo_jugado || 0 });
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function habilitarPartido(id) {
    const { error } = await supabaseClient.from('partidos').update({
        tiempo_jugado: 0,
        periodo: 'primer_tiempo'
    }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function veedorIniciarPartido() {
    if (!_veedorPartidoActual) return;
    const pid = _veedorPartidoActual.id;
    const { data: p } = await supabaseClient.from('partidos').select('*').eq('id', pid).single();
    if (!p) return;
    // Si está en entretiempo, avanzar a segundo_tiempo
    let periodo = p.periodo;
    if (periodo === 'entretiempo') periodo = 'segundo_tiempo';
    // El Veedor inicia el timer: en_curso=true + inicio_periodo=now
    const { error } = await supabaseClient.from('partidos').update({
        en_curso: true,
        periodo,
        inicio_periodo: new Date().toISOString()
    }).eq('id', pid);
    if (error) return alert('Error: ' + error.message);
    arrancarTimerPartido(pid);
    const btn = document.getElementById('veedor-btn-iniciar');
    if (btn) btn.style.display = 'none';
    const pausa = document.getElementById('veedor-btn-pausar');
    if (pausa) pausa.style.display = 'inline-block';
    const fin1t = document.getElementById('veedor-btn-fin1t');
    if (fin1t) fin1t.style.display = 'none';
    const finalizar = document.getElementById('veedor-btn-finalizar');
    if (finalizar) finalizar.style.display = periodo === 'segundo_tiempo' ? 'inline-block' : 'none';
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function veedorFinalizarPartido() {
    if (!_veedorPartidoActual) return;
    await finalizarPartido(_veedorPartidoActual.id);
    detenerTimerPartido(_veedorPartidoActual.id);
    document.getElementById('veedor-btn-finalizar').style.display = 'none';
    document.getElementById('veedor-btn-iniciar').style.display = 'none';
    document.getElementById('veedor-btn-pausar').style.display = 'none';
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function veedorPausarPartido() {
    if (!_veedorPartidoActual) return;
    const { data: p } = await supabaseClient.from('partidos').select('*').eq('id', _veedorPartidoActual.id).single();
    if (!p) return;
    await pausarPartido(p.id, p);
    const iniciar = document.getElementById('veedor-btn-iniciar');
    const pausa = document.getElementById('veedor-btn-pausar');
    const fin1t = document.getElementById('veedor-btn-fin1t');
    const finalizar = document.getElementById('veedor-btn-finalizar');
    if (pausa) pausa.style.display = 'none';
    if (finalizar) finalizar.style.display = p.periodo === 'segundo_tiempo' ? 'inline-block' : 'none';
    if (p.periodo === 'primer_tiempo' && (p.tiempo_jugado || 0) > 0) {
        if (iniciar) iniciar.style.display = 'none';
        if (fin1t) fin1t.style.display = 'inline-block';
    } else {
        if (iniciar) iniciar.style.display = 'inline-block';
        if (fin1t) fin1t.style.display = 'none';
    }
}

function actualizarScoreVeedor(eventos, eqAId, eqBId) {
    const golesA = (eventos || []).filter(e => String(e.equipo_id) === String(eqAId) && e.tipo === 'gol').length;
    const golesB = (eventos || []).filter(e => String(e.equipo_id) === String(eqBId) && e.tipo === 'gol').length;
    const elA = document.getElementById('veedor-score-a');
    const elB = document.getElementById('veedor-score-b');
    if (elA) elA.textContent = golesA;
    if (elB) elB.textContent = golesB;
}

function renderPlantelEquipo(containerId, atletas, equipoId, eventos, titularesMax) {
    const lista = document.getElementById(containerId);
    if (!lista) return;
    if (!atletas || atletas.length === 0) {
        lista.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:1rem;font-size:13px;">Sin jugadores</div>';
        return;
    }

    const titularesCount = (eventos || []).filter(e => e.tipo === 'titular' && e.equipo_id === equipoId).length;
    const totalJugadores = atletas.length;
    const headerHtml = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;font-size:11px;color:var(--text-muted);border-bottom:1px solid var(--border);margin-bottom:4px;"><span>🟢 Titulares: <strong>${titularesCount}</strong> / ${titularesMax || '?'}</span><span>Total: ${totalJugadores}</span></div>`;

    lista.innerHTML = headerHtml;
    atletas.forEach(a => {
        const s = a.socios;
        if (!s) return;
        const nombreCompleto = `${s.nombre} ${s.apellido}`.trim();
        const jugadorEventos = eventos.filter(e => e.jugador_ci === s.ci && e.equipo_id === equipoId);
        const tieneAmarilla = jugadorEventos.some(e => e.tipo === 'tarjeta_amarilla');
        const tieneRoja = jugadorEventos.some(e => e.tipo === 'tarjeta_roja');
        const goles = jugadorEventos.filter(e => e.tipo === 'gol').length;
        const esTitular = jugadorEventos.some(e => e.tipo === 'titular');
        const entraCount = jugadorEventos.filter(e => e.tipo === 'entra').length;
        const saleCount = jugadorEventos.filter(e => e.tipo === 'sale').length;

        let indicator = '';
        if (tieneRoja) indicator = '<span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:50%;" title="Roja"></span>';
        else if (tieneAmarilla) indicator = '<span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:50%;" title="Amarilla"></span>';

        const titularClass = esTitular ? 'background:rgba(16,185,129,0.15);border-color:rgba(16,185,129,0.4);' : '';

        const div = document.createElement('div');
        div.style.cssText = `display:flex;align-items:center;gap:4px;padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:12px;${titularClass}`;
        div.innerHTML = `
            <div style="min-width:12px;">${indicator}</div>
            <div style="flex:1;min-width:0;line-height:1.3;">
                <strong>${escHtml(nombreCompleto)}</strong>
                <span style="color:var(--text-muted);margin-left:4px;font-size:11px;">${escHtml(s.ci)}</span>
                ${goles > 0 ? `<span style="color:#10b981;margin-left:4px;">⚽×${goles}</span>` : ''}
                <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">
                    ${esTitular ? '<span style="color:#059669;font-weight:600;">🟢 Titular</span>' : '<span style="color:#64748b;">🔘 Suplente</span>'}
                    ${entraCount+saleCount > 0 ? `<span style="margin-left:4px;">🔄 ${entraCount}/${saleCount}</span>` : ''}
                </div>
            </div>
            <div style="display:flex;gap:3px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                <button onclick="veedorToggleTitular('${_veedorPartidoActual.id}','${equipoId}','${escHtml(nombreCompleto)}','${s.ci}',${esTitular})" class="btn-sm" style="background:${esTitular?'#059669':'#94a3b8'};color:white;padding:2px 6px;font-size:10px;border:none;border-radius:4px;cursor:pointer;" title="Marcar como titular">${esTitular?'🟢':'⚪'}</button>
                <button onclick="veedorRegistrarCambio('${_veedorPartidoActual.id}','${equipoId}','${escHtml(nombreCompleto)}','${s.ci}','entra')" class="btn-sm" style="background:#10b981;color:white;padding:2px 5px;font-size:10px;border:none;border-radius:4px;cursor:pointer;" title="Entra">⬆ Entra</button>
                <button onclick="veedorRegistrarCambio('${_veedorPartidoActual.id}','${equipoId}','${escHtml(nombreCompleto)}','${s.ci}','sale')" class="btn-sm" style="background:#ef4444;color:white;padding:2px 5px;font-size:10px;border:none;border-radius:4px;cursor:pointer;" title="Sale">⬇ Sale</button>
                <button onclick="veedorRegistrarEvento('${_veedorPartidoActual.id}', '${equipoId}', '${escHtml(nombreCompleto)}', '${s.ci}', 'gol')" class="btn-sm" style="background:#10b981;color:white;padding:2px 6px;font-size:11px;border:none;border-radius:4px;cursor:pointer;${tieneRoja ? 'opacity:0.3;pointer-events:none;' : ''}">⚽</button>
                <button onclick="veedorRegistrarEvento('${_veedorPartidoActual.id}', '${equipoId}', '${escHtml(nombreCompleto)}', '${s.ci}', 'tarjeta_amarilla')" class="btn-sm" style="background:#f59e0b;color:white;padding:2px 6px;font-size:11px;border:none;border-radius:4px;cursor:pointer;${tieneRoja ? 'opacity:0.3;pointer-events:none;' : ''}">🟨</button>
                <button onclick="veedorRegistrarEvento('${_veedorPartidoActual.id}', '${equipoId}', '${escHtml(nombreCompleto)}', '${s.ci}', 'tarjeta_roja')" class="btn-sm" style="background:#ef4444;color:white;padding:2px 6px;font-size:11px;border:none;border-radius:4px;cursor:pointer;${tieneRoja ? 'opacity:0.3;pointer-events:none;' : ''}">🟥</button>
            </div>
        `;
        lista.appendChild(div);
    });
}

async function veedorRegistrarEvento(partidoId, equipoId, nombre, ci, tipo) {
    const minuto = parseInt(document.getElementById('veedor-evento-minuto').value) || 0;

    // Auto-convertir 2da amarilla → roja
    let tipoFinal = tipo;
    if (tipo === 'tarjeta_amarilla') {
        const eventos = await cargarEventosPartido(partidoId);
        const tieneAmarilla = eventos.some(e =>
            e.tipo === 'tarjeta_amarilla' &&
            e.jugador_ci === ci &&
            e.equipo_id === equipoId
        );
        if (tieneAmarilla) {
            tipoFinal = 'tarjeta_roja';
            alert('⚠️ El jugador ya tenía una amarilla. Se registra como TARJETA ROJA.');
        }
    }

    await agregarEventoPartido(partidoId, equipoId, tipoFinal, nombre, ci, minuto);
    
    // Refresh both teams and events
    await veedorCargarEquipos();
    await cargarEstadisticas();
}

async function veedorToggleTitular(partidoId, equipoId, nombre, ci, esTitular) {
    if (esTitular) {
        // Quitar titular
        await supabaseClient.from('partido_eventos').delete()
            .eq('partido_id', partidoId)
            .eq('equipo_id', equipoId)
            .eq('jugador_ci', ci)
            .eq('tipo', 'titular');
    } else {
        // Agregar titular
        await supabaseClient.from('partido_eventos').insert({
            partido_id: parseInt(partidoId),
            equipo_id: equipoId,
            tipo: 'titular',
            jugador_nombre: nombre,
            jugador_ci: ci,
            minuto: 0
        });
    }
    await veedorCargarEquipos();
}

async function veedorRegistrarCambio(partidoId, equipoId, nombre, ci, tipo) {
    const minuto = parseInt(document.getElementById('veedor-evento-minuto').value) || 0;
    await supabaseClient.from('partido_eventos').insert({
        partido_id: parseInt(partidoId),
        equipo_id: equipoId,
        tipo,
        jugador_nombre: nombre,
        jugador_ci: ci,
        minuto
    });
    await veedorCargarEquipos();
}

async function veedorRecargarEventos() {
    if (!_veedorPartidoActual) return;
    const eventos = await cargarEventosPartido(_veedorPartidoActual.id);
    actualizarScoreVeedor(eventos, _veedorPartidoActual.eqAId, _veedorPartidoActual.eqBId);
    document.getElementById('veedor-eventos-lista').innerHTML = renderEventosPartido(
        eventos,
        _veedorPartidoActual.eqAId,
        _veedorPartidoActual.eqBId,
        { a: _veedorPartidoActual.nomA, b: _veedorPartidoActual.nomB }
    );
}

async function eliminarPartido(id) {
    if (!confirm('¿Estás seguro de eliminar este partido programado?')) return;
    const { error } = await supabaseClient.from('partidos').delete().eq('id', id);
    if (error) return alert('Error al eliminar partido: ' + error.message);
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

// ============================
// CRONÓMETRO / TIMER
// ============================
// ------------------------------------------------
// CRONÓMETRO – Timer global con auto-pause
// ------------------------------------------------
let _timerTicks = {}; // partido_id → { data, interval }
let _extraTargets = {}; // partido_id → target seconds for extra time end

async function asegurarDatosReferencia() {
    if (equiposList.length === 0) {
        const { data } = await supabaseClient.from('equipos').select('*');
        if (data) equiposList = data;
    }
    if (canchasList.length === 0) {
        const { data } = await supabaseClient.from('canchas').select('*');
        if (data) canchasList = data;
    }
}

function formatearTiempo(seg) {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function obtenerPeriodoLabel(p) {
    const map = { 'primer_tiempo': '1T', 'segundo_tiempo': '2T', 'entretiempo': 'ENTRET' };
    const l = map[p.periodo] || '1T';
    const extra = _extraTargets[p.id];
    if (p.periodo === 'primer_tiempo' && extra) return '1T+ADIC';
    if (p.periodo === 'segundo_tiempo' && extra) return '2T+ADIC';
    return l;
}

function obtenerTiempoActual(p) {
    let t = p.tiempo_jugado || 0;
    if (p.en_curso && p.inicio_periodo) {
        const ahora = new Date();
        const inicio = new Date(p.inicio_periodo);
        t += Math.max(0, Math.floor((ahora - inicio) / 1000));
    }
    return t;
}

function obtenerTiempoDisplay(p) {
    let t = obtenerTiempoActual(p);
    // En 2T, restar el tiempo del 1T para mostrar contador desde 0
    if (p.periodo === 'segundo_tiempo') {
        t -= (p.tiempo_1t || 0);
    }
    return Math.max(0, t);
}

function arrancarTimerPartido(pid) {
    if (_timerTicks[pid]) return;
    _timerTicks[pid] = { data: null, count: 0 };
    _timerTicks[pid].interval = setInterval(async () => {
        const tick = _timerTicks[pid];
        if (!tick) return;
        // Recargar datos cada 10 segundos para sincronizar
        if (!tick.data || tick.count % 10 === 0) {
            const { data } = await supabaseClient.from('partidos').select('*').eq('id', pid).single();
            if (!data || data.finalizado || !data.en_curso) {
                detenerTimerPartido(pid);
                return;
            }
            tick.data = data;
            tick.count = 0;
        }
        tick.count++;
        const p = tick.data;
        const t = obtenerTiempoActual(p);

        // Auto-pausa al llegar al límite del período
        const extraTarget = _extraTargets[pid];
        let debePausar = false;
        if (p.periodo === 'primer_tiempo') {
            if (extraTarget) {
                debePausar = t >= extraTarget;
            } else {
                debePausar = t >= 2700;
            }
        } else if (p.periodo === 'segundo_tiempo') {
            if (extraTarget) {
                debePausar = t >= extraTarget;
            } else {
                debePausar = t >= 5400;
            }
        }
        if (debePausar) {
            const ahora = new Date();
            const inicio = new Date(p.inicio_periodo);
            const transcurrido = Math.floor((ahora - inicio) / 1000);
            const nuevoTiempo = (p.tiempo_jugado || 0) + Math.max(0, transcurrido);
            await supabaseClient.from('partidos').update({
                en_curso: false,
                tiempo_jugado: nuevoTiempo,
                inicio_periodo: null
            }).eq('id', pid);
            if (p.periodo === 'primer_tiempo') {
                await supabaseClient.from('partidos').update({ periodo: 'entretiempo' }).eq('id', pid);
            }
            delete _extraTargets[pid];
            detenerTimerPartido(pid);
            await cargarPartidosAdmin();
            cargarEstadisticas();
            // Actualizar botones del Veedor si está viendo este partido
            if (_veedorPartidoActual && _veedorPartidoActual.id == pid) {
                const finalizarBtn = document.getElementById('veedor-btn-finalizar');
                if (finalizarBtn) finalizarBtn.style.display = p.periodo === 'segundo_tiempo' ? 'inline-block' : 'none';
                const iniciarBtn = document.getElementById('veedor-btn-iniciar');
                if (iniciarBtn) iniciarBtn.style.display = 'inline-block';
                const pausaBtn = document.getElementById('veedor-btn-pausar');
                if (pausaBtn) pausaBtn.style.display = 'none';
            }
            return;
        }

        // Actualizar displays en vivo (admin + veedor)
        // Admin muestra tiempo total, Veedor muestra tiempo del período
        const displayT = p.periodo === 'segundo_tiempo' ? (t - (p.tiempo_1t || 0)) : t;
        actualizarDisplayTimer(pid, Math.max(0, displayT), p);
        // Asegurar que botón Finalizar sea visible en 2T mientras corre
        if (_veedorPartidoActual && _veedorPartidoActual.id == pid && p.periodo === 'segundo_tiempo' && p.en_curso) {
            const fBtn = document.getElementById('veedor-btn-finalizar');
            if (fBtn) fBtn.style.display = 'inline-block';
        }
    }, 1000);

    // También refrescar las vistas cada tick para la tabla admin
    let refreshCount = 0;
    _timerTicks[pid].refresh = setInterval(async () => {
        refreshCount++;
        if (refreshCount % 5 === 0) {
            await cargarPartidosAdmin();
            await veedorRecargarEventos();
            cargarEventosEnVivo();
        }
    }, 1000);
}

function detenerTimerPartido(pid) {
    const tick = _timerTicks[pid];
    if (!tick) return;
    clearInterval(tick.interval);
    if (tick.refresh) clearInterval(tick.refresh);
    delete _timerTicks[pid];
}

function actualizarDisplayTimer(pid, seg, partido) {
    const label = obtenerPeriodoLabel(partido) || '1T';
    const timeStr = formatearTiempo(seg);
    // Actualizar timer en admin table (si existe el elemento)
    const timerSpan = document.getElementById(`timer-${pid}`);
    if (timerSpan) {
        timerSpan.textContent = timeStr;
    }
    // Actualizar timer en veedor
    const veedorTimer = document.getElementById('veedor-timer-display');
    const veedorPeriod = document.getElementById('veedor-period-display');
    if (veedorTimer) veedorTimer.textContent = timeStr;
    if (veedorPeriod) veedorPeriod.textContent = label;
}

async function iniciarPartido(id) {
    const { error } = await supabaseClient.from('partidos').update({
        en_curso: true,
        tiempo_jugado: 0,
        periodo: 'primer_tiempo',
        inicio_periodo: new Date().toISOString()
    }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    arrancarTimerPartido(id);
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function pausarPartido(id, partido) {
    if (!partido) {
        const { data } = await supabaseClient.from('partidos').select('*').eq('id', id).single();
        partido = data;
    }
    const ahora = new Date();
    const inicio = new Date(partido.inicio_periodo);
    const transcurrido = Math.floor((ahora - inicio) / 1000);
    const nuevoTiempo = (partido.tiempo_jugado || 0) + Math.max(0, transcurrido);
    const { error } = await supabaseClient.from('partidos').update({
        en_curso: false,
        tiempo_jugado: nuevoTiempo,
        inicio_periodo: null
    }).eq('id', id);
    if (error) return alert('Error al pausar: ' + error.message);
    detenerTimerPartido(id);
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function reanudarPartido(id, destino) {
    const { data: p } = await supabaseClient.from('partidos').select('*').eq('id', id).single();
    if (!p) return;
    let periodo = p.periodo;
    if (destino === '2T') {
        periodo = 'segundo_tiempo';
        delete _extraTargets[id];
    } else if (destino === '1T') {
        periodo = 'primer_tiempo';
    } else {
        // Auto-detect
        if (periodo === 'entretiempo') periodo = 'segundo_tiempo';
        else if (periodo === 'primer_tiempo' && p.tiempo_jugado >= 2700) periodo = 'entretiempo';
    }
    const { error } = await supabaseClient.from('partidos').update({
        en_curso: true,
        periodo,
        inicio_periodo: new Date().toISOString()
    }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    arrancarTimerPartido(id);
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

async function agregarTiempoAdicional(id) {
    const input = document.getElementById(`admin-extra-minutos-${id}`);
    const extraMin = parseInt(input?.value) || 0;
    if (!extraMin) return alert('Ingresa los minutos adicionales');
    const { data: p } = await supabaseClient.from('partidos').select('tiempo_jugado, periodo').eq('id', id).single();
    if (!p) return;
    const base = p.tiempo_jugado || 0;
    const target = base + (extraMin * 60);
    // Solo guardamos el target (no actualizamos tiempo_jugado aún)
    _extraTargets[id] = target;
    if (input) input.value = '';
    await cargarPartidosAdmin();
    cargarEstadisticas();
}

// ============================
// ESTADÍSTICAS PÚBLICAS (libre acceso)
// ============================
async function cargarEstadisticas() {
    await cargarFixturePublico();
    await cargarEventosEnVivo();
    await cargarEstadisticasYTabla();
}

async function cargarEventosEnVivo() {
    const ahora = new Date().toISOString();
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select('*')
        .eq('finalizado', false)
        .lte('fecha_hora', ahora)
        .order('fecha_hora', { ascending: false });

    const container = document.getElementById('est-en-vivo-list');
    if (!container) return;

    if (error || !partidos || partidos.length === 0) {
        document.getElementById('est-en-vivo-section').style.display = 'none';
        return;
    }

    // Ensure equipos/canchas data is available
    await asegurarDatosReferencia();

    // Load events for each match
    const enVivo = [];
    for (const p of partidos) {
        const eventos = await cargarEventosPartido(p.id);
        enVivo.push({ ...p, eventos: eventos || [] });
    }

    document.getElementById('est-en-vivo-section').style.display = 'block';
    container.innerHTML = '';

    enVivo.forEach(p => {
        const eqA = equiposList.find(e => e.id === p.equipo_a_id) || { nombre: '?', logo_url: '' };
        const eqB = equiposList.find(e => e.id === p.equipo_b_id) || { nombre: '?', logo_url: '' };
        const cancha = canchasList.find(c => c.id === p.cancha_id) || { nombre: '—' };
        const logoA = eqA.logo_url 
            ? `<img src="${eqA.logo_url}" alt="${eqA.nombre}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">`
            : `<div style="width:32px;height:32px;background:#e2e8f0;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;"><i data-lucide="shield" style="width:16px;height:16px;"></i></div>`;
        const logoB = eqB.logo_url 
            ? `<img src="${eqB.logo_url}" alt="${eqB.nombre}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">`
            : `<div style="width:32px;height:32px;background:#e2e8f0;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;"><i data-lucide="shield" style="width:16px;height:16px;"></i></div>`;

        const golesA = p.eventos.filter(e => String(e.equipo_id) === String(p.equipo_a_id) && e.tipo === 'gol');
        const golesB = p.eventos.filter(e => String(e.equipo_id) === String(p.equipo_b_id) && e.tipo === 'gol');

        // Build player-level event list grouped by minuto
        let timelineHtml = '';
        if (p.eventos.length > 0) {
            const matchOnly = p.eventos.filter(ev => ev.tipo === 'gol' || ev.tipo === 'tarjeta_amarilla' || ev.tipo === 'tarjeta_roja');
            const sorted = [...matchOnly].sort((a, b) => a.minuto - b.minuto);
            timelineHtml = '<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;font-size:13px;">';
            const rojos = (p.eventos || []).filter(e => e.tipo === 'tarjeta_roja');
            sorted.forEach(ev => {
                const esEqA = String(ev.equipo_id) === String(p.equipo_a_id);
                const eqNombre = esEqA ? eqA.nombre : eqB.nombre;
                if (ev.tipo === 'gol') {
                    timelineHtml += `<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:rgba(16,185,129,0.1);border-radius:6px;margin:2px 0;border-left:3px solid #10b981;">
                        <span style="font-weight:800;color:#94a3b8;min-width:28px;font-size:13px;">${ev.minuto}'</span>
                        <span style="font-size:18px;">⚽</span>
                        <span style="color:#10b981;font-weight:700;font-size:14px;">${escHtml(eqNombre)}</span>
                        <span style="font-weight:600;">${escHtml(ev.jugador_nombre)}</span>
                    </div>`;
                } else if (ev.tipo === 'tarjeta_roja') {
                    timelineHtml += `<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:rgba(239,68,68,0.12);border-radius:6px;margin:2px 0;border-left:3px solid #ef4444;">
                        <span style="font-weight:800;color:#94a3b8;min-width:28px;font-size:13px;">${ev.minuto}'</span>
                        <span style="font-size:16px;">🟥</span>
                        <span style="color:#ef4444;font-weight:700;font-size:14px;">${escHtml(eqNombre)}</span>
                        <span style="font-weight:600;">${escHtml(ev.jugador_nombre)}</span>
                        <span style="background:rgba(239,68,68,0.2);color:#fca5a5;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;">EXPULSADO</span>
                    </div>`;
                } else if (ev.tipo === 'tarjeta_amarilla') {
                    timelineHtml += `<div style="display:flex;align-items:center;gap:8px;padding:3px 6px;background:rgba(245,158,11,0.08);border-radius:6px;margin:2px 0;border-left:3px solid #f59e0b;">
                        <span style="font-weight:800;color:#94a3b8;min-width:28px;font-size:12px;">${ev.minuto}'</span>
                        <span style="font-size:14px;">🟨</span>
                        <span style="color:#f59e0b;font-weight:600;font-size:13px;">${escHtml(eqNombre)}</span>
                        <span style="font-weight:500;">${escHtml(ev.jugador_nombre)}</span>
                    </div>`;
                }
            });
            timelineHtml += '</div>';
        } else {
            timelineHtml = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0;">El partido comenzó, sin eventos aún</div>';
        }

        const tiempo = obtenerTiempoDisplay(p);
        const periodLabel = obtenerPeriodoLabel(p);
        const cronoDisplay = p.en_curso || p.tiempo_jugado > 0 ? formatearTiempo(tiempo) : '';
        const periodDisplay = p.en_curso || p.tiempo_jugado > 0 ? periodLabel : '';

        const isLive = p.en_curso || (p.tiempo_jugado || 0) > 0;
        container.innerHTML += `
            <div style="background:rgba(0,0,0,0.25);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:14px;overflow:hidden;">
                <div style="background:linear-gradient(180deg,rgba(185,28,28,0.2) 0%,rgba(0,0,0,0.1) 100%);padding:16px;">
                    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                        <div style="flex:1;text-align:right;">
                            <div style="font-size:14px;font-weight:700;color:white;line-height:1.3;">${escHtml(eqA.nombre)}</div>
                        </div>
                        <div style="text-align:right;">${logoA}</div>
                        <div style="display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.35);padding:6px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
                            <span style="font-size:36px;font-weight:900;color:${golesA.length > golesB.length ? 'var(--accent-color)' : 'white'};line-height:1;">${golesA.length}</span>
                            <span style="font-size:16px;font-weight:700;color:var(--text-muted);">-</span>
                            <span style="font-size:36px;font-weight:900;color:${golesB.length > golesA.length ? 'var(--accent-color)' : 'white'};line-height:1;">${golesB.length}</span>
                        </div>
                        <div style="text-align:left;">${logoB}</div>
                        <div style="flex:1;text-align:left;">
                            <div style="font-size:14px;font-weight:700;color:white;line-height:1.3;">${escHtml(eqB.nombre)}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
                        ${isLive ? '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;"><span style="display:inline-block;width:6px;height:6px;background:#ef4444;border-radius:50%;animation:pulse 1.5s infinite;"></span> En Vivo</span>' : ''}
                        ${cronoDisplay ? `<span style="font-size:18px;font-weight:800;font-family:monospace;color:white;background:rgba(0,0,0,0.3);padding:2px 10px;border-radius:4px;">${cronoDisplay}</span>` : ''}
                        ${periodDisplay ? `<span style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${periodDisplay}</span>` : ''}
                        <span style="font-size:11px;color:var(--text-muted);">${escHtml(cancha.nombre)}</span>
                        ${p.categoria_id ? `<span style="font-size:10px;font-weight:600;color:rgba(245,158,11,0.8);background:rgba(245,158,11,0.1);padding:2px 8px;border-radius:4px;">${escHtml((categoriasConfig.find(c=>c.id===p.categoria_id)||{}).nombre||'')}</span>` : ''}
                    </div>
                </div>
                <div style="padding:10px 16px 12px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.1);">
                    ${timelineHtml}
                </div>
            </div>`;
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function cargarFixturePublico() {
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select('*')
        .eq('finalizado', false)
        .order('fecha_hora', { ascending: true });

    const container = document.getElementById('calendario-juegos');
    if (!container) return;

    if (error) {
        container.innerHTML = `<p style="color:#ef4444;text-align:center;">Error al cargar fixture: ${error.message}</p>`;
        return;
    }

    if (!partidos || partidos.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">No hay partidos programados próximamente.</div>`;
        return;
    }

    await asegurarDatosReferencia();

    // Agrupar por fecha
    const partidosPorFecha = {};
    partidos.forEach(p => {
        const eqA = equiposList.find(e => e.id === p.equipo_a_id) || { nombre: '?', logo_url: '' };
        const eqB = equiposList.find(e => e.id === p.equipo_b_id) || { nombre: '?', logo_url: '' };
        const cancha = canchasList.find(c => c.id === p.cancha_id) || { nombre: '—' };
        p._eqA = eqA;
        p._eqB = eqB;
        p._cancha = cancha;

        const fechaObj = new Date(p.fecha_hora);
        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const fechaStr = fechaObj.toLocaleDateString('es-ES', opciones);
        const fechaFormateada = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
        
        if (!partidosPorFecha[fechaFormateada]) {
            partidosPorFecha[fechaFormateada] = [];
        }
        partidosPorFecha[fechaFormateada].push(p);
    });

    container.innerHTML = '';
    for (const [fechaLabel, lista] of Object.entries(partidosPorFecha)) {
        const grupo = document.createElement('div');
        grupo.className = 'fecha-grupo';
        grupo.innerHTML = `<h3>${fechaLabel}</h3>`;
        
        lista.forEach(p => {
            const eqA = p._eqA;
            const eqB = p._eqB;
            const cancha = p._cancha;
            const hora = new Date(p.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            
            const logoA = eqA.logo_url 
                ? `<img src="${eqA.logo_url}" alt="${eqA.nombre}" style="width:24px; height:24px; object-fit:contain; border-radius: 2px;">`
                : `<div style="width:24px; height:24px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="shield" style="width:12px; height:12px;"></i></div>`;
                
            const logoB = eqB.logo_url 
                ? `<img src="${eqB.logo_url}" alt="${eqB.nombre}" style="width:24px; height:24px; object-fit:contain; border-radius: 2px;">`
                : `<div style="width:24px; height:24px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="shield" style="width:12px; height:12px;"></i></div>`;

            grupo.innerHTML += `
                <div class="partido-card">
                    <div class="partido-hora">
                        <i data-lucide="clock"></i><span>${hora} Hs</span>
                    </div>
                    <div class="partido-versus" style="flex:1; justify-content:center; gap:1.5rem;">
                        <div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-end;">
                            <span class="team" style="text-align:right;">${escHtml(eqA.nombre)}</span>
                            ${logoA}
                        </div>
                        <span class="vs">vs</span>
                        <div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-start;">
                            ${logoB}
                            <span class="team" style="text-align:left;">${escHtml(eqB.nombre)}</span>
                        </div>
                    </div>
                    <div class="partido-cancha">
                        <i data-lucide="map-pin"></i><span>${escHtml(cancha.nombre)}</span>
                    </div>
                </div>
            `;
        });
        container.appendChild(grupo);
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function cargarEstadisticasYTabla() {
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select('*')
        .order('fecha_hora', { ascending: false });

    const listRes = document.getElementById('lista-resultados');
    if (!listRes) return;

    if (error) {
        listRes.innerHTML = `<p style="color:#ef4444;text-align:center;">Error al cargar estadísticas: ${error.message}</p>`;
        return;
    }

    await asegurarDatosReferencia();

    const partidosFinalizados = partidos ? partidos.filter(p => p.finalizado) : [];
    
    if (partidosFinalizados.length === 0) {
        listRes.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">No hay resultados de partidos anteriores registrados aún.</div>`;
    } else {
        listRes.innerHTML = '';
        
        for (const p of partidosFinalizados.slice(0, 10)) {
            const eqA = equiposList.find(e => e.id === p.equipo_a_id) || { id: p.equipo_a_id, nombre: '?', logo_url: '' };
            const eqB = equiposList.find(e => e.id === p.equipo_b_id) || { id: p.equipo_b_id, nombre: '?', logo_url: '' };
            const cancha = canchasList.find(c => c.id === p.cancha_id) || { nombre: '—' };
            const fecha = new Date(p.fecha_hora).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            const eventos = await cargarEventosPartido(p.id);
            const golesEventosA = (eventos || []).filter(e => String(e.equipo_id) === String(p.equipo_a_id) && e.tipo === 'gol').length;
            const golesEventosB = (eventos || []).filter(e => String(e.equipo_id) === String(p.equipo_b_id) && e.tipo === 'gol').length;
            const scoreA = p.goles_a || golesEventosA;
            const scoreB = p.goles_b || golesEventosB;
            
            const logoA = eqA.logo_url 
                ? `<img src="${eqA.logo_url}" alt="${eqA.nombre}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">`
                : `<div style="width:32px;height:32px;background:rgba(255,255,255,0.1);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);"><i data-lucide="shield" style="width:16px;height:16px;"></i></div>`;
                
            const logoB = eqB.logo_url 
                ? `<img src="${eqB.logo_url}" alt="${eqB.nombre}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">`
                : `<div style="width:32px;height:32px;background:rgba(255,255,255,0.1);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);"><i data-lucide="shield" style="width:16px;height:16px;"></i></div>`;

            let golesHtml = '';
            const golesList = (eventos || []).filter(e => e.tipo === 'gol').sort((a, b) => a.minuto - b.minuto);
            if (golesList.length > 0) {
                golesHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;justify-content:center;">';
                golesList.forEach(g => {
                    const esA = String(g.equipo_id) === String(p.equipo_a_id);
                    golesHtml += `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;${esA ? 'background:rgba(16,185,129,0.15);color:#6ee7b7;' : 'background:rgba(245,158,11,0.15);color:#fcd34d;'}">⚽ ${g.minuto}' ${escHtml(g.jugador_nombre)}</span>`;
                });
                golesHtml += '</div>';
            }

            const eqAGanador = scoreA > scoreB;
            const eqBGanador = scoreB > scoreA;
            const empate = scoreA === scoreB;

            listRes.innerHTML += `
                <div style="background:rgba(0,0,0,0.2);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:12px;overflow:hidden;">
                    <div style="background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.05) 100%);padding:14px 16px;">
                        <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
                            <div style="flex:1;text-align:right;display:flex;align-items:center;justify-content:flex-end;gap:8px;">
                                <span style="font-size:14px;font-weight:${eqAGanador ? '800' : '500'};color:${eqAGanador ? 'var(--accent-color)' : 'white'};">${escHtml(eqA.nombre)}</span>
                                ${logoA}
                            </div>
                            <div style="display:flex;align-items:center;gap:5px;background:rgba(0,0,0,0.3);padding:4px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
                                <span style="font-size:28px;font-weight:900;color:${eqAGanador ? 'var(--accent-color)' : 'white'};line-height:1;">${scoreA}</span>
                                <span style="font-size:13px;font-weight:700;color:var(--text-muted);">-</span>
                                <span style="font-size:28px;font-weight:900;color:${eqBGanador ? 'var(--accent-color)' : 'white'};line-height:1;">${scoreB}</span>
                            </div>
                            <div style="flex:1;text-align:left;display:flex;align-items:center;gap:8px;">
                                ${logoB}
                                <span style="font-size:14px;font-weight:${eqBGanador ? '800' : '500'};color:${eqBGanador ? 'var(--accent-color)' : 'white'};">${escHtml(eqB.nombre)}</span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px;font-size:11px;color:var(--text-muted);">
                            <span>${fecha}</span>
                            <span>${escHtml(cancha.nombre)}</span>
                            ${p.categoria_id ? `<span style="color:rgba(245,158,11,0.7);background:rgba(245,158,11,0.08);padding:1px 6px;border-radius:3px;">${escHtml((categoriasConfig.find(c=>c.id===p.categoria_id)||{}).nombre||'')}</span>` : ''}
                        </div>
                    </div>
                    ${golesHtml ? `<div style="padding:6px 16px 10px;border-top:1px solid rgba(255,255,255,0.04);background:rgba(0,0,0,0.05);">${golesHtml}</div>` : ''}
                </div>
            `;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Tabla de posiciones dinámitca
    const tabla = {};
    equiposList.forEach(e => {
        tabla[e.id] = {
            id: e.id,
            nombre: e.nombre,
            logo_url: e.logo_url,
            pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0
        };
    });

    partidosFinalizados.forEach(p => {
        const idA = p.equipo_a_id;
        const idB = p.equipo_b_id;
        const eqA = equiposList.find(e => e.id === idA) || { nombre: '?', logo_url: '' };
        const eqB = equiposList.find(e => e.id === idB) || { nombre: '?', logo_url: '' };
        
        if (!tabla[idA]) tabla[idA] = { id: idA, nombre: eqA.nombre, logo_url: eqA.logo_url, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
        if (!tabla[idB]) tabla[idB] = { id: idB, nombre: eqB.nombre, logo_url: eqB.logo_url, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };

        const tA = tabla[idA];
        const tB = tabla[idB];

        tA.pj++;
        tB.pj++;
        tA.gf += p.goles_a;
        tA.gc += p.goles_b;
        tB.gf += p.goles_b;
        tB.gc += p.goles_a;

        if (p.goles_a > p.goles_b) {
            tA.pg++;
            tA.pts += 3;
            tB.pp++;
        } else if (p.goles_a < p.goles_b) {
            tB.pg++;
            tB.pts += 3;
            tA.pp++;
        } else {
            tA.pe++;
            tA.pts += 1;
            tB.pe++;
            tB.pts += 1;
        }
        tA.dg = tA.gf - tA.gc;
        tB.dg = tB.gf - tB.gc;
    });

    const tablaOrdenada = Object.values(tabla).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.dg !== a.dg) return b.dg - a.dg;
        return b.gf - a.gf;
    });

    const tbodyTabla = document.getElementById('tabla-posiciones-body');
    if (tbodyTabla) {
        tbodyTabla.innerHTML = '';
        if (tablaOrdenada.length === 0) {
            tbodyTabla.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay equipos registrados</td></tr>';
            return;
        }
        
        tablaOrdenada.forEach((row, index) => {
            const logo = row.logo_url 
                ? `<img src="${row.logo_url}" alt="${row.nombre}" style="width:20px; height:20px; object-fit:contain; vertical-align:middle; margin-right:8px; border-radius:2px;">`
                : `<div style="width:20px; height:20px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8; vertical-align:middle; margin-right:8px;"><i data-lucide="shield" style="width:10px; height:10px;"></i></div>`;
            
            tbodyTabla.innerHTML += `
                <tr>
                    <td style="text-align:center; font-weight:700;">${index + 1}</td>
                    <td>
                        <div style="display:flex; align-items:center;">
                            ${logo}
                            <strong>${escHtml(row.nombre)}</strong>
                        </div>
                    </td>
                    <td style="text-align:center;">${row.pj}</td>
                    <td style="text-align:center;">${row.pg}</td>
                    <td style="text-align:center;">${row.pe}</td>
                    <td style="text-align:center;">${row.pp}</td>
                    <td style="text-align:center;">${row.gf}</td>
                    <td style="text-align:center;">${row.gc}</td>
                    <td style="text-align:center; font-weight: 500; color:${row.dg > 0 ? '#10b981' : row.dg < 0 ? '#ef4444' : '#64748b'}">
                        ${row.dg > 0 ? '+' : ''}${row.dg}
                    </td>
                    <td style="text-align:center; font-weight:700; color:var(--primary-color);">${row.pts}</td>
                </tr>
            `;
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Goleadores
    const goleadores = {};
    for (const p of partidosFinalizados) {
        const eventos = await cargarEventosPartido(p.id);
        eventos.filter(e => e.tipo === 'gol').forEach(e => {
            const key = e.jugador_nombre + (e.jugador_ci || '');
            if (!goleadores[key]) goleadores[key] = { nombre: e.jugador_nombre, ci: e.jugador_ci, goles: 0, equipos: new Set() };
            goleadores[key].goles++;
            goleadores[key].equipos.add(e.equipo_id);
        });
    }
    const topGoleadores = Object.values(goleadores).sort((a, b) => b.goles - a.goles).slice(0, 10);

    const golesContainer = document.getElementById('goleadores-list');
    if (golesContainer) {
        golesContainer.innerHTML = '';
        if (topGoleadores.length === 0) {
            golesContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:1rem;">Aún no se registraron goles</div>';
        } else {
            topGoleadores.forEach((g, i) => {
                golesContainer.innerHTML += `
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
                        <span style="font-weight:700;min-width:24px;color:var(--primary-color);">${i + 1}.</span>
                        <span style="font-weight:600;">${escHtml(g.nombre)}</span>
                        <span style="margin-left:auto;background:var(--primary-color);color:white;padding:2px 10px;border-radius:10px;font-weight:700;font-size:13px;">${g.goles} gol${g.goles !== 1 ? 'es' : ''}</span>
                    </div>`;
            });
        }
    }

    // Tarjetas
    const tarjetasEst = {};
    for (const p of partidosFinalizados) {
        const eventos = await cargarEventosPartido(p.id);
        eventos.filter(e => e.tipo.startsWith('tarjeta_')).forEach(e => {
            const key = e.jugador_nombre + (e.jugador_ci || '');
            if (!tarjetasEst[key]) tarjetasEst[key] = { nombre: e.jugador_nombre, ci: e.jugador_ci, amarilla: 0, roja: 0 };
            if (e.tipo === 'tarjeta_amarilla') tarjetasEst[key].amarilla++;
            if (e.tipo === 'tarjeta_roja') tarjetasEst[key].roja++;
        });
    }
    const topTarjetas = Object.values(tarjetasEst).sort((a, b) => (b.roja + b.amarilla) - (a.roja + a.amarilla)).slice(0, 10);

    const tarjetasContainer = document.getElementById('tarjetas-estadisticas-list');
    if (tarjetasContainer) {
        tarjetasContainer.innerHTML = '';
        if (topTarjetas.length === 0) {
            tarjetasContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:1rem;">Aún no se registraron tarjetas</div>';
        } else {
            topTarjetas.forEach((t, i) => {
                tarjetasContainer.innerHTML += `
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
                        <span style="font-weight:700;min-width:24px;color:var(--primary-color);">${i + 1}.</span>
                        <span style="font-weight:600;">${escHtml(t.nombre)}</span>
                        <div style="margin-left:auto;display:flex;gap:8px;font-size:13px;">
                            ${t.amarilla > 0 ? `<span style="background:#fef3c7;padding:2px 8px;border-radius:6px;">🟨 ${t.amarilla}</span>` : ''}
                            ${t.roja > 0 ? `<span style="background:#fee2e2;padding:2px 8px;border-radius:6px;">🟥 ${t.roja}</span>` : ''}
                        </div>
                    </div>`;
            });
        }
    }
}

// ============================
// ADMIN: BÚSQUEDA POR CI
// ============================
async function buscarSocioAdmin() {
    const ci = limpiarCI(document.getElementById('admin-buscar-ci').value);
    if (!ci) return alert('Ingresá un CI');

    const { data: socios, error } = await supabaseClient
        .from('socios')
        .select('*')
        .eq('ci', ci)
        .limit(1);

    const socio = socios && socios[0];
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

function cargarFaltaUI() {
    const radio = document.querySelector('input[name="falta-opt"]:checked');
    if (!radio) return alert('Seleccioná un tipo de sanción');
    document.getElementById('tipo-falta').value = radio.value;
    cargarFalta();
}

function switchAdminTab(tab, btn) {
    document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById('admin-tab-' + tab).style.display = 'block';
    
    if (tab === 'equipos') cargarEquiposAdmin();
    if (tab === 'socios') cargarListadoSocios();
    if (tab === 'categorias') cargarCategoriasAdmin();
    if (tab === 'canchas') cargarCanchasAdmin();
    if (tab === 'partidos') cargarPartidosAdmin();
    if (tab === 'atletas') cargarAdminAtletas();
    if (tab === 'tarjetas') cargarConfigFaltasAdmin();
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
    inicializarTablasAuxiliares();
    showSection('programacion');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const userRole = localStorage.getItem('userRole');
    if (userRole) {
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'block';

        if (userRole === 'veedor') {
            document.getElementById('nav-veedor').style.display = 'block';
        } else if (userRole === 'caja') {
            document.getElementById('nav-caja').style.display = 'block';
        } else if (userRole === 'admin') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('nav-admin').style.display = 'block';
        }
    } else {
        document.getElementById('nav-login').style.display = 'block';
    }
});
