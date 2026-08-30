# mei-lembretes

App pessoal para nunca esquecer: pagar o DAS-MEI, emitir a nota fiscal de serviço para a RT Intelligence e conferir se o pagamento caiu. Notificações via Web Push (navegador/celular).

Ver o plano completo em `PLANO.md` (Fase 1 = MVP do lembrete de DAS-MEI; Fase 2 = assistente de emissão de NF; Fase 3 = acompanhamento de recebimento).

## Estrutura

- `backend/` — API FastAPI + Postgres (SQLAlchemy async + Alembic).
- `frontend/` — Angular PWA (login, dashboard, configurações, push).
- `docker-compose.yml` — sobe Postgres local + backend para desenvolvimento.

## Rodando localmente

Ver `backend/README.md` e `frontend/README.md` para instruções detalhadas de cada parte.
