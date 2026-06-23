const SUPABASE_URL = 'https://mrshoeaovukolclsvypy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yc2hvZWFvdnVrb2xjbHN2eXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODAwNDAsImV4cCI6MjA5NzM1NjA0MH0.2mTVIaRy3KBRrcIHSiL6FC6SBz3f_hiicFSjTIkkThI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let categoriasConfig = [];
let canchasList = [];
let equiposList = [];

async function inicializarTablasAuxiliares() {
    try {
        const { data: cats } = await supabaseClient.from('categorias_config').select('*').order('edad_min');
        if (cats) categoriasConfig = cats;

        const { data: cnchs } = await supabaseClient.from('canchas').select('*').order('nombre');
        if (cnchs) canchasList = cnchs;

        const { data: eqs } = await supabaseClient.from('equipos').select('*').order('nombre');
        if (eqs) equiposList = eqs;

        actualizarSelectsPartidos();
        cargarFixturePublico();
    } catch (e) {
        console.error('Error al inicializar datos auxiliares:', e);
    }
}

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
    if (id === 'admin') {
        cargarListadoSocios();
        cargarEquiposAdmin();
        cargarCategoriasAdmin();
        cargarCanchasAdmin();
        cargarPartidosAdmin();
    }
    if (id === 'programacion') {
        cargarFixturePublico();
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

    // Obtener cantidad de adherentes
    const { count, error: errCount } = await supabaseClient
        .from('socios')
        .select('*', { count: 'exact', head: true })
        .eq('familia_id', socio.id)
        .neq('tipo', 'titular');

    const countAdherentes = count || 0;
    document.getElementById('insc-cupo-contador').textContent = `${countAdherentes} / 6`;

    const formAdh = document.getElementById('insc-formulario-adherente');
    const msgLleno = document.getElementById('insc-cupo-lleno-msg');

    if (countAdherentes >= 6) {
        formAdh.style.display = 'none';
        msgLleno.style.display = 'block';
    } else {
        formAdh.style.display = 'block';
        msgLleno.style.display = 'none';
        
        // Cargar equipos en el selector
        const select = document.getElementById('insc-equipo');
        select.innerHTML = '<option value="">Seleccionar equipo...</option>';
        equiposList.forEach(e => {
            select.innerHTML += `<option value="${e.id}">${escHtml(e.nombre)}</option>`;
        });
        
        // Limpiar campos
        document.getElementById('insc-atleta-nombre').value = '';
        document.getElementById('insc-atleta-ci').value = '';
        document.getElementById('insc-atleta-edad').value = '';
        document.getElementById('insc-atleta-categoria-label').textContent = 'Libre';
    }

    resultado.style.display = 'block';
}

function calcularCategoriaAutomatica(edadVal) {
    const edad = parseInt(edadVal);
    const label = document.getElementById('insc-atleta-categoria-label');
    if (isNaN(edad) || edad < 0) {
        label.textContent = '---';
        return;
    }
    const cat = categoriasConfig.find(c => edad >= c.edad_min && edad <= c.edad_max);
    label.textContent = cat ? cat.nombre : 'Sin Categoría';
}

function obtenerCategoriaParaEdad(edad) {
    const cat = categoriasConfig.find(c => edad >= c.edad_min && edad <= c.edad_max);
    return cat ? cat.nombre : 'Sin Categoría';
}

