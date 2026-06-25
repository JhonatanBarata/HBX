# PLAN — Base CNPJ paga + posicionamento HBX List / Lead / Company

**STATUS: CONGELADO até o 1º cliente FULL (HBX Company).** Não construir antes disso. (Decisão do dono, 25/06.)

## Gatilho
Implementar a base CNPJ paga SOMENTE quando fechar o primeiro cliente FULL. Até lá, roda com Brave + camada free (já ligado).

## Fonte escolhida (cotação 25/06)
- **Casa dos Dados — 1º passo.** ~R$0,01/consulta (re-consulta do mesmo CNPJ em 30 dias = grátis). API REST v4/v5 com busca por CNAE+cidade + export. Pay-per-use → risco de custo baixo, sem assinatura alta.
- **Speedio / Econodata — upgrade de qualidade** (decisor validado, 80+ filtros). Assinatura ~R$297–2.000+/mês. Só quando volume/receita justificar.
- **CNPJ grátis** (BrasilAPI / CNPJá / CNPJ.ws) — só pra ENRIQUECER um CNPJ já conhecido. Telefone/e-mail da Receita é fraco; não faz descoberta robusta por segmento.

## Encaixe arquitetural (não confundir)
Isso é **DESCOBERTA** (gera leads NOVOS por segmento) = **fonte nova do Radar, fase `01-search`**. NÃO é o `provider_router` de enriquecimento (esse completa um lead já conhecido). São dois fluxos diferentes.

## Posicionamento (propaganda) — análise do dono
- **HBX List**: "Base CNPJ filtrada + contatos comerciais públicos + decisor provável quando encontrado." (não prometer demais)
- **HBX Lead**: "Além da base, o HBX cruza sinais públicos, identifica o melhor canal, sugere abordagem e entrega o card pronto pra ação." (cobra mais)
- **HBX Company**: "Mapeia mercado, integra CRM/ERP e alimenta a operação com leads classificados." (consultivo)

Régua do dono — **não** é game changer se: CSV com CNPJ / sócio da Receita tratado como decisor / telefone genérico / e-mail chutado / sem score / sem fonte / sem ação / sem cadência / sem histórico / sem validação. **É** game changer com: CNPJ ativo + ICP / decisor provável com fonte / contato público / WhatsApp pronto / score / enriquecimento automático / card no funil / cadência / retorno medido / limpeza de base / Lista Fria ≠ Lead Quente.

## O que JÁ entregamos hoje (vender List/Lead com o que existe)
Enriquecimento automático (site / Instagram / Facebook / e-mail), score de confiança (quality / social / email / oportunidade), canal recomendado, sinais + próxima ação + dica de pitch, WhatsApp confirmado (Webwhats), card dentro do funil. **Falta de verdade:** decisor (a PESSOA), cadência multi-toque estruturada, retorno medido fim-a-fim, rótulo explícito Lista Fria / Lead Quente.

## Pendências técnicas ligadas
- **Brave Search LIGADO** no localhost (provider tier free; entra só com a chave, sem `allowPaid`). — 25/06
- Cano `allowPaid`/`allowPremium` backend→motor pronto (torneira fechada). Amarrar ao plano ≥250 = pendente (Opus/financeiro), só quando ligar um pago de verdade.
