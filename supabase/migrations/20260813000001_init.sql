-- =============================================================================
-- Revi | Captura de leads em eventos
-- Migration 0001 — tabelas, enums, indices e RLS
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type papel_usuario as enum ('bdr', 'closer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type temperatura_lead as enum ('quente', 'morno', 'frio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_sync_lead as enum ('pendente', 'enviado', 'erro', 'duplicado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type resolucao_duplicado_lead as enum ('anexar_nota', 'criar_assim_mesmo');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- app_users
-- Mapeia o auth.uid do Supabase para o HubSpot owner ID.
-- E esse mapeamento que faz o lead nascer atribuido a quem captou, sem o BDR
-- precisar selecionar nada na tela.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id                uuid primary key references auth.users (id) on delete cascade,
  nome              text        not null,
  email             text        not null unique,
  hubspot_owner_id  text        not null,
  papel             papel_usuario not null default 'bdr',
  ativo             boolean     not null default true,
  criado_em         timestamptz not null default now()
);

comment on column public.app_users.hubspot_owner_id is
  'HubSpot owner ID (numerico, como texto). Vira hubspot_owner_id e bdr_responsavel no negocio.';

-- ---------------------------------------------------------------------------
-- eventos
-- O evento e sempre parametro de configuracao. Cadastrar uma feira nova nunca
-- pode exigir alteracao de codigo ou deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.eventos (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null,
  -- String exata que vai para a property `detalhamento_de_origem` do HubSpot.
  valor_detalhamento_origem text not null,
  -- Sobrescreve HUBSPOT_VALOR_CANAL para este evento. Normalmente fica nulo.
  valor_canal               text,
  -- Link de agendamento round-robin especifico do evento. Se nulo, o app usa
  -- VITE_LINK_AGENDAMENTO_ROUND_ROBIN.
  link_agendamento          text,
  data_inicio               date not null,
  data_fim                  date not null,
  ativo                     boolean not null default true,
  criado_em                 timestamptz not null default now(),
  constraint eventos_periodo_valido check (data_fim >= data_inicio)
);

create index if not exists eventos_ativo_idx on public.eventos (ativo, data_inicio desc);

-- ---------------------------------------------------------------------------
-- leads
-- O `id` e um UUID gerado no dispositivo e usado como chave de idempotencia:
-- se a fila offline reenviar a mesma requisicao, o backend reconhece pelo id e
-- nao duplica nada no HubSpot.
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                    uuid primary key,
  evento_id             uuid not null references public.eventos (id),
  capturado_por         uuid not null references public.app_users (id),

  -- obrigatorios
  nome                  text not null,
  telefone              text not null,
  email                 text not null,
  empresa               text not null,

  -- opcionais
  cargo                 text,
  site                  text,
  instagram             text,

  -- Valor exato do enum `plataforma_de_e_commerce_utilizada` do HubSpot.
  plataforma_ecommerce  text,
  -- Texto livre quando o BDR escolhe "Outra". Nao vai para o enum (o HubSpot
  -- rejeitaria), vai para a nota do negocio.
  plataforma_outra      text,
  temperatura           temperatura_lead,
  observacoes           text,

  consentimento_lgpd    boolean not null default false,
  consentimento_em      timestamptz,

  agendou_reuniao       boolean not null default false,

  status_sync           status_sync_lead not null default 'pendente',
  erro_sync             text,
  tentativas_sync       integer not null default 0,
  resolucao_duplicado   resolucao_duplicado_lead,
  -- Dono atual do contato quando o e-mail ja existe no HubSpot. Serve para a
  -- tela mostrar "esse contato ja existe (dono: X)".
  duplicado_owner_nome  text,

  hubspot_contact_id    text,
  hubspot_company_id    text,
  hubspot_deal_id       text,
  -- Guardado para que um retry nao crie uma segunda nota quando o negocio ja
  -- subiu mas a nota falhou.
  hubspot_note_id       text,

  -- Hora local do dispositivo no momento da captura.
  criado_em             timestamptz not null default now(),
  sincronizado_em       timestamptz,
  atualizado_em         timestamptz not null default now(),

  constraint leads_consentimento_datado
    check (consentimento_lgpd = false or consentimento_em is not null)
);

create index if not exists leads_capturado_por_idx on public.leads (capturado_por, criado_em desc);
create index if not exists leads_evento_idx        on public.leads (evento_id, criado_em desc);
create index if not exists leads_status_idx        on public.leads (status_sync);

create or replace function public.touch_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists leads_touch_atualizado_em on public.leads;
create trigger leads_touch_atualizado_em
  before update on public.leads
  for each row execute function public.touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- Helper de papel. SECURITY DEFINER para nao cair em recursao de RLS quando as
-- policies de app_users consultarem a propria tabela.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
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

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.eventos   enable row level security;
alter table public.leads     enable row level security;

-- app_users: cada um le o proprio registro; admin le todos.
-- Nao existe policy de insert/update/delete: usuarios sao criados manualmente
-- no painel do Supabase, nunca pela aplicacao.
drop policy if exists app_users_select_self on public.app_users;
create policy app_users_select_self on public.app_users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- eventos: leitura para todos os autenticados.
drop policy if exists eventos_select_all on public.eventos;
create policy eventos_select_all on public.eventos
  for select to authenticated
  using (true);

drop policy if exists eventos_admin_write on public.eventos;
create policy eventos_admin_write on public.eventos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- leads: o BDR so le e escreve os leads que ele mesmo capturou. Admin le tudo.
drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads
  for select to authenticated
  using (capturado_por = auth.uid() or public.is_admin());

drop policy if exists leads_insert_own on public.leads;
create policy leads_insert_own on public.leads
  for insert to authenticated
  with check (capturado_por = auth.uid());

drop policy if exists leads_update_own on public.leads;
create policy leads_update_own on public.leads
  for update to authenticated
  using (capturado_por = auth.uid() or public.is_admin())
  with check (capturado_por = auth.uid() or public.is_admin());

-- Sem policy de delete: lead capturado nunca some.
