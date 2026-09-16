-- 1. profiles extra fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS student_id text,
  ADD COLUMN IF NOT EXISTS faculty_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.profiles p SET email = u.email
FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

-- 2. regulations
CREATE TABLE IF NOT EXISTS public.regulations (
  code text PRIMARY KEY,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regulations TO authenticated;
GRANT ALL ON public.regulations TO service_role;
ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "regulations readable by authenticated" ON public.regulations;
CREATE POLICY "regulations readable by authenticated" ON public.regulations
  FOR SELECT TO authenticated USING (true);
INSERT INTO public.regulations (code, label) VALUES
  ('R25','Regulation 2025'),('R24','Regulation 2024'),
  ('R23','Regulation 2023'),('R22','Regulation 2022')
ON CONFLICT (code) DO NOTHING;

-- 3. materials description
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS description text;

-- 4. material_events denormalised columns
ALTER TABLE public.material_events
  ADD COLUMN IF NOT EXISTS faculty_id uuid,
  ADD COLUMN IF NOT EXISTS subject_id uuid,
  ADD COLUMN IF NOT EXISTS regulation text;

UPDATE public.material_events e
SET faculty_id = m.teacher_id, subject_id = m.subject_id, regulation = m.regulation
FROM public.materials m
WHERE m.id = e.material_id AND e.faculty_id IS NULL;

-- 5. audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin reads audit logs" ON public.audit_logs;
CREATE POLICY "admin reads audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. edit requests
CREATE TABLE IF NOT EXISTS public.edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.edit_requests TO authenticated;
GRANT UPDATE ON public.edit_requests TO authenticated;
GRANT ALL ON public.edit_requests TO service_role;
ALTER TABLE public.edit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own edit requests readable" ON public.edit_requests;
CREATE POLICY "own edit requests readable" ON public.edit_requests
  FOR SELECT TO authenticated USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "own edit requests insert" ON public.edit_requests;
CREATE POLICY "own edit requests insert" ON public.edit_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id AND status = 'pending');
DROP POLICY IF EXISTS "admin reads edit requests" ON public.edit_requests;
CREATE POLICY "admin reads edit requests" ON public.edit_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin updates edit requests" ON public.edit_requests;
CREATE POLICY "admin updates edit requests" ON public.edit_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. signup trigger: role is never user-selectable
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE assigned public.app_role := 'student';
BEGIN
  INSERT INTO public.profiles (id, full_name, email, department, student_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'department',''),
    NULLIF(NEW.raw_user_meta_data->>'student_id','')
  )
  ON CONFLICT (id) DO NOTHING;

  IF lower(COALESCE(NEW.email,'')) = 'matalajahnavi@gmail.com' THEN
    assigned := 'admin';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- bootstrap admin if the account already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE lower(email) = 'matalajahnavi@gmail.com'
ON CONFLICT DO NOTHING;

-- 8. admin-only role / status mutations with audit trail
CREATE OR REPLACE FUNCTION public.admin_set_role(_target uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can change roles';
  END IF;
  IF _target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;
  SELECT role::text INTO prev FROM public.user_roles WHERE user_id = _target LIMIT 1;
  DELETE FROM public.user_roles WHERE user_id = _target;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target, _role);
  INSERT INTO public.audit_logs (admin_id, target_user_id, action, previous_value, new_value)
  VALUES (auth.uid(), _target, 'role_change', prev, _role::text);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_status(_target uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can change account status';
  END IF;
  IF _status NOT IN ('active','disabled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF _target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot disable your own account';
  END IF;
  SELECT status INTO prev FROM public.profiles WHERE id = _target;
  UPDATE public.profiles SET status = _status WHERE id = _target;
  INSERT INTO public.audit_logs (admin_id, target_user_id, action, previous_value, new_value)
  VALUES (auth.uid(), _target, 'status_change', prev, _status);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_edit_request(_request uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.edit_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can review requests';
  END IF;
  SELECT * INTO r FROM public.edit_requests WHERE id = _request AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF _approve THEN
    IF r.field = 'regulation' THEN
      UPDATE public.profiles SET regulation = r.requested_value WHERE id = r.student_id;
    ELSIF r.field = 'department' THEN
      UPDATE public.profiles SET department = r.requested_value WHERE id = r.student_id;
    ELSIF r.field = 'student_id' THEN
      UPDATE public.profiles SET student_id = r.requested_value WHERE id = r.student_id;
    ELSIF r.field = 'full_name' THEN
      UPDATE public.profiles SET full_name = r.requested_value WHERE id = r.student_id;
    END IF;
  END IF;

  UPDATE public.edit_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _request;

  INSERT INTO public.audit_logs (admin_id, target_user_id, action, previous_value, new_value)
  VALUES (auth.uid(), r.student_id,
          'edit_request_' || CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
          r.field || ': ' || COALESCE(r.current_value,''), r.requested_value);
END; $$;

REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_edit_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_edit_request(uuid, boolean) TO authenticated;

-- 9. helper: is the caller an active account?
CREATE OR REPLACE FUNCTION public.is_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT status = 'active' FROM public.profiles WHERE id = _user_id), false)
$$;
REVOKE ALL ON FUNCTION public.is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_regulation()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT regulation FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_regulation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_regulation() TO authenticated;

-- 10. scoped read policies
DROP POLICY IF EXISTS "subjects readable by authenticated" ON public.subjects;
CREATE POLICY "subjects readable by role" ON public.subjects
  FOR SELECT TO authenticated USING (
    public.is_active(auth.uid()) AND (
      public.has_role(auth.uid(), 'admin')
      OR teacher_id = auth.uid()
      OR regulation = public.my_regulation()
    )
  );

DROP POLICY IF EXISTS "materials readable by authenticated" ON public.materials;
CREATE POLICY "materials readable by role" ON public.materials
  FOR SELECT TO authenticated USING (
    public.is_active(auth.uid()) AND (
      public.has_role(auth.uid(), 'admin')
      OR teacher_id = auth.uid()
      OR regulation = public.my_regulation()
    )
  );

DROP POLICY IF EXISTS "admin manages materials" ON public.materials;
CREATE POLICY "admin manages materials" ON public.materials
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manages subjects" ON public.subjects;
CREATE POLICY "admin manages subjects" ON public.subjects
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "student inserts own events" ON public.material_events;
CREATE POLICY "student inserts own events" ON public.material_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id AND public.is_active(auth.uid()));
