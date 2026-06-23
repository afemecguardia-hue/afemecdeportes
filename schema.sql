-- ==========================================
-- SCRIPT DE CREACIÓN DE TABLAS PARA SUPABASE
-- Proyecto: AFEMEC Deportes
-- Versión: 3.0 - Gestión de Socios y Atletas
-- ==========================================

-- 1. Tabla de Socios (titulares, cónyuges e hijos)
CREATE TABLE IF NOT EXISTS public.socios (
    id SERIAL PRIMARY KEY,
    ci TEXT DEFAULT '',
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL CHECK (tipo IN ('titular', 'conyuge', 'hijo')),
    familia_id INTEGER REFERENCES public.socios(id),
    habilitado BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en socios" ON public.socios;
CREATE POLICY "Permitir todo a todos en socios" ON public.socios
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabla de Padres del Titular
CREATE TABLE IF NOT EXISTS public.padres_titular (
    id SERIAL PRIMARY KEY,
    titular_id INTEGER NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL DEFAULT '',
    ci TEXT DEFAULT '',
    tipo TEXT NOT NULL CHECK (tipo IN ('padre', 'madre')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.padres_titular ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en padres_titular" ON public.padres_titular;
CREATE POLICY "Permitir todo a todos en padres_titular" ON public.padres_titular
    FOR ALL USING (true) WITH CHECK (true);

-- 3. Tabla de Equipos
CREATE TABLE IF NOT EXISTS public.equipos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en equipos" ON public.equipos;
CREATE POLICY "Permitir todo a todos en equipos" ON public.equipos
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Tabla de Inscripción de Atletas (vincula socio + equipo)
CREATE TABLE IF NOT EXISTS public.atletas (
    id SERIAL PRIMARY KEY,
    socio_id INTEGER NOT NULL REFERENCES public.socios(id),
    equipo_id INTEGER NOT NULL REFERENCES public.equipos(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(socio_id, equipo_id)
);

ALTER TABLE public.atletas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en atletas" ON public.atletas;
CREATE POLICY "Permitir todo a todos en atletas" ON public.atletas
    FOR ALL USING (true) WITH CHECK (true);

-- 5. Tabla de Faltas (Multas Disciplinarias)
CREATE TABLE IF NOT EXISTS public.faltas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ci_jugador TEXT NOT NULL,
    nombre_jugador TEXT NOT NULL,
    tipo_falta TEXT NOT NULL,
    monto NUMERIC NOT NULL DEFAULT 20000,
    pagado BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.faltas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en faltas" ON public.faltas;
CREATE POLICY "Permitir todo a todos en faltas" ON public.faltas
    FOR ALL USING (true) WITH CHECK (true);

-- 6. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('veedor', 'caja', 'admin')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en users" ON public.users;
CREATE POLICY "Permitir todo a todos en users" ON public.users
    FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- DATOS INICIALES
-- ==========================================
INSERT INTO public.users (username, password_hash, role)
VALUES 
    ('veedor', '64f4dc20b9216cc602771ee195f9486da0db3dd3b402be04af583d7eec23d940', 'veedor'),
    ('caja', '64f4dc20b9216cc602771ee195f9486da0db3dd3b402be04af583d7eec23d940', 'caja'),
    ('admin', '64f4dc20b9216cc602771ee195f9486da0db3dd3b402be04af583d7eec23d940', 'admin')
ON CONFLICT (username) 
DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;

-- Equipos iniciales
INSERT INTO public.equipos (nombre) VALUES
    ('Halcones'),
    ('Dep. AFEMEC'),
    ('Fénix FC'),
    ('Titanes'),
    ('Libertadores'),
    ('Guaraní')
ON CONFLICT (nombre) DO NOTHING;

-- ==========================================
-- ACTUALIZACIONES Y NUEVAS TABLAS (VERSIÓN 4.0)
-- ==========================================

-- 7. Modificaciones a tablas existentes
-- Permitir tipo 'adherente' en socios
ALTER TABLE public.socios DROP CONSTRAINT IF EXISTS socios_tipo_check;
ALTER TABLE public.socios ADD CONSTRAINT socios_tipo_check CHECK (tipo IN ('titular', 'conyuge', 'hijo', 'adherente'));

-- Añadir edad y categoria a socios
ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS edad INTEGER DEFAULT 0;
ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT '';

-- Añadir logo_url a equipos
ALTER TABLE public.equipos ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';

-- 8. Tabla de Configuración de Categorías
CREATE TABLE IF NOT EXISTS public.categorias_config (
    id SERIAL PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    edad_min INTEGER NOT NULL DEFAULT 0,
    edad_max INTEGER NOT NULL DEFAULT 99,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.categorias_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en categorias_config" ON public.categorias_config;
CREATE POLICY "Permitir todo a todos en categorias_config" ON public.categorias_config
    FOR ALL USING (true) WITH CHECK (true);

-- Categorías por defecto
INSERT INTO public.categorias_config (nombre, edad_min, edad_max) VALUES
    ('Libre', 0, 29),
    ('Señor', 30, 39),
    ('Master', 40, 99)
ON CONFLICT (nombre) DO NOTHING;

-- 9. Tabla de Canchas
CREATE TABLE IF NOT EXISTS public.canchas (
    id SERIAL PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.canchas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en canchas" ON public.canchas;
CREATE POLICY "Permitir todo a todos en canchas" ON public.canchas
    FOR ALL USING (true) WITH CHECK (true);

-- Canchas por defecto
INSERT INTO public.canchas (nombre) VALUES
    ('Cancha 1'),
    ('Cancha 2')
ON CONFLICT (nombre) DO NOTHING;

-- 10. Tabla de Partidos
CREATE TABLE IF NOT EXISTS public.partidos (
    id SERIAL PRIMARY KEY,
    equipo_a_id UUID NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
    equipo_b_id UUID NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
    fecha_hora TIMESTAMPTZ NOT NULL,
    cancha_id INTEGER NOT NULL REFERENCES public.canchas(id) ON DELETE CASCADE,
    goles_a INTEGER DEFAULT 0,
    goles_b INTEGER DEFAULT 0,
    finalizado BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.partidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo a todos en partidos" ON public.partidos;
CREATE POLICY "Permitir todo a todos en partidos" ON public.partidos
    FOR ALL USING (true) WITH CHECK (true);

