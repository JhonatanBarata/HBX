Plano agressivo para o Radar
Fase 1 — Contrato de esteira: nada trava o que não deveria travar

Criar contratos em:

backend/src/webscraping/radar/shared/

Arquivos:

radar-stage.types.ts
radar-stage-policy.ts
radar-stage-result.ts
radar-error-codes.ts
radar-diagnostic.service.ts

Estados separados por lead:

leadStatus
deliveryStatus
enrichmentStatus
socialStatus
emailStatus
whatsappStatus
providerStatus

Exemplo:

leadStatus=qualified
deliveryStatus=delivered
socialStatus=error
enrichmentStatus=partial

Isso é válido. Social deu erro, mas o card foi entregue.

Bloqueia entrega
sem permissão
sem quota
input inválido
lead duplicado real
lead negativo/protegido
sem contato mínimo
qualidade abaixo do mínimo
falha total de persistência
Nunca bloqueia entrega
social
email enrichment
WhatsApp check
site enrichment
presentation
sync posterior com Vendas
provider secundário
cache
histórico
campanha/fábrica

Essa fase é obrigatória antes de mexer no social.

Fase 2 — Quality Gate forte

Criar um gate explícito em:

radar/02-filter/radar-quality-gate.service.ts

Ele decide se o lead pode virar card.

Critérios mínimos:

nome válido
cidade/UF coerente
telefone válido OU site válido OU WhatsApp válido
não é diretório genérico
não é duplicado real
não está protegido/negativo
não é marketplace/listagem
score mínimo

O quality gate precisa devolver:

{
  deliverable: boolean;
  reason: string;
  qualityScore: number;
  missing: string[];
  blocksDelivery: boolean;
}

Importante: social não entra como requisito obrigatório. Social aumenta score, mas não pode zerar lead bom.

Fase 3 — Delivery independente de enrichment

Criar ou reforçar:

radar/05-delivery/radar-delivery-orchestrator.service.ts
radar/05-delivery/radar-post-delivery-update.service.ts

Fluxo:

lead passou quality gate
  ↓
salva run item
  ↓
entrega Vendas
  ↓
agenda jobs extras

Jobs extras:

social
email
whatsapp
site
score update
post-delivery update

Se social falhar:

deliveryStatus continua delivered
socialStatus vira error
postDeliveryUpdate fica retryable
Fase 4 — Motor social novo, agressivo e assíncrono

Aqui sim entra o social forte.

Nova estrutura:

radar/04-socials/
  radar-social-orchestrator.service.ts
  radar-social-job.service.ts
  radar-social-query-planner.ts
  radar-social-candidate-extractor.ts
  radar-social-candidate-scorer.ts
  radar-social-result-writer.service.ts
  radar-social-types.ts

O RadarSocialLookupService atual vira compatibilidade/queue ou é reduzido para chamar o orchestrator.

Query planner agressivo

Hoje o social busca pouco. O novo planner precisa gerar queries por camadas:

1. nome fantasia + cidade + instagram/facebook
2. razão social + cidade + instagram/facebook
3. telefone com máscara + instagram/facebook
4. telefone sem máscara + instagram/facebook
5. domínio + instagram/facebook
6. site:instagram.com "nome" "cidade"
7. site:facebook.com "nome" "cidade"
8. "nome" "cidade" "whatsapp"
9. "nome" "endereço/bairro" instagram
10. handle provável: nome+cidade, nome+uf, nome+segmento
Candidate extractor

Extrair candidato de:

sourceUrl
url
website
instagramUrl
facebookUrl
title
snippet
description
rawJson
Scorer

Pontuar forte:

+35 nome/marca bate
+25 cidade bate
+20 telefone bate
+20 domínio bate
+15 endereço/bairro bate
+10 segmento bate
+10 handle parece marca
-40 cidade conflitante
-50 página genérica
-60 diretório
-80 terceiro/marketplace

Aceitação:

>= 75 confirmado
60-74 candidate_review
< 60 rejeitado

Resultado:

socialStatus = found | partial | candidate_review | missing | error

Se encontrar só Instagram:

socialStatus=partial
instagramUrl=...
facebookUrl=null

Não é missing.

