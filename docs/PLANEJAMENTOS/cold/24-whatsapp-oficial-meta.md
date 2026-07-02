# COLD-24 — WhatsApp oficial (Meta Business) como SEGUNDA opção de conexão

**Tela deles (print p14):** wizard "Adicionar nova conexão" 3 passos (Selecionar→Conectar→
Finalizar) com DUAS opções lado a lado, honestas:
- **Conexão WhatsApp Oficial (Meta Business)**: "API oficial, maior estabilidade, recursos
  avançados, suporte oficial" — tags "Alta estabilidade", "Recursos avançados".
- **Conexão WhatsApp não oficial**: "API não oficial. Menor estabilidade, porém recursos
  ilimitados" — tags "Recursos ilimitados", "**Sem custo adicional**".
Ou seja: eles assumem no produto que rodam um Baileys igual ao nosso Webwhats, e usam o oficial
como upsell de estabilidade.

## Leitura pro HBX
1. **Validação de arquitetura**: nosso Webwhats não é gambiarra — é o padrão do mercado inclusive
   em player grande. Parar de tratar como segredo sujo; tratar como "conexão ilimitada".
2. **Oficial faz sentido um dia** para: cliente enterprise/medroso, disparo em volume com bênção
   da Meta (templates aprovados), e como PLANO B se a Meta apertar o cerco no não-oficial.
   Custo: conversa cobrada pela Meta (R$ por conversa/24h), verificação de negócio, templates.

## Plano (só quando houver demanda real pagante)
1. Adapter `whatsapp-official` no Webwhats (Meta Cloud API: webhook + send de template/mensagem)
   atrás da MESMA interface interna do motor — o app não sabe a diferença.
2. Wizard de conexão com as 2 opções (copiar a honestidade deles: prós/contras na cara).
3. Preço: conexão oficial só em plano alto (repassa custo Meta + margem).
**Regras duras continuam**: 1 número=1 conexão, disjuntor, teto de disparo — independem do tipo.

**Gatilho:** 1º cliente que exigir oficial OU sinal de risco sistêmico no não-oficial.
