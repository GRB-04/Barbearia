-- 1. Adicionar coluna avatar_url na tabela barber_profiles
ALTER TABLE public.barber_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Criar o bucket storage 'avatars' caso nao exista
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Limpar políticas se já existirem e recriar
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
CREATE POLICY "Public Read Avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload Avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
CREATE POLICY "Authenticated Update Avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Delete Avatars" ON storage.objects;
CREATE POLICY "Authenticated Delete Avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');
