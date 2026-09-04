-- =============================================================================
-- Revi | Captura de leads em eventos
-- Migration 0004 — link de reuniao por pessoa
--
-- Por que: a escala de agendamento deixou de ser so por feira. Cada BDR tem a
-- propria agenda no HubSpot, e a reuniao marcada no estande precisa cair na
-- agenda de quem conversou com o visitante.
--
-- Precedencia na aplicacao:
--   app_users.link_agendamento  ->  eventos.link_agendamento
--                               ->  VITE_LINK_AGENDAMENTO_ROUND_ROBIN
--
-- Escrita em `app_users` continua SEM policy, de proposito: todo update passa
-- pela Edge Function `admin-usuarios`, que roda com service role, confere
-- `papel = 'admin'` e protege o ultimo admin ativo. Um update de `papel`
-- liberado na API publica seria escalonamento de privilegio.
-- =============================================================================

alter table public.app_users
  add column if not exists link_agendamento text;

comment on column public.app_users.link_agendamento is
  'Link de agendamento da pessoa (HubSpot Meetings, Calendly). Vence o link do evento. Nulo = cai no link do evento e, na falta dele, no padrao do .env.';
