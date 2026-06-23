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
