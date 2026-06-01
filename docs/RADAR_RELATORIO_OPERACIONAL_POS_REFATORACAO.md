seguir commit como exemplo: ea46711, levar ele como macro

todas as pesquisas q eu realizei, foram feitas assim:
1 primeira pesquisa feita, pós filtro do primeiro score e resultado.
2 segunda pesquisa (enriquecimento): motor pega o resultado da primeira: {estabelecimento} + {cidade}+{estado} e este é o enriquecimento. Regra: não usar a api paga da google por enquanto.

## Teste operacional

empresa: 11 localhost
cidade: Rio Claro
estado: São Paulo / SP
segmento: alimentação
distância: 0
quantidade: 30 cards

## Resultado atual - primeira pesquisa pós filtro/score

Execução: primeira pesquisa HBX, sem enriquecimento social/site/e-mail.
Status: concluído
Quantidade solicitada: 30
Cards aprovados no Radar: 30
Cards filtrados/removidos: 1

### Escopo usado na busca primária

A busca literal por "alimentação Rio Claro SP" trouxe 2 cards. Para cumprir a busca primária do segmento alimentação, foi usada a expansão primária do próprio Radar:

- restaurantes
- pizzarias
- lanchonetes
- bares
- cafeterias
- panificadoras
- confeitarias
- docerias
- alimentos naturais
- mercados
- supermercados
- açougues

Fontes executadas até completar 30 cards:

- restaurantes: 29 resultados retornados
- pizzarias: 30 resultados retornados

Resultado removido antes da entrega:

- 20 restaurantes no Rio de Janeiro que você precisa conhecer
  motivo: resultado genérico/blog, sem empresa local e sem telefone próprio.

### 30 cards encontrados

empresa 1 - Mariana's
telefone: (19) 3524-7406
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/mariana-s-3660461

empresa 2 - Ananias Pizzaria
telefone: (19) 3532-1182
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/ananias-pizzaria-3650465

empresa 3 - Bar Do Baixinho
telefone: (19) 3523-3098
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/bar-do-baixinho-3649873

empresa 4 - Restaurante Barcelona
telefone: (19) 3524-0264
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/restaurante-barcelona-3650227

empresa 5 - Jaidete Santos De Almeida
telefone: (19) 7104-4864
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/jaidete-santos-de-almeida-3658837

empresa 6 - Pizza Express Rio Claro
telefone: (19) 3536-3112
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/pizza-express-rio-claro-20819244

empresa 7 - Marmitaria Da Sil
telefone: (19) 97127-4118
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/marmitaria-da-sil-21881881

empresa 8 - Ana Lidia Itri
telefone: (19) 3524-4022
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/ana-lidia-itri-3651873

empresa 9 - Jaja Rotisserie
telefone: (19) 3533-4123
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/jaja-rotisserie-3652651

empresa 10 - N Opcoes
telefone: (19) 3523-2397
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/n-opcoes-18682362

empresa 11 - Joaquim Restaurante
telefone: (19) 3532-1763
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/joaquim-restaurante-21867931

empresa 12 - Le Rotisserie
telefone: (19) 97128-0298
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/le-rotisserie-21881886

empresa 13 - Restaurante Universitário Unesp Rio Claro
telefone: (19) 3526-4124
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/restaurante-universitario-unesp-rio-claro-21867979

empresa 14 - Opção Natural Restaurante Vegetariano
telefone: (19) 99637-6806
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/opcao-natural-restaurante-vegetariano-21867933

empresa 15 - Neuzeli Da Silva Martins Trivelato
telefone: (19) 3533-1396
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/neuzeli-da-silva-martins-trivelato-3652623

empresa 16 - Restaurante, Lanchonete E Mercearia Crocantes Ltda
telefone: (19) 7171-6999
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/restaurante-lanchonete-e-mercearia-crocantes-ltda-24664418

empresa 17 - Barril 2000 Restaurante
telefone: (19) 3524-6857
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/barril-2000-restaurante-21867920

empresa 18 - La Bella Vegana Delivery
telefone: (19) 99819-7726
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/la-bella-vegana-delivery-21867731

empresa 19 - Mariana Carolina Marques
telefone: (19) 3536-1198
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/mariana-carolina-marques-3655674

empresa 20 - Espetinho da 26
telefone: (19) 99957-2299
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/espetinho-da-26-21881438

