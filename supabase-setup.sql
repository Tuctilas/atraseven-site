-- ============================================================
-- ATRA SEVEN · Setup do Supabase
-- Cole este script no SQL Editor do painel do Supabase e rode.
-- (Já aplicado no projeto lqhacfysttafhnqesxli em 26/06/2026.)
-- ============================================================

-- 1) Tabela de conteúdo editável do site (usada por js/store.js)
create table if not exists public.site_content (
  id          integer primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Linha única (id = 1) que o back-end faz upsert
insert into public.site_content (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- 2) Segurança: a API usa a SERVICE ROLE key (ignora RLS).
--    Mantemos RLS ligado e SEM políticas públicas, então o
--    conteúdo só é gravável pela API (service key), nunca pelo
--    navegador/anon key.
alter table public.site_content enable row level security;

-- 3) Bucket de Storage público para as fotos (site-photos).
--    O back-end usa getPublicUrl(), então o bucket precisa ser público.
insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', true)
on conflict (id) do nothing;

-- Pronto. Configure no Render as variáveis:
--   SUPABASE_URL          = https://SEU-PROJETO.supabase.co
--   SUPABASE_SERVICE_KEY  = (Settings > API > service_role key)
--   SUPABASE_BUCKET       = site-photos   (opcional; é o padrão)
