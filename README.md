# Revi | Captura de Leads em Eventos

PWA interna da Revi para captação de leads em feiras, summits e jantares. Opera em
tablet ou celular, no estande, e substitui o processo de fotografar o crachá para
cadastrar no HubSpot depois.

**Regra de ouro do projeto: confiabilidade > funcionalidade.** Todo lead é gravado no
IndexedDB antes de qualquer coisa, e nada é apagado automaticamente. A internet de
evento cai; o app não pode cair junto.

A ferramenta é reutilizável em todos os eventos: **o evento é um registro na tabela
`eventos`, nunca uma constante no código.** Cadastrar uma feira nova não exige deploy.

---

## 1. Stack

| Camada | Escolha |
| --- | --- |
| Front | React 18 + Vite + TypeScript + Tailwind |
| Fila local | IndexedDB via Dexie (nunca localStorage) |
| Auth / DB | Supabase (e-mail + senha, Postgres com RLS) |
| Integração | HubSpot API v3/v4, só de dentro da Edge Function |
| Deploy | Vercel |
| PWA | manifest + service worker (Workbox), instalável e offline |

**Restrição de segurança:** o token do HubSpot nunca aparece no bundle do front. Toda
escrita no HubSpot passa pela Edge Function `sync-lead`, que valida o JWT do Supabase
antes de agir. O front conhece apenas `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

Verificação automatizada disso:

```bash
npm run build && npm run check:bundle
```

---

## 2. Setup local

```bash
git clone <repo> && cd lpcapturarevi
npm install
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
```

O service worker está habilitado também em `dev`, então dá para testar o
comportamento offline sem precisar buildar.

Outros comandos:

```bash
npm run build          # typecheck + build de produção
npm run typecheck      # só o TypeScript
npm run check:bundle   # confere que nenhum segredo vazou para dist/
node scripts/gerar-icones.mjs   # regenera os ícones do PWA
```

---

## 3. Banco de dados

As migrations estão em `supabase/migrations/`. Aplique com a CLI do Supabase:

```bash
supabase link --project-ref <ref-do-projeto>
supabase db push
```

Ou cole o conteúdo dos dois arquivos, em ordem, no SQL Editor do painel.

O que elas criam:

- `app_users` — mapeia `auth.uid` → HubSpot owner ID. É esse mapeamento que faz o lead
  nascer atribuído a quem captou, sem o BDR selecionar nada.
- `eventos` — nome, `valor_detalhamento_origem`, datas, link de agendamento opcional.
- `leads` — o registro completo, com `id` gerado no dispositivo (chave de idempotência).
- **RLS**: o BDR só lê e escreve os leads que ele mesmo capturou; `admin` lê tudo;
  `eventos` é leitura para todos os autenticados. Não existe policy de `delete`.

### Sessão de 30 dias

No painel: **Authentication → Sessions**. Deixe *Time-box user sessions* vazio (ou ≥ 30
dias) e o *Refresh token reuse interval* no padrão. O BDR loga uma vez em casa e não é
deslogado durante o evento.

Não há tela de cadastro público, e o login é por senha de propósito: magic link exige
rede **e** acesso ao inbox, os dois indisponíveis num corredor de feira.

---

## 4. Como criar um usuário

1. Painel do Supabase → **Authentication → Users → Add user**. Informe e-mail e senha,
   e marque *Auto Confirm User*.
2. Descubra o HubSpot owner ID da pessoa (ver §7).
3. No SQL Editor:

```sql
select public.vincular_usuario(
  'bdr@userevi.com',   -- e-mail, igual ao criado no passo 1
  'Nome do BDR',
  '85078031',          -- HubSpot owner ID
  'bdr'                -- bdr | closer | admin
);
```

Rodar de novo com o mesmo e-mail atualiza o registro — serve para corrigir um owner ID
errado sem apagar nada.

---

## 5. Como cadastrar um novo evento

**Este é o passo que a equipe repete a cada feira.** Não exige deploy nem alteração de
código.

```sql
insert into public.eventos
  (nome, valor_detalhamento_origem, data_inicio, data_fim, link_agendamento, ativo)
values
  ('Magazord Summit 2026',   -- aparece no seletor do app
   'Magazord Summit 2026',   -- string EXATA que vai para `detalhamento_de_origem`
   '2026-08-20',
   '2026-08-21',
   null,                     -- link round-robin do evento; null usa o do .env
   true);
