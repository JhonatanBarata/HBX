# Passo 12 - Plano master do Email Lab e enriquecimento premium

Data: 2026-06-08

## Status do passo 12

Implementado como baseline de arquitetura e produto para os passos 13 a 21.

Este passo nao cria endpoint, tela, scraper ou provider pago. Ele fecha a decisao de produto, os limites de seguranca e a ordem de execucao. Qualquer codigo novo deve entrar nos passos seguintes, sem misturar Local Lab experimental com VPS oficial.

## Objetivo

Transformar o enriquecimento do HBX em um produto percebido, barato de operar e seguro para margem:

- HBX List vira lista operacional simples.
- HBX Lead Plus vira dossier comercial com evidencias, motivo, dor, canal e plano de abordagem.
- HBX Full vira Lead Plus com automacao e IA.
- API paga nao vira motor principal.
- Localhost pode virar laboratorio experimental.
- VPS continua limpa, oficial e conservadora.
- Resultados do laboratorio entram na VPS somente por importacao segura.

## Decisao central

Nao criar uma API arriscada dentro da VPS.

Criar duas camadas com o mesmo contrato:

- `VPS Production`: API oficial, limpa, auditavel, sem scraping sensivel de buscador.
- `Local Lab`: API local experimental, descartavel, sem credencial da VPS, exportando JSONL normalizado.

A VPS importa apenas resultados limpos, normalizados, deduplicados e validados.

## Ordem dos passos

1. Passo 13: contratos de `LeadHarvestCandidate`, `EmailHarvestCandidate`, `HarvestImportBatch` e `HarvestImportResult`.
2. Passo 14: API oficial da VPS para receber/importar/consultar batches.
3. Passo 15: Local Lab API experimental em `127.0.0.1`, separada do produto oficial.
4. Passo 16: importador seguro com dedupe, negativos, opt-out e rejeicoes.
5. Passo 17: enriquecimento gratis de e-mail v2 antes de pensar em API paga.
6. Passo 18: ledger e budget de API paga antes de Google/Hunter/qualquer provider externo.
7. Passo 19: tela desktop de Observacao para mostrar diferenca real entre List e Lead Plus.
8. Passo 20: painel OPS Control para disparar Local, VPS, ambos, exportar e importar.
9. Passo 21: rollout, validacao e prompts Codex para aplicar em PRs pequenos.

## Mapa de execucao

- [Passo 13 - Contratos harvest/import](./13-contratos-harvest-import.md)
- [Passo 14 - VPS API oficial Lead Harvest](./14-vps-api-oficial-lead-harvest.md)
- [Passo 15 - Local Lab API experimental](./15-local-lab-api-experimental.md)
- [Passo 16 - Importador seguro VPS](./16-importador-seguro-vps.md)
- [Passo 17 - Enriquecimento e-mail gratis v2](./17-enriquecimento-email-gratis-v2.md)
- [Passo 18 - Governanca custo API paga](./18-governanca-custo-api-paga.md)
- [Passo 19 - Observacao desktop List/Lead Plus](./19-observacao-desktop-list-lead-plus.md)
- [Passo 20 - OPS Control Email Lab](./20-ops-control-email-lab.md)
- [Passo 21 - Rollout checklist Codex](./21-rollout-checklist-codex.md)

## Limites de escopo para implementacao

Passo 12 permite:

- documentar a decisao Local Lab x VPS;
- documentar a separacao HBX List, HBX Lead Plus e HBX Full;
- documentar a sequencia de implantacao;
- documentar os bloqueios de seguranca e custo.

Passo 12 nao permite:

- criar scraping experimental dentro da VPS;
- criar importacao direta sem contrato;
- acionar provider pago;
- mudar entitlement/plano comercial;
- expor campo premium por ajuste apenas de frontend;
- alterar deploy, segredo, token ou credencial.

## Regras que nao podem ser quebradas

- Nao rodar scraper experimental na VPS.
- Nao salvar direto no banco da VPS a partir do Local Lab.
- Nao expor segredo, token, JWT master ou credencial operacional.
- Nao ignorar negativos, opt-out, duplicados ou historico ruim.
- Nao prometer Google/Bing como produto para cliente.
- Nao usar bypass de captcha, proxy rotativo ou truque para simular usuario humano.
- Nao acionar API paga sem ledger, budget, cache e motivo.
- Nao deixar HBX List receber inteligencia completa por falha de frontend.
- Backend deve ser a fonte de verdade para plano, entitlement e campos liberados.

## Produto final esperado

Frase de produto:

`HBX List entrega contatos. HBX Lead Plus entrega o motivo, a dor, o canal, o e-mail possivel, a evidencia e o proximo passo.`

No OPS:

- operador escolhe `Local`, `VPS` ou `Ambos`;
- escolhe estado, cidade, segmento e meta de e-mails;
- escolhe modo: `Priorizar e-mail`, `Somente e-mail publico`, `Enriquecer cards sem e-mail`;
- ve metricas de sites visitados, e-mails achados, aceitos, duplicados, rejeitados e falhas;
- exporta batch do Local Lab;
- importa batch para VPS;
- consulta rejeicoes e motivos.

No Radar/Vendas:

- List aparece como linha/card compacto operacional;
- Lead Plus aparece como dossier rico;
- Full acrescenta automacao e IA;
- e-mail mostra status e fonte;
- custo externo aparece para owner/admin, nao como promessa comercial para cliente.

## Dependencias ja vistas no repo

- `ops-control` ja controla Local/VPS/Ambos, turbo, filtro e cancelamento.
- `backend/src/commercial-plans/commercial-plan-catalog.ts` ja diferencia tiers `list`, `lead`, `full`.
- `backend/src/webscraping/radar-lead-enrichment.ts` ja possui e-mail, status, fonte, social, Maps, score, dor, canal e `qualityV2`.
- `backend/src/webscraping/radar/01-search/radar-search-input.service.ts` ja preserva `preferredChannels`, `requiredChannels` e `channelMatchMode`.
- Testes de webscraping ja cobrem varios cenarios de `requiredChannels`.

## Observacao sobre contexto AI local

O AGENTS cita `docs/ai/README.md`, mas esse arquivo nao foi encontrado no repo nesta leitura. Antes de implementar codigo, procurar novamente se a pasta de contexto foi recriada ou movida.

## Criterio de pronto do plano completo

O plano esta pronto quando:

- existe contrato unico entre Local Lab e VPS;
- Local Lab consegue gerar batch offline/JSONL;
- VPS consegue validar/importar sem depender do Local Lab;
- enriquecimento gratis melhora e-mail sem custo externo;
- qualquer API paga passa por ledger e budget;
- List/Lead Plus/Full ficam visualmente e funcionalmente diferentes;
- OPS mostra controle, status, exportacao, importacao e rejeicoes;
- nenhum fluxo comercial pago e liberado por apenas esconder/mostrar campo no frontend.

## Criterio de pronto do passo 12

- Documento master define objetivo, decisao central, ordem, regras, produto final esperado e dependencias.
- Cada passo posterior tem arquivo proprio e linkado no mapa de execucao.
- O plano deixa explicito que VPS Production e Local Lab usam o mesmo contrato, mas nao compartilham segredo nem gravacao direta.
- O plano deixa explicito que API paga so entra depois de ledger, budget, cache e motivo.
- O plano preserva Radar como memoria, negativos como protecao e backend como fonte de verdade comercial.
