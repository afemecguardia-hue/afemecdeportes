const SUPABASE_URL = 'https://mrshoeaovukolclsvypy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yc2hvZWFvdnVrb2xjbHN2eXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODAwNDAsImV4cCI6MjA5NzM1NjA0MH0.2mTVIaRy3KBRrcIHSiL6FC6SBz3f_hiicFSjTIkkThI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let categoriasConfig = [];
let canchasList = [];
let equiposList = [];
let configFaltas = [];
let categoriaEquiposMap = {};
let partidoActivoId = null;
let tableroSyncInterval = null;

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
var _estadisticasInterval = null;
var _realtimeChannel = null;

function iniciarRealtimeEstadisticas() {
    if (_realtimeChannel) return;
    try {
        _realtimeChannel = supabaseClient
            .channel('estadisticas-realtime')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'partido_eventos' },
                function(payload) {
                    try {
                        if (payload.new && payload.new.tipo === 'gol') {
                            var ev = payload.new;
                            var mostrar = true;
                            var sec = document.getElementById('programacion');
                            if (sec && sec.style.display === 'none' && document.getElementById('veedor') && document.getElementById('veedor').style.display !== 'none') {
                                mostrar = false;
                            }
                            if (mostrar) {
                                (async function() {
                                    try {
                                        var partidoRes = await supabaseClient.from('partidos').select('*').eq('id', ev.partido_id).single();
                                        if (partidoRes.data) {
                                            var p = partidoRes.data;
                                            if (!equiposList || equiposList.length === 0) await asegurarDatosReferencia();
                                            var eqA = equiposList.find(function(e) { return String(e.id) === String(p.equipo_a_id); });
                                            var eqB = equiposList.find(function(e) { return String(e.id) === String(p.equipo_b_id); });
                                            var nomA = eqA ? eqA.nombre : '?';
                                            var nomB = eqB ? eqB.nombre : '?';
                                            var equipoJugador = String(ev.equipo_id) === String(p.equipo_a_id) ? nomA : nomB;
                                            var rival = String(ev.equipo_id) === String(p.equipo_a_id) ? nomB : nomA;
                                            mostrarAnimacionGol(ev.partido_id, ev.jugador_nombre, equipoJugador, rival, ev.minuto);
                                        }
                                    } catch(e) { console.warn('Goal anim error:', e); }
                                    setTimeout(function() { programarRefreshEstadisticas(); }, 3500);
                                })();
                            } else {
                                programarRefreshEstadisticas();
                            }
                        } else {
                            programarRefreshEstadisticas();
                        }
                    } catch(e) { console.warn('Goal handler error:', e); }

                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'partidos' },
                function() { programarRefreshEstadisticas(); }
            )
            .subscribe();
    } catch(e) {
        console.log('Realtime no disponible:', e);
    }
}

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
    document.querySelectorAll('.drawer-btn').forEach(btn => btn.classList.remove('active'));
    const drawerActive = document.getElementById(`drawer-${id}`);
    if (drawerActive) drawerActive.classList.add('active');

    // La suscripción Realtime se mantiene activa siempre

    if (id === 'veedor') {
        veedorCargarPartidos();
    }
    if (id === 'programacion') {
        cargarEstadisticas();
    }
    if (id === 'caja') {
        actualizarListaCobros();
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
    if (id === 'tablero') {
        cargarEquiposTablero();
        cargarPartidosEnVivoTablero();
    }
    if (id === 'programacion') {
        cargarEstadisticas();
        iniciarRealtimeEstadisticas();
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

    // Buscar en titulares
    let { data: titular } = await supabaseClient
        .from('titulares')
        .select('*')
        .eq('ci', ci)
        .maybeSingle();
    
    let socio = null;
    let tipo = 'titular';
    
    if (titular) {
        socio = titular;
    } else {
        // Buscar en cónyuges
        let { data: conyuge } = await supabaseClient
            .from('conyuges')
            .select('*')
            .eq('ci', ci)
            .maybeSingle();
        
        if (conyuge) {
            socio = conyuge;
            tipo = 'conyuge';
        } else {
            // Buscar en hijos
            let { data: hijo } = await supabaseClient
                .from('hijos')
                .select('*')
                .eq('ci', ci)
                .maybeSingle();
            
            if (hijo) {
                socio = hijo;
                tipo = 'hijo';
            }
        }
    }
    
    const resultado = document.getElementById('insc-resultado');
    if (!socio) {
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
    resultado.dataset.titularOriginalId = socio.id; // Guardar ID del titular original
    
    // Guardar datos del titular para autocompletado
    resultado.dataset.titularNombre = socio.nombre || '';
    resultado.dataset.titularApellido = socio.apellido || '';
    resultado.dataset.titularCi = socio.ci || '';
    resultado.dataset.titularFechaNac = socio.fecha_nacimiento || '';
    resultado.dataset.titularTelefono = socio.telefono || '';

    const nombreCompleto = `${socio.nombre} ${socio.apellido}`.trim();
    document.getElementById('insc-nombre').textContent = nombreCompleto;
    document.getElementById('insc-ci-label').textContent = socio.ci;
    document.getElementById('insc-estado-label').textContent = socio.habilitado ? 'Habilitado' : 'Deshabilitado';

    // Cargar cónyuges e hijos del titular para el selector
    const familiarSelector = document.getElementById('insc-familiar-selector');
    familiarSelector.innerHTML = '<option value="">-- Ingresar datos manualmente --</option>';
    
    if (tipo === 'titular') {
        // Cargar cónyuges (desde tabla conyuges)
        const { data: conyuges } = await supabaseClient
            .from('conyuges')
            .select('*')
            .eq('titular_id', socio.id);
        
        // También buscar en conyuge_relacion (para titulares que son cónyuges entre sí)
        const { data: relacionesConyuge } = await supabaseClient
            .from('conyuge_relacion')
            .select('*')
            .or(`titular1_id.eq.${socio.id},titular2_id.eq.${socio.id}`);
        
        // Obtener IDs de los cónyuges titulares
        const conyugeTitularIds = new Set();
        if (relacionesConyuge) {
            relacionesConyuge.forEach(r => {
                if (r.titular1_id === socio.id) conyugeTitularIds.add(r.titular2_id);
                if (r.titular2_id === socio.id) conyugeTitularIds.add(r.titular1_id);
            });
        }
        
        // Cargar datos de los titulares que son cónyuges
        let conyugesTitulares = [];
        if (conyugeTitularIds.size > 0) {
            const { data: titularesConyuges } = await supabaseClient
                .from('titulares')
                .select('*')
                .in('id', Array.from(conyugeTitularIds));
            conyugesTitulares = titularesConyuges || [];
        }
        
        if (conyuges && conyuges.length) {
            for (const c of conyuges) {
                const { count: atletaCount } = await supabaseClient
                    .from('atletas')
                    .select('*', { count: 'exact', head: true })
                    .eq('socio_id', c.id);
                const inscrito = (atletaCount || 0) > 0;
                const label = inscrito ? `✓ ${c.nombre} ${c.apellido} (Cónyuge - Ya inscripto)` : `${c.nombre} ${c.apellido} (Cónyuge)`;
                familiarSelector.innerHTML += `<option value="conyuge|${c.id}" data-nombre="${c.nombre}" data-apellido="${c.apellido}" data-ci="${c.ci}" data-fecha="${c.fecha_nacimiento || ''}">${escHtml(label)}</option>`;
            }
        }
        
        // Agregar cónyuges que son titulares
        if (conyugesTitulares && conyugesTitulares.length) {
            for (const c of conyugesTitulares) {
                const { count: atletaCount } = await supabaseClient
                    .from('atletas')
                    .select('*', { count: 'exact', head: true })
                    .eq('ci_atleta', c.ci);
                const inscrito = (atletaCount || 0) > 0;
                const label = inscrito ? `✓ ${c.nombre} ${c.apellido} (Cónyuge - Ya inscripto)` : `${c.nombre} ${c.apellido} (Cónyuge)`;
                familiarSelector.innerHTML += `<option value="conyuge|${c.id}" data-nombre="${c.nombre}" data-apellido="${c.apellido}" data-ci="${c.ci}" data-fecha="${c.fecha_nacimiento || ''}">${escHtml(label)}</option>`;
            }
        }
        
        // Cargar hijos
        const { data: hijosRel } = await supabaseClient
            .from('hijo_titular')
            .select('hijo_id')
            .eq('titular_id', socio.id);
        
        if (hijosRel && hijosRel.length) {
            const hijoIds = hijosRel.map(h => h.hijo_id);
            const { data: hijos } = await supabaseClient
                .from('hijos')
                .select('*')
                .in('id', hijoIds);
            
            if (hijos && hijos.length) {
                for (const h of hijos) {
                    const { count: atletaCount } = await supabaseClient
                        .from('atletas')
                        .select('*', { count: 'exact', head: true })
                        .eq('socio_id', h.id);
                    const inscrito = (atletaCount || 0) > 0;
                    const label = inscrito ? `✓ ${h.nombre} ${h.apellido} (Hijo - Ya inscripto)` : `${h.nombre} ${h.apellido} (Hijo)`;
                    familiarSelector.innerHTML += `<option value="hijo|${h.id}" data-nombre="${h.nombre}" data-apellido="${h.apellido}" data-ci="${h.ci}" data-fecha="${h.fecha_nacimiento || ''}">${escHtml(label)}</option>`;
                }
            }
        }
    }

    // Contar atletas ya registrados con este CI
    const { count: atletasCount, error: errCount } = await supabaseClient
        .from('atletas')
        .select('*', { count: 'exact', head: true })
        .eq('socio_id', socio.id);

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

function seleccionarTitularComoAtleta() {
    const checkbox = document.getElementById('insc-titular-como-atleta');
    const resultado = document.getElementById('insc-resultado');
    
    if (checkbox.checked) {
        // Autocompletar con datos del titular
        const nombre = resultado.dataset.titularNombre || '';
        const apellido = resultado.dataset.titularApellido || '';
        const ci = resultado.dataset.titularCi || '';
        const fechaNac = resultado.dataset.titularFechaNac || '';
        const telefono = resultado.dataset.titularTelefono || '';
        
        document.getElementById('insc-atleta-nombre').value = `${nombre} ${apellido}`.trim();
        document.getElementById('insc-atleta-ci').value = ci;
        document.getElementById('insc-atleta-fecha-nac').value = fechaNac;
        document.getElementById('insc-atleta-telefono').value = telefono;
        
        // Calcular edad y categoría automáticamente
        if (fechaNac) {
            calcularCategoriaAutomatica(fechaNac);
            
            // Filtrar equipos según la edad calculada
            const edad = calcularEdadDesdeFecha(fechaNac);
            if (edad >= 0) {
                filtrarEquiposPorCategoria(edad);
            }
        }
        
        // Deshabilitar selector de familiares
        document.getElementById('insc-familiar-selector').disabled = true;
        document.getElementById('insc-familiar-selector').value = '';
    } else {
        // Limpiar campos
        document.getElementById('insc-atleta-nombre').value = '';
        document.getElementById('insc-atleta-ci').value = '';
        document.getElementById('insc-atleta-fecha-nac').value = '';
        document.getElementById('insc-atleta-telefono').value = '';
        document.getElementById('insc-atleta-edad-label').textContent = '---';
        document.getElementById('insc-atleta-categoria-label').textContent = '---';
        document.getElementById('insc-categoria-info').textContent = '';
        document.getElementById('insc-categoria-checkboxes').innerHTML = '';
        restaurarTodosEquipos();
        
        // Habilitar selector de familiares
        document.getElementById('insc-familiar-selector').disabled = false;
    }
}

function seleccionarFamiliar() {
    const selector = document.getElementById('insc-familiar-selector');
    const selectedOption = selector.options[selector.selectedIndex];
    
    if (!selectedOption || !selectedOption.value) {
        // Limpiar campos si se selecciona "Ingresar datos manualmente"
        document.getElementById('insc-atleta-nombre').value = '';
        document.getElementById('insc-atleta-ci').value = '';
        document.getElementById('insc-atleta-fecha-nac').value = '';
        document.getElementById('insc-atleta-telefono').value = '';
        document.getElementById('insc-atleta-edad-label').textContent = '---';
        document.getElementById('insc-atleta-categoria-label').textContent = '---';
        document.getElementById('insc-categoria-info').textContent = '';
        document.getElementById('insc-categoria-checkboxes').innerHTML = '';
        restaurarTodosEquipos();
        
        // Restaurar socio_id al titular original
        const resultado = document.getElementById('insc-resultado');
        const titularOriginalId = resultado.dataset.titularOriginalId;
        if (titularOriginalId) {
            resultado.dataset.socioId = titularOriginalId;
        }
        return;
    }
    
    // Autocompletar campos con datos del familiar
    const nombre = selectedOption.dataset.nombre || '';
    const apellido = selectedOption.dataset.apellido || '';
    const ci = selectedOption.dataset.ci || '';
    const fechaNac = selectedOption.dataset.fecha || '';
    
    document.getElementById('insc-atleta-nombre').value = `${nombre} ${apellido}`.trim();
    document.getElementById('insc-atleta-ci').value = ci;
    document.getElementById('insc-atleta-fecha-nac').value = fechaNac;
    
    // Calcular edad y categoría automáticamente
    if (fechaNac) {
        calcularCategoriaAutomatica(fechaNac);
        
        // Filtrar equipos según la edad calculada
        const edad = calcularEdadDesdeFecha(fechaNac);
        if (edad >= 0) {
            filtrarEquiposPorCategoria(edad);
        }
    }
    
    // Actualizar socio_id al del familiar seleccionado
    const resultado = document.getElementById('insc-resultado');
    const [tipo, id] = selectedOption.value.split('|');
    resultado.dataset.socioId = id;
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
    } else if (catsMatch.length === 0) {
        infoEl.innerHTML = '<span style="color:#ef4444;">⚠️ No cumple con el rango de edad requerido para ninguna categoría</span>';
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

    const catsNombre = catsSeleccionadas.map(c => c.nombre).join(', ');

    // Verificar si el atleta ya está inscrito por CI
    const { data: atletaExistente } = await supabaseClient
        .from('atletas')
        .select('id, equipo_id, ci_atleta')
        .eq('ci_atleta', atletaCi);
    
    if (atletaExistente && atletaExistente.length > 0) {
        // Verificar si alguno está en otro equipo
        const atletaEnOtroEquipo = atletaExistente.find(a => String(a.equipo_id) !== String(equipoId));
        if (atletaEnOtroEquipo) {
            return alert(`El atleta con CI ${atletaCi} ya está inscrito en otro equipo. Un atleta solo puede inscribirse en un equipo.`);
        }
        
        // Si está en el mismo equipo, verificar si ya está inscrito en las categorías seleccionadas
        const categoriasIdsExistentes = atletaExistente.map(c => c.categoria_id);
        const categoriasYaInscriptas = catsSeleccionadas.filter(c => categoriasIdsExistentes.includes(c.id));
        
        if (categoriasYaInscriptas.length > 0) {
            const nombresCategorias = categoriasYaInscriptas.map(c => c.nombre).join(', ');
            return alert(`El atleta ya está inscrito en: ${nombresCategorias}. No se puede inscribir más de una vez en la misma categoría.`);
        }
    }

    // Determinar tipo de atleta
    let tipoAtleta = 'invitado';
    const checkboxTitular = document.getElementById('insc-titular-como-atleta');
    const familiarSelector = document.getElementById('insc-familiar-selector');
    
    if (checkboxTitular && checkboxTitular.checked) {
        tipoAtleta = 'titular';
    } else if (familiarSelector && familiarSelector.value) {
        const [tipo, id] = familiarSelector.value.split('|');
        if (tipo === 'conyuge') tipoAtleta = 'conyuge';
        else if (tipo === 'hijo') tipoAtleta = 'hijo';
    }

    // Verificar que las categorías seleccionadas estén asignadas al equipo
    for (const cat of catsSeleccionadas) {
        const { data: categoriaEquipo } = await supabaseClient
            .from('categoria_equipos')
            .select('*')
            .eq('categoria_id', cat.id)
            .eq('equipo_id', equipoId)
            .maybeSingle();
        
        if (!categoriaEquipo) {
            return alert(`La categoría "${cat.nombre}" no está asignada al equipo seleccionado. Por favor, selecciona una categoría válida para este equipo.`);
        }
    }

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

    // Inscribir en atletas para cada categoría seleccionada
    for (const cat of catsSeleccionadas) {
        const { error: errAtleta } = await supabaseClient
            .from('atletas')
            .insert({
                socio_id: titularId,
                equipo_id: equipoId,
                categoria_id: cat.id,
                nombre_atleta: atletaNombre,
                apellido_atleta: '',
                ci_atleta: atletaCi,
                fecha_nacimiento_atleta: atletaFechaNac,
                telefono_atleta: atletaTelefono,
                tipo_atleta: tipoAtleta
            });
        if (errAtleta) {
            if (errAtleta?.code === '23505') return alert(`El atleta ya está inscripto en ${cat.nombre} para este equipo`);
            return alert('Error al inscribir en ' + cat.nombre + ': ' + errAtleta.message);
        }
    }

    alert(`✅ Atleta inscripto correctamente en ${catsSeleccionadas.length} categoría(s): ${catsNombre}`);
    
    // Limpiar campos
    document.getElementById('insc-atleta-nombre').value = '';
    document.getElementById('insc-atleta-ci').value = '';
    document.getElementById('insc-atleta-fecha-nac').value = '';
    document.getElementById('insc-atleta-telefono').value = '';
    document.getElementById('insc-atleta-edad-label').textContent = '---';
    document.getElementById('insc-atleta-categoria-label').textContent = '---';
    document.getElementById('insc-categoria-info').textContent = '';
    document.getElementById('insc-categoria-checkboxes').innerHTML = '';
    document.getElementById('insc-equipo').value = '';
    
    // Limpiar checkbox del titular y habilitar selector de familiares
    const checkboxTitularLimpieza = document.getElementById('insc-titular-como-atleta');
    if (checkboxTitularLimpieza) {
        checkboxTitularLimpieza.checked = false;
        document.getElementById('insc-familiar-selector').disabled = false;
    }
    document.getElementById('insc-familiar-selector').value = '';
    
    // Actualizar contador de atletas
    const { count: atletasCount } = await supabaseClient
        .from('atletas')
        .select('*', { count: 'exact', head: true })
        .eq('socio_id', titularId);
    document.getElementById('insc-cupo-contador').textContent = `${atletasCount || 0} / 6`;
}

// ============================
// VEEDOR (búsqueda + falta)
// ============================
async function buscarJugador() {
    console.log('buscarJugador ejecutada');
    const ci = limpiarCI(document.getElementById('veedor-ci').value);
    console.log('Buscando jugador con CI:', ci);
    
    // Buscar en titulares
    let { data: titular } = await supabaseClient
        .from('titulares')
        .select('id, nombre, apellido')
        .eq('ci', ci)
        .maybeSingle();
    
    console.log('Titular encontrado:', titular);
    
    let socio = null;
    let tipo = 'titular';
    
    if (titular) {
        socio = titular;
    } else {
        // Buscar en cónyuges
        let { data: conyuge } = await supabaseClient
            .from('conyuges')
            .select('id, nombre, apellido')
            .eq('ci', ci)
            .maybeSingle();
        
        console.log('Cónyuge encontrado:', conyuge);
        
        if (conyuge) {
            socio = conyuge;
            tipo = 'conyuge';
        } else {
            // Buscar en hijos
            let { data: hijo } = await supabaseClient
                .from('hijos')
                .select('id, nombre, apellido')
                .eq('ci', ci)
                .maybeSingle();
            
            console.log('Hijo encontrado:', hijo);
            
            if (hijo) {
                socio = hijo;
                tipo = 'hijo';
            }
        }
    }
    
    console.log('Socio final:', socio, 'Tipo:', tipo);
    
    if (!socio) {
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
    document.getElementById('nombre-encontrado').innerText = `${nombreCompleto} (${tipo})`;
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

    // Buscar en titulares
    let { data: titular } = await supabaseClient
        .from('titulares')
        .select('id, nombre, apellido')
        .eq('ci', ci)
        .maybeSingle();
    
    let socio = null;
    
    if (titular) {
        socio = titular;
    } else {
        // Buscar en cónyuges
        let { data: conyuge } = await supabaseClient
            .from('conyuges')
            .select('id, nombre, apellido')
            .eq('ci', ci)
            .maybeSingle();
        
        if (conyuge) {
            socio = conyuge;
        } else {
            // Buscar en hijos
            let { data: hijo } = await supabaseClient
                .from('hijos')
                .select('id, nombre, apellido')
                .eq('ci', ci)
                .maybeSingle();
            
            if (hijo) {
                socio = hijo;
            }
        }
    }
    
    if (!socio) return alert('Jugador no encontrado');

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

    const { data: titulares, error } = await supabaseClient
        .from('titulares')
        .select('*')
        .order('apellido');

    if (error) return alert('Error: ' + error.message);

    tbody.innerHTML = '';
    titulares.forEach(s => {
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
    const { error } = await supabaseClient.from('titulares').update({ habilitado }).eq('id', id);
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
        // Validar tamaño (máximo 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return alert('El logo es muy pesado. El tamaño máximo permitido es 5 MB.');
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
        if (file.size > 5 * 1024 * 1024) return alert('El logo es muy pesado. Máximo 5 MB.');
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

    // Totals de adherentes (cónyuges e hijos)
    const { count: conyugesCount } = await supabaseClient.from('conyuges').select('*', { count: 'exact', head: true });
    const { count: hijosCount } = await supabaseClient.from('hijos').select('*', { count: 'exact', head: true });
    const adhCount = (conyugesCount || 0) + (hijosCount || 0);
    const elAdh = document.getElementById('admin-total-adherentes');
    if (elAdh) elAdh.textContent = adhCount || 0;
    
    // Breakdown de adherentes
    const elAdhConyuges = document.getElementById('admin-adherentes-conyuges');
    if (elAdhConyuges) elAdhConyuges.textContent = conyugesCount || 0;
    const elAdhHijos = document.getElementById('admin-adherentes-hijos');
    if (elAdhHijos) elAdhHijos.textContent = hijosCount || 0;

    // Totals de atletas inscriptos (contar por CI único, no por filas)
    const { data: atletas } = await supabaseClient.from('atletas').select('ci_atleta, tipo_atleta');
    
    // Usar Set para contar CI únicos
    const ciUnicos = new Set();
    atletas?.forEach(a => ciUnicos.add(a.ci_atleta));
    const atlCount = ciUnicos.size || 0;
    
    const elAtl = document.getElementById('admin-total-atletas');
    if (elAtl) elAtl.textContent = atlCount || 0;
    
    // Breakdown de atletas por tipo usando campo tipo_atleta (contar por CI único)
    const ciPorTipo = {
        titular: new Set(),
        conyuge: new Set(),
        hijo: new Set(),
        invitado: new Set()
    };
    
    if (atletas && atletas.length > 0) {
        atletas.forEach(a => {
            if (a.tipo_atleta === 'titular') ciPorTipo.titular.add(a.ci_atleta);
            else if (a.tipo_atleta === 'conyuge') ciPorTipo.conyuge.add(a.ci_atleta);
            else if (a.tipo_atleta === 'hijo') ciPorTipo.hijo.add(a.ci_atleta);
            else ciPorTipo.invitado.add(a.ci_atleta); // 'invitado' o null
        });
    }
    
    const atletasTitular = ciPorTipo.titular.size;
    const atletasInvitados = ciPorTipo.invitado.size;
    const atletasConyuges = ciPorTipo.conyuge.size;
    const atletasHijos = ciPorTipo.hijo.size;
    
    const elAtlTitular = document.getElementById('admin-atletas-titular');
    if (elAtlTitular) elAtlTitular.textContent = atletasTitular;
    const elAtlInvitados = document.getElementById('admin-atletas-externos');
    if (elAtlInvitados) elAtlInvitados.textContent = atletasInvitados;
    const elAtlConyuges = document.getElementById('admin-atletas-conyuges');
    if (elAtlConyuges) elAtlConyuges.textContent = atletasConyuges;
    const elAtlHijos = document.getElementById('admin-atletas-hijos');
    if (elAtlHijos) elAtlHijos.textContent = atletasHijos;

    // Categorías → equipos → contadores
    const container = document.getElementById('atletas-categorias-container');
    container.innerHTML = '<p style="color:var(--text-muted);">Cargando...</p>';

    const { data: atletasDetalle } = await supabaseClient.from('atletas').select('id, equipo_id, categoria_id, socio_id, ci_atleta, tipo_atleta');

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
            const count = (atletasDetalle || []).filter(a => String(a.equipo_id) === String(eq.id) && a.categoria_id === cat.id).length;
            const max = cat.jugadores_por_equipo || 0;
            const pct = max > 0 ? Math.round((count / max) * 100) : 0;
            const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
            const logoHtml = eq.logo_url ? `<img src="${escHtml(eq.logo_url)}" alt="${escHtml(eq.nombre)}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;margin-right:0.5rem;background:rgba(255,255,255,0.2);padding:2px;">` : '';
            html += `<div class="kpi-card" style="flex:1;min-width:150px;padding:0.7rem 1rem;background:${color};cursor:pointer;" onclick="mostrarAtletasEquipo('${eq.id}',${cat.id},'${escHtml(eq.nombre)}','${escHtml(cat.nombre)}')">
                <div class="kpi-details" style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;">
                        ${logoHtml}
                        <span class="kpi-label">${escHtml(eq.nombre)}</span>
                    </div>
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
            id, created_at, categoria_id, socio_id,
            nombre_atleta, apellido_atleta, ci_atleta, fecha_nacimiento_atleta,
            equipo:equipo_id (id, nombre)
        `)
        .eq('equipo_id', equipoId)
        .eq('categoria_id', catId)
        .order('created_at', { ascending: false });

    if (error || !atletas) {
        tbody.innerHTML = '<tr><td colspan="7">Error al cargar</td></tr>';
        return;
    }

    // Cargar partidos jugados
    const partidosCount = {};
    if (atletas.length > 0) {
        const socioIds = atletas.map(a => a.socio_id).filter(Boolean);
        if (socioIds.length > 0) {
            const { data: eventos } = await supabaseClient
                .from('partido_eventos')
                .select('socio_id, partido_id')
                .in('socio_id', socioIds);
            if (eventos) {
                eventos.forEach(ev => {
                    partidosCount[ev.socio_id] = (partidosCount[ev.socio_id] || 0) + 1;
                });
            }
        }
    }

    // Obtener datos del titular para mostrar
    const titularMap = {};
    const titularIds = atletas.map(a => a.socio_id).filter(Boolean);
    if (titularIds.length > 0) {
        const { data: titularesData } = await supabaseClient
            .from('titulares')
            .select('id, ci, nombre, apellido')
            .in('id', titularIds);
        if (titularesData) {
            titularesData.forEach(t => {
                titularMap[t.id] = `${t.nombre} ${t.apellido} (${t.ci})`;
            });
        }
    }

    tbody.innerHTML = '';
    atletas.forEach(a => {
        const pj = partidosCount[a.socio_id] || 0;
        const ci = a.ci_atleta || '—';
        const nombre = a.nombre_atleta || '—';
        const apellido = a.apellido_atleta || '';
        const edad = a.fecha_nacimiento_atleta ? calcularEdadDesdeFecha(a.fecha_nacimiento_atleta) : '—';
        const titular = titularMap[a.socio_id] || '—';
        tbody.innerHTML += `<tr>
            <td>${escHtml(ci)}</td>
            <td><strong>${escHtml(nombre)} ${escHtml(apellido)}</strong></td>
            <td>${edad}</td>
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
    let tiempoFinal = Math.max(0, Number(p.tiempo_jugado) || 0);
    if (p.en_curso && p.inicio_periodo) {
        const inicio = new Date(p.inicio_periodo).getTime();
        if (!isNaN(inicio) && inicio > 0) {
            tiempoFinal += Math.max(0, Math.floor((Date.now() - inicio) / 1000));
        }
    }

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
    var viejoVeedorId = _veedorPartidoActual ? _veedorPartidoActual.id : null;
    _veedorPartidoActual = { id: partidoId, eqAId, eqBId, nomA, nomB, catId };

    document.getElementById('veedor-nom-equipo-a').textContent = nomA;
    document.getElementById('veedor-nom-equipo-b').textContent = nomB;
    var nomAEl = document.getElementById('veedor-nombre-a');
    var nomBEl = document.getElementById('veedor-nombre-b');
    if (nomAEl) nomAEl.textContent = nomA;
    if (nomBEl) nomBEl.textContent = nomB;
    // Logos en el marcador Veedor
    if (!equiposList || equiposList.length === 0) await asegurarDatosReferencia();
    var eqAData = equiposList.find(function(e) { return String(e.id) === String(eqAId); });
    var eqBData = equiposList.find(function(e) { return String(e.id) === String(eqBId); });
    var logoAEl = document.getElementById('veedor-logo-a');
    var logoBEl = document.getElementById('veedor-logo-b');
    if (logoAEl && eqAData && eqAData.logo_url) { logoAEl.src = eqAData.logo_url; logoAEl.style.display = 'inline'; }
    if (logoBEl && eqBData && eqBData.logo_url) { logoBEl.src = eqBData.logo_url; logoBEl.style.display = 'inline'; }
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
    if (viejoVeedorId && String(viejoVeedorId) !== String(partidoId)) {
        detenerTimerPartido(viejoVeedorId);
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
    await cargarEstadisticas();
    // Sincronizar con tablero si está activo el mismo partido
    if (partidoActivoId && String(partidoActivoId) === String(pid)) {
        tableroIsRunning = true;
        // El polling se encargará de sincronizar el tiempo
    }
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
    // Sincronizar con tablero si está activo el mismo partido
    if (partidoActivoId && String(partidoActivoId) === String(_veedorPartidoActual.id)) {
        tableroIsRunning = false;
        if (tableroTimerInterval) {
            clearInterval(tableroTimerInterval);
            tableroTimerInterval = null;
        }
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

var _ultimoMinutoPartido = {};

function obtenerMinutoActual(partidoId) {
    var tick = _timerTicks[partidoId];
    if (tick && tick.data) {
        var t;
        if (tick.data.en_curso && tick.inicioLocal) {
            t = tick.tiempoJugadoLocal + Math.max(0, Math.floor((Date.now() - tick.inicioLocal) / 1000));
        } else {
            t = obtenerTiempoActual(tick.data);
        }
        var min = Math.floor(Math.max(0, t) / 60);
        _ultimoMinutoPartido[partidoId] = min;
        return min;
    }
    if (_ultimoMinutoPartido[partidoId] !== undefined) return _ultimoMinutoPartido[partidoId];
    var input = document.getElementById('veedor-evento-minuto');
    return input ? (parseInt(input.value) || 0) : 0;
}

async function veedorRegistrarEvento(partidoId, equipoId, nombre, ci, tipo) {
    const minuto = obtenerMinutoActual(partidoId);

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
    
    // Show goal celebration - NO await after this (instant)
    if (tipo === 'gol') {
        try {
            var pRes = await supabaseClient.from('partidos').select('*').eq('id', partidoId).single();
            if (pRes.data) {
                if (!equiposList || equiposList.length === 0) await asegurarDatosReferencia();
                var eqA = equiposList.find(function(e) { return String(e.id) === String(pRes.data.equipo_a_id); });
                var eqB = equiposList.find(function(e) { return String(e.id) === String(pRes.data.equipo_b_id); });
                var eqNom = String(equipoId) === String(pRes.data.equipo_a_id) ? (eqA ? eqA.nombre : '?') : (eqB ? eqB.nombre : '?');
                var rivalNom = String(equipoId) === String(pRes.data.equipo_a_id) ? (eqB ? eqB.nombre : '?') : (eqA ? eqA.nombre : '?');
                mostrarAnimacionGol(partidoId, nombre, eqNom, rivalNom, minuto);
            }
        } catch(e) {}
    }
    
    // Refresh both teams and events - these can run in background
    veedorCargarEquipos().catch(e => {});
    cargarEstadisticas().catch(e => {});
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
    const minuto = obtenerMinutoActual(partidoId);
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

function formatearTiempo(seg, cs) {
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    var base = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    if (cs !== undefined) base += '.' + String(cs).padStart(2,'0');
    return base;
}

function obtenerPeriodoLabel(p, t) {
    const map = { 'primer_tiempo': '1T', 'segundo_tiempo': '2T', 'entretiempo': 'ENTRET' };
    const l = map[p.periodo] || '1T';
    if (t === undefined) t = obtenerTiempoActual(p);
    const limite = p.periodo === 'primer_tiempo' ? 2700 : 5400;
    if (t > limite) return l + '+';
    return l;
}

function obtenerTiempoActual(p) {
    if (!p) return 0;
    let t = Number(p.tiempo_jugado) || 0;
    if (p.en_curso && p.inicio_periodo) {
        const ahora = Date.now();
        const inicio = new Date(p.inicio_periodo).getTime();
        if (!isNaN(inicio) && inicio > 0) {
            t += Math.max(0, Math.floor((ahora - inicio) / 1000));
        }
    }
    return isNaN(t) ? 0 : Math.max(0, t);
}

function obtenerTiempoDisplay(p) {
    return Math.max(0, obtenerTiempoActual(p));
}

function obtenerTiempoAdicional(p, t) {
    if (t === undefined) t = obtenerTiempoActual(p);
    const limite = p.periodo === 'primer_tiempo' ? 2700 : 5400;
    return Math.max(0, t - limite);
}

function arrancarTimerPartido(pid) {
    if (_timerTicks[pid]) return;
    _timerTicks[pid] = { data: null, inicioLocal: null, tiempoJugadoLocal: 0 };

    // Esperar un poco y cargar datos iniciales
    setTimeout(function() {
        (async function() {
            try {
                var res = await supabaseClient.from('partidos').select('*').eq('id', pid).single();
                var d = res.data;
                if (!d || d.finalizado || !d.en_curso) {
                    detenerTimerPartido(pid);
                    return;
                }
                _timerTicks[pid].data = d;
                _timerTicks[pid].inicioLocal = Date.now();
                _timerTicks[pid].tiempoJugadoLocal = obtenerTiempoActual(d);
            } catch(e) {
                detenerTimerPartido(pid);
            }
        })();
    }, 300);

    _timerTicks[pid].interval = setInterval(function() {
        try {
            var tick = _timerTicks[pid];
            if (!tick || !tick.data) return;
            var p = tick.data;

            var elapsedMs = Math.max(0, Date.now() - (tick.inicioLocal || Date.now()));
            var tiempoBase = Math.max(0, Number(tick.tiempoJugadoLocal) || 0);
            var totalMs = tiempoBase * 1000 + elapsedMs;
            var t = Math.floor(totalMs / 1000);
            var cs = Math.floor((totalMs % 1000) / 10);
            // Si el tiempo decreció, ignoramos este tick
            if (t < (tick._ultimoT || 0)) return;
            tick._ultimoT = t;
            // Re-sincronizar cada 30s con Supabase
            var transcurrido = Math.floor(elapsedMs / 1000);
            if (transcurrido > 0 && transcurrido % 30 === 0 && tick._syncing !== true) {
                tick._syncing = true;
                supabaseClient.from('partidos').select('*').eq('id', pid).single().then(function(res2) {
                    if (res2.data && !res2.data.finalizado && res2.data.en_curso) {
                        tick.data = res2.data;
                        tick.inicioLocal = Date.now();
                        tick.tiempoJugadoLocal = obtenerTiempoActual(res2.data);
                    }
                    tick._syncing = false;
                }).catch(function(){ tick._syncing = false; });
            }

            var extraTarget = _extraTargets[pid];
            var debePausar = extraTarget ? t >= extraTarget : false;
            if (debePausar) {
                supabaseClient.from('partidos').update({ en_curso: false, tiempo_jugado: t, inicio_periodo: null }).eq('id', pid).then(function() {
                    if (p.periodo === 'primer_tiempo') {
                        supabaseClient.from('partidos').update({ periodo: 'entretiempo' }).eq('id', pid).then(function() {});
                    }
                });
                delete _extraTargets[pid];
                detenerTimerPartido(pid);
                var fb = _veedorPartidoActual && _veedorPartidoActual.id == pid ? document.getElementById('veedor-btn-finalizar') : null;
                if (fb) fb.style.display = p.periodo === 'segundo_tiempo' ? 'inline-block' : 'none';
                var ib = _veedorPartidoActual && _veedorPartidoActual.id == pid ? document.getElementById('veedor-btn-iniciar') : null;
                if (ib) ib.style.display = 'inline-block';
                var pb = _veedorPartidoActual && _veedorPartidoActual.id == pid ? document.getElementById('veedor-btn-pausar') : null;
                if (pb) pb.style.display = 'none';
                return;
            }

            actualizarDisplayTimer(pid, t, p, cs);
            if (_veedorPartidoActual && _veedorPartidoActual.id == pid && p.periodo === 'segundo_tiempo' && p.en_curso) {
                var fb2 = document.getElementById('veedor-btn-finalizar');
                if (fb2) fb2.style.display = 'inline-block';
            }
        } catch(e) {}
    }, 50);

    // Refrescar eventos cada 5s
    _timerTicks[pid].refresh = setInterval(function() {
        try {
            if (typeof veedorRecargarEventos === 'function') veedorRecargarEventos();
        } catch(e) {}
    }, 5000);
}

function detenerTimerPartido(pid) {
    const tick = _timerTicks[pid];
    if (!tick) return;
    clearInterval(tick.interval);
    if (tick.refresh) clearInterval(tick.refresh);
    delete _timerTicks[pid];
}

function actualizarDisplayTimer(pid, seg, partido, cs) {
    const label = obtenerPeriodoLabel(partido, seg) || '1T';
    const timeStr = formatearTiempo(seg, cs);
    const timerSpan = document.getElementById('timer-' + pid);
    if (timerSpan) timerSpan.textContent = timeStr;
    const periodSpan = document.getElementById('period-' + pid);
    if (periodSpan) periodSpan.textContent = label;
    // Solo actualizar display del veedor si es el partido actual seleccionado
    if (_veedorPartidoActual && String(_veedorPartidoActual.id) === String(pid)) {
        const veedorTimer = document.getElementById('veedor-timer-display');
        const veedorPeriod = document.getElementById('veedor-period-display');
        if (veedorTimer) veedorTimer.textContent = timeStr;
        if (veedorPeriod) veedorPeriod.textContent = label;
    }
    var extra = obtenerTiempoAdicional(partido, seg);
    var extraSpan = document.getElementById('extra-' + pid);
    if (extraSpan) {
        if (extra > 0) { extraSpan.textContent = '+' + formatearTiempo(extra); extraSpan.style.display = 'inline'; }
        else { extraSpan.style.display = 'none'; }
    }
    // Solo actualizar display extra del veedor si es el partido actual seleccionado
    if (_veedorPartidoActual && String(_veedorPartidoActual.id) === String(pid)) {
        var veedorExtra = document.getElementById('veedor-extra-display');
        if (veedorExtra) {
            if (extra > 0) { veedorExtra.textContent = '+' + formatearTiempo(extra); veedorExtra.style.display = 'inline'; }
            else { veedorExtra.style.display = 'none'; }
        }
    }
}

var _fallbackTimerData = null;
// Sincronizar datos del Veedor con DB cada 5s
setInterval(async function() {
    var pid = _veedorPartidoActual ? _veedorPartidoActual.id : null;
    if (!pid) return;
    try {
        var res = await supabaseClient.from('partidos').select('*').eq('id', pid).single();
        if (res.data) _fallbackTimerData = res.data;
    } catch(e) {}
}, 5000);

// Auto-actualizar minuto del input del Veedor cada 1s
setInterval(function() {
    var minInput = document.getElementById('veedor-evento-minuto');
    if (!minInput || !_veedorPartidoActual) return;
    var pidV = _veedorPartidoActual.id;
    var mins = _ultimoMinutoPartido[pidV];
    if (mins === undefined) {
        var tickV = _timerTicks[pidV];
        if (tickV && tickV.data && tickV.data.en_curso) {
            var elapsedMs = Date.now() - tickV.inicioLocal;
            var totalMs = tickV.tiempoJugadoLocal * 1000 + elapsedMs;
            mins = Math.floor(Math.max(0, totalMs / 1000) / 60);
        }
    }
    if (mins !== undefined && parseInt(minInput.value) !== mins) minInput.value = mins;
}, 1000);

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
    var ahora = Date.now();
    var inicio = partido.inicio_periodo ? new Date(partido.inicio_periodo).getTime() : ahora;
    var transcurrido = (!isNaN(inicio) && inicio > 1000000) ? Math.max(0, Math.floor((ahora - inicio) / 1000)) : 0;
    var nuevoTiempo = Math.max(0, (Number(partido.tiempo_jugado) || 0) + transcurrido);
    const { error } = await supabaseClient.from('partidos').update({
        en_curso: false,
        tiempo_jugado: nuevoTiempo,
        inicio_periodo: null
    }).eq('id', id);
    if (error) return alert('Error al pausar: ' + error.message);
    _ultimoMinutoPartido[id] = Math.floor(Math.max(0, nuevoTiempo) / 60);
    // Actualizar fallback inmediatamente para que ningún timer residual siga corriendo
    if (_fallbackTimerData && String(_fallbackTimerData.id) === String(id)) {
        _fallbackTimerData.en_curso = false;
        _fallbackTimerData.tiempo_jugado = nuevoTiempo;
        _fallbackTimerData.inicio_periodo = null;
    }
    detenerTimerPartido(id);
    await cargarPartidosAdmin();
    await cargarEstadisticas();
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
    delete _ultimoMinutoPartido[id];
    arrancarTimerPartido(id);
    await cargarPartidosAdmin();
    await cargarEstadisticas();
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
var _debounceRefresh = null;
function programarRefreshEstadisticas() {
    if (_debounceRefresh) clearTimeout(_debounceRefresh);
    _debounceRefresh = setTimeout(function() {
        _debounceRefresh = null;
        var sec = document.getElementById('programacion');
        if (sec && sec.style.display !== 'none') {
            cargarEstadisticas();
        }
    }, 300);
}

function mostrarAnimacionGol(partidoId, jugador, equipo, rival, minuto) {
    // Buscar el marcador (goal-anchor) dentro del Veedor o la tarjeta En Vivo
    var target = null;
    if (_veedorPartidoActual && String(_veedorPartidoActual.id) === String(partidoId)) {
        var bar = document.getElementById('veedor-timer-bar');
        if (bar) {
            var anchor = bar.querySelector('.goal-anchor');
            target = anchor || bar;
        }
    }
    if (!target) {
        var cards = document.querySelectorAll('#est-en-vivo-list [data-pid]');
        for (var i = 0; i < cards.length; i++) {
            if (String(cards[i].getAttribute('data-pid')) === String(partidoId)) {
                var anchor = cards[i].querySelector('.goal-anchor');
                target = anchor || cards[i];
                break;
            }
        }
    }
    if (!target) return;

    // Limpiar animación previa en este marcador
    var old = target.querySelector('.goal-badge-fifa');
    if (old && old.parentNode) old.removeChild(old);

    var badge = document.createElement('div');
    badge.className = 'goal-badge-fifa';
    badge.textContent = '¡GOOOL!';
    badge.style.cssText = 'position:absolute;z-index:100;top:50%;left:50%;transform:translate(-50%,-50%);font-weight:900;color:#10b981;text-shadow:0 0 30px rgba(16,185,129,0.9);white-space:nowrap;pointer-events:none;line-height:1;';

    // Tamaño relativo al marcador: usar la altura del target
    var h = target.offsetHeight || 40;
    var fs = Math.max(14, Math.round(h * 0.6));
    badge.style.fontSize = fs + 'px';

    target.style.position = 'relative';
    target.style.overflow = 'visible';
    target.appendChild(badge);

    // Animación con requestAnimationFrame: 3s, sale a la izquierda
    var start = performance.now();
    var w = target.offsetWidth || 200;
    function anim(t) {
        var e = (t - start) / 1000;
        if (e > 3) {
            if (badge.parentNode) badge.parentNode.removeChild(badge);
            return;
        }
        if (e < 0.35) {
            var p = e / 0.35;
            var s = 0.3 + 0.7 * (1 - Math.pow(1 - p, 3));
            badge.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
            badge.style.opacity = '1';
        } else if (e < 2.5) {
            var pu = 1 + 0.05 * Math.sin((e - 0.35) * 7);
            badge.style.transform = 'translate(-50%,-50%) scale(' + pu + ')';
            badge.style.opacity = '1';
        } else {
            var p2 = (e - 2.5) / 0.5;
            badge.style.transform = 'translate(calc(-50% - ' + (p2 * w * 1.5) + 'px),-50%) scale(0.9)';
            badge.style.opacity = '' + (1 - p2);
        }
        requestAnimationFrame(anim);
    }
    requestAnimationFrame(anim);
}

// ============================
// PUBLICIDAD Y REDES SOCIALES
// ============================
async function cargarPublicidadAdmin() {
    var msg = document.getElementById('pub-msg');
    try {
        var { data, error } = await supabaseClient.from('config_publicidad').select('*').eq('id', 1).single();
        if (error || !data) { if (msg) msg.textContent = 'Error al cargar: ' + (error ? error.message : 'sin datos'); return; }
    } catch(e) { if (msg) msg.textContent = 'Error de conexión: ' + e.message; return; }
    document.getElementById('pub-facebook').value = data.facebook_url || '';
    document.getElementById('pub-instagram').value = data.instagram_url || '';
    document.getElementById('pub-youtube').value = data.youtube_url || '';
    document.getElementById('pub-web').value = data.web_url || '';
    document.getElementById('pub-link-izq').value = data.ad_izquierda_link || '';
    document.getElementById('pub-link-der').value = data.ad_derecha_link || '';
    if (msg) msg.textContent = 'Datos cargados correctamente.';
    window._pubData = data;
}

async function guardarPublicidadAdmin() {
    var msg = document.getElementById('pub-msg');
    var payload = {
        facebook_url: document.getElementById('pub-facebook').value.trim(),
        instagram_url: document.getElementById('pub-instagram').value.trim(),
        youtube_url: document.getElementById('pub-youtube').value.trim(),
        web_url: document.getElementById('pub-web').value.trim(),
        ad_izquierda_link: document.getElementById('pub-link-izq').value.trim(),
        ad_derecha_link: document.getElementById('pub-link-der').value.trim()
    };
    var imgIzq = document.getElementById('pub-img-izq').files[0];
    var imgDer = document.getElementById('pub-img-der').files[0];
    if (imgIzq) {
        if (imgIzq.size > 500 * 1024) return alert('Imagen izquierda muy pesada (máx. 500KB)');
        payload.ad_izquierda_img = await new Promise(function(resolve) {
            var r = new FileReader();
            r.onload = function(e) { resolve(e.target.result); };
            r.readAsDataURL(imgIzq);
        });
    }
    if (imgDer) {
        if (imgDer.size > 500 * 1024) return alert('Imagen derecha muy pesada (máx. 500KB)');
        payload.ad_derecha_img = await new Promise(function(resolve) {
            var r = new FileReader();
            r.onload = function(e) { resolve(e.target.result); };
            r.readAsDataURL(imgDer);
        });
    }
    var { error } = await supabaseClient.from('config_publicidad').upsert({ id: 1, ...payload });
    if (error) {
        if (msg) msg.textContent = 'Error al guardar: ' + error.message;
    } else {
        if (msg) msg.textContent = '✅ Publicidad guardada correctamente.';
        await cargarPublicidadAdmin();
    }
}

async function cargarRedesSociales() {
    var container = document.getElementById('footer-social');
    if (!container) return;
    try {
        var { data } = await supabaseClient.from('config_publicidad').select('*').eq('id', 1).single();
        if (!data) return;
    } catch(e) { return; }
    var redes = [
        { key: 'facebook_url', label: 'Facebook', color: '#1877F2',
          svg: '<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
        { key: 'instagram_url', label: 'Instagram', color: '#E4405F',
          svg: '<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' },
        { key: 'youtube_url', label: 'YouTube', color: '#FF0000',
          svg: '<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
        { key: 'web_url', label: 'Sitio Web', color: '#64748B',
          svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="26" height="26"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' }
    ];
    var html = '';
    var alguna = false;
    redes.forEach(function(r) {
        if (data[r.key]) {
            alguna = true;
            var c = r.color;
            html += '<a href="' + escHtml(data[r.key]) + '" target="_blank" rel="noopener" title="' + r.label + '" style="background:' + c + ';color:white;">';
            html += r.svg;
            html += '<span>' + r.label + '</span>';
            html += '</a>';
        }
    });
    container.innerHTML = html;
    container.style.display = alguna ? 'flex' : 'none';
}

async function cargarAdsLaterales() {
    var leftCol = document.getElementById('est-ad-left');
    var rightCol = document.getElementById('est-ad-right');
    if (!leftCol || !rightCol) return;
    try {
        var { data } = await supabaseClient.from('config_publicidad').select('*').eq('id', 1).single();
        if (!data) return;
    } catch(e) { return; }
    if (data.ad_izquierda_img && data.ad_izquierda_link) {
        leftCol.innerHTML = '<a href="' + escHtml(data.ad_izquierda_link) + '" target="_blank" rel="noopener"><img src="' + escHtml(data.ad_izquierda_img) + '" alt="Publicidad" style="width:250px;height:auto;max-height:600px;object-fit:contain;animation:adPulse 3s ease-in-out infinite;"></a>';
        leftCol.style.display = 'flex';
    } else {
        leftCol.style.display = 'none';
    }
    if (data.ad_derecha_img && data.ad_derecha_link) {
        rightCol.innerHTML = '<a href="' + escHtml(data.ad_derecha_link) + '" target="_blank" rel="noopener"><img src="' + escHtml(data.ad_derecha_img) + '" alt="Publicidad" style="width:250px;height:auto;max-height:600px;object-fit:contain;animation:adPulse 3s ease-in-out infinite;"></a>';
        rightCol.style.display = 'flex';
    } else {
        rightCol.style.display = 'none';
    }
}

async function cargarEstadisticas() {
    try {
        cargarRedesSociales();
        cargarAdsLaterales();
        await cargarFixturePublico();
        await cargarEventosEnVivo();
        await cargarEstadisticasYTabla();
    } catch(e) {
        console.error('Error en cargarEstadisticas:', e);
        var errDiv = document.createElement('div');
        errDiv.style.cssText = 'background:rgba(239,68,68,0.15);color:#fca5a5;padding:12px;border-radius:8px;margin:10px 0;font-size:13px;';
        errDiv.textContent = 'Error: ' + (e.message || e) + '. Revisá la consola (F12) para más detalles.';
        var listRes = document.getElementById('lista-resultados');
        if (listRes) {
            listRes.innerHTML = '';
            listRes.appendChild(errDiv);
        }
    }
}

async function cargarEventosEnVivo() {
    var todosPartidos;
    try {
        var res = await supabaseClient.from('partidos').select('*').eq('finalizado', false).order('fecha_hora', { ascending: false });
        todosPartidos = res.data;
        if (res.error) todosPartidos = null;
    } catch(e) { todosPartidos = null; }

    var container = document.getElementById('est-en-vivo-list');
    if (!container) return;
    var enVivoSection = document.getElementById('est-en-vivo-section');
    if (!enVivoSection) return;

    if (!todosPartidos || todosPartidos.length === 0) {
        enVivoSection.style.display = 'none';
        return;
    }

    await asegurarDatosReferencia();

    var enVivoData = [];
    for (var pi = 0; pi < todosPartidos.length; pi++) {
        var p = todosPartidos[pi];
        if (p.en_curso || (p.tiempo_jugado || 0) > 0 || p.periodo === 'entretiempo') {
            var eventosArr = await cargarEventosPartido(p.id);
            enVivoData.push({ partido: p, eventos: eventosArr || [] });
        }
    }

    if (enVivoData.length === 0) {
        enVivoSection.style.display = 'none';
        return;
    }
    enVivoSection.style.display = 'block';

    // Asegurar que los timers de partidos en vivo estén corriendo
    for (var eipi = 0; eipi < enVivoData.length; eipi++) {
        var evp = enVivoData[eipi].partido;
        if (evp.en_curso && !_timerTicks[evp.id]) {
            arrancarTimerPartido(evp.id);
        }
    }

    var evHtml = '';
    for (var ei = 0; ei < enVivoData.length; ei++) {
        var item = enVivoData[ei];
        var p = item.partido;
        var eventos = item.eventos;

        var eqA = equiposList.find(function(e) { return e.id === p.equipo_a_id; }) || { nombre: '?' };
        var eqB = equiposList.find(function(e) { return e.id === p.equipo_b_id; }) || { nombre: '?' };
        var cancha = canchasList.find(function(c) { return c.id === p.cancha_id; }) || { nombre: '—' };

        var golesA = 0;
        var golesB = 0;
        var timelineHtml = '';
        var sortedEvents = [];
        for (var vi = 0; vi < eventos.length; vi++) {
            var ev = eventos[vi];
            if (ev.tipo === 'gol') {
                if (String(ev.equipo_id) === String(p.equipo_a_id)) golesA++;
                else golesB++;
                sortedEvents.push(ev);
            } else if (ev.tipo === 'tarjeta_amarilla' || ev.tipo === 'tarjeta_roja') {
                sortedEvents.push(ev);
            }
        }
        sortedEvents.sort(function(a, b) { return a.minuto - b.minuto; });

        if (sortedEvents.length > 0) {
            timelineHtml = '<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;font-size:13px;">';
            for (var si = 0; si < sortedEvents.length; si++) {
                var ev2 = sortedEvents[si];
                var esEqA = String(ev2.equipo_id) === String(p.equipo_a_id);
                var eqNombre = esEqA ? eqA.nombre : eqB.nombre;
                if (ev2.tipo === 'gol') {
                    timelineHtml += '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:rgba(16,185,129,0.1);border-radius:6px;margin:2px 0;border-left:3px solid #10b981;">' +
                        '<span style="font-weight:800;color:#94a3b8;min-width:28px;font-size:13px;">' + ev2.minuto + "'</span>" +
                        '<span style="font-size:18px;">⚽</span>' +
                        '<span style="color:#10b981;font-weight:700;font-size:14px;">' + escHtml(eqNombre) + '</span>' +
                        '<span style="font-weight:600;">' + escHtml(ev2.jugador_nombre) + '</span></div>';
                } else if (ev2.tipo === 'tarjeta_roja') {
                    timelineHtml += '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:rgba(239,68,68,0.12);border-radius:6px;margin:2px 0;border-left:3px solid #ef4444;">' +
                        '<span style="font-weight:800;color:#94a3b8;min-width:28px;font-size:13px;">' + ev2.minuto + "'</span>" +
                        '<span style="font-size:16px;">🟥</span>' +
                        '<span style="color:#ef4444;font-weight:700;font-size:14px;">' + escHtml(eqNombre) + '</span>' +
                        '<span style="font-weight:600;">' + escHtml(ev2.jugador_nombre) + '</span>' +
                        '<span style="background:rgba(239,68,68,0.2);color:#fca5a5;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;">EXPULSADO</span></div>';
                } else if (ev2.tipo === 'tarjeta_amarilla') {
                    timelineHtml += '<div style="display:flex;align-items:center;gap:8px;padding:3px 6px;background:rgba(245,158,11,0.08);border-radius:6px;margin:2px 0;border-left:3px solid #f59e0b;">' +
                        '<span style="font-weight:800;color:#94a3b8;min-width:28px;font-size:12px;">' + ev2.minuto + "'</span>" +
                        '<span style="font-size:14px;">🟨</span>' +
                        '<span style="color:#f59e0b;font-weight:600;font-size:13px;">' + escHtml(eqNombre) + '</span>' +
                        '<span style="font-weight:500;">' + escHtml(ev2.jugador_nombre) + '</span></div>';
                }
            }
            timelineHtml += '</div>';
        } else {
            timelineHtml = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0;">El partido comenzó, sin eventos aún</div>';
        }

        var tiempo = obtenerTiempoDisplay(p);
        var periodLabel = obtenerPeriodoLabel(p, tiempo);
        var cronoDisplay = p.en_curso || p.tiempo_jugado > 0 ? formatearTiempo(tiempo) : '';
        var periodDisplay = p.en_curso || p.tiempo_jugado > 0 ? periodLabel : '';
        var isLive = p.en_curso || (p.tiempo_jugado || 0) > 0;
        var catNombre = p.categoria_id ? ((categoriasConfig.find(function(c) { return c.id === p.categoria_id; }) || {}).nombre || '') : '';

        var logoA = eqA.logo_url ? '<img src="' + escHtml(eqA.logo_url) + '" style="width:36px;height:36px;object-fit:contain;border-radius:6px;" onerror="this.style.display=\'none\'">' : '';
        var logoB = eqB.logo_url ? '<img src="' + escHtml(eqB.logo_url) + '" style="width:36px;height:36px;object-fit:contain;border-radius:6px;" onerror="this.style.display=\'none\'">' : '';

        evHtml += '<div data-pid="' + p.id + '" style="margin-bottom:14px;position:relative;">' +
            '<div style="display:flex;align-items:stretch;justify-content:center;font-family:var(--font-heading);">' +
            '<div style="display:grid;grid-template-columns:1fr auto 1fr;width:100%;max-width:500px;background:rgba(0,0,0,0.4);border-radius:10px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">' +
            '<div style="background:rgba(185,28,28,0.15);padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:6px;">' + logoA + '<span style="font-size:13px;font-weight:700;color:white;text-align:center;line-height:1.2;word-break:break-word;">' + escHtml(eqA.nombre) + '</span></div>' +
            '<div class="goal-anchor" style="display:flex;flex-direction:column;align-items:center;padding:6px 16px;background:rgba(0,0,0,0.3);min-width:120px;position:relative;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:30px;font-weight:900;color:var(--accent-color);line-height:1;">' + golesA + '</span>' +
            '<span style="font-size:14px;font-weight:700;color:var(--text-muted);">-</span>' +
            '<span style="font-size:30px;font-weight:900;color:var(--accent-color);line-height:1;">' + golesB + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:4px;">' +
            '<span id="timer-' + p.id + '" style="font-size:22px;font-weight:800;font-family:monospace;color:white;letter-spacing:2px;">' + cronoDisplay + '</span>' +
            '<span id="extra-' + p.id + '" style="font-size:13px;font-weight:700;font-family:monospace;color:#f59e0b;display:none;">+00:00</span>' +
            '</div>' +
            '<span id="period-' + p.id + '" style="font-size:10px;font-weight:700;color:rgba(16,185,129,0.8);text-transform:uppercase;letter-spacing:1px;">' + periodDisplay + '</span>' +
            '</div>' +
            '<div style="background:rgba(185,28,28,0.15);padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:6px;">' +
            '<span style="font-size:13px;font-weight:700;color:white;text-align:center;line-height:1.2;word-break:break-word;">' + escHtml(eqB.nombre) + '</span>' + logoB +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:3px 10px 5px;font-size:10px;color:var(--text-muted);background:rgba(0,0,0,0.08);border-radius:0 0 10px 10px;">' +
            '<span>' + escHtml(cancha.nombre) + '</span>' +
            (catNombre ? '<span style="color:rgba(245,158,11,0.7);">' + escHtml(catNombre) + '</span>' : '') +
            '</div>' +
            (timelineHtml ? '<div style="padding:6px 12px 10px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.08);">' + timelineHtml + '</div>' : '') +
            '</div>';
    }
    container.innerHTML = evHtml;
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

    var fixtureHtml = '';
    for (const [fechaLabel, lista] of Object.entries(partidosPorFecha)) {
        fixtureHtml += '<div class="fecha-grupo"><h3>' + fechaLabel + '</h3>';
        
        lista.forEach(p => {
            const eqA = p._eqA;
            const eqB = p._eqB;
            const cancha = p._cancha;
            const hora = new Date(p.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            fixtureHtml += '<div class="partido-card">' +
                '<div class="partido-hora"><i data-lucide="clock"></i><span>' + hora + ' Hs</span></div>' +
                '<div class="partido-versus" style="flex:1; justify-content:center; gap:1.5rem;">' +
                '<div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-end;">' +
                '<span class="team" style="text-align:right;">' + escHtml(eqA.nombre) + '</span></div>' +
                '<span class="vs">vs</span>' +
                '<div class="team-display" style="display:flex; align-items:center; gap:8px; width:120px; justify-content:flex-start;">' +
                '<span class="team" style="text-align:left;">' + escHtml(eqB.nombre) + '</span></div>' +
                '</div>' +
                '<div class="partido-cancha"><i data-lucide="map-pin"></i><span>' + escHtml(cancha.nombre) + '</span></div>' +
                '</div>';
        });
        fixtureHtml += '</div>';
    }
    container.innerHTML = fixtureHtml;
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

    if (categoriasConfig.length === 0) {
        const { data: cats } = await supabaseClient.from('categorias_config').select('*').order('edad_min');
        if (cats) categoriasConfig = cats;
    }
    if (Object.keys(categoriaEquiposMap).length === 0) {
        const { data: catEqs } = await supabaseClient.from('categoria_equipos').select('*');
        if (catEqs) {
            categoriaEquiposMap = {};
            catEqs.forEach(function(ce) {
                if (!categoriaEquiposMap[ce.categoria_id]) categoriaEquiposMap[ce.categoria_id] = [];
                categoriaEquiposMap[ce.categoria_id].push(ce.equipo_id);
            });
        }
    }

    const partidosFinalizados = partidos ? partidos.filter(p => p.finalizado) : [];
    
    var resultHtml = partidosFinalizados.length === 0
        ? '<div style="text-align:center;color:var(--text-muted);padding:2rem;">No hay resultados de partidos anteriores registrados aún.</div>'
        : '';
        
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

        const eqAGanador = scoreA > scoreB;
        const eqBGanador = scoreB > scoreA;

        var golesHtml = '';
        const golesList = (eventos || []).filter(e => e.tipo === 'gol').sort((a, b) => a.minuto - b.minuto);
        if (golesList.length > 0) {
            golesHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;justify-content:center;">';
            golesList.forEach(g => {
                const esA = String(g.equipo_id) === String(p.equipo_a_id);
                golesHtml += '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;' + (esA ? 'background:rgba(16,185,129,0.15);color:#6ee7b7;' : 'background:rgba(245,158,11,0.15);color:#fcd34d;') + '">⚽ ' + g.minuto + "' " + escHtml(g.jugador_nombre) + '</span>';
            });
            golesHtml += '</div>';
        }

        var logoAhtml = eqA.logo_url ? '<img src="' + escHtml(eqA.logo_url) + '" style="width:36px;height:36px;object-fit:contain;border-radius:6px;" onerror="this.style.display=\'none\'">' : '';
        var logoBhtml = eqB.logo_url ? '<img src="' + escHtml(eqB.logo_url) + '" style="width:36px;height:36px;object-fit:contain;border-radius:6px;" onerror="this.style.display=\'none\'">' : '';

        resultHtml += '<div style="margin-bottom:12px;">' +
            '<div style="display:flex;align-items:stretch;justify-content:center;font-family:var(--font-heading);">' +
            '<div style="display:grid;grid-template-columns:1fr auto 1fr;width:100%;max-width:500px;background:rgba(0,0,0,0.4);border-radius:10px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">' +
            '<div style="background:rgba(185,28,28,0.15);padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:6px;">' +
            logoAhtml +
            '<span style="font-size:13px;font-weight:700;color:white;text-align:center;line-height:1.2;word-break:break-word;">' + escHtml(eqA.nombre) + '</span>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;align-items:center;padding:6px 16px;background:rgba(0,0,0,0.3);min-width:80px;">' +
            '<div style="display:flex;align-items:center;gap:5px;">' +
            '<span style="font-size:30px;font-weight:900;color:var(--accent-color);line-height:1;">' + scoreA + '</span>' +
            '<span style="font-size:14px;font-weight:700;color:var(--text-muted);">-</span>' +
            '<span style="font-size:30px;font-weight:900;color:var(--accent-color);line-height:1;">' + scoreB + '</span>' +
            '</div>' +
            '</div>' +
            '<div style="background:rgba(185,28,28,0.15);padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:6px;">' +
            '<span style="font-size:13px;font-weight:700;color:white;text-align:center;line-height:1.2;word-break:break-word;">' + escHtml(eqB.nombre) + '</span>' +
            logoBhtml +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:3px 10px 5px;font-size:10px;color:var(--text-muted);background:rgba(0,0,0,0.08);border-radius:0 0 10px 10px;">' +
            '<span>' + fecha + '</span>' +
            '<span>' + escHtml(cancha.nombre) + '</span>' +
            (p.categoria_id ? '<span style="color:rgba(245,158,11,0.7);">' + escHtml((categoriasConfig.find(function(c) { return c.id === p.categoria_id; }) || {}).nombre || '') + '</span>' : '') +
            '</div>' +
            (golesHtml ? '<div style="padding:6px 12px 10px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.08);">' + golesHtml + '</div>' : '') +
            '</div>';
    }
    listRes.innerHTML = resultHtml;

    // --- TABLA DE POSICIONES POR CATEGORÍA ---
    try {
        const containerPos = document.getElementById('posiciones-por-categoria');
        if (containerPos) {
            var posHtml = '';
            var renderizadas = 0;

            if (categoriasConfig.length === 0) {
                posHtml = '<div style="color:var(--text-muted);text-align:center;padding:1rem;">No hay categorías configuradas en el sistema.</div>';
            } else {
                for (var ci = 0; ci < categoriasConfig.length; ci++) {
                    var cat = categoriasConfig[ci];
                    var eqIds = categoriaEquiposMap[cat.id] || [];
                    var partidosCat = partidosFinalizados.filter(function(p) { return Number(p.categoria_id) === Number(cat.id); });

                    if (partidosCat.length === 0 && eqIds.length === 0) continue;

                    var tCat = {};
                    for (var ei = 0; ei < eqIds.length; ei++) {
                        var eid = eqIds[ei];
                        for (var eqi = 0; eqi < equiposList.length; eqi++) {
                            if (equiposList[eqi].id === eid) {
                                tCat[eid] = { id: eid, nombre: equiposList[eqi].nombre, logo_url: equiposList[eqi].logo_url || '', pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                                break;
                            }
                        }
                    }

                    for (var pi = 0; pi < partidosCat.length; pi++) {
                        var p = partidosCat[pi];
                        if (!tCat[p.equipo_a_id]) {
                            for (var eqi = 0; eqi < equiposList.length; eqi++) {
                                if (equiposList[eqi].id === p.equipo_a_id) {
                                    tCat[p.equipo_a_id] = { id: p.equipo_a_id, nombre: equiposList[eqi].nombre, logo_url: equiposList[eqi].logo_url || '', pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                                    break;
                                }
                            }
                        }
                        if (!tCat[p.equipo_b_id]) {
                            for (var eqi = 0; eqi < equiposList.length; eqi++) {
                                if (equiposList[eqi].id === p.equipo_b_id) {
                                    tCat[p.equipo_b_id] = { id: p.equipo_b_id, nombre: equiposList[eqi].nombre, logo_url: equiposList[eqi].logo_url || '', pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                                    break;
                                }
                            }
                        }
                        var tA = tCat[p.equipo_a_id];
                        var tB = tCat[p.equipo_b_id];
                        if (!tA || !tB) continue;
                        tA.pj++; tB.pj++;
                        var gA = p.goles_a || 0;
                        var gB = p.goles_b || 0;
                        tA.gf += gA; tA.gc += gB;
                        tB.gf += gB; tB.gc += gA;
                        if (gA > gB) { tA.pg++; tA.pts += 3; tB.pp++; }
                        else if (gA < gB) { tB.pg++; tB.pts += 3; tA.pp++; }
                        else { tA.pe++; tA.pts += 1; tB.pe++; tB.pts += 1; }
                        tA.dg = tA.gf - tA.gc;
                        tB.dg = tB.gf - tB.gc;
                    }

                    var tVals = Object.values(tCat);
                    if (tVals.length === 0) continue;
                    tVals.sort(function(a, b) {
                        if (b.pts !== a.pts) return b.pts - a.pts;
                        if (b.dg !== a.dg) return b.dg - a.dg;
                        return b.gf - a.gf;
                    });

                    renderizadas++;

                    // Generar tira de logos para esta categoría
                    var logosHtml = '';
                    for (var ei2 = 0; ei2 < eqIds.length; ei2++) {
                        var eqId = eqIds[ei2];
                        var eq = equiposList.find(function(e) { return e.id === eqId; });
                        if (eq && eq.logo_url) {
                            logosHtml += '<img src="' + escHtml(eq.logo_url) + '" style="width:60px;height:60px;object-fit:cover;border-radius:50%;margin:0 6px 6px 0;background:rgba(255,255,255,0.05);padding:2px;border:2px solid rgba(255,255,255,0.1);cursor:pointer;" onclick="verDetalleEquipo(\'' + escHtml(eq.id) + '\')" onerror="this.style.display=\'none\'" title="' + escHtml(eq.nombre) + '" class="team-logo-btn">';
                        }
                    }

                    var html = '<div style="background:rgba(0,0,0,0.18);border-radius:8px;padding:8px 10px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.06);">';
                    html += '<div style="font-size:14px;font-weight:700;color:var(--accent-color);margin-bottom:4px;">' + escHtml(cat.nombre) + '</div>';
                    if (logosHtml) {
                        html += '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;">' + logosHtml + '</div>';
                    }
                    html += '<div style="overflow-x:auto;"><table style="font-size:12px;width:100%;border-collapse:collapse;">';
                    html += '<thead><tr style="background:rgba(185,28,28,0.2);">';
                    var cols = [
                        { label: '#', w: '28px', align: 'center' },
                        { label: 'Equipo', w: '', align: 'left' },
                        { label: 'PJ', w: '26px', align: 'center' },
                        { label: 'PG', w: '26px', align: 'center' },
                        { label: 'PE', w: '26px', align: 'center' },
                        { label: 'PP', w: '26px', align: 'center' },
                        { label: 'GF', w: '26px', align: 'center' },
                        { label: 'GC', w: '26px', align: 'center' },
                        { label: 'DG', w: '28px', align: 'center' },
                        { label: 'Pts', w: '28px', align: 'center' }
                    ];
                    for (var ci2 = 0; ci2 < cols.length; ci2++) {
                        var c = cols[ci2];
                        var w = c.w ? 'width:' + c.w + ';' : 'flex:1;';
                        html += '<th style="' + w + 'padding:4px 4px;text-align:' + c.align + ';color:var(--accent-color);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">' + c.label + '</th>';
                    }
                    html += '</tr></thead><tbody>';
                    for (var ri = 0; ri < tVals.length; ri++) {
                        var row = tVals[ri];
                        var dgColor = row.dg > 0 ? '#10b981' : (row.dg < 0 ? '#ef4444' : '#64748b');
                        var dgSign = row.dg > 0 ? '+' : '';
                        var bg = ri % 2 === 0 ? 'background:rgba(255,255,255,0.02);' : '';
                        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);' + bg + '">';
                        var logoSmall = row.logo_url ? '<img src="' + escHtml(row.logo_url) + '" style="width:20px;height:20px;object-fit:cover;border-radius:50%;flex-shrink:0;">' : '';
                        var nombreClickable = '<div style="display:flex;align-items:center;gap:6px;cursor:pointer;" onclick="verDetalleEquipo(\'' + escHtml(row.id) + '\')">' + logoSmall + '<span style="text-decoration:underline;text-underline-offset:2px;">' + escHtml(row.nombre) + '</span></div>';
                        var vals = [
                            String(ri + 1),
                            nombreClickable,
                            String(row.pj),
                            String(row.pg),
                            String(row.pe),
                            String(row.pp),
                            String(row.gf),
                            String(row.gc),
                            dgSign + row.dg,
                            String(row.pts)
                        ];
                        var aligns = ['center','left','center','center','center','center','center','center','center','center'];
                        var colors = ['white','white','white','white','white','white','white','white',dgColor,'var(--primary-color)'];
                        for (var vi = 0; vi < vals.length; vi++) {
                            var w = cols[vi].w ? 'width:' + cols[vi].w + ';' : 'flex:1;';
                            var fw = vi === 1 ? 'font-weight:600;' : (vi === 0 || vi === vals.length - 1 ? 'font-weight:700;' : '');
                            html += '<td style="' + w + 'padding:4px 4px;text-align:' + aligns[vi] + ';color:' + colors[vi] + ';font-size:12px;' + fw + '">' + vals[vi] + '</td>';
                        }
                        html += '</tr>';
                    }
                    html += '</tbody></table></div></div>';
                    posHtml += html;

                }

                if (renderizadas === 0) {
                    posHtml = '<div style="color:var(--text-muted);text-align:center;padding:1rem;">Categorías configuradas pero sin equipos asignados ni partidos jugados.</div>';
                }
            }
            containerPos.innerHTML = posHtml;
        }
    } catch(e) { console.log('Error standings:', e); }

    var eventosPorPartido = {};
    try {
        // --- GOLEADORES con equipo y categoría ---
        const goleadores = {};
        for (const p of partidosFinalizados) {
            const evs = await cargarEventosPartido(p.id);
            eventosPorPartido[p.id] = evs;
            evs.filter(function(e) { return e.tipo === 'gol'; }).forEach(function(e) {
                const key = e.jugador_nombre + '|' + (e.jugador_ci || '');
                if (!goleadores[key]) goleadores[key] = { nombre: e.jugador_nombre, ci: e.jugador_ci || '', goles: 0, equipos: {}, categorias: {} };
                goleadores[key].goles++;
                const eq = equiposList.find(function(ee) { return String(ee.id) === String(e.equipo_id); });
                const eqNombre = eq ? eq.nombre : '?';
                if (!goleadores[key].equipos[e.equipo_id]) goleadores[key].equipos[e.equipo_id] = eqNombre;
                const catMatch = categoriasConfig.find(function(c) { return Number(c.id) === Number(p.categoria_id); });
                const catNombre = catMatch ? catMatch.nombre : '?';
                if (!goleadores[key].categorias[p.categoria_id]) goleadores[key].categorias[p.categoria_id] = catNombre;
            });
        }
        const topGoleadores = Object.values(goleadores).sort(function(a, b) { return b.goles - a.goles; }).slice(0, 15);

        const golesContainer = document.getElementById('goleadores-list');
        if (golesContainer) {
            var golHtml = '';
            if (topGoleadores.length === 0) {
                golHtml = '<div style="color:var(--text-muted);text-align:center;padding:1rem;">Aún no se registraron goles</div>';
            } else {
                topGoleadores.forEach(function(g, i) {
                    const equiposStr = Object.values(g.equipos).join(', ');
                    const catsStr = Object.values(g.categorias).join(', ');
                    golHtml += '<div class="stats-player-row" onclick="verEstadisticasJugador(\'' + escHtml(g.nombre) + '\', \'' + escHtml(g.ci) + '\')">' +
                        '<span class="stats-player-pos">' + (i + 1) + '</span>' +
                        '<span class="stats-player-name">' + escHtml(g.nombre) + '</span>' +
                        '<span class="stats-player-meta">' + escHtml(equiposStr) + '</span>' +
                        '<span class="stats-player-meta">' + escHtml(catsStr) + '</span>' +
                        '<span class="stats-player-count">' + g.goles + ' gol' + (g.goles !== 1 ? 'es' : '') + '</span></div>';
                });
            }
            golesContainer.innerHTML = golHtml;
        }
    } catch(e) { console.log('Error goleadores:', e); }

    try {
        // --- TARJETAS con equipo y categoría ---
        const tarjetasEst = {};
        for (const p of partidosFinalizados) {
            const evs = eventosPorPartido[p.id] || await cargarEventosPartido(p.id);
            evs.filter(function(e) { return e.tipo.indexOf('tarjeta_') === 0; }).forEach(function(e) {
                const key = e.jugador_nombre + '|' + (e.jugador_ci || '');
                if (!tarjetasEst[key]) tarjetasEst[key] = { nombre: e.jugador_nombre, ci: e.jugador_ci || '', amarilla: 0, roja: 0, equipos: {}, categorias: {} };
                if (e.tipo === 'tarjeta_amarilla') tarjetasEst[key].amarilla++;
                if (e.tipo === 'tarjeta_roja') tarjetasEst[key].roja++;
                const eq = equiposList.find(function(ee) { return String(ee.id) === String(e.equipo_id); });
                if (eq && !tarjetasEst[key].equipos[e.equipo_id]) tarjetasEst[key].equipos[e.equipo_id] = eq.nombre;
                const catMatch = categoriasConfig.find(function(c) { return Number(c.id) === Number(p.categoria_id); });
                if (catMatch && !tarjetasEst[key].categorias[p.categoria_id]) tarjetasEst[key].categorias[p.categoria_id] = catMatch.nombre;
            });
        }
        const topTarjetas = Object.values(tarjetasEst).sort(function(a, b) { return (b.roja + b.amarilla) - (a.roja + a.amarilla); }).slice(0, 15);

        const tarjetasContainer = document.getElementById('tarjetas-estadisticas-list');
        if (tarjetasContainer) {
            var tarjHtml = '';
            if (topTarjetas.length === 0) {
                tarjHtml = '<div style="color:var(--text-muted);text-align:center;padding:1rem;">Aún no se registraron tarjetas</div>';
            } else {
                topTarjetas.forEach(function(t, i) {
                    const equiposStr = Object.values(t.equipos).join(', ');
                    const catsStr = Object.values(t.categorias).join(', ');
                    tarjHtml += '<div class="stats-player-row" onclick="verEstadisticasJugador(\'' + escHtml(t.nombre) + '\', \'' + escHtml(t.ci) + '\')">' +
                        '<span class="stats-player-pos">' + (i + 1) + '</span>' +
                        '<span class="stats-player-name">' + escHtml(t.nombre) + '</span>' +
                        '<span class="stats-player-meta">' + escHtml(equiposStr) + '</span>' +
                        '<span class="stats-player-meta">' + escHtml(catsStr) + '</span>' +
                        '<span class="stats-player-count">' +
                        (t.amarilla > 0 ? '<span style="color:#f59e0b;">&#x1F7E8; ' + t.amarilla + '</span>' : '') +
                        (t.roja > 0 ? '<span style="color:#ef4444;margin-left:4px;">&#x1F7E5; ' + t.roja + '</span>' : '') +
                        '</span></div>';
                });
            }
            tarjetasContainer.innerHTML = tarjHtml;
        }
    } catch(e) { console.log('Error tarjetas:', e); }
}

// ============================
// ESTADÍSTICAS: Detalle de jugador por partido
// ============================
async function verEstadisticasJugador(nombre, ci) {
    var eventos;
    if (ci) {
        var res = await supabaseClient
            .from('partido_eventos')
            .select('*')
            .eq('jugador_ci', ci)
            .order('minuto');
        eventos = res.data;
        if (res.error) eventos = null;
    } else {
        eventos = null;
    }

    if (!eventos || eventos.length === 0) {
        var res2 = await supabaseClient
            .from('partido_eventos')
            .select('*')
            .ilike('jugador_nombre', '%' + nombre + '%')
            .order('minuto');
        if (res2.error || !res2.data || res2.data.length === 0) {
            return alert('No se encontraron estadísticas para ' + nombre);
        }
        eventos = res2.data;
    }

    // Group by partido
    const porPartido = {};
    eventos.forEach(e => {
        if (!porPartido[e.partido_id]) porPartido[e.partido_id] = { partido_id: e.partido_id, equipo_id: e.equipo_id, goles: 0, amarillas: 0, rojas: 0, minGol: null };
        if (e.tipo === 'gol') { porPartido[e.partido_id].goles++; porPartido[e.partido_id].minGol = e.minuto; }
        if (e.tipo === 'tarjeta_amarilla') porPartido[e.partido_id].amarillas++;
        if (e.tipo === 'tarjeta_roja') porPartido[e.partido_id].rojas++;
    });

    // Get match info
    const partidoIds = Object.keys(porPartido);
    const { data: partidos } = await supabaseClient
        .from('partidos')
        .select('*')
        .in('id', partidoIds)
        .order('fecha_hora', { ascending: false });

    let html = `<div class="modal-overlay" onclick="this.remove()">`;
    html += `<div class="modal" onclick="event.stopPropagation()" style="max-width:600px;max-height:85vh;overflow-y:auto;">`;
    html += `<h3 style="margin-bottom:4px;font-size:18px;">${escHtml(nombre)}</h3>`;
    html += `<p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">Estadísticas por partido</p>`;

    if (!partidos || partidos.length === 0) {
        html += `<p style="color:var(--text-muted);">Sin datos de partidos</p>`;
    } else {
        for (const p of partidos) {
            const eqA = equiposList.find(e => String(e.id) === String(p.equipo_a_id)) || { nombre: '?' };
            const eqB = equiposList.find(e => String(e.id) === String(p.equipo_b_id)) || { nombre: '?' };
            const stats = porPartido[p.id];
            const esEqA = String(stats.equipo_id) === String(p.equipo_a_id);
            const equipoJug = esEqA ? eqA.nombre : eqB.nombre;
            const rival = esEqA ? eqB.nombre : eqA.nombre;
            const fecha = new Date(p.fecha_hora).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
            const score = `${p.goles_a ?? 0} - ${p.goles_b ?? 0}`;

            html += `<div style="background:rgba(0,0,0,0.15);border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:12px;color:var(--text-muted);">${fecha}</span>
                    <span style="font-size:13px;font-weight:600;">${escHtml(equipoJug)}</span>
                    <span style="font-size:16px;font-weight:800;color:var(--accent-color);">${score}</span>
                    <span style="font-size:13px;font-weight:600;">vs ${escHtml(rival)}</span>
                </div>
                <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
                    ${stats.goles > 0 ? `<span style="font-size:13px;background:rgba(16,185,129,0.15);color:#6ee7b7;padding:2px 10px;border-radius:10px;font-weight:600;">⚽ ${stats.goles} gol${stats.goles > 1 ? 'es' : ''}</span>` : ''}
                    ${stats.amarillas > 0 ? `<span style="font-size:13px;background:rgba(245,158,11,0.15);color:#fcd34d;padding:2px 10px;border-radius:10px;font-weight:600;">🟨 ${stats.amarillas}</span>` : ''}
                    ${stats.rojas > 0 ? `<span style="font-size:13px;background:rgba(239,68,68,0.15);color:#fca5a5;padding:2px 10px;border-radius:10px;font-weight:600;">🟥 ${stats.rojas}</span>` : ''}
                    ${stats.goles === 0 && stats.amarillas === 0 && stats.rojas === 0 ? '<span style="font-size:12px;color:var(--text-muted);">Participó sin eventos destacados</span>' : ''}
                </div>
            </div>`;
        }
    }

    html += `<button onclick="this.closest('.modal-overlay').remove()" class="btn-action" style="background:#64748b;color:white;padding:8px 20px;margin-top:12px;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Cerrar</button>`;
    html += `</div></div>`;

    document.body.appendChild(div);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function verDetalleEquipo(equipoId) {
    // 1. Mostrar spinner de carga
    const loader = document.createElement('div');
    loader.className = 'modal-overlay';
    loader.id = 'team-details-loader';
    loader.innerHTML = `
        <div class="modal" style="text-align:center;padding:2rem;max-width:300px;">
            <div class="spinner" style="border: 4px solid rgba(255,255,255,0.1); border-left-color: var(--accent-color); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
            <p style="font-weight:600;font-family:'Outfit',sans-serif;color:white;">Cargando datos del equipo...</p>
        </div>
    `;
    document.body.appendChild(loader);

    try {
        // 2. Obtener datos del equipo
        let eq = equiposList.find(e => String(e.id) === String(equipoId));
        if (!eq) {
            const { data: fetchEq } = await supabaseClient.from('equipos').select('*').eq('id', equipoId).single();
            eq = fetchEq || { id: equipoId, nombre: 'Equipo desconocido', logo_url: '' };
        }

        // 3. Obtener atletas/socios del equipo
        const { data: atletas, error: errA } = await supabaseClient
            .from('atletas')
            .select('id, socio_id, categoria_id, socios(id, nombre, apellido, edad, habilitado, fecha_nacimiento, ci)')
            .eq('equipo_id', equipoId);

        if (errA) throw errA;

        // 4. Obtener partidos en los que juega el equipo
        const { data: partidos, error: errP } = await supabaseClient
            .from('partidos')
            .select('*')
            .or(`equipo_a_id.eq.${equipoId},equipo_b_id.eq.${equipoId}`)
            .order('fecha_hora', { ascending: false });

        if (errP) throw errP;

        // 5. Obtener todos los eventos de los partidos en los que participó
        const matchIds = (partidos || []).map(p => p.id);
        let eventos = [];
        if (matchIds.length > 0) {
            const { data: evs, error: errEv } = await supabaseClient
                .from('partido_eventos')
                .select('*')
                .in('partido_id', matchIds);
            if (!errEv) eventos = evs;
        }

        // Remover loader
        loader.remove();

        // 6. Determinar categorías únicas en las que está el equipo
        const catIds = [...new Set(atletas.map(a => a.categoria_id).filter(id => id !== null))];

        let activeTab = 'jugadores';

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.onclick = function() { modalOverlay.remove(); };

        const modal = document.createElement('div');
        modal.className = 'modal team-details-modal';
        modal.onclick = function(e) { e.stopPropagation(); };

        // Botón cerrar
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.1);color:white;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background 0.2s;z-index:10;';
        closeBtn.onmouseover = function() { this.style.background = 'rgba(255,255,255,0.2)'; };
        closeBtn.onmouseout = function() { this.style.background = 'rgba(255,255,255,0.1)'; };
        closeBtn.onclick = function() { modalOverlay.remove(); };
        modal.appendChild(closeBtn);

        // Header del equipo
        const header = document.createElement('div');
        header.className = 'team-details-header';
        
        const logoHtml = eq.logo_url 
            ? `<img src="${escHtml(eq.logo_url)}" class="team-details-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` 
            : '';
        const logoFallback = `<div class="team-details-logo" style="display:${eq.logo_url?'none':'flex'};align-items:center;justify-content:center;color:var(--accent-color);font-size:2rem;background:rgba(255,255,255,0.05);border:2px solid var(--accent-color);border-radius:50%;"><i data-lucide="shield"></i></div>`;

        header.innerHTML = `
            ${logoHtml}
            ${logoFallback}
            <div class="team-details-name-wrapper">
                <h2>${escHtml(eq.nombre)}</h2>
                <p style="color:var(--text-muted);font-size:12px;margin:2px 0 0 0;">Equipo del Torneo AFEMEC</p>
            </div>
        `;
        modal.appendChild(header);

        // Contenedor de pestañas
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'team-details-tabs';
        
        const tabs = [
            { id: 'jugadores', label: '👥 Jugadores' },
            { id: 'estadisticas', label: '📊 Estadísticas' },
            { id: 'calendario', label: '📅 Calendario' },
            { id: 'resumen', label: '📋 Resumen' }
        ];

        tabs.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'team-details-tab-btn' + (t.id === activeTab ? ' active' : '');
            btn.textContent = t.label;
            btn.onclick = function() {
                modal.querySelectorAll('.team-details-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderTabContent(t.id);
            };
            tabsContainer.appendChild(btn);
        });
        modal.appendChild(tabsContainer);

        // Contenedor de contenido
        const contentContainer = document.createElement('div');
        contentContainer.className = 'team-details-content';
        modal.appendChild(contentContainer);

        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        async function renderTabContent(tabId) {
            contentContainer.innerHTML = '';
            
            if (tabId === 'jugadores') {
                if (!atletas || atletas.length === 0) {
                    contentContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem;">No hay jugadores registrados en este equipo.</div>';
                    return;
                }
                let listHtml = '<div style="display:flex;flex-direction:column;gap:8px;">';
                atletas.forEach((a, index) => {
                    const s = a.socios;
                    if (!s) return;
                    const nombre = `${s.nombre} ${s.apellido}`;
                    const edad = s.fecha_nacimiento ? calcularEdadDesdeFecha(s.fecha_nacimiento) : (s.edad || '—');
                    const habilitado = s.habilitado ? '<span class="badge-status-socio activo">Habilitado</span>' : '<span class="badge-status-socio inactivo">Inactivo</span>';
                    const catObj = categoriasConfig.find(c => c.id === a.categoria_id);
                    const catName = catObj ? catObj.nombre : 'Sin categoría';

                    listHtml += `
                        <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <span style="background:rgba(245,158,11,0.15);color:var(--accent-color);font-family:monospace;font-weight:800;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">#${index + 1}</span>
                                <div>
                                    <strong style="font-size:14px;color:white;display:block;">${escHtml(nombre)}</strong>
                                    <span style="font-size:12px;color:var(--text-muted);">CI: ${escHtml(s.ci)} &nbsp;|&nbsp; Edad: ${edad} años</span>
                                    <span style="display:block;font-size:11px;color:rgba(245,158,11,0.7);margin-top:2px;">Categoría: ${escHtml(catName)}</span>
                                </div>
                            </div>
                            <div>
                                ${habilitado}
                            </div>
                        </div>
                    `;
                });
                listHtml += '</div>';
                contentContainer.innerHTML = listHtml;
            } 
            else if (tabId === 'estadisticas') {
                if (catIds.length === 0) {
                    contentContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem;">Este equipo no tiene categorías asociadas en el sistema.</div>';
                    return;
                }

                let statsHtml = '<div style="display:flex;flex-direction:column;gap:16px;">';
                
                for (const catId of catIds) {
                    const catObj = categoriasConfig.find(c => c.id === catId) || { nombre: 'Categoría ' + catId };
                    
                    // Obtener partidos finalizados de esta categoría para tabla standings
                    const { data: matchesCat } = await supabaseClient
                        .from('partidos')
                        .select('*')
                        .eq('categoria_id', catId)
                        .eq('finalizado', true);

                    const catEqIds = categoriaEquiposMap[catId] || [];

                    const tCat = {};
                    catEqIds.forEach(eid => {
                        const eqMatch = equiposList.find(e => e.id === eid);
                        tCat[eid] = { id: eid, nombre: eqMatch ? eqMatch.nombre : '?', logo_url: eqMatch ? eqMatch.logo_url : '', pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                    });

                    (matchesCat || []).forEach(p => {
                        if (!tCat[p.equipo_a_id]) {
                            const eqMatch = equiposList.find(e => e.id === p.equipo_a_id);
                            tCat[p.equipo_a_id] = { id: p.equipo_a_id, nombre: eqMatch ? eqMatch.nombre : '?', logo_url: eqMatch ? eqMatch.logo_url : '', pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                        }
                        if (!tCat[p.equipo_b_id]) {
                            const eqMatch = equiposList.find(e => e.id === p.equipo_b_id);
                            tCat[p.equipo_b_id] = { id: p.equipo_b_id, nombre: eqMatch ? eqMatch.nombre : '?', logo_url: eqMatch ? eqMatch.logo_url : '', pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                        }
                        const tA = tCat[p.equipo_a_id];
                        const tB = tCat[p.equipo_b_id];
                        if (tA && tB) {
                            tA.pj++; tB.pj++;
                            const gA = p.goles_a || 0;
                            const gB = p.goles_b || 0;
                            tA.gf += gA; tA.gc += gB;
                            tB.gf += gB; tB.gc += gA;
                            if (gA > gB) { tA.pg++; tA.pts += 3; tB.pp++; }
                            else if (gA < gB) { tB.pg++; tB.pts += 3; tA.pp++; }
                            else { tA.pe++; tA.pts += 1; tB.pe++; tB.pts += 1; }
                            tA.dg = tA.gf - tA.gc;
                            tB.dg = tB.gf - tB.gc;
                        }
                    });

                    const sorted = Object.values(tCat).sort((a, b) => {
                        if (b.pts !== a.pts) return b.pts - a.pts;
                        if (b.dg !== a.dg) return b.dg - a.dg;
                        return b.gf - a.gf;
                    });

                    const posIndex = sorted.findIndex(t => String(t.id) === String(equipoId));
                    const row = posIndex !== -1 ? sorted[posIndex] : { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
                    const position = posIndex !== -1 ? posIndex + 1 : '—';

                    // Tarjetas y goles
                    const catMatchesIds = (partidos || []).filter(p => p.categoria_id === catId).map(p => p.id);
                    const catEvents = eventos.filter(e => catMatchesIds.includes(e.partido_id) && String(e.equipo_id) === String(equipoId));
                    const yellowCards = catEvents.filter(e => e.tipo === 'tarjeta_amarilla').length;
                    const redCards = catEvents.filter(e => e.tipo === 'tarjeta_roja').length;

                    // Top 4 goleadores
                    const catGoles = catEvents.filter(e => e.tipo === 'gol');
                    const catScorers = {};
                    catGoles.forEach(g => {
                        const nameKey = g.jugador_nombre.trim();
                        if (nameKey) {
                            if (!catScorers[nameKey]) catScorers[nameKey] = 0;
                            catScorers[nameKey]++;
                        }
                    });
                    const topScorers = Object.entries(catScorers)
                        .map(([nombre, goles]) => ({ nombre, goles }))
                        .sort((a, b) => b.goles - a.goles)
                        .slice(0, 4);

                    // Estado planilla
                    const catPlayers = atletas.filter(a => a.categoria_id === catId);
                    const enabledCount = catPlayers.filter(a => a.socios?.habilitado).length;
                    const disabledCount = catPlayers.filter(a => a.socios && !a.socios.habilitado).length;

                    statsHtml += `
                        <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                <h3 style="margin:0;font-size:16px;color:var(--accent-color);font-family:'Outfit',sans-serif;">🏆 ${escHtml(catObj.nombre)}</h3>
                                <span style="background:rgba(245,158,11,0.15);color:var(--accent-color);font-size:12px;padding:2px 10px;border-radius:12px;font-weight:700;">Posición: ${position}º</span>
                            </div>
                            
                            <!-- Grid Estadísticas -->
                            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-bottom:12px;">
                                <div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;">PJ</span>
                                    <strong style="font-size:14px;color:white;">${row.pj}</strong>
                                </div>
                                <div style="background:rgba(16,185,129,0.08);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:#6ee7b7;text-transform:uppercase;">PG</span>
                                    <strong style="font-size:14px;color:#10b981;">${row.pg}</strong>
                                </div>
                                <div style="background:rgba(148,163,184,0.08);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:#cbd5e1;text-transform:uppercase;">PE</span>
                                    <strong style="font-size:14px;color:#94a3b8;">${row.pe}</strong>
                                </div>
                                <div style="background:rgba(239,68,68,0.08);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:#fca5a5;text-transform:uppercase;">PP</span>
                                    <strong style="font-size:14px;color:#ef4444;">${row.pp}</strong>
                                </div>
                            </div>

                            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-bottom:12px;">
                                <div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;">GF</span>
                                    <strong style="font-size:14px;color:white;">${row.gf}</strong>
                                </div>
                                <div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;">GC</span>
                                    <strong style="font-size:14px;color:white;">${row.gc}</strong>
                                </div>
                                <div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;text-align:center;">
                                    <span style="display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;">DG</span>
                                    <strong style="font-size:14px;color:${row.dg > 0 ? '#10b981' : (row.dg < 0 ? '#ef4444' : 'white')}">${row.dg > 0 ? '+' : ''}${row.dg}</strong>
                                </div>
                                <div style="background:rgba(245,158,11,0.1);padding:6px;border-radius:6px;text-align:center;border:1px solid rgba(245,158,11,0.2);">
                                    <span style="display:block;font-size:10px;color:var(--accent-color);text-transform:uppercase;font-weight:700;">PTS</span>
                                    <strong style="font-size:14px;color:var(--accent-color);">${row.pts}</strong>
                                </div>
                            </div>

                            <!-- Tarjetas y Planilla -->
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
                                <div>
                                    <span style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:600;">🎴 Sanciones</span>
                                    <span style="display:inline-block;font-size:12px;background:rgba(245,158,11,0.15);color:#fcd34d;padding:2px 8px;border-radius:12px;margin-right:4px;font-weight:600;">🟨 ${yellowCards}</span>
                                    <span style="display:inline-block;font-size:12px;background:rgba(239,68,68,0.15);color:#fca5a5;padding:2px 8px;border-radius:12px;font-weight:600;">🟥 ${redCards}</span>
                                </div>
                                <div>
                                    <span style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:600;">📋 Estado de Planilla</span>
                                    <span style="display:block;font-size:11px;color:white;">Habilitados: <strong style="color:#10b981;">${enabledCount}</strong></span>
                                    <span style="display:block;font-size:11px;color:white;">Deshabilitados: <strong style="color:#ef4444;">${disabledCount}</strong></span>
                                </div>
                            </div>

                            <!-- Top Goleadores -->
                            <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
                                <span style="display:block;font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:6px;">⚽ Top 4 Goleadores del Equipo</span>
                                ${topScorers.length === 0 
                                    ? '<div style="font-size:12px;color:var(--text-muted);font-style:italic;">Sin goles registrados.</div>' 
                                    : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                                        ${topScorers.map((s, idx) => `
                                            <div style="background:rgba(255,255,255,0.03);padding:4px 8px;border-radius:6px;font-size:12px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(255,255,255,0.04);">
                                                <span style="color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${idx+1}. ${escHtml(s.nombre)}</span>
                                                <strong style="color:#10b981;flex-shrink:0;">⚽ ${s.goles}</strong>
                                            </div>
                                        `).join('')}
                                    </div>`
                                }
                            </div>
                        </div>
                    `;
                }
                statsHtml += '</div>';
                contentContainer.innerHTML = statsHtml;
            } 
            else if (tabId === 'calendario') {
                const fixtures = partidos || [];
                if (fixtures.length === 0) {
                    contentContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem;">No hay partidos registrados para este equipo.</div>';
                    return;
                }

                let calHtml = '<div style="display:flex;flex-direction:column;gap:10px;">';
                fixtures.forEach(p => {
                    const eqA = equiposList.find(e => e.id === p.equipo_a_id) || { nombre: '?' };
                    const eqB = equiposList.find(e => e.id === p.equipo_b_id) || { nombre: '?' };
                    const cat = categoriasConfig.find(c => c.id === p.categoria_id) || { nombre: '—' };
                    
                    const esA = String(p.equipo_a_id) === String(equipoId);
                    const rival = esA ? eqB.nombre : eqA.nombre;
                    const logoRival = esA 
                        ? (eqB.logo_url ? `<img src="${escHtml(eqB.logo_url)}" style="width:20px;height:20px;object-fit:cover;border-radius:50%;">` : '') 
                        : (eqA.logo_url ? `<img src="${escHtml(eqA.logo_url)}" style="width:20px;height:20px;object-fit:cover;border-radius:50%;">` : '');

                    const fDate = new Date(p.fecha_hora).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                    
                    let outcomeBadge = '';
                    let scoreText = '';
                    
                    if (p.finalizado) {
                        const scoreA = p.goles_a || 0;
                        const scoreB = p.goles_b || 0;
                        scoreText = `${scoreA} - ${scoreB}`;
                        
                        const won = (esA && scoreA > scoreB) || (!esA && scoreB > scoreA);
                        const draw = scoreA === scoreB;
                        
                        if (won) {
                            outcomeBadge = '<span style="background:rgba(16,185,129,0.15);color:#6ee7b7;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;">Victoria</span>';
                        } else if (draw) {
                            outcomeBadge = '<span style="background:rgba(148,163,184,0.15);color:#cbd5e1;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;">Empate</span>';
                        } else {
                            outcomeBadge = '<span style="background:rgba(239,68,68,0.15);color:#fca5a5;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;">Derrota</span>';
                        }
                    } else {
                        scoreText = 'vs';
                        outcomeBadge = '<span style="background:rgba(245,158,11,0.15);color:#fcd34d;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;">Próximamente</span>';
                    }

                    calHtml += `
                        <div style="background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <div style="min-width:0;flex:1;">
                                <div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                                    <span>📅 ${fDate}</span>
                                    <span>•</span>
                                    <span style="color:var(--accent-color);font-weight:600;">${escHtml(cat.nombre)}</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:white;font-weight:700;">
                                    <span style="color:var(--text-muted);font-weight:400;font-size:12px;">vs</span>
                                    ${logoRival}
                                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(rival)}</span>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                                <strong style="font-family:monospace;font-size:16px;color:white;background:rgba(0,0,0,0.3);padding:4px 10px;border-radius:6px;">${scoreText}</strong>
                                ${outcomeBadge}
                            </div>
                        </div>
                    `;
                });
                calHtml += '</div>';
                contentContainer.innerHTML = calHtml;
            } 
            else if (tabId === 'resumen') {
                const finalizedMatches = (partidos || []).filter(p => p.finalizado);
                
                let totalPJ = 0;
                let totalPG = 0;
                let totalPE = 0;
                let totalPP = 0;
                let totalGF = 0;
                let totalGC = 0;

                finalizedMatches.forEach(p => {
                    totalPJ++;
                    const esA = String(p.equipo_a_id) === String(equipoId);
                    const gA = p.goles_a || 0;
                    const gB = p.goles_b || 0;
                    
                    const myGoals = esA ? gA : gB;
                    const rivalGoals = esA ? gB : gA;
                    
                    totalGF += myGoals;
                    totalGC += rivalGoals;

                    if (myGoals > rivalGoals) totalPG++;
                    else if (myGoals < rivalGoals) totalPP++;
                    else totalPE++;
                });

                const winRate = totalPJ > 0 ? Math.round((totalPG / totalPJ) * 100) : 0;
                const totalDG = totalGF - totalGC;

                contentContainer.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                            <div style="background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;text-align:center;">
                                <span style="display:block;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Partidos Jugados</span>
                                <strong style="font-size:28px;color:white;font-family:'Outfit',sans-serif;line-height:1;">${totalPJ}</strong>
                            </div>
                            <div style="background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;text-align:center;">
                                <span style="display:block;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Victorias</span>
                                <strong style="font-size:28px;color:#10b981;font-family:'Outfit',sans-serif;line-height:1;">${winRate}%</strong>
                            </div>
                        </div>

                        <!-- Detalle de Resultados -->
                        <div style="background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;">
                            <h3 style="margin:0 0 12px 0;font-size:12px;color:var(--accent-color);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Resumen General</h3>
                            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;">
                                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);padding:10px;border-radius:8px;text-align:center;">
                                    <span style="display:block;font-size:11px;color:#6ee7b7;margin-bottom:4px;">Victorias</span>
                                    <strong style="font-size:20px;color:#10b981;">${totalPG}</strong>
                                </div>
                                <div style="background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.15);padding:10px;border-radius:8px;text-align:center;">
                                    <span style="display:block;font-size:11px;color:#cbd5e1;margin-bottom:4px;">Empates</span>
                                    <strong style="font-size:20px;color:#94a3b8;">${totalPE}</strong>
                                </div>
                                <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.15);padding:10px;border-radius:8px;text-align:center;">
                                    <span style="display:block;font-size:11px;color:#fca5a5;margin-bottom:4px;">Derrotas</span>
                                    <strong style="font-size:20px;color:#ef4444;">${totalPP}</strong>
                                </div>
                            </div>
                        </div>

                        <!-- Goles -->
                        <div style="background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;">
                            <h3 style="margin:0 0 12px 0;font-size:12px;color:var(--accent-color);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Registro de Goles</h3>
                            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;">
                                <div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;text-align:center;">
                                    <span style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;">A Favor</span>
                                    <strong style="font-size:18px;color:white;">${totalGF}</strong>
                                </div>
                                <div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;text-align:center;">
                                    <span style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;">En Contra</span>
                                    <strong style="font-size:18px;color:white;">${totalGC}</strong>
                                </div>
                                <div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;text-align:center;border-left:1px dashed rgba(255,255,255,0.1);">
                                    <span style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;">Diferencia</span>
                                    <strong style="font-size:18px;color:${totalDG > 0 ? '#10b981' : (totalDG < 0 ? '#ef4444' : 'white')}">${totalDG > 0 ? '+' : ''}${totalDG}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Renderizado inicial
        await renderTabContent(activeTab);

    } catch (e) {
        loader.remove();
        console.error('Error al abrir detalle del equipo:', e);
        alert('Error al cargar la información del equipo: ' + e.message);
    }
}

// ============================
// ADMIN: BÚSQUEDA POR CI
// ============================
async function buscarSocioAdmin() {
    const ci = limpiarCI(document.getElementById('admin-buscar-ci').value);
    if (!ci) return alert('Ingresá un CI');

    // Buscar en titulares primero
    let socio = null;
    let tipoSocio = null;
    
    const { data: titular } = await supabaseClient
        .from('titulares')
        .select('*')
        .eq('ci', ci)
        .maybeSingle();
    
    if (titular) {
        socio = titular;
        tipoSocio = 'titular';
    } else {
        // Buscar en cónyuges
        const { data: conyuge } = await supabaseClient
            .from('conyuges')
            .select('*, titular:titulares(*)')
            .eq('ci', ci)
            .maybeSingle();
        
        if (conyuge) {
            socio = conyuge;
            tipoSocio = 'conyuge';
        } else {
            // Buscar en hijos
            const { data: hijo } = await supabaseClient
                .from('hijos')
                .select('*')
                .eq('ci', ci)
                .maybeSingle();
            
            if (hijo) {
                socio = hijo;
                tipoSocio = 'hijo';
            }
        }
    }
    
    const resultado = document.getElementById('admin-busqueda-resultado');
    if (!socio) {
        resultado.style.display = 'none';
        alert('Socio no encontrado');
        return;
    }

    // Calcular edad desde fecha de nacimiento
    let edadTexto = 'N/A';
    let fechaNacTexto = 'N/A';
    if (socio.fecha_nacimiento) {
        const edad = calcularEdadDesdeFecha(socio.fecha_nacimiento);
        edadTexto = edad >= 0 ? edad + ' años' : 'N/A';
        fechaNacTexto = socio.fecha_nacimiento;
    }

    // Obtener familiares según el tipo
    let familiaHtml = '';
    let titularId = null;
    let conyugeHtml = '';
    
    if (tipoSocio === 'titular') {
        titularId = socio.id;
        
        // Obtener cónyuges
        const { data: conyuges } = await supabaseClient
            .from('conyuges')
            .select('*')
            .eq('titular_id', titularId);
        
        if (conyuges && conyuges.length) {
            conyuges.forEach(c => {
                let edadInfo = '';
                let fechaNacInfo = 'N/A';
                if (c.fecha_nacimiento) {
                    const edad = calcularEdadDesdeFecha(c.fecha_nacimiento);
                    edadInfo = edad >= 0 ? `${edad} años` : 'N/A';
                    fechaNacInfo = c.fecha_nacimiento;
                }
                
                let ciInfo = '';
                if (c.ci && c.ci !== '' && c.ci !== '0') {
                    ciInfo = `<span style="color: #10b981; font-weight: 600;">CI: ${c.ci}</span>`;
                }
                
                conyugeHtml += `
                    <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: white;">${c.nombre} ${c.apellido}</strong>
                                <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(Cónyuge adherente)</span>
                            </div>
                            <div style="color: var(--accent-color); font-weight: 500;">
                                ${edadInfo} ${ciInfo ? `| ${ciInfo}` : ''}
                            </div>
                        </div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                            Fecha Nacimiento: ${fechaNacInfo}
                        </div>
                    </div>
                `;
            });
        }
        
        // Obtener cónyuge titular (relación conyuge_relacion)
        const { data: conyugeRel } = await supabaseClient
            .from('conyuge_relacion')
            .select('*')
            .eq('titular1_id', titularId)
            .maybeSingle();
        
        if (conyugeRel) {
            // Obtener datos del cónyuge titular
            const { data: conyugeTitular } = await supabaseClient
                .from('titulares')
                .select('*')
                .eq('id', conyugeRel.titular2_id)
                .maybeSingle();
            
            if (conyugeTitular) {
                const c = conyugeTitular;
                let edadInfo = '';
                let fechaNacInfo = 'N/A';
                if (c.fecha_nacimiento) {
                    const edad = calcularEdadDesdeFecha(c.fecha_nacimiento);
                    edadInfo = edad >= 0 ? `${edad} años` : 'N/A';
                    fechaNacInfo = c.fecha_nacimiento;
                }
                
                conyugeHtml += `
                    <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: white;">${c.nombre} ${c.apellido}</strong>
                                <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(Cónyuge socio titular)</span>
                            </div>
                            <div style="color: var(--accent-color); font-weight: 500;">
                                ${edadInfo} <span style="color: #10b981; font-weight: 600;">| CI: ${c.ci}</span>
                            </div>
                        </div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                            Fecha Nacimiento: ${fechaNacInfo}
                        </div>
                    </div>
                `;
            }
        }
        
        // Si no hay cónyuge, mostrar "Sin cónyuge"
        if (!conyugeHtml) {
            conyugeHtml = '<div style="padding: 0.5rem; color: var(--text-muted); font-size: 13px;">Sin cónyuge</div>';
        }
        
        // Obtener hijos
        const { data: hijoRelaciones } = await supabaseClient
            .from('hijo_titular')
            .select('hijo:hijos(*)')
            .eq('titular_id', titularId);
        
        if (hijoRelaciones && hijoRelaciones.length) {
            hijoRelaciones.forEach(hr => {
                const h = hr.hijo;
                if (!h) return;
                
                let edadInfo = '';
                let fechaNacInfo = 'N/A';
                if (h.fecha_nacimiento) {
                    const edad = calcularEdadDesdeFecha(h.fecha_nacimiento);
                    edadInfo = edad >= 0 ? `${edad} años` : 'N/A';
                    fechaNacInfo = h.fecha_nacimiento;
                }
                
                let ciInfo = '';
                if (h.ci && h.ci !== '' && h.ci !== '0') {
                    ciInfo = `<span style="color: var(--text-muted); font-weight: 600;">| CI: ${h.ci}</span>`;
                }
                
                familiaHtml += `
                    <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: white;">${h.nombre} ${h.apellido}</strong>
                                <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(hijo)</span>
                            </div>
                            <div style="color: var(--accent-color); font-weight: 500;">
                                ${edadInfo} ${ciInfo}
                            </div>
                        </div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                            Fecha Nacimiento: ${fechaNacInfo}
                        </div>
                    </div>
                `;
            });
        }
        
    } else if (tipoSocio === 'conyuge') {
        // Mostrar titular del cónyuge
        if (socio.titular) {
            const t = socio.titular;
            let edadInfo = '';
            let fechaNacInfo = 'N/A';
            if (t.fecha_nacimiento) {
                const edad = calcularEdadDesdeFecha(t.fecha_nacimiento);
                edadInfo = edad >= 0 ? `${edad} años` : 'N/A';
                fechaNacInfo = t.fecha_nacimiento;
            }
            
            familiaHtml += `
                <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: white;">${t.nombre} ${t.apellido}</strong>
                            <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(titular)</span>
                        </div>
                        <div style="color: var(--accent-color); font-weight: 500;">
                            ${edadInfo} <span style="color: #10b981; font-weight: 600;">| CI: ${t.ci}</span>
                        </div>
                    </div>
                    <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                        Fecha Nacimiento: ${fechaNacInfo}
                    </div>
                </div>
            `;
            
            // Obtener hijos del titular
            titularId = t.id;
            const { data: hijoRelaciones } = await supabaseClient
                .from('hijo_titular')
                .select('hijo:hijos(*)')
                .eq('titular_id', titularId);
            
            if (hijoRelaciones && hijoRelaciones.length) {
                hijoRelaciones.forEach(hr => {
                    const h = hr.hijo;
                    if (!h) return;
                    
                    let edadInfo = '';
                    let fechaNacInfo = 'N/A';
                    if (h.fecha_nacimiento) {
                        const edad = calcularEdadDesdeFecha(h.fecha_nacimiento);
                        edadInfo = edad >= 0 ? `${edad} años` : 'N/A';
                        fechaNacInfo = h.fecha_nacimiento;
                    }
                    
                    let detalleExtra = '';
                    if (h.ci && h.ci !== '' && h.ci !== '0') {
                        detalleExtra = `<span style="color: var(--text-muted); font-weight: 600;"> | CI: ${h.ci}</span>`;
                    }
                    
                    familiaHtml += `
                        <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: white;">${h.nombre} ${h.apellido}</strong>
                                    <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(hijo)</span>
                                </div>
                                <div style="color: var(--accent-color); font-weight: 500;">
                                    ${edadInfo}${detalleExtra}
                                </div>
                            </div>
                            <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                                Fecha Nacimiento: ${fechaNacInfo}
                            </div>
                        </div>
                    `;
                });
            }
        }
    } else if (tipoSocio === 'hijo') {
        // Mostrar padres del hijo
        const { data: padreRelaciones } = await supabaseClient
            .from('hijo_titular')
            .select('titular:titulares(*)')
            .eq('hijo_id', socio.id);
        
        if (padreRelaciones && padreRelaciones.length) {
            padreRelaciones.forEach(pr => {
                const t = pr.titular;
                if (!t) return;
                
                let edadInfo = '';
                let fechaNacInfo = 'N/A';
                if (t.fecha_nacimiento) {
                    const edad = calcularEdadDesdeFecha(t.fecha_nacimiento);
                    edadInfo = edad >= 0 ? `${edad} años` : 'N/A';
                    fechaNacInfo = t.fecha_nacimiento;
                }
                
                familiaHtml += `
                    <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: white;">${t.nombre} ${t.apellido}</strong>
                                <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(padre titular)</span>
                            </div>
                            <div style="color: var(--accent-color); font-weight: 500;">
                                ${edadInfo} <span style="color: #10b981; font-weight: 600;">| CI: ${t.ci}</span>
                            </div>
                        </div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                            Fecha Nacimiento: ${fechaNacInfo}
                        </div>
                    </div>
                `;
            });
        }
    }

    if (!familiaHtml) {
        familiaHtml = '<span style="color: var(--text-muted);">Sin familiares registrados</span>';
    }

    // Obtener atletas inscritos si es titular
    let atletasHtml = '';
    if (tipoSocio === 'titular' && titularId) {
        const { data: atletas } = await supabaseClient
            .from('atletas')
            .select(`
                id, created_at, categoria_id,
                nombre_atleta, apellido_atleta, ci_atleta, fecha_nacimiento_atleta,
                equipo:equipo_id (id, nombre),
                categoria:categoria_id (nombre)
            `)
            .eq('socio_id', titularId);
        
        if (atletas && atletas.length) {
            atletas.forEach(a => {
                const fechaInscripcion = a.created_at ? new Date(a.created_at).toLocaleDateString() : 'N/A';
                const equipoNombre = a.equipo?.nombre || 'N/A';
                const categoriaNombre = a.categoria?.nombre || 'N/A';
                const atletaNombre = a.nombre_atleta || 'Desconocido';
                const atletaApellido = a.apellido_atleta || '';
                const atletaCi = a.ci_atleta || 'N/A';
                const atletaFechaNac = a.fecha_nacimiento_atleta || 'N/A';
                const atletaEdad = a.fecha_nacimiento_atleta ? calcularEdadDesdeFecha(a.fecha_nacimiento_atleta) + ' años' : 'N/A';
                
                atletasHtml += `
                    <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: white;">${atletaNombre} ${atletaApellido}</strong>
                                <span style="color: var(--text-muted); font-size: 13px; margin-left: 0.5rem;">(CI: ${atletaCi})</span>
                            </div>
                            <div style="color: var(--accent-color); font-weight: 500;">
                                ${atletaEdad}
                            </div>
                        </div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 0.25rem;">
                            Fecha Nacimiento: ${atletaFechaNac} | Equipo: ${equipoNombre} | Categoría: ${categoriaNombre} | Inscripto: ${fechaInscripcion}
                        </div>
                    </div>
                `;
            });
        } else {
            atletasHtml = '<span style="color: var(--text-muted);">Sin atletas inscritos</span>';
        }
    } else {
        atletasHtml = '<span style="color: var(--text-muted);">Solo disponible para titulares</span>';
    }

    document.getElementById('admin-busq-ci').textContent = socio.ci || 'N/A';
    document.getElementById('admin-busq-nombre').textContent = `${socio.nombre} ${socio.apellido}`.trim();
    document.getElementById('admin-busq-tipo').textContent = tipoSocio;
    document.getElementById('admin-busq-fecha-nac').textContent = fechaNacTexto;
    document.getElementById('admin-busq-edad').textContent = edadTexto;
    document.getElementById('admin-busq-equipo').textContent = 'N/A';
    document.getElementById('admin-busq-estado').textContent = socio.habilitado ? 'Habilitado' : 'Deshabilitado';
    document.getElementById('admin-busq-conyuge').innerHTML = conyugeHtml || '<span style="color: var(--text-muted);">Sin cónyuge</span>';
    document.getElementById('admin-busq-familia').innerHTML = familiaHtml;
    document.getElementById('admin-busq-atletas').innerHTML = atletasHtml;
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
    if (tab === 'publicidad') cargarPublicidadAdmin();
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
        document.getElementById('drawer-login').style.display = 'none';
        document.getElementById('drawer-logout').style.display = 'flex';

        document.getElementById('nav-veedor').style.display = 'none';
        document.getElementById('nav-caja').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';
        document.getElementById('drawer-veedor').style.display = 'none';
        document.getElementById('drawer-caja').style.display = 'none';
        document.getElementById('drawer-admin').style.display = 'none';

        if (userData.role === 'veedor') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('drawer-veedor').style.display = 'flex';
            showSection('veedor');
        } else if (userData.role === 'caja') {
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('drawer-caja').style.display = 'flex';
            showSection('caja');
        } else if (userData.role === 'admin') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('nav-admin').style.display = 'block';
            document.getElementById('drawer-veedor').style.display = 'flex';
            document.getElementById('drawer-caja').style.display = 'flex';
            document.getElementById('drawer-admin').style.display = 'flex';
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

function toggleMobileMenu() {
    var backdrop = document.getElementById('mobile-menu-backdrop');
    var drawer = document.getElementById('mobile-menu-drawer');
    if (!backdrop || !drawer) return;
    var isOpen = backdrop.classList.contains('open');
    backdrop.classList.toggle('open');
    drawer.classList.toggle('open');
    backdrop.style.display = isOpen ? 'none' : 'block';
    document.body.style.overflow = isOpen ? '' : 'hidden';
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
        document.getElementById('drawer-login').style.display = 'none';
        document.getElementById('drawer-logout').style.display = 'flex';

        document.getElementById('drawer-veedor').style.display = 'none';
        document.getElementById('drawer-caja').style.display = 'none';
        document.getElementById('drawer-admin').style.display = 'none';

        if (userRole === 'veedor') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('drawer-veedor').style.display = 'flex';
        } else if (userRole === 'caja') {
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('drawer-caja').style.display = 'flex';
        } else if (userRole === 'admin') {
            document.getElementById('nav-veedor').style.display = 'block';
            document.getElementById('nav-caja').style.display = 'block';
            document.getElementById('nav-admin').style.display = 'block';
            document.getElementById('drawer-veedor').style.display = 'flex';
            document.getElementById('drawer-caja').style.display = 'flex';
            document.getElementById('drawer-admin').style.display = 'flex';
        }
    } else {
        document.getElementById('nav-login').style.display = 'block';
        document.getElementById('drawer-login').style.display = 'flex';
    }
});

// --- Animated Grass Overlay ---
document.addEventListener('DOMContentLoaded', function() {
    var grassCanvas = document.createElement('canvas');
    grassCanvas.id = 'grass-canvas';
    grassCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-2;pointer-events:none;';
    document.body.insertBefore(grassCanvas, document.body.firstChild);

    var gctx = grassCanvas.getContext('2d');
    var blades = [];
    var gMouseX = -9999, gMouseY = -9999;
    var gW, gH;

    function resizeGrass() {
        gW = grassCanvas.width = window.innerWidth;
        gH = grassCanvas.height = window.innerHeight;
        initBlades();
    }

    function initBlades() {
        blades = [];
        var count = Math.min(1200, Math.max(200, Math.floor(gW * 0.6)));
        for (var i = 0; i < count; i++) {
            blades.push({
                x: Math.random() * gW,
                y: gH * 0.3 + Math.random() * gH * 0.7,
                h: 8 + Math.random() * 45,
                phase: Math.random() * Math.PI * 2,
                speed: 0.15 + Math.random() * 0.5,
                w: 0.8 + Math.random() * 3,
                hue: 90 + Math.random() * 55,
                sat: 25 + Math.random() * 40,
                lig: 20 + Math.random() * 32,
                alpha: 0.15 + Math.random() * 0.35,
                baseSway: 1.5 + Math.random() * 4
            });
        }
    }

    function drawGrass(time) {
        gctx.clearRect(0, 0, gW, gH);
        var t = time / 1000;
        for (var i = 0; i < blades.length; i++) {
            var b = blades[i];
            var wind = Math.sin(t * b.speed + b.phase) * b.baseSway;
            var dx = gMouseX - b.x;
            var dy = gMouseY - (b.y - b.h * 0.5);
            var dist = Math.sqrt(dx * dx + dy * dy);
            var mouseForce = Math.max(0, 1 - dist / 180) * 14;
            var totalSway = wind + mouseForce;
            gctx.beginPath();
            gctx.moveTo(b.x, b.y);
            gctx.quadraticCurveTo(b.x + totalSway * 0.3, b.y - b.h * 0.6, b.x + totalSway, b.y - b.h);
            gctx.strokeStyle = 'hsla(' + b.hue + ',' + b.sat + '%,' + b.lig + '%,' + b.alpha + ')';
            gctx.lineWidth = b.w;
            gctx.lineCap = 'round';
            gctx.stroke();
        }
    }

    function loopGrass(time) {
        drawGrass(time);
        requestAnimationFrame(loopGrass);
    }

    document.addEventListener('mousemove', function(e) {
        gMouseX = e.clientX;
        gMouseY = e.clientY;
    });

    window.addEventListener('resize', resizeGrass);
    resizeGrass();
    requestAnimationFrame(loopGrass);
});

// ============================
// TABLERO DE PROYECCIÓN 4K
// ============================

let tableroTimerInterval = null;
let tableroSeconds = 0;
let tableroIsRunning = false;
let tableroPeriod = 1;
let tableroScoreA = 0;
let tableroScoreB = 0;

// Cargar equipos en los selects del tablero
async function cargarEquiposTablero() {
    try {
        const selectA = document.getElementById('tablero-equipo-a');
        const selectB = document.getElementById('tablero-equipo-b');
        
        if (!selectA || !selectB) return;
        
        // Limpiar opciones existentes
        selectA.innerHTML = '<option value="">Seleccionar...</option>';
        selectB.innerHTML = '<option value="">Seleccionar...</option>';
        
        // Cargar equipos desde la base de datos con sus logos
        const { data: equipos, error } = await supabaseClient.from('equipos').select('*');
        
        if (error || !equipos) {
            console.error('Error al cargar equipos:', error);
            return;
        }
        
        equiposList = equipos;
        
        equipos.forEach(function(equipo) {
            const optionA = document.createElement('option');
            optionA.value = equipo.id;
            optionA.textContent = equipo.nombre;
            selectA.appendChild(optionA);
            
            const optionB = document.createElement('option');
            optionB.value = equipo.id;
            optionB.textContent = equipo.nombre;
            selectB.appendChild(optionB);
        });
        
        // Cargar categorías
        const selectCat = document.getElementById('tablero-categoria');
        if (selectCat) {
            selectCat.innerHTML = '<option value="">Seleccionar...</option>';
            categoriasConfig.forEach(function(cat) {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nombre;
                selectCat.appendChild(option);
            });
        }
    } catch (e) {
        console.error('Error al cargar equipos del tablero:', e);
    }
}

// Mejorar imagen PNG para resolución 4K
function mejorarImagenPara4K(dataUrl, callback) {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Dimensiones para ultra alta resolución (mínimo 1024x1024 para 4K)
        const targetSize = Math.max(1024, Math.max(img.width, img.height));
        canvas.width = targetSize;
        canvas.height = targetSize;
        
        // Habilitar suavizado de ultra alta calidad
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Dibujar imagen redimensionada con fondo transparente
        ctx.clearRect(0, 0, targetSize, targetSize);
        ctx.drawImage(img, 0, 0, targetSize, targetSize);
        
        // Convertir a DataURL de ultra alta calidad
        const improvedDataUrl = canvas.toDataURL('image/png', 1.0);
        callback(improvedDataUrl);
    };
    
    img.onerror = function() {
        console.error('Error al procesar imagen para 4K');
        callback(dataUrl); // Retornar original si falla
    };
    
    img.src = dataUrl;
}

// Cargar logo de un equipo en el tablero
function cargarLogoTablero(lado) {
    const select = document.getElementById('tablero-equipo-' + lado);
    const logoImg = document.getElementById('tablero-logo-' + lado);
    
    if (!select || !logoImg) return;
    
    const equipoId = select.value;
    const equipo = equiposList.find(function(e) { return String(e.id) === String(equipoId); });
    
    if (equipo) {
        // Obtener logo desde Supabase (campo logo_url)
        if (equipo.logo_url && equipo.logo_url.trim() !== '') {
            // Mejorar imagen para 4K
            mejorarImagenPara4K(equipo.logo_url, function(improvedLogo) {
                logoImg.src = improvedLogo;
                logoImg.style.display = 'block';
                logoImg.onerror = function() {
                    console.error('Error al cargar logo mejorado');
                    logoImg.style.display = 'none';
                };
            });
        } else {
            console.log('El equipo no tiene logo en Supabase');
            logoImg.style.display = 'none';
        }
    } else {
        logoImg.style.display = 'none';
    }
}

// Iniciar el tablero de proyección
function iniciarTablero() {
    alert('Por favor selecciona un partido en vivo de la lista');
}

// Iniciar tablero manualmente
function iniciarTableroManual() {
    const selectA = document.getElementById('tablero-equipo-a');
    const selectB = document.getElementById('tablero-equipo-b');
    const selectCat = document.getElementById('tablero-categoria');
    const proyeccion = document.getElementById('tablero-proyeccion');
    
    if (!selectA || !selectB) {
        alert('Error: No se encontraron los selects de equipos');
        return;
    }
    
    if (!selectA.value || !selectB.value) {
        alert('Por favor selecciona ambos equipos');
        return;
    }
    
    // Cargar logos
    cargarLogoTablero('a');
    cargarLogoTablero('b');
    
    // Mostrar categoría
    const categoria = categoriasConfig.find(function(c) { return String(c.id) === String(selectCat.value); });
    const catDisplay = document.getElementById('tablero-categoria-display');
    if (catDisplay) {
        catDisplay.textContent = categoria ? categoria.nombre : 'TORNEO';
    }
    
    // Mostrar tablero
    proyeccion.style.display = 'block';
    
    // Resetear valores
    tableroScoreA = 0;
    tableroScoreB = 0;
    tableroSeconds = 0;
    tableroPeriod = 1;
    tableroIsRunning = false;
    partidoActivoId = null;
    
    actualizarMarcadorTablero();
    actualizarTimerTablero();
}

// Cargar partidos en vivo para el tablero
async function cargarPartidosEnVivoTablero() {
    const container = document.getElementById('partidos-en-vivo-container');
    if (!container) return;
    
    container.innerHTML = '<p style="color: var(--text-muted);">Cargando partidos...</p>';
    
    const { data: partidos, error } = await supabaseClient
        .from('partidos')
        .select('*')
        .eq('en_curso', true)
        .order('fecha_hora', { ascending: true });
    
    if (error || !partidos || partidos.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No hay partidos en vivo</p>';
        document.getElementById('configuracion-manual').style.display = 'block';
        return;
    }
    
    document.getElementById('configuracion-manual').style.display = 'none';
    container.innerHTML = '';
    
    partidos.forEach(p => {
        const eqA = equiposList.find(e => String(e.id) === String(p.equipo_a_id));
        const eqB = equiposList.find(e => String(e.id) === String(p.equipo_b_id));
        const cat = categoriasConfig.find(c => String(c.id) === String(p.categoria_id));
        
        if (!eqA || !eqB || !cat) return;
        
        const card = document.createElement('div');
        card.style.cssText = 'background: linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(185,28,28,0.1) 100%); padding: 1rem; border-radius: 12px; border: 2px solid rgba(245,158,11,0.3); cursor: pointer; transition: all 0.3s;';
        card.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-size: 12px; font-weight: 700; color: var(--accent-color); background: rgba(245,158,11,0.2); padding: 2px 8px; border-radius: 4px;">▶ EN VIVO</span>
                <span style="font-size: 11px; color: var(--text-muted);">${escHtml(cat.nombre)}</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 700; color: #fff;">${escHtml(eqA.nombre)}</span>
                <span style="font-size: 18px; font-weight: 900; color: var(--accent-color);">${p.goles_a} - ${p.goles_b}</span>
                <span style="font-weight: 700; color: #fff;">${escHtml(eqB.nombre)}</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <span style="font-size: 14px; font-weight: 600; color: #fff;">${formatearTiempo(obtenerTiempoActual(p))}</span>
                <span style="font-size: 12px; color: var(--text-muted);">${obtenerPeriodoLabel(p)}</span>
            </div>
        `;
        
        card.onclick = function() {
            iniciarTableroDesdePartido(p);
        };
        
        card.onmouseover = function() {
            this.style.borderColor = 'rgba(245,158,11,0.8)';
            this.style.transform = 'translateY(-2px)';
        };
        
        card.onmouseout = function() {
            this.style.borderColor = 'rgba(245,158,11,0.3)';
            this.style.transform = 'translateY(0)';
        };
        
        container.appendChild(card);
    });
}

// Iniciar tablero desde un partido en vivo
async function iniciarTableroDesdePartido(partido) {
    const proyeccion = document.getElementById('tablero-proyeccion');
    const catDisplay = document.getElementById('tablero-categoria-display');
    
    const eqA = equiposList.find(e => String(e.id) === String(partido.equipo_a_id));
    const eqB = equiposList.find(e => String(e.id) === String(partido.equipo_b_id));
    const cat = categoriasConfig.find(c => String(c.id) === String(partido.categoria_id));
    
    if (!eqA || !eqB || !cat) {
        alert('Error: No se encontraron datos del partido');
        return;
    }
    
    // Configurar datos del partido
    partidoActivoId = partido.id;
    tableroScoreA = partido.goles_a || 0;
    tableroScoreB = partido.goles_b || 0;
    tableroSeconds = partido.tiempo_jugado || 0;
    tableroPeriod = partido.periodo === 'segundo_tiempo' ? 2 : 1;
    tableroIsRunning = partido.en_curso;
    
    // Detener cualquier timer local anterior
    tableroPausar();
    
    // Cargar logos
    const logoImgA = document.getElementById('tablero-logo-a');
    const logoImgB = document.getElementById('tablero-logo-b');
    
    if (eqA.logo_url && eqA.logo_url.trim() !== '') {
        mejorarImagenPara4K(eqA.logo_url, function(improvedLogo) {
            logoImgA.src = improvedLogo;
            logoImgA.style.display = 'block';
        });
    } else {
        logoImgA.style.display = 'none';
    }
    
    if (eqB.logo_url && eqB.logo_url.trim() !== '') {
        mejorarImagenPara4K(eqB.logo_url, function(improvedLogo) {
            logoImgB.src = improvedLogo;
            logoImgB.style.display = 'block';
        });
    } else {
        logoImgB.style.display = 'none';
    }
    
    // Mostrar categoría
    if (catDisplay) {
        catDisplay.textContent = cat.nombre;
    }
    
    // Mostrar tablero
    proyeccion.style.display = 'block';
    
    actualizarMarcadorTablero();
    actualizarTimerTablero();
    
    // NO iniciar timer local - el polling se encarga del tiempo
    // Solo para modo manual sin partido activo
    
    // Iniciar sincronización por polling (más confiable)
    iniciarSincronizacionTablero(partido.id);
    
    // Suscribirse a cambios en tiempo real del partido
    suscribirAPartido(partido.id);
}

// Sincronizar tablero por polling (método confiable)
function iniciarSincronizacionTablero(partidoId) {
    // Limpiar intervalo anterior si existe
    if (tableroSyncInterval) {
        clearInterval(tableroSyncInterval);
    }
    
    // Sincronizar cada 500ms para mayor precisión
    tableroSyncInterval = setInterval(async function() {
        if (!partidoActivoId) {
            clearInterval(tableroSyncInterval);
            tableroSyncInterval = null;
            return;
        }
        
        try {
            const { data: partido, error } = await supabaseClient
                .from('partidos')
                .select('*')
                .eq('id', partidoActivoId)
                .single();
            
            if (error || !partido) {
                console.error('Error al sincronizar partido:', error);
                return;
            }
            
            // Contar goles desde partido_eventos (más confiable)
            const { data: eventosGol, error: errorGol } = await supabaseClient
                .from('partido_eventos')
                .select('*')
                .eq('partido_id', partidoActivoId)
                .eq('tipo', 'gol');
            
            let golesA = 0;
            let golesB = 0;
            
            if (!errorGol && eventosGol) {
                golesA = eventosGol.filter(e => String(e.equipo_id) === String(partido.equipo_a_id)).length;
                golesB = eventosGol.filter(e => String(e.equipo_id) === String(partido.equipo_b_id)).length;
            }
            
            // Actualizar marcador con goles contados SOLO si hay cambio
            if (tableroScoreA !== golesA || tableroScoreB !== golesB) {
                tableroScoreA = golesA;
                tableroScoreB = golesB;
                actualizarMarcadorTablero();
            }
            
            // Calcular tiempo actual con validación
            let tiempoActual = Math.max(0, Number(partido.tiempo_jugado) || 0);
            if (partido.en_curso && partido.inicio_periodo) {
                const inicio = new Date(partido.inicio_periodo).getTime();
                if (!isNaN(inicio) && inicio > 0) {
                    tiempoActual += Math.max(0, Math.floor((Date.now() - inicio) / 1000));
                }
            }
            
            // Actualizar tiempo SIEMPRE para sincronización precisa
            if (tableroSeconds !== tiempoActual) {
                tableroSeconds = tiempoActual;
                actualizarTimerTablero();
            }
            
            // Actualizar período
            const nuevoPeriodo = partido.periodo === 'segundo_tiempo' ? 2 : 1;
            if (tableroPeriod !== nuevoPeriodo) {
                tableroPeriod = nuevoPeriodo;
                actualizarTimerTablero();
            }
            
            // Actualizar estado del timer (solo para control visual)
            tableroIsRunning = partido.en_curso;
            
            // Si el partido finalizó, detener sincronización
            if (partido.finalizado) {
                tableroPausar();
                clearInterval(tableroSyncInterval);
                tableroSyncInterval = null;
                if (partidoRealtimeChannel) {
                    supabaseClient.removeChannel(partidoRealtimeChannel);
                    partidoRealtimeChannel = null;
                }
                partidoActivoId = null;
            }
        } catch (e) {
            console.error('Error en sincronización:', e);
        }
    }, 500);
}

// Suscribirse a cambios en tiempo real del partido
let partidoRealtimeChannel = null;

function suscribirAPartido(partidoId) {
    if (partidoRealtimeChannel) {
        supabaseClient.removeChannel(partidoRealtimeChannel);
    }
    
    partidoRealtimeChannel = supabaseClient
        .channel('partido-' + partidoId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'partidos',
            filter: 'id=eq.' + partidoId
        }, function(payload) {
            const p = payload.new;
            if (!p) return;
            
            // Actualizar marcador
            tableroScoreA = p.goles_a || 0;
            tableroScoreB = p.goles_b || 0;
            actualizarMarcadorTablero();
            
            // Actualizar tiempo
            tableroSeconds = p.tiempo_jugado || 0;
            tableroPeriod = p.periodo === 'segundo_tiempo' ? 2 : 1;
            actualizarTimerTablero();
            
            // Controlar estado del timer
            if (p.en_curso && !tableroIsRunning) {
                tableroIniciar();
            } else if (!p.en_curso && tableroIsRunning) {
                tableroPausar();
            }
            
            // Si el partido finalizó, detener todo
            if (p.finalizado) {
                tableroPausar();
                if (partidoRealtimeChannel) {
                    supabaseClient.removeChannel(partidoRealtimeChannel);
                    partidoRealtimeChannel = null;
                }
            }
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'partido_eventos',
            filter: 'partido_id=eq.' + partidoId
        }, function(payload) {
            const ev = payload.new;
            if (ev && ev.tipo === 'gol') {
                // Recargar datos del partido para obtener goles actualizados
                supabaseClient.from('partidos').select('*').eq('id', partidoId).single().then(function({ data }) {
                    if (data) {
                        tableroScoreA = data.goles_a || 0;
                        tableroScoreB = data.goles_b || 0;
                        actualizarMarcadorTablero();
                    }
                });
            }
        })
        .subscribe();
}

// Iniciar cronómetro
function tableroIniciar() {
    if (tableroIsRunning) return;
    
    tableroIsRunning = true;
    const timerDisplay = document.getElementById('tablero-timer-display');
    if (timerDisplay) {
        timerDisplay.classList.add('timer-running');
    }
    
    // NO iniciar timer local - usar sincronización por polling
    // Solo para modo manual sin partido activo
    if (!partidoActivoId) {
        tableroTimerInterval = setInterval(function() {
            tableroSeconds++;
            actualizarTimerTablero();
        }, 1000);
    }
}

// Pausar cronómetro
function tableroPausar() {
    if (!tableroIsRunning) return;
    
    tableroIsRunning = false;
    clearInterval(tableroTimerInterval);
    
    const timerDisplay = document.getElementById('tablero-timer-display');
    if (timerDisplay) {
        timerDisplay.classList.remove('timer-running');
    }
}

// Reiniciar cronómetro
function tableroReset() {
    tableroPausar();
    tableroSeconds = 0;
    actualizarTimerTablero();
}

// Actualizar display del timer
function actualizarTimerTablero() {
    const minutes = Math.floor(tableroSeconds / 60);
    const seconds = tableroSeconds % 60;
    const timeStr = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    
    const timerDisplay = document.getElementById('tablero-timer-display');
    if (timerDisplay) {
        timerDisplay.textContent = timeStr;
    }
    
    // Actualizar período
    const periodDisplay = document.getElementById('tablero-period-display');
    if (periodDisplay) {
        periodDisplay.textContent = tableroPeriod + 'T';
    }
}

// Actualizar marcador
function actualizarMarcadorTablero() {
    const scoreA = document.getElementById('tablero-score-a');
    const scoreB = document.getElementById('tablero-score-b');
    
    if (scoreA) scoreA.textContent = tableroScoreA;
    if (scoreB) scoreB.textContent = tableroScoreB;
}

// Registrar gol
function tableroGol(equipo, delta) {
    // Solo permitir cambios manuales si NO hay partido activo sincronizado
    if (partidoActivoId) {
        alert('No se pueden modificar goles manualmente cuando hay un partido sincronizado. Usá el veedor para registrar goles.');
        return;
    }
    
    if (equipo === 'a') {
        tableroScoreA = Math.max(0, tableroScoreA + delta);
    } else {
        tableroScoreB = Math.max(0, tableroScoreB + delta);
    }
    
    actualizarMarcadorTablero();
    
    // Animación de gol
    const scoreElement = document.getElementById('tablero-score-' + equipo);
    if (scoreElement && delta > 0) {
        scoreElement.classList.remove('score-goal');
        void scoreElement.offsetWidth; // Trigger reflow
        scoreElement.classList.add('score-goal');
    }
}

// Cambiar período
function tableroCambiarPeriodo() {
    tableroPeriod = tableroPeriod === 1 ? 2 : 1;
    tableroReset();
    actualizarTimerTablero();
}

// Pantalla completa
function tableroFullscreen() {
    const proyeccion = document.getElementById('tablero-proyeccion');
    
    if (!proyeccion) return;
    
    if (!document.fullscreenElement) {
        proyeccion.requestFullscreen().catch(function(err) {
            console.error('Error al activar pantalla completa:', err);
            alert('No se pudo activar pantalla completa. Asegúrate de que el navegador lo permita.');
        });
    } else {
        document.exitFullscreen();
    }
}

// Escuchar cambios de pantalla completa
document.addEventListener('fullscreenchange', function() {
    const proyeccion = document.getElementById('tablero-proyeccion');
    if (proyeccion) {
        if (document.fullscreenElement) {
            proyeccion.style.borderRadius = '0';
        } else {
            proyeccion.style.borderRadius = '16px';
        }
    }
});

// Inicializar tablero al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    // Cargar equipos cuando se muestre la sección del tablero
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.target.id === 'tablero' && mutation.target.style.display !== 'none') {
                cargarEquiposTablero();
            }
        });
    });

// ============================
// PERFIL DE EQUIPO (MODAL)
// ============================
let perfilEquipoActivoId = null;

function abrirPerfilEquipo(equipoId) {
    if (!equipoId) return;
    const eq = equiposList.find(e => e.id === equipoId);
    if (!eq) return alert('Equipo no encontrado');

    perfilEquipoActivoId = equipoId;
    
    // Set Header
    document.getElementById('perfil-equipo-nombre').textContent = eq.nombre;
    const logoImg = document.getElementById('perfil-equipo-logo');
    if (logoImg) {
        logoImg.src = eq.logo_url || '';
        logoImg.style.display = eq.logo_url ? 'block' : 'none';
    }

    // Show Modal
    const modal = document.getElementById('modal-perfil-equipo');
    if (modal) {
        modal.style.display = 'flex';
        cambiarSeccionPerfil('jugadores'); // Default section
    }
    
    // Refresh Lucide icons
    if (window.lucide) lucide.createIcons();
}

function cerrarPerfilEquipo() {
    const modal = document.getElementById('modal-perfil-equipo');
    if (modal) modal.style.display = 'none';
    perfilEquipoActivoId = null;
}

function cambiarSeccionPerfil(seccion) {
    // Update Buttons
    document.querySelectorAll('.perfil-nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-perfil-${seccion === 'stats' ? 'stats' : seccion}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('perfil-content');
    if (!content) return;

    switch (seccion) {
        case 'jugadores':
            content.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Cargando jugadores...</div>';
            renderPerfilJugadores();
            break;
        case 'stats':
            content.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Cargando estadísticas...</div>';
            renderPerfilStats();
            break;
        case 'calendario':
            content.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Cargando calendario...</div>';
            renderPerfilCalendario();
            break;
        case 'resumen':
            content.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Cargando resumen...</div>';
            renderPerfilResumen();
            break;
    }
}

// Stubs for Parts 2-5
function renderPerfilJugadores() { 
    document.getElementById('perfil-content').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Sección de Jugadores (Parte 2)</div>';
}
function renderPerfilStats() { 
    document.getElementById('perfil-content').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Sección de Estadísticas (Parte 3)</div>';
}
function renderPerfilCalendario() { 
    document.getElementById('perfil-content').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Sección de Calendario (Parte 4)</div>';
}
function renderPerfilResumen() { 
    document.getElementById('perfil-content').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Sección de Resumen (Parte 5)</div>';
}
    
    const tableroSection = document.getElementById('tablero');
    if (tableroSection) {
        observer.observe(tableroSection, { attributes: true, attributeFilter: ['style'] });
    }
});