```

Depois é só desativar o evento anterior:

```sql
update public.eventos set ativo = false where nome = 'Evento antigo';
```

O app cacheia o último evento usado por usuário: ao abrir, ele já vem selecionado.

Colunas opcionais:

- `valor_canal` — sobrescreve o canal padrão (`Eventos`) só para este evento.
- `link_agendamento` — link de reuniões round-robin específico da feira. Útil porque
  cada evento costuma ter uma escala de closers diferente.

---

## 6. Edge Function `sync-lead`

### Deploy

```bash
supabase functions deploy sync-lead
supabase secrets set --env-file supabase/.env.local
```

O `supabase/.env.local` (não versionado) carrega os segredos listados na seção
**EDGE FUNCTION** do `.env.example`. No mínimo, `HUBSPOT_TOKEN`.

### O que ela faz, nesta ordem

1. Valida o JWT do Supabase. Sem token válido, **401** antes de qualquer chamada ao HubSpot.
2. Grava/atualiza o lead no Postgres, forçando `capturado_por` = usuário da sessão
   (nunca o que veio no corpo da requisição).
3. Busca duplicata de contato por e-mail. Se existir, **não sobrescreve nada e não rouba
   a propriedade do registro** — devolve `duplicado` com o nome do dono atual, e o BDR
   decide na tela: anexar nota ao existente ou criar mesmo assim.
4. Busca a empresa pelo domínio (extraído do site ou do e-mail, ignorando provedores
   pessoais como Gmail); cria se não existir.
5. Cria o contato.
6. Cria o negócio no pipeline e etapa configurados, com `hubspot_owner_id` e
   `bdr_responsavel` = o BDR que captou, e canal + detalhamento de origem vindos do evento.
7. Associa contato ↔ empresa ↔ negócio.
8. Cria uma nota no negócio com as observações do BDR e a plataforma de e-commerce.
9. Devolve os três IDs; o app marca o lead como `enviado`.

### Idempotência

O `lead.id` é um UUID gerado no dispositivo. Antes de criar qualquer coisa, a função
verifica se aquele UUID já foi processado:

- **Barreira 1 (sempre ativa):** a linha em `public.leads`. Se já está `enviado` com
  `hubspot_deal_id`, retorna os IDs existentes sem tocar no HubSpot.
- **Barreira 2 (opcional):** uma property de texto no negócio com o UUID, consultada por
  busca. Só entra em ação se `HUBSPOT_PROPERTY_ID_CAPTURA` estiver configurada — ver §7.

**Falha parcial:** cada ID criado (contato, empresa, negócio) é gravado no Postgres na
hora. Se o contato subiu e o negócio falhou, o próximo retry retoma de onde parou em vez
de recriar o que já existe.

### Logs

Todos os passos são logados com o UUID do lead como prefixo. Para investigar um lead:

```bash
supabase functions logs sync-lead
```

e procure por `[sync-lead][<uuid>]`.

---

## 7. Valores de configuração do HubSpot

Os valores abaixo **já vêm preenchidos** com o que existe hoje no portal da Revi
(`22634045`), conferidos direto na API. Todos são sobrescrevíveis por variável de
ambiente, e vivem em um único arquivo: `supabase/functions/_shared/config.ts`.

| Variável | Valor atual | Onde conferir no HubSpot |
| --- | --- | --- |
| `HUBSPOT_PIPELINE_ID` | `139031732` (Vendas Diretas) | Configurações → Objetos → Negócios → Pipelines. O ID aparece na URL. |
| `HUBSPOT_DEAL_STAGE_INICIAL_ID` | `238830451` (Contato) | Mesma tela, ao editar a etapa. O lead de evento já teve conversa presencial, então nasce um passo à frente de "Prospect/Pesquisa". |
| `HUBSPOT_PROPERTY_CANAL` | `canal_de_lead` | Propriedades → Negócio → "Canal do Lead". |
| `HUBSPOT_VALOR_CANAL` | `Eventos` | Opção já existente no enum. |
| `HUBSPOT_PROPERTY_DETALHAMENTO_ORIGEM` | `detalhamento_de_origem` | Propriedades → Negócio. Texto livre; o valor vem do evento. |
| `HUBSPOT_PROPERTY_BDR_RESPONSAVEL` | `bdr_responsavel` | Propriedades → Negócio. Enum cujos **valores são owner IDs**. |
| `HUBSPOT_PROPERTY_ORIGEM_NEGOCIO` | `origem_do_negocio` = `Venda Direta` | Propriedades → Negócio. |
| `HUBSPOT_PROPERTY_PLATAFORMA` | `plataforma_de_e_commerce_utilizada` | Propriedades → Negócio. Enum; a lista do app espelha esses valores. |

### ⚠️ Ainda falta preencher

**`HUBSPOT_PROPERTY_ID_CAPTURA`** — não existe no portal. Crie em
Configurações → Propriedades → Negócio → Criar propriedade, tipo *Texto de linha única*,
nome interno sugerido `id_captura_evento`. Depois:

```bash
supabase secrets set HUBSPOT_PROPERTY_ID_CAPTURA=id_captura_evento
```

Sem ela o app funciona normalmente — a idempotência continua garantida pela tabela
`leads`. A property é a segunda barreira, útil se alguém apagar o registro local.

Só isso. O link de agendamento já vem configurado:
`https://meetings.hubspot.com/nicholas-love/revezamento-de-qualificacao-`
— sobrescrevível por evento em `eventos.link_agendamento`, porque a escala de closers
muda de feira para feira. A roleta é configurada no HubSpot; o app nunca decide quem
atende.

