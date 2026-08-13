-- =============================================================================
-- Revi | Captura de leads em eventos
-- Migration 0002 — helper de cadastro de usuario + seed (1 evento, 1 usuario)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vincular_usuario()
-- Passo que a equipe repete a cada BDR novo. O usuario e criado no painel do
-- Supabase (Authentication > Users > Add user, com e-mail e senha); esta funcao
-- so cria a linha em app_users que amarra o auth.uid ao HubSpot owner ID.
--
--   select public.vincular_usuario('bdr@userevi.com', 'Fulano', '85078031', 'bdr');
-- ---------------------------------------------------------------------------
create or replace function public.vincular_usuario(
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

revoke all on function public.vincular_usuario(text, text, text, papel_usuario) from public;

-- ---------------------------------------------------------------------------
-- Seed: evento de exemplo.
-- Troque/adicione eventos por aqui ou pelo Table Editor. Nunca por deploy.
-- ---------------------------------------------------------------------------
insert into public.eventos (nome, valor_detalhamento_origem, data_inicio, data_fim, ativo)
select 'Evento de Teste (seed)', 'Evento de Teste 2026', current_date, current_date + 2, true
where not exists (select 1 from public.eventos);

-- ---------------------------------------------------------------------------
-- Seed: usuario de teste.
-- Nao falha a migration se o usuario ainda nao existir em auth.users — apenas
-- avisa. Crie o usuario no painel e rode a chamada comentada abaixo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_email text := 'teste@userevi.com';
begin
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.vincular_usuario(v_email, 'BDR de Teste', '85038368', 'admin');
    raise notice 'Usuario de teste vinculado: %', v_email;
  else
    raise notice
      'Usuario % ainda nao existe em auth.users. Crie em Authentication > Users e rode: select public.vincular_usuario(%, ''BDR de Teste'', ''<owner_id>'', ''bdr'');',
      v_email, quote_literal(v_email);
  end if;
end $$;
