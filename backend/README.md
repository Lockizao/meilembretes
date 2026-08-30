# MEI Lembretes — Backend (Fase 1 / MVP)

API em FastAPI para lembretes do DAS-MEI: gera automaticamente as
obrigações mensais, marca atraso e dispara notificações Web Push com
antecedência configurável.

## Stack

- Python 3.13, FastAPI, SQLAlchemy 2.0 (async), Alembic
- Banco: SQLite (`aiosqlite`) em desenvolvimento local, Postgres (`asyncpg`,
  ex. Neon) em produção — controlado só pela variável `DATABASE_URL`
- Autenticação: JWT em cookie `httpOnly`
- Notificações: Web Push (VAPID) via `pywebpush`

## Passo a passo (Windows / PowerShell)

### 1. Criar e ativar o ambiente virtual

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

(Em Linux/Mac: `python3 -m venv venv && source venv/bin/activate`)

### 2. Instalar as dependências

```powershell
pip install -r requirements.txt
```

### 3. Configurar variáveis de ambiente

```powershell
Copy-Item .env.example .env
```

Edite o `.env` gerado. Para desenvolvimento local, o padrão já funciona:

```
ENV=development
DATABASE_URL=sqlite+aiosqlite:///./dev.db
```

**Importante sobre cookies em dev local:** como o `ENV=development` roda em
`http://` (sem TLS), o cookie `access_token` é setado com `secure=False`.
Se você mudar `ENV=production` sem ter HTTPS de verdade, o navegador vai
**rejeitar** o cookie e o login vai parecer "não funcionar" (a resposta do
`/auth/login` vem 200, mas o cookie nunca é salvo). Só use
`ENV=production` atrás de um domínio com HTTPS real (ex. Render).

### 4. Gerar as chaves VAPID (Web Push)

O pacote `py-vapid` instala o comando `vapid`:

```powershell
vapid --gen
```

Isso cria `private_key.pem` e `public_key.pem` na pasta atual. Para obter as
chaves no formato base64url que o `.env` espera, rode o snippet abaixo (usa
as mesmas chaves recém-geradas), ou gere programaticamente:

```powershell
python -c "
from py_vapid import Vapid
import base64
from cryptography.hazmat.primitives import serialization

v = Vapid()
v.generate_keys()

pub_raw = v.public_key.public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint,
)
priv_raw = v.private_key.private_numbers().private_value.to_bytes(32, 'big')

def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

print('VAPID_PUBLIC_KEY=' + b64u(pub_raw))
print('VAPID_PRIVATE_KEY=' + b64u(priv_raw))
"
```

Copie as duas linhas impressas (`VAPID_PUBLIC_KEY=...` e
`VAPID_PRIVATE_KEY=...`) para o seu `.env`, substituindo os valores
existentes. Preencha também `VAPID_CLAIMS_EMAIL` com um e-mail de contato
válido (é enviado ao serviço de push como identificação do remetente).

> Este repositório já tem um par de chaves de exemplo gerado no `.env` local
> para facilitar os testes — gere as suas próprias antes de ir para produção.

### 5. Rodar as migrations

```powershell
alembic upgrade head
```

Isso cria o arquivo `dev.db` (SQLite) na pasta `backend/` com todas as
tabelas (`users`, `das_config`, `obligation_instances`, `notification_log`,
`push_subscriptions`).

Para gerar uma nova migration depois de alterar `app/models.py`:

```powershell
alembic revision --autogenerate -m "descrição da mudança"
alembic upgrade head
```

### 6. Criar o usuário administrador (único usuário do sistema)

```powershell
python -m app.cli create-admin --email voce@exemplo.com --password "sua-senha-forte"
```

(equivalente: `python scripts/create_admin.py --email ... --password ...`)

Rodar o comando de novo com o mesmo e-mail atualiza a senha do usuário
existente em vez de criar um duplicado.

### 7. Subir o servidor

```powershell
uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000`. Documentação interativa em
`http://localhost:8000/docs`.

Lembre-se de configurar `FRONTEND_ORIGIN` no `.env` com a origem exata do
frontend (default `http://localhost:4200`) — o CORS só libera essa origem,
com `allow_credentials=True` (necessário para o cookie funcionar
cross-origin entre o Angular em `:4200` e a API em `:8000`).

### 8. Rodar os testes

```powershell
pytest
```

Os testes cobrem a lógica de `app/services/reminders.py` (geração
idempotente de instâncias, marcação de atraso, disparo de notificação uma
única vez por instância/dia de antecedência) usando um SQLite temporário
isolado — sem rede e sem tocar no `dev.db` real.

### 9. Testar o job diário manualmente

O job é protegido por um token simples (`JOB_SECRET_TOKEN` no `.env`), não
por login de usuário — é pensado para ser chamado por um cron/scheduler
externo.

```bash
curl -X POST http://localhost:8000/jobs/run-daily \
  -H "X-Job-Token: <valor de JOB_SECRET_TOKEN do seu .env>"
```

Resposta esperada:

```json
{"processed": 2, "notifications_sent": 0}
```

(o número de `notifications_sent` só é maior que zero se houver
`push_subscriptions` cadastradas para o usuário e a data estiver dentro da
janela de `dias_antecedencia_lembrete` configurada em `/config/das`).

## Estrutura

```
backend/
  app/
    main.py              # cria o FastAPI app, CORS, rate limit, routers
    config.py             # Settings (pydantic-settings) lidas do .env
    database.py            # engine async + Base declarativa + get_db()
    models.py               # tabelas SQLAlchemy 2.0
    schemas.py                # modelos Pydantic de entrada/saída
    security.py                 # hash de senha (bcrypt) e JWT
    deps.py                       # get_current_user (le cookie, valida JWT)
    cli.py                          # comando `create-admin`
    routers/
      auth.py, config.py, obligations.py, push.py, jobs.py, health.py
    services/
      reminders.py    # logica central, idempotente, chamada pelo job diario
      push_sender.py  # envio Web Push (VAPID) via pywebpush
  alembic/               # migrations
  scripts/create_admin.py  # atalho para app.cli create-admin
  tests/                    # pytest (reminders.py)
  Dockerfile
  requirements.txt
  .env.example
```

## Deploy (Render) — visão geral

O `Dockerfile` instala as dependências, copia o código e, ao iniciar o
container, roda `alembic upgrade head` antes de subir o `uvicorn` — assim
o schema do banco de produção (Postgres/Neon) fica sempre atualizado a
cada deploy. Configure as variáveis de ambiente do `.env.example`
diretamente no painel do Render (incluindo `ENV=production`,
`DATABASE_URL` apontando para o Postgres do Neon, e `FRONTEND_ORIGIN` com
a URL real do frontend publicado). Este Dockerfile não foi testado nesta
máquina (Docker não está instalado aqui) — validar no ambiente do Render.
