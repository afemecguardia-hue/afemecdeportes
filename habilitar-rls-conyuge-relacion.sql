-- Habilitar RLS para conyuge_relacion
ALTER TABLE public.conyuge_relacion ENABLE ROW LEVEL SECURITY;

-- Permitir a usuarios autenticados ver todas las relaciones (ajustar según necesidad)
CREATE POLICY "Usuarios autenticados pueden ver conyuge_relacion"
    ON public.conyuge_relacion FOR SELECT
    TO authenticated
    USING (true);

-- Permitir a usuarios autenticados insertar/actualizar conyuge_relacion
CREATE POLICY "Usuarios autenticados pueden gestionar conyuge_relacion"
    ON public.conyuge_relacion FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
