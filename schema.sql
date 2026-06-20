-- ==========================================
-- SCRIPT DE CREACIÓN DE TABLAS PARA SUPABASE
-- Proyecto: AFEMEC Deportes
-- ==========================================

-- 1. Tabla de Atletas (Inscripciones)
CREATE TABLE IF NOT EXISTS public.atletas (
    ci TEXT PRIMARY KEY,                          -- Cédula de Identidad (ej. "1.234.567" o "1234567")
    nombre TEXT NOT NULL,                         -- Nombre Completo
    edad INTEGER NOT NULL,                        -- Edad en años
    tipo TEXT NOT NULL CHECK (tipo IN ('socio', 'aderente')), -- Tipo de Miembro
    parentesco TEXT DEFAULT 'N/A',                -- Parentesco para adherentes
    categoria TEXT,                               -- Categoría por edad (ej. "Ejecutivo", "Señor", "Master")
    equipo TEXT,                                  -- Nombre de Equipo (ej. "PRESUPUESTO", "AFEMEC")
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL -- Fecha de creación
);

-- Habilitar acceso de lectura/escritura pública
ALTER TABLE public.atletas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a todos en atletas" ON public.atletas
    FOR ALL USING (true) WITH CHECK (true);


-- 2. Tabla de Faltas (Multas Disciplinarias)
CREATE TABLE IF NOT EXISTS public.faltas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID Único autogenerado
    ci_jugador TEXT NOT NULL,                     -- CI del Jugador sancionado
    nombre_jugador TEXT NOT NULL,                 -- Nombre del Jugador
    tipo_falta TEXT NOT NULL,                     -- 'amarilla', 'azul', 'roja'
    monto NUMERIC NOT NULL DEFAULT 20000,         -- Monto de la multa (ej: 20000 o 50000)
    pagado BOOLEAN DEFAULT false NOT NULL,        -- Estado de pago (true = cobrado)
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL -- Fecha de registro
);

-- Habilitar acceso de lectura/escritura pública
ALTER TABLE public.faltas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a todos en faltas" ON public.faltas
    FOR ALL USING (true) WITH CHECK (true);


-- 3. Tabla de Usuarios (Soporte de Roles y Login)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,                -- Nombre de usuario (veedor, caja, admin)
    password_hash TEXT NOT NULL,                  -- Contraseña en texto plano para desarrollo
    role TEXT NOT NULL CHECK (role IN ('veedor', 'caja', 'admin')), -- Rol asignado
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilitar acceso de lectura/escritura pública
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a todos en users" ON public.users
    FOR ALL USING (true) WITH CHECK (true);


-- 4. Tabla de Equipos
CREATE TABLE IF NOT EXISTS public.equipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT UNIQUE NOT NULL,                  -- Nombre del Equipo (ej. "PRESUPUESTO")
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilitar acceso de lectura/escritura pública
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a todos en equipos" ON public.equipos
    FOR ALL USING (true) WITH CHECK (true);


-- 5. Tabla de Configuración de Edades por Categoría
CREATE TABLE IF NOT EXISTS public.categorias_config (
    categoria TEXT PRIMARY KEY,                   -- 'ejecutivo', 'senor', 'master'
    edad_min INTEGER NOT NULL,                    -- Edad mínima para la categoría
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilitar acceso de lectura/escritura pública
ALTER TABLE public.categorias_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a todos en categorias_config" ON public.categorias_config
    FOR ALL USING (true) WITH CHECK (true);


-- ==========================================
-- DATOS INICIALES DE PRUEBA (CONFIGURACIÓN)
-- ==========================================

-- Usuarios iniciales
INSERT INTO public.users (username, password_hash, role)
VALUES 
    ('veedor', 'afemec123', 'veedor'),
    ('caja', 'afemec123', 'caja'),
    ('admin', 'afemec123', 'admin')
ON CONFLICT (username) 
DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;

-- Configuración de edades iniciales
INSERT INTO public.categorias_config (categoria, edad_min)
VALUES 
    ('ejecutivo', 30),
    ('senor', 40),
    ('master', 50)
ON CONFLICT (categoria) 
DO UPDATE SET edad_min = EXCLUDED.edad_min;

-- Equipos iniciales
INSERT INTO public.equipos (nombre)
VALUES 
    ('PRESUPUESTO'),
    ('AFEMEC')
ON CONFLICT (nombre) DO NOTHING;
