# Webwhats

Fork operacional focado em Baileys + multi-instância + persistência obrigatória, pronto para produção Oracle Linux ou Ubuntu sem Docker no fluxo principal.

## Trilha oficial de produção

A trilha oficial desta base é Node.js + systemd.

- Guia de produção Oracle/Ubuntu: [README_ORACLE.md](./README_ORACLE.md)
- Fluxo oficial: `npm ci` -> `npm run build` -> `npm run db:generate` -> `npm run db:deploy` -> `npm run start:prod`

## Escopo mantido nesta base

- Baileys
- multi-instância sem teto artificial de código
- persistência obrigatória para instâncias, mensagens novas, updates, contatos, chats e histórico
- QR disponível até QR novo, conexão aberta, logout explícito ou expiração real
- operação sem Docker no caminho principal

## Regras desta trilha

- Não usar Docker como caminho principal de produção.
- Não adicionar `whatsapp-web.js`, Puppeteer ou browser.
- Não quebrar multi-instância.
- Não tornar o armazenamento do cliente opcional.
- Não criar microserviço novo para subir esta base.

## Docker legado

Os arquivos em `Docker/` e `docker-compose*.yaml` permanecem apenas como legado opcional de referência. Eles não fazem parte da documentação oficial de produção desta base.

## Deploy rápido

```bash
cp .env.oracle.example .env
mkdir -p instances store store/auth
npm ci
npm run build
npm run db:generate
npm run db:deploy
npm run start:prod
```

## Runtime validado para Oracle

- `DATABASE_SAVE_DATA_INSTANCE`, `DATABASE_SAVE_DATA_NEW_MESSAGE`, `DATABASE_SAVE_MESSAGE_UPDATE`, `DATABASE_SAVE_DATA_CONTACTS`, `DATABASE_SAVE_DATA_CHATS` e `DATABASE_SAVE_DATA_HISTORIC` ficam obrigatórios em runtime.
- `QRCODE_LIMIT=0` remove o teto artificial de QR.
- `EVENT_EMITTER_MAX_LISTENERS=0` remove o teto artificial de listeners.
- `DEL_INSTANCE=false` evita remoção automática de instâncias.

## Origem

Esta base deriva do projeto Evolution API e foi ajustada neste fork para um fluxo mais direto de produção em Oracle/Linux com Node.js + systemd.

## Licença

Consulte [LICENSE](./LICENSE).
