# App pessoal de lembretes: DAS-MEI + Emissão de NF + Recebimento RT Intelligence

## Contexto

Matheus é PJ prestando serviço para a RT Intelligence e também MEI (CNPJ registrado em Abreu e Lima - PE). Hoje corre o risco de esquecer três coisas recorrentes:

1. Pagar o **DAS-MEI** (vence todo dia 20).
2. **Emitir a nota fiscal** de serviço para a RT Intelligence — desde set/2022 isso é obrigatoriamente feito pelo **Sistema Nacional de NFS-e** (nfse.gov.br), não mais pelo site da prefeitura, e sem certificado digital não dá pra automatizar o preenchimento/envio real.
3. **Conferir se a RT pagou** a nota depois de emitida, dentro do prazo combinado.

Existem apps prontos (MaisMei, Meu MEI Digital, Jota) que cobrem parte disso, mas o usuário quer construir a própria versão, sob medida para o fluxo dele (DAS + NF da RT + recebimento), acessível também pelo celular via notificação push.

Todas as decisões de arquitetura abaixo já foram validadas com o usuário (cidade do MEI, nível de automação da NF, canal de notificação, hospedagem e stack) e por um agente de planejamento dedicado.

## Escopo e não-escopo

- **Dentro do escopo**: gerar lembretes (push) para os 3 eventos recorrentes, deixar os dados da NF prontos para copiar (sem enviar/assinar nada no gov.br), marcar cada obrigação como concluída, configurar valores/datas/antecedências.
- **Fora do escopo (explicitamente)**: automatizar emissão real da NF no nfse.gov.br (exigiria certificado digital / RPA sobre site do governo — não faremos isso), Telegram/e-mail (arquitetura já deixa isso plugável, mas não faz parte do MVP), multi-usuário.

## Arquitetura

**Stack**: Python (FastAPI) no backend, Angular (PWA) no frontend, Postgres via **Neon** (free tier realmente persistente — Render/Railway free Postgres expira ou usa disco efêmero, o que destruiria o histórico).

**Repositório**: monorepo único (`backend/` + `frontend/` + `docker-compose.yml`).

### Modelo de dados (Postgres, via SQLAlchemy async + Alembic)

- `users` — usuário único do app.
- `das_config` / `nf_config` / `rt_recebimento_config` — regras editáveis (valor, dia de vencimento/emissão, dias de antecedência do lembrete, dados do tomador da NF).
- `obligation_instances` — uma linha por mês por tipo (`DAS`, `NF_EMISSAO`, `RT_RECEBIMENTO`), com `status` (pendente/concluído/atrasado). Ao marcar uma `NF_EMISSAO` como concluída, o app gera automaticamente a instância `RT_RECEBIMENTO` correspondente (`data_vencimento = data de emissão + prazo configurado`), resolvendo o item 3 sem lógica extra do usuário.
- `notification_log` — evita reenviar o mesmo lembrete no mesmo dia/gatilho.
- `push_subscriptions` — inscrições de Web Push do navegador/celular.

### Backend (FastAPI)

- Autenticação: usuário/senha fixos (seed único), JWT em **cookie httpOnly + Secure**, sem localStorage. Rate limit no login.
- Rotas principais: `/auth/login`, `/config/{das,nf,rt-recebimento}`, `/obligations` (listar/detalhar/marcar concluído), `/obligations/{id}/nf-data` (dados prontos da NF pra copiar + link pro nfse.gov.br), `/push/subscribe`, `/jobs/run-daily`.
- **Scheduler**: como o free tier do Render "dorme" o processo, a lógica de lembrete não fica num APScheduler in-process — fica num serviço (`app/services/reminders.py`) chamado via `POST /jobs/run-daily` (protegido por token estático), disparado 1x/dia por um **cron externo gratuito (cron-job.org)**. O job é idempotente: gera instâncias do mês, marca atrasados, e dispara push para quem bateu num dos dias de antecedência configurados.
- **Web Push**: chaves VAPID geradas uma vez, envio via `pywebpush`. Canal de notificação desenhado como interface (`NotificationChannel`) para permitir add Telegram/e-mail depois sem tocar no scheduler.

