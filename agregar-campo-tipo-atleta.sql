-- Agregar campo tipo_atleta a la tabla atletas
-- Valores posibles: 'titular', 'invitado', 'conyuge', 'hijo'
ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS tipo_atleta TEXT DEFAULT 'invitado';

-- Crear índice para mejorar consultas
CREATE INDEX IF NOT EXISTS idx_atletas_tipo ON public.atletas(tipo_atleta);