### Scopes do Private App

```
crm.objects.contacts.read    crm.objects.contacts.write
crm.objects.companies.read   crm.objects.companies.write
crm.objects.deals.read       crm.objects.deals.write
crm.objects.owners.read      crm.schemas.deals.read
```

### Owner IDs (mapa usuário → owner)

O mapa vive na coluna `app_users.hubspot_owner_id`, um registro por usuário. Para
descobrir o ID de alguém, use a lista de opções da property `bdr_responsavel` (os
valores do enum são exatamente os owner IDs) ou o endpoint `/crm/v3/owners`.

Alguns já conhecidos: Helder Mendes `85038368`, Felipe Braga `85078031`,
Sarah Alves `81295171`, Victor Costa `81295235`, Camila Marques `88180329`,
Gustavo Reis `88180347`.

### Workflow de troca de proprietário

Quando a reunião é agendada, a propriedade do negócio migra do BDR para o closer.
**Essa troca é feita por workflow no HubSpot, não pela aplicação.** O app apenas grava
os dados corretamente (owner = BDR, `bdr_responsavel` = BDR, canal e detalhamento de
origem) para o workflow ter do que disparar.

---

## 8. Deploy na Vercel

1. **Import Project** apontando para este repositório.
2. Framework preset: **Vite** (o `vercel.json` já cobre build e rewrites do SPA).
3. Em **Settings → Environment Variables**, adicione **apenas**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_LINK_AGENDAMENTO_ROUND_ROBIN`
4. Deploy.

**Nunca** adicione `HUBSPOT_TOKEN` na Vercel. Ele é secret do Supabase. Qualquer
variável `VITE_*` vai para o bundle público.

Depois do deploy, abra a URL no tablet e use *Adicionar à tela inicial*. Instale e abra
o app pelo menos uma vez **com rede** antes do evento, para o service worker cachear o
app shell — é o que permite abrir offline em cold start.

---

## 9. Comportamento offline

1. Todo lead vai primeiro para o IndexedDB com `status_sync = pendente`. Sem exceção,
   mesmo com rede perfeita — assim não existe caminho de código raro que só roda no pior
   momento.
2. Fila sem limite de itens.
3. Sincronização disparada por: retorno de conectividade (`online`), abertura do app,
   volta ao primeiro plano, timer de 60s e botão manual.
4. Backoff exponencial (5s → 15s → 60s → 3min → 10min), máximo 5 tentativas, depois
   marca `erro` e espera ação manual. **Nenhum lead é descartado.**
5. Queda de rede **não gasta tentativa**: o contador só avança quando o servidor de fato
   recusou o lead. Um Wi-Fi ruim de feira não pode empurrar a fila inteira para "erro".
6. Ao sincronizar, aviso visual: "3 leads enviados".
7. O IndexedDB nunca é limpo automaticamente.

### Teste obrigatório antes do evento

```
1. Abra o app com rede e faça login.
2. Ative o modo avião.
3. Cadastre 5 leads.
4. Feche o app por completo (mate o processo).
5. Reabra ainda offline  → o app deve abrir e mostrar "5 pendentes".
6. Desative o modo avião → aviso "5 leads enviados".
7. Confira no HubSpot: 5 negócios, sem duplicatas.
8. Toque em "Reenviar" em um deles → nada é duplicado no HubSpot.
```

---

## 10. Telas

- **Login** — logo, e-mail, senha. Nada mais.
- **Home** — usuário e evento no header, seletor de evento, botão grande *Novo lead*,
  contador de capturados hoje, indicador de sincronização (sempre visível) e a lista dos
  últimos leads, tocáveis para editar ou reenviar.
- **Captura** — dois modos:
  - **Eu preencho (BDR)**: os 4 obrigatórios + cargo, site, Instagram, plataforma de
    e-commerce e observações.
  - **Entregar o tablet (cliente)**: só os campos do visitante + consentimento LGPD
    obrigatório. Nenhum campo interno visível. Ao concluir, tela de "Obrigado" e volta
    automática a um formulário em branco em 5s. Sair do modo cliente exige **segurar** o
    botão, para o visitante não voltar ao app com um toque acidental.
  Os dois modos terminam com **dois botões**: *Salvar lead* e *Agendar reunião*. O
  segundo salva e já abre o link round-robin do HubSpot em nova aba, com `firstname`,
  `lastname`, `email`, `company` e `phone` preenchidos a partir do que a pessoa acabou
  de digitar, mais `utm_source`/`utm_medium`/`utm_campaign` para a reunião ficar
  rastreável até o evento. O visitante só escolhe o horário.
- **Pós-salvamento** — confirma o lead e pergunta se saiu reunião, gravando
  `agendou_reuniao`. Abrir o link nunca marca sozinho: como esse campo segmenta as
  trilhas pós-evento, quem confirma é o BDR. Para leads do modo cliente, a pergunta
  aparece na fila.
- **Fila** — pendentes e erros, com *Sincronizar agora*, mensagem de erro legível por
  lead, botão de reenviar e o aviso de conflito de duplicata com as duas opções.

---

## 11. Decisões que valem conhecer

**Lead do modo cliente espera o complemento do BDR.** Se um lead capturado pelo visitante
subisse na hora, ele chegaria ao HubSpot antes de o BDR preencher plataforma e
observações — e a nota do negócio nasceria vazia. Então esses leads ficam retidos na
fila, sinalizados como "esperando você completar", e sobem quando o BDR salva o
complemento (ou pelo botão *Enviar assim mesmo*). **Liberação automática em 2 horas**
(`LIBERAR_AGUARDANDO_APOS_MS` em `src/config/app.ts`): lead incompleto no HubSpot é
sempre melhor do que lead parado no aparelho.

**Sessão expirada offline não bloqueia a captura.** Enquanto houver usuário em cache no
IndexedDB, o app continua capturando normalmente; o login só é exigido no momento de
sincronizar, com aviso claro na Home.

**"Criar mesmo assim" reaproveita o contato existente.** O HubSpot não aceita dois
contatos com o mesmo e-mail. Nesse caminho o app cria empresa e negócio novos e associa
ao contato que já existe, **sem tocar nas properties nem no proprietário dele**.

**Editar um lead já enviado não atualiza o HubSpot.** A tela avisa isso explicitamente.
Reenviar seria no-op (o backend deduplica pelo UUID) e daria falsa sensação de
atualização. Para o caso normal — completar os campos internos antes do envio — a
retenção descrita acima resolve. Ajustes depois do envio se fazem no HubSpot.

---

## 12. Fora do escopo da v1 (caminho deixado aberto)

- **Enriquecimento de lead** por site e Instagram: será feito por serviço externo,
  disparado por webhook do HubSpot. Os dois campos são gravados normalizados
  (`https://…` e `@handle`) tanto no Supabase quanto na nota do negócio.