empresa 21 - Parmegiana Du Chef
telefone: (19) 3557-8565
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/parmegiana-du-chef-21867745

empresa 22 - Marmitaria Diva' S Delivery
telefone: (19) 3523-7257
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/marmitaria-diva-s-delivery-3657585

empresa 23 - RESTAURANTE PROSA MINEIRA
telefone: (19) 3557-6621
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/restaurante-prosa-mineira-21867955

empresa 24 - T-Maki Restaurante Japones
telefone: (19) 3533-4777
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/t-maki-restaurante-japones-3659468

empresa 25 - Restaurante Excelsior
telefone: (19) 3524-9401
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/restaurante-excelsior-19686509

empresa 26 - Madalupi Trattoria
telefone: (19) 98870-4192
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/madalupi-trattoria-21874341

empresa 27 - Massa Mania
telefone: (19) 99890-5499
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/massa-mania-mania-de-fazer-delicias-21874337

empresa 28 - O Rei Da Panela
telefone: (19) 7149-6783
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/restaurantes/o-rei-da-panela-20001813

empresa 29 - Espaço kevilin Gomes
telefone: (19) 99798-3123
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/pizzarias/espaco-kevilin-gomes-21867732

empresa 30 - Pizzaria edson
telefone: (19) 3533-8980
fonte: https://www.solutudo.com.br/empresas/sp/rio-claro/pizzarias/pizzaria-edson-21871674

## Resultado atual - enriquecimento via motor HBX

Execução: `/enrich-lead` no motor HBX, usando os 30 cards já entregues na primeira pesquisa.
Modo: enriquecimento pós-entrega, sem nova descoberta de cards.
Entrada do motor por card: {nome da empresa} + Rio Claro + SP + segmento do card.
Quantidade processada: 30 de 30
Erros finais: 0

Resumo do motor:

- Cards com social encontrado: 15
- Cards sem social confirmado pelo motor: 15
- Instagram confirmado: 14
- Facebook confirmado: 8
- Site confirmado: 0
- E-mail confirmado: 0
- Possíveis sociais entregues pelo motor: 0
- Matches confirmados pelo motor: 22

Observação operacional:

Rodada direta do motor em `tmp-radar-alimentacao-rio-claro-enrichment-v4.json`.
O motor validou handles sociais por card e derrubou falsos positivos genéricos encontrados na rodada anterior, como `espaco`, `naturalrestaurante`, `restauranteuniversitario`, `marmitaria`, `mercearia` e `espetinho`.
Quando o motor não encontrou social com confiança suficiente, o card permaneceu sem enriquecimento social.

### Enriquecimento por card

empresa 1 - Mariana's
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 2 - Ananias Pizzaria
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 3 - Bar Do Baixinho
instagram: https://instagram.com/barbaixinho
facebook: não
site: não
email: não
status do motor: found
confiança social: 100

empresa 4 - Restaurante Barcelona
instagram: https://instagram.com/restaurantebarcelona
facebook: não
site: não
email: não
status do motor: found
confiança social: 100

empresa 5 - Jaidete Santos De Almeida
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 6 - Pizza Express Rio Claro
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 7 - Marmitaria Da Sil
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 8 - Ana Lidia Itri
instagram: https://instagram.com/analidiaitri
facebook: não
site: não
email: não
status do motor: found
confiança social: 96

empresa 9 - Jaja Rotisserie
instagram: https://instagram.com/jajarotisserierc
facebook: não
site: não
email: não
status do motor: found
confiança social: 100

empresa 10 - N Opcoes
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 11 - Joaquim Restaurante
instagram: https://instagram.com/joaquimrestaurante
facebook: https://facebook.com/joaquimrestaurante
site: não
email: não
status do motor: found
confiança social: 100

empresa 12 - Le Rotisserie
instagram: https://instagram.com/lerotisserierc
facebook: https://facebook.com/lerotisserie
site: não
email: não
status do motor: found
confiança social: 100

empresa 13 - Restaurante Universitário Unesp Rio Claro
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 14 - Opção Natural Restaurante Vegetariano
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 15 - Neuzeli Da Silva Martins Trivelato
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 16 - Restaurante, Lanchonete E Mercearia Crocantes Ltda
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 17 - Barril 2000 Restaurante
instagram: https://instagram.com/barril2000restaurante
facebook: não
site: não
email: não
status do motor: found
confiança social: 100