Fase 5 — Search Engine melhor que o atual

Você já tem uma busca híbrida: Radar DB/cache/histórico → HBX → fallback Google. Isso é bom, mas dá para transformar em engine de verdade.

Criar:

radar/01-search/radar-search-orchestrator.service.ts
radar/01-search/radar-source-planner.service.ts
radar/01-search/radar-result-merger.service.ts
radar/01-search/radar-search-strategy.service.ts

O planner decide fontes:

Radar DB
histórico da empresa
global cache
HBX engine
Google textual
Google Places
site crawling leve
diretórios locais
CNPJ/base pública
reprocessamento de descartados

O search não deve pensar “chamo uma fonte”. Deve pensar:

preciso de 100 cards bons
fonte A deu 40
fonte B deu 20
fonte C deu 12
falta 28
aciona outra estratégia
Estratégias por modo
modo rápido:
Radar DB + cache + HBX

modo qualidade:
Radar DB + HBX + Google textual + social async

modo profundo:
HBX + Google textual + site crawl + diretórios + CNPJ

modo fábrica noturna:
CNPJ + diretórios + Google textual + reprocessamento + enriquecimento assíncrono
Fase 6 — Fontes novas para leads

Brainstorm agressivo:

1. Google textual por intenção

Não só Places.

"segmento" "cidade" "whatsapp"
"segmento" "cidade" "instagram"
"segmento" "cidade" "telefone"
"segmento" "cidade" "site"
"segmento" "cidade" "contato"
"segmento" "cidade" "orçamento"
2. Site crawling leve

Quando tiver site:

/
contato
sobre
atendimento
unidades
links

Procurar:

telefone
WhatsApp
Instagram
Facebook
email
CNPJ
endereço
3. CNPJ/base pública

Gerar leads por:

CNAE
cidade
situação ativa
nome fantasia
razão social
matriz/filial
porte

Depois enriquecer via Google/social.

4. Diretórios locais

Usar como fonte, não como verdade:

Associação Comercial
guias de cidade
portais locais
sindicatos
catálogos de fornecedores
marketplaces de serviços
5. Verticais específicas
restaurantes → cardápio/delivery
clínicas → portais médicos
imobiliárias → portais de imóveis
oficinas → guias automotivos
hotéis → turismo/reservas
escolas → educação
salões/barbearias → Instagram/local guides
6. Leads por sinal de oportunidade

Isso é poderoso para vender HBX:

empresa tem Instagram mas não tem WhatsApp claro
empresa tem site sem formulário funcionando
empresa tem telefone fixo sem canal digital
empresa tem Google Maps mas não tem social
empresa tem social ativo mas sem link de atendimento
empresa tem reclamações/avaliações sem resposta
empresa parece vender mas não tem automação

Esse tipo de lead não é só “contato”; é lead com argumento comercial.

7. Reprocessamento interno

O próprio HBX vira fonte:

cards sem social
cards com telefone mas sem WhatsApp
cards com site mas sem email
cards rejeitados por falta de canal
cards antigos por cidade/segmento
cards duplicados com dados complementares
Ordem que eu executaria agora
Commit 1 — Pipeline fail-open

Não mexe no social ainda. Só garante que nada bloqueia indevidamente.

Entregável:

radar-stage-policy
radar-stage-result
radar-diagnostic
testes: social falha e card continua entregável
Commit 2 — Quality Gate

Separar qualidade mínima de enriquecimento.

Entregável:

radar-quality-gate.service.ts
lead deliverable mesmo sem social
lead sem contato mínimo bloqueado
lead diretório bloqueado
Commit 3 — Delivery independente

Tirar qualquer dependência direta entre social e entrega.

Entregável:

delivery aceita social pending/error
post-delivery updater tenta atualizar depois
Commit 4 — Motor social novo

Criar social engine agressivo.

Entregável:

query planner
candidate extractor
candidate scorer
result writer
audit trail
Commit 5 — Search strategy engine

Criar planner de fontes.

Entregável:

radar-source-planner
estratégia rápido/qualidade/profundo/fábrica
Commit 6 — Novas fontes

Adicionar progressivamente:

Google textual
site crawl leve
CNPJ/base pública
diretórios
vertical strategies