# MEI Lembretes — Frontend (Fase 1 / MVP)

PWA em Angular para nunca esquecer o pagamento do DAS-MEI. Fase 1 cobre apenas o
fluxo de DAS: login, dashboard com as obrigações e configurações de lembrete,
com notificações Web Push.

## Stack

- Angular 21 (standalone components, signals, sem NgModules)
- Angular Material (tema `indigo-pink`)
- `@angular/pwa` (manifest + service worker gerado por `ngsw-config.json`)
- Vitest como test runner (builder oficial `@angular/build:unit-test`)

## Pré-requisitos

- Node.js 24+ e npm 11+ (testado com Node v24.13.1 / npm 11.8.0)
- **Não é necessário Git nem Docker** para rodar este frontend em desenvolvimento.

## Passo a passo

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar o ambiente

A URL do backend fica em `src/environments/`:

- `src/environments/environment.development.ts` — usado automaticamente por
  `ng serve` / `npm start`.
- `src/environments/environment.ts` — usado por `ng build` (produção).

Ambos já apontam para `http://localhost:8000` por padrão:

```ts
export const environment = {
  production: false, // true no environment.ts
  apiUrl: 'http://localhost:8000',
};
```

Se o backend rodar em outra porta/host, ajuste `apiUrl` no arquivo
correspondente.

### 3. Rodar em desenvolvimento

```bash
npm start
# ou: ng serve
```

Acesse `http://localhost:4200`. O backend (FastAPI) precisa estar rodando em
`http://localhost:8000` para as chamadas de API funcionarem — sem ele, as
telas carregam mas mostram mensagens de erro amigáveis ao tentar buscar dados
(o app não trava).

### 4. Build de produção

```bash
npm run build
# ou: ng build
```

Gera o build em `dist/frontend/`. Já foi validado nesta máquina (ver seção
"Comandos validados nesta máquina" abaixo).

### 5. Rodar os testes unitários

```bash
npm test
# ou: ng test
```

Roda os testes com Vitest (ambiente jsdom) para os serviços (`auth.service`,
`obligations.service`, `config.service`, `push.service`), o interceptor, o
guard e os componentes de página, usando `provideHttpClientTesting()` /
`HttpTestingController` para mockar o backend.

## Testando notificações Web Push localmente

1. Rode o frontend com `ng serve` e acesse via `http://localhost:4200`.
2. **Importante:** Web Push exige HTTPS em produção, mas os navegadores
   tratam `localhost` (e `127.0.0.1`) como uma origem segura por exceção —
   então funciona normalmente em desenvolvimento sem certificado.
3. Na tela de **Dashboard** (se a permissão ainda não foi concedida) ou em
   **Configurações**, clique em "Ativar notificações". O navegador vai pedir
   permissão de notificação.
4. Ao aceitar, o app:
   - busca a chave pública VAPID em `GET /push/vapid-public-key`;
   - chama `SwPush.requestSubscription({ serverPublicKey })` para criar a
     inscrição no navegador;
   - envia `endpoint` + `keys` (`p256dh`, `auth`) da inscrição para
     `POST /push/subscribe` no backend.
5. Se a permissão for negada, o app mostra uma mensagem explicando que é
   preciso habilitar manualmente nas configurações do site no navegador (não
   há como reabrir o prompt do navegador programaticamente depois de negado).
6. Em **Configurações**, com a permissão concedida, aparece o botão
   "Cancelar notificações", que chama `DELETE /push/subscribe` com o
   `endpoint` atual e cancela a inscrição local no navegador.
7. O service worker (`ngsw-worker.js`) só fica habilitado fora do modo de
   desenvolvimento do Angular (`provideServiceWorker(..., { enabled:
   !isDevMode() })`). Isso não impede testar o fluxo de *inscrição* (pedido
   de permissão + POST /push/subscribe) rodando `ng serve`, mas para testar o
   recebimento real de uma notificação empurrada pelo backend é mais fiável
   testar contra um `ng build` servido estaticamente (ex.:
   `npx http-server dist/frontend/browser`), já que aí o service worker é
   registrado de verdade.

## Estrutura de pastas

```
src/app/
  models/api.models.ts        # tipos que espelham o contrato de API
  services/
    auth.service.ts           # POST /auth/login, /auth/logout
    obligations.service.ts    # GET/PATCH /obligations
    config.service.ts         # GET/PUT /config/das
    push.service.ts           # fluxo de Web Push via SwPush
  interceptors/
    auth.interceptor.ts       # withCredentials + redirect em 401
  guards/
    auth.guard.ts             # ver decisão de design abaixo
  pages/
    login/
    dashboard/
    settings/
```

## Decisões de design

### Guard "que não bloqueia"

O cookie de sessão é `httpOnly`, então o frontend não consegue validar a
sessão no lado do cliente antes de navegar, e o contrato de API não expõe um
endpoint tipo `/auth/me` para uma checagem leve (e inventar um endpoint novo
estava fora do escopo deste frontend). Por isso `authGuard` sempre permite a
navegação (`return true`) — cada página protegida dispara suas próprias
chamadas de carregamento ao montar, e `authInterceptor` intercepta qualquer
resposta `401` dessas chamadas e redireciona para `/login`. O guard fica
registrado nas rotas como ponto único de extensão, caso o backend passe a
expor futuramente um endpoint de verificação de sessão.

### `withCredentials`

Tanto o `authInterceptor` quanto cada método dos serviços passam
`withCredentials: true` explicitamente — redundante de propósito, para que
os serviços continuem corretos mesmo em testes unitários que não registram
o interceptor.

## Comandos validados nesta máquina

- `npx @angular/cli@21 new frontend --directory=. --routing --style=scss --skip-git --strict --standalone --package-manager=npm --file-name-style-guide=2016 --test-runner=vitest --ssr=false` — OK, workspace criado sem git.
- `npx ng add @angular/pwa` — OK.
- `npx ng add @angular/material` — o schematic de configuração do tema falhou
  com erro interno (`Cannot read properties of undefined (reading 'primary')`)
  depois de instalar os pacotes; a integração foi finalizada manualmente
  (tema prebuilt `indigo-pink.css` importado em `src/styles.scss`,
  `@angular/animations` instalado à parte, `provideAnimationsAsync()`
  adicionado em `app.config.ts`, fontes Roboto/Material Icons no
  `index.html`).
- `npm install` — OK, sem vulnerabilidades.
- `npx ng build` — build de produção **passa sem erros** (saída em
  `dist/frontend/`).
- `npx ng test` — **10 arquivos de teste / 35 testes, todos passando**
  (Vitest + jsdom).