empresa 18 - La Bella Vegana Delivery
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 19 - Mariana Carolina Marques
instagram: https://instagram.com/marianacarolinamarques
facebook: https://facebook.com/marianacarolinamarques
site: não
email: não
status do motor: found
confiança social: 96

empresa 20 - Espetinho da 26
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 21 - Parmegiana Du Chef
instagram: https://instagram.com/parmegianaduchef
facebook: https://facebook.com/parmegianaduchef
site: não
email: não
status do motor: found
confiança social: 96

empresa 22 - Marmitaria Diva' S Delivery
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 23 - RESTAURANTE PROSA MINEIRA
instagram: https://instagram.com/restauranteprosamineira
facebook: https://facebook.com/restauranteprosamineira
site: não
email: não
status do motor: found
confiança social: 100

empresa 24 - T-Maki Restaurante Japones
instagram: https://instagram.com/tmakirestaurantejapones
facebook: https://facebook.com/makirestaurante
site: não
email: não
status do motor: found
confiança social: 100

empresa 25 - Restaurante Excelsior
instagram: https://instagram.com/restauranteexcelsior
facebook: https://facebook.com/restauranteexcelsior
site: não
email: não
status do motor: found
confiança social: 100

empresa 26 - Madalupi Trattoria
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 27 - Massa Mania
instagram: https://instagram.com/massamania
facebook: não
site: não
email: não
status do motor: found
confiança social: 96

empresa 28 - O Rei Da Panela
instagram: não
facebook: https://facebook.com/oreidapanela
site: não
email: não
status do motor: found
confiança social: 86

empresa 29 - Espaço kevilin Gomes
instagram: não
facebook: não
site: não
email: não
status do motor: missing

empresa 30 - Pizzaria edson
instagram: https://instagram.com/pizzariaedson
facebook: não
site: não
email: não
status do motor: found
confiança social: 100

## Rodada de correção do enriquecimento - fase 2

Direção aplicada:

- fixture esperada criada em `hbx-scraping-engine/tests/fixtures/radar_alimentacao_rio_claro_expected.json`;
- o engine passou a expor `possibleSocialCandidates` no `/enrich-lead`;
- handle parecido sozinho deixou de ser confirmação automática;
- social abaixo de 70 de confiança não preenche mais `instagramUrl`/`facebookUrl`;
- perfil pessoal sem sinal comercial/local deixou de virar possível;
- site próprio sem evidência local deixou de ser confirmado.

Arquivos de evidência:

- rodada direta: `tmp-radar-alimentacao-rio-claro-enrichment-v6.json`
- comparação com fixture: `tmp-radar-alimentacao-rio-claro-compare-v6.json`

### Comparação contra o resultado esperado

Resultado esperado pela fixture:

- sinais oficiais esperados: 31
- cards com social/site/email esperado: 21

Resultado do motor gratuito/local após a correção:

- sinais oficiais confirmados corretamente: 0
- sinais oficiais perdidos: 31
- falsos confirmados: 0
- cards com candidato possível: 1
- erros do endpoint: 0

### O que melhorou

- Os falsos confirmados da rodada anterior foram removidos do campo oficial.
- Casos como Ana Lidia Itri, Mariana Carolina Marques, Parmegiana Du Chef, O Rei Da Panela, Pizzaria Edson e Massa Mania não entram mais como social confirmado só por handle parecido.
- O site falso `marianausa.com` também deixou de ser confirmado.
- O contrato agora separa confirmado de possível, preparando o front/Vendas para exibir certeza versus indício.

### O que piorou

- A cobertura caiu demais sem uma busca estruturada de qualidade.
- O motor gratuito/local não recuperou os mesmos resultados do anexo para Instagram, Facebook, cardápio, site Unesp, Linktree, iFood ou email.
- Na prática, sem SerpAPI/Google CSE, o motor ficou seguro contra lixo, mas não chegou no nível comercial desejado.

Conclusão operacional:

A fase 2 melhorou a precisão e eliminou falso confirmado, mas provou que a camada gratuita/local não é suficiente para bater o resultado esperado. O próximo passo arquitetural precisa ser ligar SerpAPI/Google CSE no enriquecimento pós-entrega, usando esta fixture como validação de regressão.
