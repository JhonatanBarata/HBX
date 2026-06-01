# Radar - Relatorio operacional pos-refatoracao

## Teste atual - Rio Claro/SP - imobiliaria

- empresa: 11 localhost
- cidade: Rio Claro
- estado: Sao Paulo / SP
- segmento: imobiliaria
- distancia: 0
- quantidade solicitada: 20 cards
- fase atual: primeira pesquisa preenchida

## Primeira pesquisa - cards entregues antes do enriquecimento

Fonte usada para preencher esta etapa: motor HBX local `/search`, payload principal com `segment=imobiliarias`, `query=imobiliarias Rio Claro SP`, `targetType=pj`, `limit=20`, `fresh=true`.

Observacao: a chamada literal com `segment=imobiliaria` retornou apenas 3 cards. Para cumprir os 20 cards da primeira etapa, a busca primária usada foi a variante sem acento/plural `imobiliarias`, ainda dentro do mesmo segmento solicitado.

| # | Empresa | Telefone | Fonte | Score | Social inicial |
|---|---|---|---|---:|---|
| 1 | Imobiliária Mega | (19) 3533-1418 | Apontador | 54 | missing |
| 2 | Rodinei Cezar Oliveira Ltda | (19) 3533-1254 | Solutudo | 54 | missing |
| 3 | SIMONE FERNADES Negócios imobiliários | (19) 99636-7174 | Solutudo | 54 | missing |
| 4 | Sanchez Corretores De Imoveis Ltda | (19) 3557-7945 | Solutudo | 54 | missing |
| 5 | Gasparotto Administradora De Bens E Participacoes Ltda | (19) 3522-7550 | Solutudo | 54 | missing |
| 6 | Prevent Participacoes Ltda | (19) 3522-5800 | Solutudo | 54 | missing |
| 7 | Lrm Administradora De Bens Ltda | (19) 3524-1818 | Solutudo | 54 | missing |
| 8 | Immobiltec Participacoes Imobiliarias Do Brasil Ltda. | (19) 98152-5115 | Solutudo | 54 | missing |
| 9 | Faenza Empreendimento Imobiliario Spe Ltda | (19) 3597-5552 | Solutudo | 54 | missing |
| 10 | Marcio Rogerio Scatolin | (19) 3534-9781 | Solutudo | 54 | missing |
| 11 | Villa Gardone Empreendimento Imobiliario Spe Ltda | (19) 3531-5398 | Solutudo | 54 | missing |
| 12 | Pirinei Empreendimentos Ltda | (19) 3024-1338 | Solutudo | 54 | missing |
| 13 | Imoveis & Oportunidades | (19) 98405-3879 | Solutudo | 54 | missing |
| 14 | Ayf Administradora De Imoveis Ltda | (19) 99719-5402 | Solutudo | 54 | missing |
| 15 | Parf Participacoes Ltda | (19) 3534-3353 | Solutudo | 54 | missing |
| 16 | Xavier Camargo Imobiliaria | (19) 3522-7777 | Solutudo | 54 | missing |
| 17 | J C I Servicos Imobiliarios Ltda | (19) 3533-9616 | Solutudo | 54 | missing |
| 18 | Morato & Ursaia Empreendimentos E Participacoes Ltda | (19) 3526-7141 | Solutudo | 54 | missing |
| 19 | Schio Corretores De Imoveis Ltda | (19) 3534-5811 | Solutudo | 54 | missing |
| 20 | Rsp Administradora De Bens E Participacoes Ltda | (19) 2511-2624 | Solutudo | 54 | missing |

## Enriquecimento

### Rodada social-only - 20 cards

Payload usado: `/enrich-lead` com `preferredChannels=["instagram","facebook"]`, `requestedFields=["instagram","facebook"]`, `requiredChannels=[]`, `allowPaid=false`, `allowPremium=false`, `timeBudgetSeconds=10`.

Escopo desta rodada: somente Instagram/Facebook. Site, email e LinkedIn ficam para camadas posteriores.

Arquivo bruto: `tmp-radar-imobiliaria-rio-claro-socials-all.json`.

| # | Empresa | Instagram encontrado | Facebook encontrado | Possiveis | Status | Tempo | Comparacao com anexo |
|---|---|---|---|---:|---|---:|---|
| 1 | Imobiliária Mega | nao | nao | 0 | missing | 21.4s | ok: anexo tambem nao tem social |
| 2 | Rodinei Cezar Oliveira Ltda | nao | nao | 0 | missing | 60.6s | falhou: anexo encontrou Facebook Rodinei |
| 3 | SIMONE FERNADES Negócios imobiliários | nao | nao | 2 | missing | 43.4s | nao bateu: anexo aponta Facebook proximo Idealize; motor sugeriu handles Simone |
| 4 | Sanchez Corretores De Imoveis Ltda | timeout | timeout | 0 | timeout | 70.1s | inconclusivo: anexo nao confirmou social |
| 5 | Gasparotto Administradora De Bens E Participacoes Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 6 | Prevent Participacoes Ltda | nao | nao | 0 | missing | 66.9s | ok: anexo nao tem social |
| 7 | Lrm Administradora De Bens Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 8 | Immobiltec Participacoes Imobiliarias Do Brasil Ltda. | nao | nao | 0 | missing | 61.8s | ok: anexo nao tem social |
| 9 | Faenza Empreendimento Imobiliario Spe Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 10 | Marcio Rogerio Scatolin | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 11 | Villa Gardone Empreendimento Imobiliario Spe Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 12 | Pirinei Empreendimentos Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 13 | Imoveis & Oportunidades | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 14 | Ayf Administradora De Imoveis Ltda | nao | nao | 0 | missing | 58.3s | ok: anexo nao tem social |
| 15 | Parf Participacoes Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 16 | Xavier Camargo Imobiliaria | timeout | timeout | 0 | timeout | 70.0s | falhou/inconclusivo: anexo encontrou Facebook |
| 17 | J C I Servicos Imobiliarios Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 18 | Morato & Ursaia Empreendimentos E Participacoes Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |
| 19 | Schio Corretores De Imoveis Ltda | https://instagram.com/schioimoveis | nao | 0 | found | 51.7s | parcial: bateu Instagram; faltou Facebook ericas55 |
| 20 | Rsp Administradora De Bens E Participacoes Ltda | timeout | timeout | 0 | timeout | 70.0s | inconclusivo: anexo nao tem social |

Resumo da comparacao com a referencia manual:

- Confirmado igual/parcial: empresa 19 encontrou Instagram `schioimoveis`.
- Corretamente sem social: empresas 1, 6, 8 e 14 retornaram missing e o anexo tambem nao traz social.
- Falhas claras: empresa 2 nao encontrou Facebook de Rodinei; empresa 16 nao chegou no Facebook da Xavier Camargo; empresa 19 nao confirmou Facebook `ericas55`.
- Possivel ruim: empresa 3 gerou possiveis `simonefernades`, mas a referencia manual aponta outro Facebook proximo (`idealizeimoveisrc`), entao nao considero bom.
- Problema operacional: muitos cards bateram timeout de 70s. O social-only ainda precisa cortar melhor a busca por handles quando a empresa tem nome juridico/cadastral e nao marca comercial forte.
