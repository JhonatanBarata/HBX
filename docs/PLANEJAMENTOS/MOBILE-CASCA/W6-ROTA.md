# W6 — ROTA: /entrega re-vestido na casca ("outro aplicativo", regra 3 do dono)

> Ler PLANO.md + docs/Rules/FRONTEND.md + W1-RESULTADO.md + docs/PLANEJAMENTOS/LOGISTICA-MOBILE/
> (PLANO.md e A*-RESULTADO.md — contexto do app existente). Ordem do dono: "Rota entra em OUTRO
> aplicativo — pode ter outra cor e tals, mas é o MESMO ideal e MESMA casca, e ter como voltar
> para o HBX central NOS ÍCONES."

## O que muda (apresentação; lógica/endpoints/PWA INTOCADOS)
1. **Estrutura = casca do W1** (topo 1 linha + conteúdo + tab bar 54–56px), **skin própria**:
   `data-skin="entrega"` continua, cores/tokens do `entrega.css` vestem a casca (alto contraste
   de sol, mobile-first). Estrutura e componentes = os mesmos da casca central — outra COR,
   mesma casca. Reescrever a apresentação das telas do /entrega em cima da API da casca (não
   aproveitar os componentes de shell antigos do /entrega — EntregaTabBar/EntregaScaffold saem;
   ArrivalSheet e cia viram CascaSheet com a skin).
2. **Tab bar do Rota:** Rota · Clientes · Produtos · Ajustes · **HBX** (ícone de voltar pro app
   central → `/vendas`, com transição VOLTAR). É a exigência "voltar pro HBX central nos ícones".
3. **Transições:** TODAS as navegações/sheets do app com IR/VOLTAR da casca (chegada, stepper,
   confirmação — nada seco).
4. **Fullscreen (LEI — "especialmente no rota"):** ao tocar "Iniciar rota", oferecer tela cheia
   (1 toque) + **toast de aviso ao entrar**; toggle também em Ajustes. Wake Lock existente mantém.
5. Manter: PWA/manifest, geofence foreground, vibrate, swipe entre paradas, regras de pagamento
   condicional (M4), guardrails de WhatsApp (envio SÓ pelo caminho blindado — não tocar).

## Leis
Mesma régua de densidade (o app já é 1-polegar; alvos ≥52px valem aqui). ZERO texto explicativo
nas telas (lei do plano-mãe LOGISTICA-MOBILE). check-pele verde (hex SÓ em entrega.css).

## Checks
Viewport 375×812: entrar no Rota pela tab do HBX (transição), navegar as 4+1 abas, voltar pro HBX
pelo ícone; iniciar rota → oferta de fullscreen + aviso; fluxo Hoje→Rota→Chegada→Entregue segue
funcionando. Lighthouse instalável ok. lint+tsc+build. Commit `feat(mobile-casca): W6 rota`.
Gravar `W6-RESULTADO.md`, apagar este arquivo.
