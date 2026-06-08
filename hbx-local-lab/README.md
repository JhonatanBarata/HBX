# HBX Local Lab

Servico local experimental para descoberta de e-mails em fontes publicas e exportacao no contrato JSONL do HBX.

```powershell
cd hbx-local-lab
npm test
npm start
```

Padrao local:

```text
http://127.0.0.1:3098
```

## Endpoints

```text
POST /local-lab/jobs
GET  /local-lab/jobs/:id
GET  /local-lab/jobs/:id/export
GET  /local-lab/jobs/:id/export?file=manifest
GET  /local-lab/jobs/:id/export?file=leads
GET  /local-lab/jobs/:id/export?file=emails
POST /local-lab/jobs/:id/cancel
```

## Modo agressivo publico

Use `mode: "max_public"` ou `aggressive: true` para aumentar os limites locais sem conectar na VPS.

```json
{
  "city": "Sao Paulo",
  "state": "SP",
  "segment": "clinicas odontologicas",
  "targetEmails": 5000,
  "providers": ["web_query", "site_crawl", "directory_probe", "social_probe"],
  "mode": "max_public",
  "aggressive": true,
  "maxCandidates": 5000,
  "maxPagesPerSite": 250,
  "maxDiscoveredLinks": 1000,
  "maxDirectoryUrls": 5000,
  "maxSocialUrls": 5000,
  "seedUrls": [],
  "websites": [],
  "candidates": [],
  "directoryUrls": [],
  "socialUrls": []
}
```

## Separacao segura

O Lab nao usa credencial da VPS, nao acessa Prisma, nao escreve no banco oficial e rejeita payload com campos sensiveis como token, cookie, secret, senha ou API key.

Nao implementar aqui:

- bypass de bloqueio;
- captcha solver;
- proxy rotativo;
- evasao de anti-bot;
- simulacao de usuario humano;
- acesso a area privada ou logada.
