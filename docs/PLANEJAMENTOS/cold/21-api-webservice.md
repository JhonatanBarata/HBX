# COLD-21 — API / WebService (linha de receita futura)

**Tela deles:** `/app/api`. Duas APIs: **Busca de Empresas** (V2, docs + coleção Postman + vídeo)
e **API do CRM**. Chave Bearer visível com "Copiar" e "Revogar/alterar". Consumo debita créditos.
Há até tutorial de integração com CRM Dynamics (miram cliente grande).

## Leitura estratégica
Eles revendem o dado da Receita por API (tipo ReceitaWS/BrasilAPI pagas). Mercado real: sistemas
de terceiros (ERPs, contadores, antifraude leve) pagam por consulta.

## HBX: quando fizer, fazer DIFERENTE
Vender consulta cadastral crua = competir com BrasilAPI grátis e ReceitaWS barata. Perder.
O que SÓ o HBX teria pra vender por API: **o dado validado** — `GET /api/lead-check?cnpj=` →
cadastral + `whatsappValidado`, `siteVivo`, `notaIA`, `seloContato`. Cliente-alvo: plataformas
de crédito/marketplace B2B que precisam saber "essa empresa responde?".

## Plano mínimo (quando ativar)
1. API key por empresa/parceiro (tabela + middleware Bearer + rate limit).
2. 2 endpoints: `company/:cnpj` (cadastral local, barato) e `company/:cnpj/alive` (camadas vivas,
   mais caro, enfileira se frio).
3. Billing por consumo acoplado ao sistema de planos existente (frente financeira: Opus direto).
4. Docs = 1 página markdown + coleção Postman (copiar a simplicidade deles).

**Gatilho:** primeiro pedido externo real OU HOT-01/04 estáveis + fôlego. Até lá, frio.
