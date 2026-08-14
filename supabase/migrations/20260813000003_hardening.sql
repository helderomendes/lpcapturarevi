-- =============================================================================
-- Revi | Captura de leads em eventos
-- Migration 0003 — tirar as funcoes SECURITY DEFINER da API publica
--
-- Por que: o schema `public` e exposto pelo PostgREST, e o Supabase concede
-- EXECUTE em funcoes desse schema para `anon` e `authenticated` via default
-- privilege. O `revoke ... from public` da migration 0002 nao alcanca esses
-- grants. Na pratica, `vincular_usuario` ficava chamavel por /rest/v1/rpc:
-- qualquer usuario logado podia se promover a admin passando o proprio e-mail.
--
-- Correcao: as duas funcoes vao para o schema `private`, que nao e exposto.
-- Detectado pelo security advisor do Supabase (lints 0028 e 0029).
-- =============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- is_admin(): usada dentro das policies, entao `authenticated` precisa poder
-- executar. Fora do schema exposto, isso deixa de ser um endpoint REST.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and papel = 'admin' and ativo = true
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies apontando para a nova funcao, antes de derrubar a antiga.
-- ---------------------------------------------------------------------------
drop policy if exists app_users_select_self on public.app_users;
create policy app_users_select_self on public.app_users
  for select to authenticated
  using (id = auth.uid() or private.is_admin());

drop policy if exists eventos_admin_write on public.eventos;
create policy eventos_admin_write on public.eventos
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads
  for select to authenticated
  using (capturado_por = auth.uid() or private.is_admin());

drop policy if exists leads_update_own on public.leads;
create policy leads_update_own on public.leads
  for update to authenticated
  using (capturado_por = auth.uid() or private.is_admin())
  with check (capturado_por = auth.uid() or private.is_admin());

drop function if exists public.is_admin();

-- ---------------------------------------------------------------------------
-- vincular_usuario(): passo manual do admin, rodado no SQL Editor. Nunca pela
-- aplicacao — por isso sai da API e nao recebe grant para ninguem.
-- ---------------------------------------------------------------------------
create or replace function private.vincular_usuario(
  p_email            text,
  p_nome             text,
  p_hubspot_owner_id text,
  p_papel            papel_usuario default 'bdr'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);

  if v_uid is null then
    raise exception
      'Nenhum usuario em auth.users com o e-mail %. Crie primeiro em Authentication > Users.',
      p_email;
  end if;

  insert into public.app_users (id, nome, email, hubspot_owner_id, papel, ativo)
  values (v_uid, p_nome, lower(p_email), p_hubspot_owner_id, p_papel, true)
  on conflict (id) do update
    set nome             = excluded.nome,
        email            = excluded.email,
        hubspot_owner_id = excluded.hubspot_owner_id,
        papel            = excluded.papel,
        ativo            = true;

  return v_uid;
end;
$$;

revoke all on function private.vincular_usuario(text, text, text, papel_usuario) from public;
revoke all on function private.vincular_usuario(text, text, text, papel_usuario) from anon;
revoke all on function private.vincular_usuario(text, text, text, papel_usuario) from authenticated;

drop function if exists public.vincular_usuario(text, text, text, papel_usuario);
