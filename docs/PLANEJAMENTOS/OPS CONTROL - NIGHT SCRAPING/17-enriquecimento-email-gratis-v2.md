# Passo 17 - Enriquecimento gratis de e-mail v2

## Objetivo

Melhorar e-mail e percepcao de enriquecimento sem API paga. O Lead Plus precisa parecer rico mesmo com Google/Hunter desligados.

## Decisao

E-mail deve morar principalmente no enriquecimento pos-descoberta, nao na busca bruta.

Busca acha empresas. Enriquecimento melhora cards. Filtro decide o que entra na fila.

## Camadas gratis

Camada 0 - cache e memoria HBX:

- telefone normalizado;
- dominio;
- nome + cidade;
- historico global;
- resultados ja enriquecidos;
- batch importado;
- negativos e opt-outs.

Camada 1 - dados do card:

- nome;
- telefone;
- website;
- sourceUrl;
- googleMapsUrl quando existir;
- businessCategory;
- rawPayload;
- evidenceJson.

Camada 2 - mini-crawl do site:

- `/`
- `/contato`
- `/sobre`
- `/quem-somos`
- `/atendimento`
- `/servicos`
- `/especialidades`
- `/unidades`
- `/agendamento`

Extrair:

- `mailto`;
- e-mail no HTML;
- texto ofuscado;
- telefone;
- WhatsApp;
- Instagram/Facebook;
- schema.org;
- CNPJ quando publico;
- sinais de site fraco;
- botao de agendamento;
- formulario de contato.

Camada 3 - e-mail provavel:

- `contato@dominio`;
- `comercial@dominio`;
- `vendas@dominio`;
- `atendimento@dominio`;
- sempre marcar como `probable`, nunca como confirmado;
- exigir dominio oficial e, se implementado, MX valido.

Camada 4 - inteligencia comercial:

- dor provavel;
- canal recomendado;
- motivo do score;
- primeira mensagem;
- risco;
- proxima acao;
- o que falta confirmar.

## Mudancas em `enrichmentJson`

Evoluir sem quebrar compatibilidade:

```json
{
  "level": "smart_free",
  "cost": {
    "totalBrl": 0,
    "providersUsed": ["hbx", "site_crawl"],
    "cacheHit": false
  },
  "identity": {
    "confidence": 82,
    "evidence": []
  },
  "contact": {
    "email": "contato@exemplo.com.br",
    "emailConfidence": 92,
    "emailSource": "website"
  },
  "digitalPresence": {
    "websiteStatus": "present",
    "socialStatus": "partial",
    "weakness": []
  },
  "salesFit": {
    "score": 78,
    "painType": "site_fraco",
    "painPitch": "..."
  },
  "actionPlan": {
    "recommendedChannel": "email",
    "firstMessage": "...",
    "nextStep": "..."
  },
  "evidenceTimeline": [],
  "missingData": []
}
```

## Arquivos provaveis

- `backend/src/webscraping/radar-lead-enrichment.ts`
- `backend/src/vendas/vendas-lead-enrichment.ts`
- `backend/src/webscraping/radar/01-search/radar-website-crawl-source.service.ts`
- `backend/src/webscraping/radar/01-search/radar-source-executor.service.ts`
- `backend/src/webscraping/lead-quality-v2.ts`
- testes correspondentes.

## Regras de plano

HBX List:

- pode ver e-mail encontrado;
- pode ver status simples;
- nao ve dossier, motivo completo, evidencia detalhada nem plano de abordagem.

HBX Lead Plus:

- ve dossier;
- ve fonte e confianca;
- ve plano de abordagem;
- ve evidencias resumidas.

HBX Full:

- ve Lead Plus;
- ve automacoes, IA e proximas acoes em massa.

## Criterios de aceite

- Com API paga desligada, Lead Plus ainda mostra valor real.
- E-mail confirmado so se veio de fonte publica forte.
- E-mail provavel fica marcado como provavel.
- `cost.totalBrl=0` para enriquecimento interno.
- Negativo/opt-out nao e reativado.
- Filtro `Email obrigatorio` tenta enriquecer antes de salvar quando seguro.

## Validacoes

- `cd backend && npm run build`
- testes de `radar-lead-enrichment`
- testes de `vendas-lead-enrichment`
- testes de webscraping com `requiredChannels=["email"]`

## Prompt Codex para aplicar

```text
Implemente o Passo 17 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/17-enriquecimento-email-gratis-v2.md`.
Melhore apenas enriquecimento gratis e estrutura de evidencias. Nao adicione Google pago, Hunter ou outro provider externo neste PR.
```

