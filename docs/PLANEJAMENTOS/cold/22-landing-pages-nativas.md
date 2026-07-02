# COLD-22 — Landing Pages nativas do CRM × nosso website-kit

**Tela deles:** `/appjs/landing-pages`. Tabs Páginas/Formulários/**Meus Domínios**. Promessa:
"crie sem programar, conecte GTM/Search Console/GA4, use seu domínio". Formulário da LP cria
LEAD no CRM (captura inbound fecha o ciclo outbound+inbound).

## Leitura
Pra eles, LP é feature de captura. PRA NÓS É MAIOR: o HBX já tem o **website-kit** (sites de
clientes em templates Firebase) — ou seja, já sabemos publicar site de verdade. O que falta é
LIGAR o site ao CRM.

## A jogada HBX (sinergia que eles não têm)
1. **Formulário do site do cliente → lead no card de Atendimento do cliente** (webhook do
   website-kit pro backend, empresa identificada pelo site). O cliente do HBX vê o site DELE
   gerando lead DENTRO do painel — retenção brutal do combo site+CRM.
2. **LP de campanha por segmento** (nossa venda): template "página do nicho" gerada a partir do
   website-kit (1 seção hero + form + WhatsApp flutuante) pra campanhas do próprio dono.
3. Métrica no card: "origem: site próprio" (nova origem de lead além do radar).

## Plano mínimo
1. Endpoint público de captura `POST /public/lead-capture/:siteToken` (rate-limited, honeypot).
2. Snippet de form no template do website-kit apontando pro endpoint.
3. Origem "site" no card + notificação pro dono do site via WhatsApp (rotina existente).
**Não fazer:** editor visual de LP (deles). Nosso editor é o website-kit que já existe.

**Gatilho:** primeiro cliente do website-kit pedindo "quero receber os contatos do site" — aí
vira quente na hora (é 1-2 dias de trabalho).
