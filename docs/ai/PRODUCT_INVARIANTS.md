# HBX Product Invariants

## Fluxo

1. O fluxo principal e `Radar -> Vendas -> WhatsApp -> Retorno`.
2. Radar e memoria de oportunidades, nao apenas busca.
3. Vendas opera leads reais e deve preservar timeline/historico.
4. WhatsApp e canal de contato/handoff, nao origem aleatoria de cards sem empresa.
5. Retorno deve alimentar historico, conversas, status e proximas acoes.

## Radar

- Card de Radar precisa representar empresa/oportunidade real.
- Fonte generica pode descobrir empresa, mas nao deve virar card so por ter texto bonito.
- Canal publico verificavel e valioso: telefone, WhatsApp, site, e-mail, rede social ou evidencia equivalente.
- Negativo protege o sistema contra repeticao; nao apagar, ignorar ou sobrescrever casualmente.
- Deduplicacao por telefone, empresa, documento, dominio, origem e fingerprint comercial deve ser preservada.
- Entrega para Vendas deve acontecer depois de busca, filtro, enriquecimento e apresentacao suficientes para o contexto.

## Vendas

- Lead comercial deve manter origem, status, timeline, notas e motivo de perda/negativo quando aplicavel.
- Automacoes nao devem driblar quota, plano ou consentimento.
- Cards vindos do Radar precisam carregar contexto suficiente para acao humana ou automacao segura.

## WhatsApp

- Contato proativo precisa respeitar opt-in/finalidade quando o fluxo exigir.
- Nunca logar token, credencial, payload sensivel ou conteudo privado alem do necessario.
- Instancias/tenants precisam permanecer isolados.
- Webwhats tem instrucoes proprias em `Webwhats/AGENTS.md`.

## Comercial e acesso

- Backend decide plano, quota, entitlement, assinatura e status comercial.
- Frontend pode esconder/mostrar UI, mas nao autoriza feature paga sozinho.
- Mudancas em checkout, webhooks, Mercado Pago, assinaturas, refunds e dados financeiros exigem testes e pedido explicito.
- Recurso pago nao pode ficar utilizavel sem autorizacao comercial valida.

## Auth e tenant

- Guards, roles, contexto master e fronteiras de empresa/usuario nao devem ser enfraquecidos.
- Qualquer query sensivel deve respeitar `companyId`, usuario autenticado, role ou contexto master conforme o modulo.

## UI

- Texto publico em PT-BR.
- Desktop operacional e cockpit, nao landing page.
- Mobile e simples, rapido e guiado.
- Tema claro e escuro precisam continuar legiveis.

