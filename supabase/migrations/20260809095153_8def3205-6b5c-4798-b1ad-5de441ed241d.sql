-- 1) Restrict profiles SELECT
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;

CREATE POLICY "own profile readable"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "teacher profiles readable"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(id, 'teacher'::app_role));

-- 2) Restrict materials storage reads
DROP POLICY IF EXISTS "authenticated read materials files" ON storage.objects;

CREATE POLICY "materials readable by owner or matching student"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'materials'
  AND EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.file_path = storage.objects.name
      AND (
        m.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.regulation = m.regulation
        )
      )
  )
);

-- 3) Lock down the signup trigger helper
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;