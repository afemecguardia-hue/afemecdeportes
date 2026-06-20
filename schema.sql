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
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL -- Fecha de creación
);

-- Habilitar acceso de lectura/escritura pública (opcional para pruebas sin RLS restrictivo)
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
-- Habilitar acceso (ADVERTENCIA: Para producción se debe usar Supabase Auth y restringir esta tabla)
-- En desarrollo rápido se habilita RLS con política permisiva, pero en producción se debe eliminar esta política.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Solo lectura para usuarios autenticados" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir todo a todos en users" ON public.users
    FOR ALL USING (true) WITH CHECK (true);


-- ==========================================
-- DATOS INICIALES DE PRUEBA (USUARIOS DE ACCESO)
-- ==========================================

INSERT INTO public.users (username, password_hash, role)
VALUES 
    ('veedor', 'afemec123', 'veedor'),
    ('caja', 'afemec123', 'caja'),
    ('admin', 'afemec123', 'admin')
ON CONFLICT (username) 
DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;
