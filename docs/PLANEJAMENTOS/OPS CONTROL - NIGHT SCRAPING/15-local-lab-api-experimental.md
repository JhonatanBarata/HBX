# Passo 15 - Local Lab API experimental

## Objetivo

Criar uma API local, descartavel e separada da VPS para descobrir e-mails/cards em fontes publicas e exportar resultados normalizados.

Ela roda em:

```text
http://127.0.0.1:3098
```

## Escopo atualizado

O pedido atual e ter o HBX Local Lab com agressividade maxima permitida em fonte publica, sem bloqueios internos do produto oficial e sem depender da VPS.

Isso significa:

- limites locais altos para candidatos, paginas por site, links descobertos, diretorios e links sociais;
- modo explicito `max_public` ou `aggressive: true`;
- varredura de mais caminhos publicos de contato, atendimento, unidades, sitemap e paginas institucionais;
- uso de listas explicitas de `seedUrls`, `websites`, `candidates`, `directoryUrls` e `socialUrls`;
- export completo no contrato do Passo 13 para importar depois por API oficial.

Isso nao significa implementar bypass de bloqueio, captcha solver, proxy rotativo, evasao de anti-bot ou automacao para simular usuario humano. Esse tipo de ferramenta quebra a separacao segura do Lab e fica fora do Passo 15.

## Nao e produto oficial

O Local Lab:

- nao tem credencial da VPS;
- nao acessa banco da VPS;
- nao escreve no Prisma da VPS;
- nao usa token master permanente;
- nao depende do dominio oficial;
- nao promete Google/Bing para cliente;
- nao faz bypass de bloqueio, captcha, proxy rotativo, evasao de anti-bot ou automacao para simular usuario humano.

Se um provider quebrar, o HBX oficial continua funcionando.

## Estrutura sugerida

Servico separado:

```text
hbx-local-lab/
  package.json
  server.js
  providers/
    web-query.provider.js
    site-crawl.provider.js
    directory-probe.provider.js
    social-probe.provider.js
  extractors/
    email.extractor.js
    contact-page.extractor.js
  exporters/
    hbx-jsonl-exporter.js
  storage/
    .gitkeep
```

Evitar colocar isso dentro do backend principal no MVP. A separacao fisica reduz risco de misturar laboratorio com produto.

## Endpoints locais

```text
POST /local-lab/jobs
GET  /local-lab/jobs/:id
GET  /local-lab/jobs/:id/export
POST /local-lab/jobs/:id/cancel
```

Payload:

```json
{
  "city": "Sao Paulo",
  "state": "SP",
  "segment": "clinicas odontologicas",
  "targetEmails": 500,
  "providers": ["web_query", "site_crawl", "directory_probe"],
  "mode": "email_first"
}
```

Payload agressivo permitido:

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

## Providers MVP

Comecar sem acoplar a nomes sensiveis de buscador:

- `web_query`: consultas textuais simples quando disponivel.
- `site_crawl`: entra apenas em sites oficiais encontrados.
- `directory_probe`: diretorios publicos permitidos e paginas de contato.
- `social_probe`: apenas links publicos que apontam para site/e-mail.

Se no futuro existir provider especifico como `google_html`, `bing_html` ou `duckduckgo_html`, ele deve ficar desligado por padrao e marcado como experimental.

## Fluxo do job

1. Receber cidade, UF, segmento e meta.
2. Gerar queries de descoberta.
3. Encontrar candidatos de site/empresa.
4. Crawlear paginas obvias:
   - `/`
   - `/contato`
   - `/sobre`
   - `/quem-somos`
   - `/atendimento`
   - `/servicos`
   - `/unidades`
   - `/agendamento`
5. Extrair `mailto`, e-mail no HTML, texto ofuscado, telefone, WhatsApp e redes.
6. Normalizar e cortar lixo.
7. Deduplicar por e-mail, dominio, telefone e nome+cidade.
8. Exportar:
   - `batch-manifest.json`
   - `leads.jsonl`
   - `emails.jsonl`

## Agressividade permitida

No modo `max_public`, o Lab pode:

- aumentar volume de candidatos e URLs publicas processadas;
- abrir mais paginas publicas dentro do mesmo site;
- ler `sitemap.xml` quando existir;
- seguir links internos publicos de contato, unidades, equipe, especialidades, orcamento, atendimento e agendamento;
- processar diretorios e links sociais informados explicitamente no payload;
- continuar rodando localmente sem quota comercial do produto oficial.

No modo `max_public`, o Lab nao pode:

- tentar passar por captcha;
- trocar IP por proxy rotativo para contornar bloqueio;
- mascarar identidade do crawler como usuario humano;
- usar sessao, cookie, token, credencial ou segredo;
- acessar area logada, area privada ou dado nao publico;
- escrever direto no banco oficial.

## Regras de qualidade

Aceitar como e-mail forte:

- `mailto` em site oficial;
- e-mail em pagina de contato;
- e-mail em schema/JSON-LD;
- e-mail no rodape do dominio oficial;
- e-mail que combina com dominio oficial e tem MX valido, quando a validacao estiver disponivel.

Marcar como provavel:

- padrao `contato@dominio` com dominio oficial;
- padrao `comercial@dominio` com MX valido;
- e-mail citado em fonte publica mas sem pagina oficial clara.

Rejeitar:

- e-mail de rede social;
- e-mail de diretorio generico;
- dominio de encurtador;
- dominio bloqueado;
- e-mail sem `sourceUrl`;
- empresa sem nome real.

## Criterios de aceite

- Rodar local sem backend HBX.
- Criar job e consultar status.
- Exportar JSONL com contrato do Passo 13.
- Cancelar job em andamento.
- Nunca exigir credencial da VPS.
- Logs nao podem conter token, cookie ou segredo.
- Modo `max_public` aumenta limites locais sem criar bypass, captcha solver ou proxy rotativo.

## Validacoes

- `node --check hbx-local-lab/server.js`
- testes unitarios dos extractors se o pacote usar test runner
- export manual de batch pequeno

## Prompt Codex para aplicar

```text
Implemente o Passo 15 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/15-local-lab-api-experimental.md`.
Crie um servico local separado em `hbx-local-lab`, com API de jobs e export JSONL. Nao conecte na VPS e nao use segredo de producao. Implemente agressividade publica maxima com `mode: "max_public"` e `aggressive: true`, mas nao implemente bypass de bloqueio, captcha solver, proxy rotativo ou evasao de anti-bot.
```