async function inscribirAtleta() {
    const resultado = document.getElementById('insc-resultado');
    const titularId = parseInt(resultado.dataset.socioId);
    
    const atletaNombre = document.getElementById('insc-atleta-nombre').value.trim();
    const atletaCi = limpiarCI(document.getElementById('insc-atleta-ci').value);
    const atletaEdad = parseInt(document.getElementById('insc-atleta-edad').value);
    const equipoId = document.getElementById('insc-equipo').value;

    if (!atletaNombre) return alert('Ingresá el nombre del atleta');
    if (!atletaCi) return alert('Ingresá la cédula del atleta');
    if (isNaN(atletaEdad) || atletaEdad < 0) return alert('Ingresá una edad válida');
    if (!equipoId) return alert('Seleccioná un equipo');

    // Calcular categoría
    const categoria = obtenerCategoriaParaEdad(atletaEdad);
    if (categoria === 'Sin Categoría') {
        return alert('La edad ingresada no coincide con ninguna categoría configurada.');
    }

    // Registrar atleta en socios
    const { data: nuevoSocio, error: errSocio } = await supabaseClient
        .from('socios')
        .insert({
            ci: atletaCi,
            nombre: atletaNombre,
            apellido: '',
            tipo: 'adherente',
            familia_id: titularId,
            edad: atletaEdad,
            categoria: categoria,
            habilitado: true
        })
        .select()
        .single();

    if (errSocio) {
        return alert('Error al registrar datos del atleta: ' + errSocio.message);
    }

    // Inscribir en atletas
    const { error: errAtleta } = await supabaseClient
        .from('atletas')
        .insert({
            socio_id: nuevoSocio.id,
            equipo_id: equipoId
        });

    if (errAtleta) {
        await supabaseClient.from('socios').delete().eq('id', nuevoSocio.id);
        if (errAtleta.code === '23505') return alert('Este atleta ya está inscripto en este equipo');
        return alert('Error al inscribir: ' + errAtleta.message);
    }

    alert('✅ Atleta inscripto correctamente');
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
        .select('nombre, apellido, tipo')
        .eq('ci', ci)
        .limit(1);

    const socio = socios && socios[0];
    if (socio && !error) {
        const nombreCompleto = `${socio.nombre} ${socio.apellido}`.trim();
        document.getElementById('nombre-encontrado').innerText = `${nombreCompleto} (${socio.tipo})`;
        document.getElementById('resultado-busqueda').style.display = 'block';
    } else {
        alert('Jugador no encontrado');
    }
}

