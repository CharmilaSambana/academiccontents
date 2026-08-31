UPDATE public.subjects
SET code = upper(regexp_replace(left(name, 4), '[^a-zA-Z0-9]', '', 'g')) || '-' || regulation
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE public.subjects ALTER COLUMN code DROP DEFAULT;
ALTER TABLE public.subjects ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_code_not_blank CHECK (btrim(code) <> '');

CREATE POLICY "admin reads all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin reads all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin reads all events" ON public.material_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));