- **Automações de e-mail e WhatsApp pós-evento**: serão construídas no HubSpot/Revi. O
  que segmenta as duas trilhas é `agendou_reuniao`, gravado de forma confiável.
- Gerador de proposta, foto do crachá, dashboard analítico, exportação e gestão de
  usuários pela UI: não implementados.

---

## 13. Checklist de aceite

Marque durante o teste de campo:

- [ ] Login funciona e mantém sessão após fechar o app
- [ ] Lead com os 4 campos obrigatórios é salvo em menos de 60s
- [ ] Modo cliente não expõe nenhum campo interno
- [ ] Consentimento LGPD gravado com data e hora
- [ ] 5 leads em modo avião sincronizam ao voltar a rede, sem duplicata
- [ ] Reenvio manual do mesmo lead não duplica nada no HubSpot
- [ ] Contato + empresa + negócio criados e associados
- [ ] Negócio nasce com o BDR correto como proprietário e como BDR responsável
- [ ] Canal e detalhamento de origem corretos conforme o evento
- [ ] Observações e plataforma de e-commerce chegam como nota no negócio
- [ ] E-mail já existente retorna aviso de duplicata com o dono atual, sem sobrescrever
- [ ] Link de agendamento abre com os dados pré-preenchidos
- [ ] Negócio nasce na etapa "Contato" do pipeline Vendas Diretas
- [ ] Indicador de sincronização reflete o estado real da fila
- [ ] App abre offline em cold start
- [ ] Trocar de evento não exige alteração de código
- [ ] `npm run build && npm run check:bundle` passa
