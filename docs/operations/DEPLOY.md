# Deploy

Guia de deploy do HBX.

## Fluxo curto

```powershell
npm run commit -- "mensagem"
npm run publish
npm run publish:d
npm run publish:f
```

- `npm run commit` cria commit local, sem push e sem deploy.
- `npm run publish` faz push normal para `origin/master` e publica backend/webscraping na Hostinger.
- `npm run publish:d` roda dry-run completo, sem push e sem SSH destrutivo.
- `npm run publish:f` faz deploy force seguro, sem `git push --force` e sem remover volumes Docker.

Frontend continua na Vercel. Hostinger publica somente backend, webscraping e usa o Postgres local no container `hbx-postgres`.

O `.env` real fica somente no servidor. Use `docs/infra/HOSTINGER_DEPLOY.md` para o checklist completo.
