-- Nuevo schema con tablas separadas para manejar hijos con múltiples padres

-- Tabla de titulares
CREATE TABLE IF NOT EXISTS public.titulares (
    id SERIAL PRIMARY KEY,
    ci TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL DEFAULT '',
    fecha_nacimiento DATE,
    habilitado BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Tabla de cónyuges (vinculados a titulares)
CREATE TABLE IF NOT EXISTS public.conyuges (
    id SERIAL PRIMARY KEY,
    ci TEXT UNIQUE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL DEFAULT '',
    fecha_nacimiento DATE,
    titular_id INTEGER REFERENCES public.titulares(id) ON DELETE CASCADE,
    habilitado BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Tabla de hijos (pueden tener múltiples padres titulares)
CREATE TABLE IF NOT EXISTS public.hijos (
    id SERIAL PRIMARY KEY,
    ci TEXT UNIQUE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL DEFAULT '',
    fecha_nacimiento DATE,
    habilitado BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Tabla de relaciones entre hijos y titulares (permite múltiples padres por hijo)
CREATE TABLE IF NOT EXISTS public.hijo_titular (
    id SERIAL PRIMARY KEY,
    hijo_id INTEGER REFERENCES public.hijos(id) ON DELETE CASCADE,
    titular_id INTEGER REFERENCES public.titulares(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(hijo_id, titular_id)
);

-- Tabla de relaciones entre cónyuges (para cuando ambos son titulares y están casados)
CREATE TABLE IF NOT EXISTS public.conyuge_relacion (
    id SERIAL PRIMARY KEY,
    titular1_id INTEGER REFERENCES public.titulares(id) ON DELETE CASCADE,
    titular2_id INTEGER REFERENCES public.titulares(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(titular1_id, titular2_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_conyuges_titular ON public.conyuges(titular_id);
CREATE INDEX IF NOT EXISTS idx_hijo_titular_hijo ON public.hijo_titular(hijo_id);
CREATE INDEX IF NOT EXISTS idx_hijo_titular_titular ON public.hijo_titular(titular_id);
CREATE INDEX IF NOT EXISTS idx_conyuge_relacion_t1 ON public.conyuge_relacion(titular1_id);
CREATE INDEX IF NOT EXISTS idx_conyuge_relacion_t2 ON public.conyuge_relacion(titular2_id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.titulares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conyuges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hijos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hijo_titular ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conyuge_relacion ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir acceso público
CREATE POLICY "Public access titulares" ON public.titulares FOR ALL USING (true);
CREATE POLICY "Public access conyuges" ON public.conyuges FOR ALL USING (true);
CREATE POLICY "Public access hijos" ON public.hijos FOR ALL USING (true);
CREATE POLICY "Public access hijo_titular" ON public.hijo_titular FOR ALL USING (true);
CREATE POLICY "Public access conyuge_relacion" ON public.conyuge_relacion FOR ALL USING (true);
