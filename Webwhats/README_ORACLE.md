# README_ORACLE

Trilha oficial de produção para Oracle Linux ou Ubuntu: Node.js + systemd, sem Docker no caminho principal.

## Escopo desta base

- Baileys
- multi-instância sem limite artificial de código
- persistência obrigatória de instâncias, mensagens novas, updates, contatos, chats e histórico
- QR mantido até QR novo, conexão aberta, logout explícito ou expiração real
- deploy direto em Linux com systemd

## Requisitos

- Node 20+
- npm 10+
- PostgreSQL ou MySQL acessível
- systemd

## Arquivos oficiais de produção

- `.env.oracle.example`
- `systemd/evolution.service`

## Fluxo oficial

```bash
npm ci
npm run build
npm run db:generate
npm run db:deploy
npm run start:prod
```

## Docker

Docker fica somente como legado opcional neste repositório. A trilha oficial de produção desta base é Node.js + systemd.

## Preparação do host

```bash
sudo useradd --system --home-dir /opt/webwhats --shell /usr/sbin/nologin webwhats
sudo install -d -o webwhats -g webwhats /opt/webwhats
sudo rsync -av --delete --exclude .git --exclude node_modules ./ /opt/webwhats/
sudo chown -R webwhats:webwhats /opt/webwhats
```

## Build e banco

```bash
cd /opt/webwhats
sudo -u webwhats cp .env.oracle.example .env
sudo -u webwhats mkdir -p instances store store/auth
sudo -u webwhats npm ci
sudo -u webwhats npm run build
sudo -u webwhats npm run db:generate
sudo -u webwhats npm run db:deploy
```

## systemd

```bash
sudo cp systemd/evolution.service /etc/systemd/system/evolution.service
sudo systemctl daemon-reload
sudo systemctl enable evolution
sudo systemctl start evolution
sudo systemctl status evolution
```

## Verificações operacionais

- `PROVIDER_ENABLED=false` mantém a operação sem file server externo.
- `DATABASE_SAVE_DATA_INSTANCE`, `DATABASE_SAVE_DATA_NEW_MESSAGE`, `DATABASE_SAVE_MESSAGE_UPDATE`, `DATABASE_SAVE_DATA_CONTACTS`, `DATABASE_SAVE_DATA_CHATS` e `DATABASE_SAVE_DATA_HISTORIC` são obrigatórios em runtime.
- `QRCODE_LIMIT=0` remove o teto artificial de QR.
- `EVENT_EMITTER_MAX_LISTENERS=0` deixa o EventEmitter2 sem teto artificial de listeners.
- `DEL_INSTANCE=false` evita remoção automática de instâncias.
- `instances/` e o banco seguem como base de persistência operacional.

## Atualização de deploy

```bash
cd /opt/webwhats
git pull
sudo -u webwhats npm ci
sudo -u webwhats npm run build
sudo -u webwhats npm run db:generate
sudo -u webwhats npm run db:deploy
sudo systemctl restart evolution
```

## Logs

```bash
sudo journalctl -u evolution -f
```