async function cargarFalta() {
    const ci = limpiarCI(document.getElementById('veedor-ci').value);
    const tipo = document.getElementById('tipo-falta').value;
    const monto = tipo === 'roja' ? 50000 : 20000;

    const { data: socios, error: err } = await supabaseClient
        .from('socios')
        .select('nombre, apellido')
        .eq('ci', ci)
        .limit(1);

    const socio = socios && socios[0];
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
// ADMIN: EQUIPOS (MODIFICADO CON LOGOS Y ELIMINACIÓN)
// ============================
async function cargarEquiposAdmin() {
    const { data: equipos, error } = await supabaseClient.from('equipos').select('*').order('nombre');
    if (error || !equipos) return;
    
    equiposList = equipos;
    
    // Rellenar tabla en Admin
    const tbody = document.getElementById('admin-equipos-body');
    if (tbody) {
        tbody.innerHTML = '';
        equipos.forEach(e => {
            const logoImg = e.logo_url 
                ? `<img src="${e.logo_url}" alt="Logo ${escHtml(e.nombre)}" style="max-height: 40px; max-width: 80px; border-radius: 4px; object-fit: contain;">`
                : `<div style="width:40px; height:40px; background:#e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="image" style="width:18px; height:18px;"></i></div>`;
            
            tbody.innerHTML += `<tr>
                <td>${e.id}</td>
                <td>${logoImg}</td>
                <td><strong>${escHtml(e.nombre)}</strong></td>
                <td>
                    <button onclick="eliminarEquipo(${e.id})" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
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

async function eliminarEquipo(id) {
    if (!confirm('¿Estás seguro de eliminar este equipo? Se borrarán sus partidos y atletas vinculados.')) return;
    const { error } = await supabaseClient.from('equipos').delete().eq('id', id);
    if (error) return alert('Error al eliminar equipo: ' + error.message);
    await cargarEquiposAdmin();
}

// ============================
// ADMIN: CATEGORÍAS (NUEVO)
// ============================
async function cargarCategoriasAdmin() {
    const { data: categorias, error } = await supabaseClient.from('categorias_config').select('*').order('edad_min');
    if (error || !categorias) return;
    
    categoriasConfig = categorias;
    
    const tbody = document.getElementById('admin-categorias-body');
    if (tbody) {
        tbody.innerHTML = '';
        categorias.forEach(c => {
            tbody.innerHTML += `<tr>
                <td><strong>${escHtml(c.nombre)}</strong></td>
                <td>${c.edad_min} años</td>
                <td>${c.edad_max} años</td>
                <td>
                    <button onclick="eliminarCategoria(${c.id})" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
                </td>
            </tr>`;
        });
    }
}

async function agregarCategoria() {
    const nombre = document.getElementById('admin-cat-nombre').value.trim();
    const edadMin = parseInt(document.getElementById('admin-cat-min').value);
    const edadMax = parseInt(document.getElementById('admin-cat-max').value);

    if (!nombre) return alert('Ingresá el nombre de la categoría');
    if (isNaN(edadMin) || edadMin < 0) return alert('Edad mínima inválida');
    if (isNaN(edadMax) || edadMax < 0 || edadMax < edadMin) return alert('Edad máxima inválida');

    const { error } = await supabaseClient.from('categorias_config').insert({
        nombre,
        edad_min: edadMin,
        edad_max: edadMax
    });

    if (error) return alert('Error al guardar categoría: ' + error.message);
    
    document.getElementById('admin-cat-nombre').value = '';
    document.getElementById('admin-cat-min').value = '';
    document.getElementById('admin-cat-max').value = '';
    
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
                    <button onclick="eliminarCancha(${c.id})" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
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
// ADMIN: PARTIDOS (FIXTURE & MARCADORES - NUEVO)
// ============================
function actualizarSelectsPartidos() {
    const localSelect = document.getElementById('admin-partido-equipo-a');
    const visitSelect = document.getElementById('admin-partido-equipo-b');
    const canchaSelect = document.getElementById('admin-partido-cancha');
    
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
}

async function cargarPartidosAdmin() {
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select(`
            id, goles_a, goles_b, fecha_hora, finalizado,
            equipo_a:equipo_a_id (id, nombre, logo_url),
            equipo_b:equipo_b_id (id, nombre, logo_url),
            cancha:cancha_id (id, nombre)
        `)
        .order('fecha_hora', { ascending: true });

    if (error || !partidos) return;
    
    const tbody = document.getElementById('admin-partidos-body');
    if (tbody) {
        tbody.innerHTML = '';
        partidos.forEach(p => {
            const partidoStr = `${escHtml(p.equipo_a.nombre)} vs ${escHtml(p.equipo_b.nombre)}`;
            const fecha = new Date(p.fecha_hora).toLocaleString();
            
            const resultadoHTML = p.finalizado 
                ? `<strong style="font-size:16px;">${p.goles_a} - ${p.goles_b}</strong>`
                : `<div class="flex-row" style="gap:4px; justify-content:center;">
                     <input type="number" value="${p.goles_a}" id="goles-a-${p.id}" style="width:40px; padding:2px; text-align:center;">
                     <span>-</span>
                     <input type="number" value="${p.goles_b}" id="goles-b-${p.id}" style="width:40px; padding:2px; text-align:center;">
                   </div>`;
            
            const accionesHTML = p.finalizado 
                ? `<button onclick="reabrirPartido(${p.id})" class="btn-action" style="background:#3b82f6; color:white; padding:4px 8px;">Reabrir</button>`
                : `<button onclick="actualizarMarcador(${p.id}, true)" class="btn-action" style="background:#10b981; color:white; padding:4px 8px;">Finalizar</button>
                   <button onclick="actualizarMarcador(${p.id}, false)" class="btn-action" style="background:#f59e0b; color:white; padding:4px 8px;">Guardar</button>`;
            
            tbody.innerHTML += `<tr>
                <td>${fecha}</td>
                <td><strong>${partidoStr}</strong></td>
                <td style="text-align:center;">${resultadoHTML}</td>
                <td>${escHtml(p.cancha.nombre)}</td>
                <td>
                    <span class="badge" style="background:${p.finalizado ? '#d1fae5; color:#065f46;' : '#fef3c7; color:#92400e;'}">
                        ${p.finalizado ? 'Finalizado' : 'Programado'}
                    </span>
                </td>
                <td>
                    <div class="flex-row" style="gap:4px;">
                        ${accionesHTML}
                        <button onclick="eliminarPartido(${p.id})" class="btn-action" style="background:#ef4444; color:white; padding:4px 8px;">Eliminar</button>
                    </div>
                </td>
            </tr>`;
        });
    }
}

async function programarPartido() {
    const eqA = document.getElementById('admin-partido-equipo-a').value;
    const eqB = document.getElementById('admin-partido-equipo-b').value;
    const fechaHora = document.getElementById('admin-partido-fecha').value;
    const canchaId = document.getElementById('admin-partido-cancha').value;

    if (!eqA || !eqB || !fechaHora || !canchaId) {
        return alert('Por favor, completa todos los campos para programar el partido.');
    }
    if (eqA === eqB) {
        return alert('Un equipo no puede jugar contra sí mismo.');
    }

    const { error } = await supabaseClient.from('partidos').insert({
        equipo_a_id: parseInt(eqA),
        equipo_b_id: parseInt(eqB),
        fecha_hora: new Date(fechaHora).toISOString(),
        cancha_id: parseInt(canchaId),
        finalizado: false
    });

    if (error) return alert('Error al programar partido: ' + error.message);
    
    document.getElementById('admin-partido-fecha').value = '';
    await cargarPartidosAdmin();
    cargarFixturePublico();
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
    cargarFixturePublico();
}

async function reabrirPartido(id) {
    const { error } = await supabaseClient.from('partidos').update({
        finalizado: false
    }).eq('id', id);

    if (error) return alert('Error al reabrir partido: ' + error.message);
    
    await cargarPartidosAdmin();
    cargarFixturePublico();
}

async function eliminarPartido(id) {
    if (!confirm('¿Estás seguro de eliminar este partido programado?')) return;
    const { error } = await supabaseClient.from('partidos').delete().eq('id', id);
    if (error) return alert('Error al eliminar partido: ' + error.message);
    await cargarPartidosAdmin();
    cargarFixturePublico();
}

// ============================
// PROGRAMACIÓN Y FIXTURE PÚBLICO (NUEVO)
// ============================
function switchProgTab(tab, btn) {
    document.querySelectorAll('#programacion .admin-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    document.querySelectorAll('.prog-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById('prog-tab-' + tab).style.display = 'block';
    
    if (tab === 'resultados') {
        cargarEstadisticasYTabla();
    } else {
        cargarFixturePublico();
    }
}

async function cargarFixturePublico() {
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select(`
            id, goles_a, goles_b, fecha_hora, finalizado,
            equipo_a:equipo_a_id (nombre, logo_url),
            equipo_b:equipo_b_id (nombre, logo_url),
            cancha:cancha_id (nombre)
        `)
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

    // Agrupar por fecha
    const partidosPorFecha = {};
    partidos.forEach(p => {
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
            const hora = new Date(p.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            
            const logoA = p.equipo_a.logo_url 
                ? `<img src="${p.equipo_a.logo_url}" alt="${p.equipo_a.nombre}" style="width:24px; height:24px; object-fit:contain; border-radius: 2px;">`
                : `<div style="width:24px; height:24px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="shield" style="width:12px; height:12px;"></i></div>`;
                
            const logoB = p.equipo_b.logo_url 
                ? `<img src="${p.equipo_b.logo_url}" alt="${p.equipo_b.nombre}" style="width:24px; height:24px; object-fit:contain; border-radius: 2px;">`
                : `<div style="width:24px; height:24px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="shield" style="width:12px; height:12px;"></i></div>`;

            grupo.innerHTML += `
                <div class="partido-card">
                    <div class="partido-hora">
                        <i data-lucide="clock"></i><span>${hora} Hs</span>
                    </div>
                    <div class="partido-versus" style="flex:1; justify-content:center; gap:1.5rem;">
                        <div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-end;">
                            <span class="team" style="text-align:right;">${escHtml(p.equipo_a.nombre)}</span>
                            ${logoA}
                        </div>
                        <span class="vs">vs</span>
                        <div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-start;">
                            ${logoB}
                            <span class="team" style="text-align:left;">${escHtml(p.equipo_b.nombre)}</span>
                        </div>
                    </div>
                    <div class="partido-cancha">
                        <i data-lucide="map-pin"></i><span>${escHtml(p.cancha.nombre)}</span>
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
        .select(`
            id, goles_a, goles_b, fecha_hora, finalizado,
            equipo_a:equipo_a_id (id, nombre, logo_url),
            equipo_b:equipo_b_id (id, nombre, logo_url),
            cancha:cancha_id (nombre)
        `)
        .order('fecha_hora', { ascending: false });

    const listRes = document.getElementById('lista-resultados');
    if (!listRes) return;

    if (error) {
        listRes.innerHTML = `<p style="color:#ef4444;text-align:center;">Error al cargar estadísticas: ${error.message}</p>`;
        return;
    }

    const partidosFinalizados = partidos ? partidos.filter(p => p.finalizado) : [];
    
    if (partidosFinalizados.length === 0) {
        listRes.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">No hay resultados de partidos anteriores registrados aún.</div>`;
    } else {
        listRes.innerHTML = '<h3 style="font-family:\'Outfit\',sans-serif; font-size:16px; font-weight:700; color:var(--text-dark); margin-bottom:0.75rem;">Últimos Resultados</h3>';
        
        partidosFinalizados.slice(0, 5).forEach(p => {
            const fecha = new Date(p.fecha_hora).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            
            const logoA = p.equipo_a.logo_url 
                ? `<img src="${p.equipo_a.logo_url}" alt="${p.equipo_a.nombre}" style="width:24px; height:24px; object-fit:contain; border-radius:2px;">`
                : `<div style="width:24px; height:24px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="shield" style="width:12px; height:12px;"></i></div>`;
                
            const logoB = p.equipo_b.logo_url 
                ? `<img src="${p.equipo_b.logo_url}" alt="${p.equipo_b.nombre}" style="width:24px; height:24px; object-fit:contain; border-radius:2px;">`
                : `<div style="width:24px; height:24px; background:#e2e8f0; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; color:#94a3b8;"><i data-lucide="shield" style="width:12px; height:12px;"></i></div>`;

            listRes.innerHTML += `
                <div class="partido-card" style="border-left: 4px solid var(--primary-color);">
                    <div class="partido-hora">
                        <i data-lucide="calendar"></i><span>${fecha}</span>
                    </div>
                    <div class="partido-versus" style="flex:1; justify-content:center; gap:1.5rem;">
                        <div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-end;">
                            <span class="team" style="text-align:right;">${escHtml(p.equipo_a.nombre)}</span>
                            ${logoA}
                        </div>
                        <span class="vs" style="background:var(--primary-color); color:white; padding:4px 10px; border-radius:12px; font-weight:700; font-size:14px; min-width:48px; text-align:center;">
                            ${p.goles_a} - ${p.goles_b}
                        </span>
                        <div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-start;">
                            ${logoB}
                            <span class="team" style="text-align:left;">${escHtml(p.equipo_b.nombre)}</span>
                        </div>
                    </div>
                    <div class="partido-cancha">
                        <i data-lucide="map-pin"></i><span>${escHtml(p.cancha.nombre)}</span>
                    </div>
                </div>
            `;
        });
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
        const idA = p.equipo_a.id;
        const idB = p.equipo_b.id;
        
        if (!tabla[idA]) tabla[idA] = { id: idA, nombre: p.equipo_a.nombre, logo_url: p.equipo_a.logo_url, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
        if (!tabla[idB]) tabla[idB] = { id: idB, nombre: p.equipo_b.nombre, logo_url: p.equipo_b.logo_url, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };

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
    inicializarTablasAuxiliares();
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
