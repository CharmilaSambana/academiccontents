
CREATE POLICY "authenticated read materials files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materials');
CREATE POLICY "teacher uploads own materials files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_role(auth.uid(),'teacher'));
CREATE POLICY "teacher updates own materials files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "teacher deletes own materials files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text);
