const SUPABASE_URL = 'https://mrshoeaovukolclsvypy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yc2hvZWFvdnVrb2xjbHN2eXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODAwNDAsImV4cCI6MjA5NzM1NjA0MH0.2mTVIaRy3KBRrcIHSiL6FC6SBz3f_hiicFSjTIkkThI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado de la aplicación
let atletaEncontrado = null;
let configEdades = { ejecutivo: 30, senor: 40, master: 50 };
let listaEquipos = [];

// Normalización de la CI para evitar inconsistencias
function normalizarCI(ci) {
    if (!ci) return '';
    return ci.replace(/[\s.,-]/g, '').trim();
}

// Cambiar entre secciones (Registro, Veedor, Caja, Estadísticas, Programación)
function showSection(id) {
    // Ocultar todas las secciones
    document.querySelectorAll('main > section').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });

    // Mostrar la sección seleccionada con clase active
    const targetSection = document.getElementById(id);
    if (targetSection) {
        targetSection.style.display = 'block';
        setTimeout(() => {
            targetSection.classList.add('active');
        }, 10);
    }

    // Actualizar botones de navegación
    document.querySelectorAll('.main-nav .nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Asignar active al botón correspondiente
    const activeBtn = document.getElementById(`btn-${id}`) || document.getElementById(`nav-${id}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    if (id === 'caja') {
        actualizarListaCobros();
    }
    if (id === 'admin') {
        cargarDatosAdmin();
    }

    // Renderizar iconos de Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Mostrar/Ocultar campos de adherente
function toggleAdherente() {
    const tipo = document.getElementById('reg-tipo').value;
    const campoAdherente = document.getElementById('campo-adherente');
    campoAdherente.style.display = (tipo === 'aderente') ? 'block' : 'none';
}

// Simulación de búsqueda de jugador por CI para el Veedor
async function buscarJugador() {
    const ciInput = normalizarCI(document.getElementById('veedor-ci').value);

    if (!ciInput) {
        alert("Por favor, ingrese un número de CI.");
        return;
    }

    const { data: atleta, error } = await supabaseClient
        .from('atletas')
        .select('ci, nombre, tipo')
        .eq('ci', ciInput)
        .single();

    if (atleta && !error) {
        atletaEncontrado = atleta;
        document.getElementById('nombre-encontrado').innerText = `${atleta.nombre} (${atleta.tipo})`;
        document.getElementById('resultado-busqueda').style.display = 'block';
    } else {
        atletaEncontrado = null;
        alert("Jugador no encontrado en la base de datos");
    }
}

// Función para cargar la falta en Supabase
async function cargarFalta() {
    if (!atletaEncontrado) {
        alert("Error: Primero debe buscar y encontrar al atleta.");
        return;
    }

    const radioOpt = document.querySelector('input[name="falta-opt"]:checked');
    const tipo = radioOpt ? radioOpt.value : 'amarilla';
    const monto = tipo === 'roja' ? 50000 : 20000;

    const ci = atletaEncontrado.ci;
    const nombreJugador = atletaEncontrado.nombre;

    // Guardar la falta en la tabla 'faltas' de Supabase
    const { data, error } = await supabaseClient
        .from('faltas')
        .insert([
            { ci_jugador: ci, nombre_jugador: nombreJugador, tipo_falta: tipo, monto: monto, pagado: false }
        ]);

    if (error) {
        alert("Error al cargar la falta en Supabase: " + error.message);
    } else {
        alert("✅ Falta cargada en el sistema de caja (Supabase) correctamente");
    }

    atletaEncontrado = null;
    document.getElementById('resultado-busqueda').style.display = 'none';
    document.getElementById('veedor-ci').value = ''; // Limpia el campo de CI
}

// Función para cargar las faltas pendientes en la sección de Caja
async function actualizarListaCobros() {
    const lista = document.getElementById('lista-cobros');
    lista.innerHTML = "<tr><td colspan='5'>Cargando deudas...</td></tr>";

    const { data: faltas, error } = await supabaseClient
        .from('faltas')
        .select('*')
        .eq('pagado', false);

    if (error) return alert("Error al cargar faltas: " + error.message);

    lista.innerHTML = "";
    if (!faltas || faltas.length === 0) {
        lista.innerHTML = "<tr><td colspan='5' style='text-align: center; color: var(--text-muted);'>No hay deudas pendientes</td></tr>";
    } else {
        faltas.forEach(f => {
            lista.innerHTML += `<tr>
                <td><strong>${f.ci_jugador}</strong></td>
                <td>${f.nombre_jugador}</td>
                <td><span class="badge badge-${f.tipo_falta}">Tarjeta ${f.tipo_falta.toUpperCase()}</span></td>
                <td class="monto-col">${Number(f.monto).toLocaleString()} GS.</td>
                <td><button onclick="cobrarFalta('${f.id}')" class="btn-action">Cobrar</button></td>
            </tr>`;
        });
    }

    // Calcular el total recaudado hoy (faltas marcadas como pagadas)
    try {
        const { data: pagadas, error: errorPagadas } = await supabaseClient
            .from('faltas')
            .select('monto')
            .eq('pagado', true);

        let totalHoy = 0;
        if (!errorPagadas && pagadas) {
            totalHoy = pagadas.reduce((sum, f) => sum + (Number(f.monto) || 0), 0);
        }
        document.getElementById('total-hoy').innerText = `${totalHoy.toLocaleString()} GS.`;
    } catch (e) {
        console.error("Error al calcular total hoy:", e);
    }
}

// Función para marcar una falta como pagada
async function cobrarFalta(id) {
    const { error } = await supabaseClient
        .from('faltas')
        .update({ pagado: true })
        .eq('id', id);

    if (error) {
        alert("Error al procesar cobro: " + error.message);
    } else {
        actualizarListaCobros();
    }
}

// --- SISTEMA DE LOGIN Y ROLES ---
document.getElementById('form-login').addEventListener('submit', async function(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value.toLowerCase().trim();
    const pass = document.getElementById('login-pass').value;

    let userData = null;
    let fallback = false;

    try {
        // Consultar la tabla 'users' en Supabase
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', user)
            .single();

        if (error || !data) {
            fallback = true;
        } else {
            userData = data;
        }
    } catch (err) {
        fallback = true;
    }

    // Fallback con credenciales locales si no existe la tabla de usuarios en Supabase o falla
    if (fallback) {
        const localUsers = {
            'veedor': { role: 'veedor', username: 'veedor', pass: 'afemec123' },
            'caja': { role: 'caja', username: 'caja', pass: 'afemec123' },
            'admin': { role: 'admin', username: 'admin', pass: 'afemec123' }
        };

        const localUser = localUsers[user];
        if (localUser && localUser.pass === pass) {
            userData = {
                role: localUser.role,
                username: localUser.username
            };
        }
    } else {
        // Si encontramos el usuario en Supabase, validamos su password
        const passwordMatch = userData.password_hash === pass || userData.password === pass;
        if (!passwordMatch) {
            userData = null;
        }
    }

    if (userData) {
        // Guardar el rol en localStorage para mantener la sesión
        localStorage.setItem('userRole', userData.role);
        localStorage.setItem('username', userData.username);

        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'block';

        // Ocultar primero todos los menús especiales
        document.getElementById('nav-veedor').style.display = 'none';
        document.getElementById('nav-caja').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';
        document.getElementById('admin-fixture').style.display = 'none';
        document.getElementById('admin-db-tools').style.display = 'none';

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
            document.getElementById('admin-fixture').style.display = 'block';
            document.getElementById('admin-db-tools').style.display = 'block';
            showSection('estadisticas');
        }
        alert(`Bienvenido al Panel de ${userData.role.toUpperCase()}`);
        document.getElementById('form-login').reset();
    } else {
        alert("Usuario o contraseña incorrectos.");
    }
});

function logout() {
    localStorage.removeItem('userRole'); // Limpiar el rol guardado
    localStorage.removeItem('username'); // Limpiar el nombre de usuario
    location.reload(); // Recargar la página para restablecer la UI
}

// --- GENERACIÓN DE PROGRAMACIÓN (FIXTURE) ---
function generarFixtureAutomatico() {
    const equipos = ["Halcones", "Dep. AFEMEC", "Fénix FC", "Titanes", "Libertadores", "Guaraní"];
    const contenedor = document.getElementById('calendario-juegos');
    contenedor.innerHTML = "<h3>Fixture Generado Temporada 2024</h3>";

    // Simulación de emparejamiento Round Robin
    for(let i=0; i < equipos.length; i+=2) {
        contenedor.innerHTML += `
            <div class="partido-card">
                <span class="hora">21:00</span>
                <span class="enfrentamiento">${equipos[i]} vs ${equipos[i+1]}</span>
                <span class="cancha">Cancha Social AFEMEC</span>
            </div>`;
    }
}

// Manejo del formulario de registro
document.getElementById('form-registro').addEventListener('submit', async function(e) {
    e.preventDefault();

    const tipo = document.getElementById('reg-tipo').value;
    const edad = parseInt(document.getElementById('reg-edad').value, 10);
    const categoria = calcularCategoria(edad);
    const equipo = document.getElementById('reg-equipo').value;

    if (!equipo) {
        alert("Por favor, seleccione un equipo.");
        return;
    }

    const nuevoAtleta = {
        ci: normalizarCI(document.getElementById('reg-ci').value),
        nombre: document.getElementById('reg-nombre').value.trim(),
        edad: edad,
        categoria: categoria,
        equipo: equipo,
        tipo: tipo,
        parentesco: tipo === 'aderente' ? document.getElementById('reg-parentesco').value : "N/A"
    };

    // Guardar directamente en Supabase
    const { data, error } = await supabaseClient
        .from('atletas')
        .insert([nuevoAtleta]);

    if (error) {
        console.error("Detalle del error de Supabase:", error);
        alert("Error al registrar: " + error.message);
    } else {
        alert("✅ Atleta registrado en Supabase correctamente");
        this.reset();
        document.getElementById('reg-categoria').value = '';
    }
});

// Función para exportar a Excel (CSV)
async function descargarExcelAtletas() {
    try {
        const { data: atletas, error } = await supabaseClient
            .from('atletas')
            .select('*')
            .order('created_at', { ascending: false });

        if (!atletas || atletas.length === 0) return alert("No hay datos.");

        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '""';
            let str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        let csvLines = ["CI,Nombre,Edad,Categoria,Equipo,Tipo,Parentesco,Fecha"];
        atletas.forEach(a => {
            const fechaFormateada = new Date(a.created_at).toLocaleDateString();
            const row = [
                escapeCSV(a.ci),
                escapeCSV(a.nombre),
                escapeCSV(a.edad),
                escapeCSV(a.categoria),
                escapeCSV(a.equipo),
                escapeCSV(a.tipo),
                escapeCSV(a.parentesco),
                escapeCSV(fechaFormateada)
            ];
            csvLines.push(row.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + csvLines.join('\n');

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "atletas_afemec.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        alert("Error al descargar los datos");
    }
}

// Función para simular la descarga de la app móvil/escritorio con un prompt interactivo
function descargarApp() {
    const confirmar = confirm("¿Deseas descargar la aplicación oficial de AFEMEC Deportes para tu dispositivo?");
    if (confirmar) {
        alert("¡Iniciando la descarga de AFEMEC Deportes! Si la descarga no inicia automáticamente, por favor verifica los permisos de tu navegador.");
        
        // Descarga de archivo de texto mock con instrucciones
        const link = document.createElement("a");
        link.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent("Instrucciones para instalar AFEMEC Deportes:\n1. Si estás en Android, instala el archivo APK adjunto.\n2. Si estás en PC, abre index.html desde la carpeta principal para ejecutar la aplicación offline.\n3. Disfruta de la gestión del torneo."));
        link.setAttribute("download", "Instalacion_AFEMEC_Deportes.txt");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// --- Inicialización al cargar la página ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar datos dinámicos de equipos y edades
    inicializarDatos();

    // Mostrar la sección de registro por defecto
    showSection('registro');

    // Verificar si hay una sesión activa (rol guardado)
    const userRole = localStorage.getItem('userRole');
    if (userRole) {
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'block';

        // Limpiar menús antes de activar
        document.getElementById('nav-veedor').style.display = 'none';
        document.getElementById('nav-caja').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';

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
            document.getElementById('admin-fixture').style.display = 'block';
            document.getElementById('admin-db-tools').style.display = 'block';
            showSection('estadisticas');
        }
    } else {
        // Si no hay sesión, asegurar que solo se vea el login o registro
        document.getElementById('nav-login').style.display = 'block';
        showSection('registro'); // O 'login' si quieres que el login sea la primera pantalla
    }
});

// --- FUNCIONES PARA GESTIÓN DE EQUIPOS Y CATEGORÍAS POR EDAD ---

// Cargar configuraciones de edades y equipos al iniciar la página
async function inicializarDatos() {
    await cargarConfigEdades();
    await cargarEquipos();
    configurarEventosEdad();
    configurarEventosAdmin();
}

// Cargar configuración de edades de Supabase
async function cargarConfigEdades() {
    try {
        const { data, error } = await supabaseClient
            .from('categorias_config')
            .select('*');
        
        if (!error && data && data.length > 0) {
            data.forEach(item => {
                if (item.categoria === 'ejecutivo') configEdades.ejecutivo = Number(item.edad_min);
                if (item.categoria === 'senor') configEdades.senor = Number(item.edad_min);
                if (item.categoria === 'master') configEdades.master = Number(item.edad_min);
            });
        }
    } catch (e) {
        console.warn("Fallo al cargar config de edades, usando valores por defecto:", e);
    }
}

// Cargar equipos de Supabase
async function cargarEquipos() {
    try {
        const { data, error } = await supabaseClient
            .from('equipos')
            .select('*')
            .order('nombre', { ascending: true });
        
        if (!error && data) {
            listaEquipos = data;
            actualizarSelectEquipos();
        }
    } catch (e) {
        console.warn("Fallo al cargar equipos:", e);
    }
}

// Actualizar el select desplegable en el formulario de inscripción
function actualizarSelectEquipos() {
    const select = document.getElementById('reg-equipo');
    if (!select) return;
    
    select.innerHTML = '<option value="">Seleccione un Equipo</option>';
    if (listaEquipos.length === 0) {
        select.innerHTML = '<option value="">No hay equipos registrados</option>';
    } else {
        listaEquipos.forEach(eq => {
            select.innerHTML += `<option value="${eq.nombre}">${eq.nombre}</option>`;
        });
    }
}

// Calcular la categoría basada en la edad y la configuración cargada
function calcularCategoria(edad) {
    if (isNaN(edad) || edad <= 0) return '';
    if (edad >= configEdades.master) return 'Master';
    if (edad >= configEdades.senor) return 'Señor';
    if (edad >= configEdades.ejecutivo) return 'Ejecutivo';
    return 'Libre / Menor';
}

// Configurar los listeners en tiempo real para el campo de edad
function configurarEventosEdad() {
    const edadInput = document.getElementById('reg-edad');
    const catInput = document.getElementById('reg-categoria');
    
    if (edadInput && catInput) {
        const actualizarCat = () => {
            const edad = parseInt(edadInput.value, 10);
            catInput.value = calcularCategoria(edad);
        };
        edadInput.addEventListener('input', actualizarCat);
        edadInput.addEventListener('change', actualizarCat);
    }
}

// Carga los datos del panel de administración
async function cargarDatosAdmin() {
    // 1. Mostrar las edades configuradas en los inputs
    document.getElementById('cfg-edad-ejecutivo').value = configEdades.ejecutivo;
    document.getElementById('cfg-edad-senor').value = configEdades.senor;
    document.getElementById('cfg-edad-master').value = configEdades.master;

    // 2. Cargar y mostrar lista de equipos en la tabla de admin
    await renderizarEquiposAdmin();
}

// Renderizar la tabla de equipos en administración
async function renderizarEquiposAdmin() {
    const tbody = document.getElementById('lista-equipos-admin');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="2" class="table-loading"><i data-lucide="loader-2" class="spin"></i> Cargando equipos...</td></tr>';
    
    const { data: equipos, error } = await supabaseClient
        .from('equipos')
        .select('*')
        .order('nombre', { ascending: true });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="2" style="color: var(--danger-color); text-align: center;">Error al cargar equipos: ${error.message}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    if (!equipos || equipos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">No hay equipos registrados</td></tr>';
    } else {
        equipos.forEach(eq => {
            tbody.innerHTML += `<tr>
                <td><strong>${eq.nombre}</strong></td>
                <td style="text-align: right;"><button onclick="eliminarEquipo('${eq.id}', '${eq.nombre}')" class="btn-action" style="background-color: var(--danger-color); color: white;">Eliminar</button></td>
            </tr>`;
        });
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Configurar los formularios del panel de administración
function configurarEventosAdmin() {
    // Guardar límites de edades
    const formEdades = document.getElementById('form-config-edades');
    if (formEdades) {
        formEdades.addEventListener('submit', async function(e) {
            e.preventDefault();
            const ejecutivo = parseInt(document.getElementById('cfg-edad-ejecutivo').value, 10);
            const senor = parseInt(document.getElementById('cfg-edad-senor').value, 10);
            const master = parseInt(document.getElementById('cfg-edad-master').value, 10);
            
            // Validaciones lógicas básicas
            if (ejecutivo >= senor || senor >= master) {
                alert("⚠️ Validación de límites: Ejecutivo debe ser menor que Señor, y Señor menor que Master.");
                return;
            }
            
            // Guardar en Supabase cada categoría
            const categorias = [
                { categoria: 'ejecutivo', edad_min: ejecutivo },
                { categoria: 'senor', edad_min: senor },
                { categoria: 'master', edad_min: master }
            ];
            
            let exito = true;
            for (const cat of categorias) {
                const { error } = await supabaseClient
                    .from('categorias_config')
                    .upsert([cat]);
                if (error) {
                    console.error("Error al guardar categoría:", cat.categoria, error);
                    exito = false;
                }
            }
            
            if (exito) {
                configEdades.ejecutivo = ejecutivo;
                configEdades.senor = senor;
                configEdades.master = master;
                alert("✅ Configuración de edades guardada correctamente");
                
                // Actualizar la categoría en el formulario de inscripción en caso de estar editando
                const edadInput = document.getElementById('reg-edad');
                const catInput = document.getElementById('reg-categoria');
                if (edadInput && catInput && edadInput.value) {
                    catInput.value = calcularCategoria(parseInt(edadInput.value, 10));
                }
            } else {
                alert("Hubo un error al guardar la configuración de algunas categorías.");
            }
        });
    }
    
    // Agregar equipo
    const formAgregarEquipo = document.getElementById('form-agregar-equipo');
    if (formAgregarEquipo) {
        formAgregarEquipo.addEventListener('submit', async function(e) {
            e.preventDefault();
            const input = document.getElementById('new-team-name');
            const nombre = input.value.trim().toUpperCase();
            
            if (!nombre) return;
            
            const { data, error } = await supabaseClient
                .from('equipos')
                .insert([{ nombre: nombre }]);
                
            if (error) {
                alert("Error al agregar equipo: " + error.message);
            } else {
                alert(`✅ Equipo "${nombre}" agregado correctamente`);
                input.value = '';
                await renderizarEquiposAdmin();
                await cargarEquipos(); // Recargar el dropdown de registro
            }
        });
    }
}

// Eliminar equipo
async function eliminarEquipo(id, nombre) {
    if (!confirm(`¿Estás seguro de que deseas eliminar el equipo "${nombre}"?`)) return;
    
    const { error } = await supabaseClient
        .from('equipos')
        .delete()
        .eq('id', id);
        
    if (error) {
        alert("Error al eliminar equipo: " + error.message);
    } else {
        alert(`✅ Equipo "${nombre}" eliminado`);
        await renderizarEquiposAdmin();
        await cargarEquipos(); // Recargar el dropdown de registro
    }
}