### Frontend (Angular)

- `@angular/pwa` + `SwPush` para push (aproveita o service worker pronto do Angular, sem escrever um customizado).
- Telas: `/login`, `/dashboard` (próximos vencimentos, marcar como concluído), `/obligations/:id` (detalhe — pra NF mostra dados prontos + link pro nfse.gov.br), `/settings` (config de DAS/NF/RT + botão "ativar notificações").

### Deploy (tudo free tier, sem depender do PC ligado)

- Banco: Neon (Postgres).
- Backend: Render Web Service (Docker), envs com segredos (VAPID, JWT, admin, job token).
- Frontend: Render Static Site / Netlify.
- Cron: cron-job.org chamando `/jobs/run-daily` todo dia.
- Dev local: `docker-compose.yml` (Postgres local + backend); frontend com `ng serve`.

## Plano faseado de implementação

**Fase 1 — MVP (lembrete de DAS-MEI ponta a ponta)**
1. Monorepo + Docker Compose local + Neon (dev e prod).
2. Modelos `users`, `das_config`, `obligation_instances`, `notification_log`, `push_subscriptions` + migrations Alembic.
3. Auth (login fixo + JWT em cookie).
4. Geração de instâncias de DAS + `/jobs/run-daily` com a lógica de lembrete (só DAS por enquanto).
5. Web Push completo (VAPID, `/push/subscribe`, envio via `pywebpush`).
6. Angular: login + dashboard simples (lista de DAS do mês, marcar como pago, ativar notificações).
7. Deploy real (Render + Neon + cron-job.org) e teste ponta a ponta: notificação chegando de fato no celular/PC.

**Fase 2 — Assistente de emissão de NF**
1. `nf_config` (CRUD + tela de settings do tomador RT Intelligence/serviço).
2. Geração de instâncias `NF_EMISSAO` no gerador mensal.
3. `/obligations/{id}/nf-data` + tela de detalhe com dados prontos pra copiar e link pro nfse.gov.br.
4. Lembretes de emissão reaproveitando o mesmo pipeline de notificação.

**Fase 3 — Acompanhamento de recebimento da RT Intelligence**
1. `rt_recebimento_config` (CRUD — prazo de pagamento após emissão).
2. Trigger na conclusão de `NF_EMISSAO` → cria/atualiza `RT_RECEBIMENTO` vinculada.
3. Lembrete de "conferir recebimento" + ação de marcar como recebido.

## Arquivos críticos

- `backend/app/db/models.py` — todas as entidades e a relação self-referencing NF → RT_RECEBIMENTO.
- `backend/app/services/reminders.py` — geração idempotente de instâncias + verificação de antecedências + disparo de push (chamado pelo `/jobs/run-daily`).
- `backend/app/services/push_sender.py` — integração `pywebpush`/VAPID, limpeza de subscriptions expiradas (404/410).
- `backend/app/api/routes/jobs.py` — endpoint protegido por token estático usado pelo cron externo.
- `frontend/src/app/services/push.service.ts` — wrapper do `SwPush`, fluxo de permissão e `/push/subscribe`.

## Verificação

- Fase 1: rodar `docker-compose up` localmente, logar, criar uma config de DAS com vencimento "hoje + 1 dia" e antecedência `{1}`, chamar manualmente `POST /jobs/run-daily` e confirmar que a notificação push chega no navegador/celular cadastrado.
- Depois do deploy: repetir o mesmo teste em produção, e confirmar que o cron externo (cron-job.org) está de fato chamando o endpoint 1x/dia (ver logs do Render).
- Fase 2: marcar uma `NF_EMISSAO` como concluída e verificar que a instância `RT_RECEBIMENTO` é criada com a data correta.
- Testes automatizados do backend (pytest) cobrindo a lógica de `reminders.py` (geração de instâncias, cálculo de antecedência, idempotência do job).
