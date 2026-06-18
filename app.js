// Configuración de Supabase (Reemplaza con tus credenciales)
const SUPABASE_URL = 'https://mrshoeaovukolclsvypy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yc2hvZWFvdnVrb2xjbHN2eXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODAwNDAsImV4cCI6MjA5NzM1NjA0MH0.2mTVIaRy3KBRrcIHSiL6FC6SBz3f_hiicFSjTIkkThI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cambiar entre secciones (Registro, Veedor, Caja)
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'caja') actualizarListaCobros();
}

// Mostrar/Ocultar campos de adherente
function toggleAdherente() {
    const tipo = document.getElementById('reg-tipo').value;
    const campoAdherente = document.getElementById('campo-adherente');
    campoAdherente.style.display = (tipo === 'aderente') ? 'block' : 'none';
}

// Simulación de búsqueda de jugador por CI para el Veedor
async function buscarJugador() {
    const ciInput = document.getElementById('veedor-ci').value;
    
    const { data: atleta, error } = await supabaseClient
        .from('atletas')
        .select('nombre, tipo')
        .eq('ci', ciInput)
        .single();

    if (atleta && !error) {
        document.getElementById('nombre-encontrado').innerText = `${atleta.nombre} (${atleta.tipo})`;
        document.getElementById('resultado-busqueda').style.display = 'block';
    } else {
        alert("Jugador no encontrado en la base de datos");
    }
}

// Función para cargar la falta en Supabase
async function cargarFalta() {
    const ci = document.getElementById('veedor-ci').value;
    const tipo = document.getElementById('tipo-falta').value;
    const monto = tipo === 'roja' ? 50000 : 20000; // Usar números para el monto

    // Obtener el nombre del jugador de la base de datos
    const { data: atleta, error: atletaError } = await supabaseClient
        .from('atletas')
        .select('nombre')
        .eq('ci', ci)
        .single();

    if (atletaError || !atleta) {
        alert("Error: No se pudo encontrar el nombre del jugador con CI: " + ci);
        return;
    }

    const nombreJugador = atleta.nombre;

    // Guardar la falta en la tabla 'faltas' de Supabase
    const { data, error } = await supabaseClient
        .from('faltas') // Asumiendo que tienes una tabla llamada 'faltas'
        .insert([
            { ci_jugador: ci, nombre_jugador: nombreJugador, tipo_falta: tipo, monto: monto, pagado: false }
        ]);

    if (error) {
        alert("Error al cargar la falta en Supabase: " + error.message);
    } else {
        alert("✅ Falta cargada en el sistema de caja (Supabase) correctamente");
        // Opcional: Recargar la lista de cobros en la sección de Caja
        // para que se muestre la nueva falta.
        // Por ahora, solo ocultamos el resultado de búsqueda.
    }
    
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
    faltas.forEach(f => {
        lista.innerHTML += `<tr>
            <td>${f.ci_jugador}</td>
            <td>${f.nombre_jugador}</td>
            <td>Tarjeta ${f.tipo_falta.toUpperCase()}</td>
            <td>${f.monto.toLocaleString()} GS.</td>
            <td><button onclick="cobrarFalta('${f.id}')" class="btn-guardar">Cobrar</button></td>
        </tr>`;
    });
}

// Función para marcar una falta como pagada
async function cobrarFalta(id) {
    const { error } = await supabaseClient
        .from('faltas')
        .update({ pagado: true })
        .eq('id', id);

    if (error) alert("Error al procesar cobro: " + error.message);
    else actualizarListaCobros();
}

// --- SISTEMA DE LOGIN Y ROLES ---
document.getElementById('form-login').addEventListener('submit', function(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value.toLowerCase();
    const pass = document.getElementById('login-pass').value;

    // Credenciales de prueba (Esto se validaría con la base de datos)
    if (pass === 'afemec123') {
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'block';
        document.getElementById('admin-fixture').style.display = 'block';
        document.getElementById('admin-db-tools').style.display = 'block';
        
        if (user === 'veedor') {
            document.getElementById('nav-veedor').style.display = 'block';
            showSection('veedor');
        } else if (user === 'caja') {
            document.getElementById('nav-caja').style.display = 'block';
            showSection('caja');
        }
        alert(`Bienvenido al Panel de ${user.toUpperCase()}`);
    } else {
        alert("Contraseña incorrecta. Intente con 'afemec123'");
    }
});

function logout() {
    location.reload(); // Forma rápida de limpiar el estado y cerrar sesión
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
    
    const nuevoAtleta = {
        ci: document.getElementById('reg-ci').value,
        nombre: document.getElementById('reg-nombre').value,
        edad: document.getElementById('reg-edad').value,
        tipo: document.getElementById('reg-tipo').value,
        parentesco: document.getElementById('reg-parentesco').value || "N/A"
    };

    // Guardar directamente en Supabase
    const { data, error } = await supabaseClient
        .from('atletas')
        .insert([nuevoAtleta]);

    if (error) {
        alert("Error al registrar: " + error.message);
    } else {
        alert("✅ Atleta registrado en Supabase correctamente");
        this.reset();
    }
});

// Función para exportar a Excel (CSV)
async function descargarExcelAtletas() {
    try {
        const { data: atletas, error } = await supabaseClient
            .from('atletas')
            .select('*')
            .order('created_at', { ascending: false });

        if (atletas.length === 0) return alert("No hay datos.");

        let csvContent = "data:text/csv;charset=utf-8,CI,Nombre,Edad,Tipo,Parentesco,Fecha\n";
        atletas.forEach(a => {
            const fechaFormateada = new Date(a.created_at).toLocaleDateString();
            csvContent += `${a.ci},${a.nombre},${a.edad},${a.tipo},${a.parentesco},${fechaFormateada}\n`;
        });

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
