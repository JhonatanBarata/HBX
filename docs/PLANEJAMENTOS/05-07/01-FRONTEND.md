# Auditoria fiscal do frontend HBX — 05/07/2026

> Plano de implantação para o Fable. Auditoria read-only do produto; este arquivo não implementa correções.

## 1. Snapshot, escopo e critério

- Snapshot: `master` em `517d7fff`, observado em 05/07/2026 entre 15:00 e 15:55 BRT.
- O worktree mudou durante a auditoria. No fechamento, havia alterações locais de terceiros em `frontend/src/app/(app)/leads/page.client.tsx`, `configuracoes/page.client.tsx`, `frontend/src/components/hbx/credits-wallet-section.tsx` e `frontend/src/app/hbx-theme/screens.css`. Elas foram preservadas. As linhas abaixo apontam para o snapshot corrente; use o texto e o símbolo, não apenas o número da linha, se o Fable continuar editando.
- Severidade: **P0** = cobrança/dado/segurança comercial rompida; **P1** = risco alto de conta errada, indisponibilidade ou perda operacional; **P2** = falha funcional/UX relevante ou dívida que torna regressão provável; **P3** = higiene, consistência ou otimização sem bloqueio imediato.
- Estado: **confirmada** significa caminho determinístico no código ou comando reproduzido. **Hipótese a validar** significa risco sustentado por evidência, mas sem reprodução visual/live.
- Norte usado: Radar → Vendas → WhatsApp → Retorno; backend é fonte de verdade; módulos e dados pagos devem ser fail-closed; desktop e mobile; temas light/dark; 5 Leis e Glass Pill.

## 2. Veredito executivo

O frontend compila e passa o fiscal de pele, mas não está pronto para ser tratado como “fechado”. Existe **1 P0 comercial confirmado**, seguido de falhas P1 em isolamento de sessão, fallback de entitlement, autenticação inicial, reconexão e peso de entrada.

| ID | Sev. | Estado | Brecha | Decisão fiscal |
|---|---:|---|---|---|
| FE-01 | P0 | Confirmada | Dados Pro de empresa/sócio ficam no payload e no DOM de tier inferior; o bloqueio é só blur | Corrigir antes de qualquer polimento |
| FE-02 | P1 | Confirmada por fluxo de código | Caches globais sobrevivem a logout/login e podem reapresentar usuário/plano/módulos anteriores | Centralizar e invalidar sessão |
| FE-03 | P1 | Confirmada | Falha de `/commercial-plans/me` vira inteligência liberada por default; falhas são cacheadas | Tornar entitlement fail-closed e observável |
| FE-04 | P1 | Confirmada | App autenticado renderiza antes de autenticar e usa identidade fictícia no estado nulo | Criar bootstrap de sessão explícito |
| FE-05 | P1 | Confirmada | SSE reconecta indefinidamente e `apiFetch` não tem timeout/cancelamento padrão | Colocar disjuntor, timeout e visibilidade |
| FE-06 | P1 | Confirmada | Login/auth carrega até 23,65 MiB em 10 PNGs de fundo | Otimizar e carregar sob demanda |
| FE-07 | P2 | Confirmada | Handoff para WhatsApp depende de `sessionStorage`, é duplicado e pode abrir conversa errada | URL canônica + helper único |
| FE-08 | P2 | Confirmada | Retorno só agenda 09:00 no fuso do navegador | Capturar data/hora/fuso explicitamente |
| FE-09 | P2 | Confirmada | Requests concorrentes podem sobrescrever resultado novo; loading/erro/vazio não têm contrato uniforme | Camada de query e estado assíncrono |
| FE-10 | P2 | Confirmada | Padrão HbxGuide não existe e seleções novas ainda quebram a regra Glass Pill | Implantar componentes centrais antes de migrar telas |
| FE-11 | P2 | Confirmada | Modais, linhas e `span` clicáveis não têm semântica/foco consistente | Primitive acessível central |
| FE-12 | P2 | Confirmada | CSS global de 548,5 KiB e rota Vendas acopla Radar inteiro estaticamente | Separar CSS/chunks e medir orçamento |
| FE-13 | P2 | Confirmada | Testes estáticos apontam para arquivos removidos; mocks de módulo divergem do contrato | Recuperar confiança da suíte |
| FE-14 | P2 | Risco confirmado; exploração não localizada | Bearer em Web Storage e ausência declarada de CSP ampliam impacto de XSS | Migrar sessão e ativar CSP por fases |
| FE-15 | P3 | Confirmada | Arquivos-monólito e documentação de tema divergente elevam custo de mudança | Fatiar por domínio após P0/P1 |

## 3. Achados priorizados

### FE-01 — P0 — paywall de dados Pro é apenas visual

**Estado:** falha confirmada por cruzamento frontend/backend.

**Evidências**

- `frontend/src/components/hbx/detalhes-negocio.tsx:474-489`: `LockGate` monta os `children` mesmo quando `locked` e apenas adiciona overlay.
- `frontend/src/app/hbx-theme/kit.css:1563-1590`: a proteção é `filter: blur(4px)`, `pointer-events:none` e `user-select:none`; isso não remove texto do HTML/DevTools/acessibilidade.
- `frontend/src/components/hbx/detalhes-negocio.tsx:1211-1289`: CNPJ, razão social, sócio, telefone/redes do dono e pessoas são montados dentro do `LockGate`.
- `frontend/src/components/hbx/detalhes-negocio.tsx:1085-1089`: o frontend usa `canSeeCompanyData` para decidir o cadeado.
- `backend/src/commercial-plans/commercial-plans.service.ts:359-360`: inteligência é liberada em tier diferente de `list`; dados de empresa somente em `full`.
- `backend/src/vendas/vendas.service.ts:1484-1502`: o DTO, porém, inclui `companyData` quando `canSeeLeadIntelligence`, não quando `canSeeCompanyData`. Assim, o tier Lead recebe os valores que a UI apenas borra como “Disponível no HBX Pro”.

**Impacto:** quebra de cobrança/segmentação e exposição de dado pessoal/comercial de sócio. Usuário sem Pro lê a resposta de rede ou o DOM sem pagar. O frontend não pode ser a fronteira de autorização.

**Causa:** capability errada no serializer + componente de upsell que reutiliza o conteúdo real como teaser.

**Solução proposta:** no backend, omitir/nulificar `companyData`, `people`, `owner*`, `phones` e equivalentes usando `canSeeCompanyData`; no frontend, `LockGate` bloqueado deve montar apenas placeholder sintético, nunca `children` reais. Tipar DTOs por capacidade para impedir regressão.

**Critérios de aceite**

- List e Lead: campos Pro ausentes no JSON, DOM, árvore de acessibilidade e React props serializadas.
- Pro/Implantação: campos presentes normalmente.
- Upgrade/teaser usa skeleton sem valores reais.
- A inspeção de Network e DOM não revela CNPJ/sócio/telefone do dono em tier sem acesso.

**Testes:** contrato backend parametrizado por todos os tiers; Playwright com List, Lead e Pro; assert negativo no `response.body()` e em `document.body.innerText`; teste de regressão para enriquecimento manual.

**Rollback:** feature flag server-side para desabilitar totalmente o bloco Empresa/Pessoas. Reverter somente o frontend **não** fecha a brecha se o payload continuar expondo dados.

### FE-02 — P1 — caches atravessam troca de conta

**Estado:** caminho determinístico confirmado; falta reprodução visual por indisponibilidade do navegador integrado.

**Evidências**

- `frontend/src/components/hbx/shell.tsx:357-379`: `currentUserPromise` é global e não é chaveada pelo token.
- `frontend/src/components/hbx/shell.tsx:424-445`: `planMeCache` é global por 60 s.
- `frontend/src/components/hbx/shell.tsx:553-575`: `myModulesCache` também é global por 60 s.
- `frontend/src/components/hbx/shell.tsx:1099-1110`: logout do topo limpa apenas `currentUserPromise`; não limpa plano/módulos.
- `frontend/src/components/hbx/mobile-tab-bar.tsx:84-95`, `bloqueio-gate.tsx:127-132` e `app/(app)/master/page.client.tsx:209-218`: outros logouts não limpam nenhum desses caches.
- `frontend/src/app/login/page.client.tsx:158-169`: novo login navega via router, sem reload obrigatório; os módulos JS e seus caches continuam vivos.

**Impacto:** após sair de A e entrar em B na mesma aba, a UI pode exibir nome, plano, módulos e decisões de visibilidade de A. Requests mutáveis usam o token novo, criando mistura perigosa entre identidade visual e conta efetiva.

**Causa:** caches ad hoc em escopo de módulo, múltiplas implementações de logout e ausência de identificador de sessão na chave.

**Solução proposta:** criar `session-store` único com `status`, `user`, `plan`, `modules`, `sessionKey`; chavear cache por fingerprint não reversível do token/user ID; `setToken` e `clearToken` invalidam tudo; todos os logouts chamam uma única função. Como mitigação rápida, `window.location.replace('/login')` após limpar sessão.

**Critérios de aceite:** troca A→logout→B nunca exibe dado de A; logout por topo, mobile, paywall, Master e 401 têm o mesmo efeito; cache não sobrevive a token diferente.

**Testes:** Playwright sequencial com dois perfis de nomes/planos/módulos distintos; unitário do store; teste de 401 concorrente.

**Rollback:** manter a API nova atrás de flag; fallback seguro é reload completo no logout/login, não restaurar cache global sem chave.

### FE-03 — P1 — entitlement falha aberto e erro é cacheado

**Estado:** falha confirmada.

**Evidências**

- `frontend/src/components/hbx/shell.tsx:426-430`: erro de `/commercial-plans/me` vira `null` e é cacheado por 60 s.
- `frontend/src/components/hbx/shell.tsx:455-461`: estado inicial assume tier `lead` e `canSeeLeadIntelligence:true`.
- `frontend/src/components/hbx/shell.tsx:469-484`: resposta sem tier/plano cai novamente em `lead` e libera inteligência.
- `frontend/src/components/hbx/detalhes-negocio.tsx:1085-1089`: enquanto não carrega, inteligência fica liberada.
- `frontend/src/components/hbx/shell.tsx:555-575`: falha de módulos vira lista vazia “loaded”, também cacheada, ocultando módulos sem explicar/retry.

**Impacto:** inconsistência comercial (conteúdo premium pode piscar/liberar se outro endpoint trouxer o dado), e falha transitória de rede vira painel mutilado por 60 s.

**Causa:** `null` mistura “sem plano”, “carregando” e “erro”; defaults foram escolhidos para “não travar ninguém”.

**Solução proposta:** estado discriminado `idle|loading|success|error`; em erro, não cachear como sucesso; capabilities iniciam `false`; placeholder até decisão do backend; retry manual + backoff; catálogo ausente nunca promove tier.

**Critérios de aceite:** erro 500/offline não libera premium, não mostra plano fictício e oferece retry; sucesso posterior recupera sem reload; módulo pago só aparece com `accessible:true`.

**Testes:** respostas atrasada/500/timeout/malformada; assert de ausência antes e depois do erro; recuperação após retry.

**Rollback:** flag para retornar à leitura antiga mantendo o frontend fail-closed; nunca reativar defaults permissivos.

### FE-04 — P1 — bootstrap de autenticação permite flash e identidade fake

**Estado:** falha confirmada.

**Evidências**

- `frontend/src/app/(app)/layout.tsx:8-10`: `AuthGate` e `AppShell` são irmãos; o app é montado sempre.
- `frontend/src/components/hbx/auth-gate.tsx:19-23`: token é verificado somente em `useEffect`, depois da primeira pintura.
- `frontend/src/components/hbx/shell.tsx:369-379`: `useCurrentUser` não expõe loading/error.
- `frontend/src/components/hbx/shell.tsx:382-388`: usuário nulo vira “Mariana Souza” e “Gerente Comercial”, contrariando `docs/Rules/FRONTEND.md:141-142`.

**Impacto:** flash de tela protegida, requests sem token, falsa identidade durante loading/erro e possibilidade de o usuário operar acreditando estar em outro contexto.

**Causa:** guarda como efeito lateral, `null` ambíguo e fallback de demonstração em produção.

**Solução proposta:** `SessionBootstrap` envolve o shell; sem token redireciona antes de montar conteúdo; com token mostra skeleton até `/profile/current-user`; erro oferece retry/saída. Remover nomes/cargos fake e usar “—”/skeleton.

**Critérios de aceite:** visita sem token não pinta shell nem dispara APIs privadas; perfil lento não mostra identidade inventada; 401 termina em login com foco e aviso.

**Testes:** Playwright sem token, token inválido, perfil lento, 500 e conta removida; snapshot sem texto fake.

**Rollback:** preservar redirecionamento atual como fallback, mas manter shell oculto até resolver autenticação.

### FE-05 — P1 — rede sem timeout e SSE sem disjuntor

**Estado:** falha confirmada.

**Evidências**

- `frontend/src/lib/api.ts:68-80`: `apiFetch` chama `fetch` sem timeout, request ID ou política de retry.
- `frontend/src/app/(app)/atendimento/page.client.tsx:954-991`: SSE usa `while (alive)`; qualquer 401/403/500 entra em reconexão sem teto, com espera limitada a 9 s.
- `frontend/src/app/(app)/atendimento/page.client.tsx:959-963`: fetch direto não passa pelo tratamento global de 401.
- `frontend/src/app/(app)/atendimento/page.client.tsx:659-665`, `1041-1064`: status, lista e presença continuam em polling; não há pausa por `document.visibilityState`.
- `frontend/src/app/(app)/relatorios/page.client.tsx:217-241`: exportação também usa fetch direto e não herda o fluxo de 401.

**Impacto:** loading eterno, tempestade silenciosa após sessão inválida, consumo de bateria/dados em mobile e carga desnecessária no backend.

**Causa:** exceções de streaming/blob fora do client comum e polling por componente.

**Solução proposta:** `apiRequest` comum com timeout/AbortSignal e handler de 401; adaptadores `apiStream`/`apiBlob`; SSE com backoff exponencial+jitter, teto, pausa em aba oculta/offline e estado “Reconectar”; polling unificado e visibility-aware.

**Critérios de aceite:** 401 encerra stream e limpa sessão uma vez; 5xx não passa do teto; offline não faz loop; retorno à aba revalida uma vez; requests pendentes são abortados ao desmontar.

**Testes:** fake timers/unitário da máquina de estados; Playwright com SSE 401/500/morto; teste de `visibilitychange` e `offline/online`.

**Rollback:** flag para desabilitar SSE e usar polling com intervalo conservador; não restaurar loop infinito.

### FE-06 — P1 — entrada de auth transfere até 23,65 MiB de imagens

**Estado:** falha confirmada por inventário de assets e DOM/CSS; transferência real deve ser confirmada em Network.

**Evidências**

- `frontend/src/app/login/page.client.tsx:234-239` e `components/hbx/hbx-scene.tsx:115-120`: cinco frames existem simultaneamente.
- `frontend/src/app/hbx-theme/screens.css:65-84`: cada frame referencia um PNG dark e outro light, inclusive quando opacity é zero.
- Os dez arquivos `public/robo-*.png` + `public/* light.png` somam **23,65 MiB** no disco; cada imagem varia aproximadamente de 2,0 a 2,7 MiB.

**Impacto:** login lento em 4G, alto consumo de dados, LCP/CPU ruim e abandono antes da autenticação.

**Causa:** carrossel usa dez backgrounds CSS eager em vez de imagem responsiva/lazy.

**Solução proposta:** converter para AVIF/WebP responsivo; carregar apenas o primeiro frame/LCP; pré-carregar o próximo em idle; baixar variante light ou dark conforme modo; respeitar `Save-Data`/reduced motion; manter fallback estático leve.

**Critérios de aceite:** imagem inicial ≤250 KiB mobile e ≤500 KiB desktop; total antes de interação ≤1 MiB; sem layout shift; visual e transição preservados.

**Testes:** Lighthouse/WebPageTest em Fast 4G; Network em light/dark e `Save-Data`; regressão visual login/register/reset.

**Rollback:** servir um frame WebP estático; nunca recolocar os dez PNGs eager.

### FE-07 — P2 — handoff Vendas/Radar → Conversas é frágil e duplicado

**Estado:** falha confirmada; abertura errada ocorre quando storage falha ou a resposta vem sem ID.

**Evidências**

- `frontend/src/app/(app)/vendas/page.client.tsx:679-703`: cria conversa, tenta gravar ID em `sessionStorage`, ignora falha e navega mesmo assim; resposta sem `id` não produz erro.
- `frontend/src/app/(app)/leads/page.client.tsx:1023-1043`: mesma função copiada.
- `frontend/src/app/(app)/atendimento/page.client.tsx:903-912`: destino é consumido e removido uma única vez do storage.

**Impacto:** usuário clica WhatsApp em um lead e pode cair na primeira conversa/default, perdendo contexto e aumentando risco de responder ao contato errado.

**Causa:** transporte de navegação fora da URL e duplicação da regra.

**Solução proposta:** helper único `openInternalConversation`; depois do POST navegar para `/atendimento?conversation=<id>`; Atendimento valida o ID contra a lista/endpoint e mantém deep link até selecionar. Storage só como compatibilidade temporária.

**Critérios de aceite:** refresh, back/forward e nova aba mantêm conversa; storage indisponível não altera destino; ID ausente mostra erro e não navega.

**Testes:** Playwright Radar→Vendas→WhatsApp; storage lançando exceção; resposta sem ID/404/403; duas conversas abertas em sequência.

**Rollback:** aceitar query e storage durante uma versão; remover storage apenas após telemetria confirmar adoção.

### FE-08 — P2 — Retorno perde hora e depende do fuso do dispositivo

**Estado:** falha confirmada para precisão; necessidade de hora fixa é hipótese de produto a validar.

**Evidência:** `frontend/src/app/(app)/vendas/page.client.tsx:639-651` transforma a data em `${retornoData}T09:00:00` no fuso do navegador e envia ISO. Não há escolha de horário/fuso.

**Impacto:** todo retorno cai às 09:00; dispositivo fora de `America/Sao_Paulo` grava instante diferente; agenda e WhatsApp podem lembrar no horário errado.

**Solução proposta:** campo data+hora com default comercial configurável; enviar ISO e `timeZone`; backend normaliza. Se o produto realmente for “dia, sem hora”, transportar `date` sem conversão local e definir a hora no backend.

**Critérios de aceite:** mesmo instante esperado em São Paulo, Manaus e navegador UTC; UI informa fuso; retorno aparece na coluna/agenda correta.

**Testes:** unitário com DST/fusos suportados e Playwright em contextos `timezoneId` diferentes.

**Rollback:** manter default 09:00 no backend por empresa; não voltar a construir ISO implicitamente no browser.

### FE-09 — P2 — requests podem chegar fora de ordem; estados não são uniformes

**Estado:** falha arquitetural confirmada; sobrescrita precisa ser reproduzida com latência invertida.

**Evidências**

- `frontend/src/app/(app)/leads/page.client.tsx:534-563`: `loadList` não aborta request anterior nem compara request ID.
- `frontend/src/app/(app)/leads/page.client.tsx:605-610` (bloco de debounce): filtros disparam novas leituras; uma resposta antiga pode vencer a nova.
- `frontend/src/app/(app)/vendas/page.client.tsx:463-481`: board tem a mesma ausência de cancelamento.
- Radar começa com `data:null` e deriva `items=[]`; Vendas começa com `board:null`. Não há primitive comum de skeleton/loading/error/empty.

**Impacto:** filtros exibem resultado antigo sob seleção nova, ações podem operar em card inesperado e usuário confunde “carregando” com “vazio”.

**Causa:** fetch manual em cada página e estado assíncrono representado por valores soltos.

**Solução proposta:** hook central de query com AbortController ou contador monotônico; manter `status`; preservar dados anteriores com indicador de revalidação; erro com retry; mutações idempotentes e reconciliação.

**Critérios de aceite:** resposta antiga nunca sobrescreve filtro atual; loading, erro, vazio e sucesso são distinguíveis em todas as rotas críticas.

**Testes:** latência invertida; troca rápida de filtros/abas/vendedor; cancelamento no unmount; erro seguido de retry.

**Rollback:** ativar hook por rota; Radar e Vendas podem voltar independentemente sem mudar DTO.

### FE-10 — P2 — HbxGuide ausente e Glass Pill ainda é violada

**Estado:** não conformidade confirmada.

**Evidências**

- Busca em `frontend/src` por `HbxGuide1`, `HbxGuide4`, `hbx-guide1`, `hbx-guide4`, `hbx-guide5`, `hbx-desktop-container` e `hbx-content-container` retornou zero ocorrências. Os componentes previstos pelo padrão não existem no snapshot.
- `docs/Rules/FRONTEND.md:34-63` exige Glass Pill em qualquer seleção exclusiva.
- Mudança local atual em `frontend/src/app/(app)/leads/page.client.tsx:1251-1281` implementa seleções “Tem site/WhatsApp” com classe `--on`, sem `useGlassPill`.
- `frontend/src/app/hbx-theme/screens.css:2223-2225` troca background/borda instantaneamente e usa radius literal `999px`.
- Tabs legadas de Radar em `leads/page.client.tsx:1789-1800` e paginação em `1958-1962` também usam estado local instantâneo.

**Impacto:** cada tela inventa navegação, aumenta CSS específico e a implantação atual já nasce fora da regra de 05/07.

**Solução proposta:** primeiro criar/testar `HbxGuide1`, `HbxGuide4`, `HbxGuide5` e wrappers; depois migrar uma rota por vez. Para filtros exclusivos, usar `useGlassPill`/`GlassPill`; paginação não deve fingir ser guia, mas precisa de primitive próprio.

**Critérios de aceite:** páginas operacionais começam pela guia padrão; nenhum grupo exclusivo novo usa `--on` visual instantâneo; grep/lint fiscaliza o padrão; light/dark e reduced motion aprovados.

**Testes:** Story/rota `/dev/pele` para os guides; visual regression em 1366×768, 1440×900, 397×860; teclado e reduced motion.

**Rollback:** migrar por rota sem remover classes antigas até aprovação visual; flag de composição, nunca duplicar regra de negócio.

### FE-11 — P2 — acessibilidade de overlays e ações é incompleta

**Estado:** falha confirmada por inventário estático.

**Evidências**

- Foram contadas 54 ocorrências de `.hbx-veil`, mas apenas 32 `role="dialog|alertdialog"` e 31 `aria-modal="true"` no TSX.
- Não existe focus trap/inert central; apenas componentes isolados movem foco.
- `frontend/src/app/(app)/atendimento/page.client.tsx:2150`, `2241`, `2310`, `2670`: ações em `span/div` sem teclado/semântica.
- `frontend/src/app/(app)/relatorios/page.client.tsx:496`, `vendas/page.client.tsx:1253` e janelas Master usam `<tr onClick>` sem equivalência de teclado.
- Vários modais em Vendas (`1418`, `1488`, `1556`, `1634`, `1673`) e Radar (`1619`, `2014`, `2030` no snapshot atual) não usam primitive acessível uniforme.

**Impacto:** teclado/leitor de tela não alcança ou não entende ações; foco pode escapar para conteúdo atrás do modal; Esc e retorno de foco variam.

**Solução proposta:** `HbxDialog/HbxDrawer/HbxPopover` centrais com portal, label, focus trap, Esc, restore focus, scroll lock e `inert`; substituir spans/divs/rows clicáveis por button/link ou adicionar padrão completo.

**Critérios de aceite:** axe sem violações críticas; modal mantém foco dentro e devolve ao gatilho; todas as ações funcionam com Tab/Enter/Espaço/Esc; nomes acessíveis únicos.

**Testes:** `@axe-core/playwright`, navegação somente por teclado e leitor de tela manual em Vendas/Atendimento/Checkout/Master.

**Rollback:** primitive aceita classes existentes para preservar visual; migrar modal por modal.

### FE-12 — P2 — bundle/CSS monolítico

**Estado:** falha de performance confirmada por artefato de build.

**Evidências**

- `frontend/src/app/globals.css:9-76` importa kit, screens e todos os módulos/temas globalmente.
- O CSS de produção `frontend/.next/static/chunks/022f8fde91e8c422.css` mediu **548,5 KiB** não comprimidos.
- `frontend/src/app/(app)/vendas/page.client.tsx:15-25` importa estaticamente `DetalhesNegocio`, Modo Foco e o `LeadsClient` inteiro.
- O conjunto de chunks JS declarado para Vendas mediu aproximadamente **379,5 KiB** não comprimidos, além do CSS global.
- Fontes monolíticas: Atendimento 2.705 linhas, Radar/Leads ~2.093, Vendas 1.809, `DetalhesNegocio` 2.032, `shell.tsx` 1.510; `screens.css` ~4.154.

**Impacto:** parse/hidratação altos, sobretudo mobile; qualquer alteração invalida chunks grandes; refatorações colidem.

**Solução proposta:** CSS por layout/rota; manter tokens/kit realmente globais; lazy-load Radar ao selecionar “Buscar empresas”, modais pesados e processamento de voz; dividir páginas por domínio/hooks sem duplicar regras.

**Critérios de aceite:** orçamento por rota no CI; Vendas inicial não baixa Radar até abrir; CSS inicial cai substancialmente; métricas de interação não pioram.

**Testes:** bundle analyzer, Lighthouse, coverage de CSS/JS, teste de lazy chunk no Network.

**Rollback:** dynamic imports por componente são reversíveis; não alterar contrato da API na mesma entrega.

### FE-13 — P2 — suíte dá falsa confiança

**Estado:** falha reproduzida.

**Evidências**

- `node --test tests/frontend-vendas-channel-icons.test.mjs tests/frontend-radar-channel-filter.test.mjs` falhou 2/2 com `ENOENT`.
- `tests/frontend-vendas-channel-icons.test.mjs:5` aponta para `frontend/src/app/vendas/page.client.tsx`, removido.
- `tests/frontend-radar-channel-filter.test.mjs:5` aponta para `frontend/src/app/radar-digital/page.client.tsx`, removido.
- `package.json:31-32` só expõe Playwright; esses testes Node não entram no comando oficial.
- `tests/e2e/mobile-no-overflow.spec.ts:68-72` mocka `moduleKey`, enquanto produção indexa `m.key` em `shell.tsx:572-574`; o teste pode esconder a navegação em vez de validá-la.
- O fiscal mobile verifica só overflow horizontal (`mobile-no-overflow.spec.ts:254-302`), não o requisito desktop sem scroll vertical, temas ou modais.
- `npx playwright test --list` encontrou 44 casos declarados em 6 arquivos/projetos; lint/build não executam essa suíte.

**Impacto:** regressão pode passar CI e teste verde pode validar uma tela mutilada pelos próprios mocks.

**Solução proposta:** scripts `test:unit`, `test:contract`, `test:e2e`; remover/atualizar testes de código-fonte; fixture compartilhada tipada pelo DTO real; `webServer` no Playwright; matriz light/dark, desktop/mobile, roles/tiers.

**Critérios de aceite:** nenhum teste aponta para arquivo morto; mocks quebram compilação quando DTO muda; CI executa lint→unit→build→e2e crítico; relatório explicita skips.

**Testes:** a própria pipeline; adicionar FE-01, FE-02, FE-05, handoff e retorno como regressões obrigatórias.

**Rollback:** separar job E2E inicialmente não bloqueante por poucos dias, mas P0/P1 devem bloquear merge desde o primeiro dia.

### FE-14 — P2 — token exposto a XSS e CSP ausente

**Estado:** hardening ausente confirmado; nenhum exploit XSS dinâmico foi localizado nesta auditoria.

**Evidências**

- `frontend/src/lib/api.ts:29-55`: bearer fica em `localStorage`/`sessionStorage`, acessível a qualquer JS da origem.
- `frontend/next.config.ts:18-35`: headers básicos existem, mas linhas 27-28 registram CSP como follow-up.
- `frontend/src/app/layout.tsx:33-58`: scripts inline de boot/SW exigirão nonce/hash na migração.

**Impacto:** qualquer XSS futuro rouba sessão persistente; sem CSP, a defesa em profundidade é menor.

**Solução proposta:** preferir cookie `HttpOnly; Secure; SameSite` com proteção CSRF; enquanto migra, CSP report-only com nonce/hash e allowlist mínima, depois enforce; Trusted Types se viável; não interpolar dado externo em HTML.

**Critérios de aceite:** JS não lê credencial de sessão; CSP report-only sem violações legítimas por período definido e depois enforce; login Google/SW/tema continuam funcionando.

**Testes:** headers em produção, CSRF, logout/revogação, tentativas de script inline não autorizado.

**Rollback:** CSP volta para report-only se bloquear integração; cookie pode coexistir temporariamente com bearer. Não remover headers existentes.

### FE-15 — P3 — manutenção, contrato e tema

**Estado:** dívida confirmada.

**Evidências**

- Tamanhos monolíticos listados em FE-12 concentram API, polling, estado e render no mesmo arquivo.
- Tipos de resposta são declarados localmente nas páginas; não há geração/validação runtime de contrato no `frontend/package.json`.
- `frontend/src/components/hbx/theme-attributes.tsx:18-23` e `globals.css:65-68` registram quatro peles, mas `docs/Rules/FRONTEND.md:70-84` documenta três; `globals.css:6` ainda diz “nenhuma pele instalada”.
- `theme-future.css` tem ~51,5 KiB e não está importado/registrado.

**Impacto:** drift de DTO, refatoração cara e decisões erradas pelo Fable ao confiar em documentação desatualizada.

**Solução proposta:** gerar tipos OpenAPI ou pacote DTO compartilhado; validar bordas críticas; extrair hooks/services/components por domínio; alinhar documentação e remover/arquivar CSS órfão após confirmar que não é referência.

**Critérios de aceite:** contrato muda e TypeScript aponta consumidores; docs, registry e imports têm a mesma lista; nenhum arquivo órfão é entregue ao cliente.

**Testes:** typecheck contra schema, teste de serialização e verificador de registry/import/docs.

**Rollback:** extrações pequenas mantendo exports antigos; não fazer big-bang junto com FE-01/02.

## 4. Leitura do fluxo principal

| Etapa | O que está sólido | Brecha principal |
|---|---|---|
| Radar | Pull individual/bulk chama backend; erro de quota é mostrado; negativos não são apagados no front | Race de filtros, Radar inteiro embutido no bundle de Vendas, novo filtro fora de Glass Pill |
| Vendas | Board backend, retorno e negativo persistem via API; WhatsApp interno valida no backend | Caches/sessão, estado assíncrono e retorno fixo às 09:00 |
| WhatsApp | Fluxo de conexão está centralizado em `whatsapp-connection-flow.ts`; inbox tem SSE + fallback | Handoff via storage, SSE sem teto/401 comum, múltiplos polls |
| Retorno | PATCH grava `returnAt` e board é recarregado | Sem horário/fuso explícito e sem E2E ponta a ponta do lembrete |

## 5. Sequência de implantação para o Fable

### Fase 0 — travar regressão e medir

1. Criar testes vermelhos para FE-01 e FE-02 antes de alterar produção.
2. Registrar payloads por tier, bundle atual, CSS, requests do Atendimento e LCP do login.
3. Não misturar redesign do Radar já em andamento com correção de sessão/paywall.

**Gate:** testes reproduzem vazamento e troca de conta; baseline salvo.

### Fase 1 — segurança comercial

1. Corrigir serializer backend para `canSeeCompanyData`.
2. Alterar `LockGate` para placeholder sem children reais.
3. Tornar intelligence/company fail-closed em loading/erro.

**Gate:** matriz List/Lead/Pro passa no JSON, DOM e árvore acessível. Sem este gate, não implantar fases visuais.

### Fase 2 — fundação de sessão e rede

1. Criar session store/cache chaveado e logout único.
2. Envolver shell em bootstrap autenticado.
3. Adicionar timeout/abort e adaptadores blob/stream.
4. Aplicar disjuntor SSE e pausa por visibilidade/offline.

**Gate:** A→B sem vestígio, 401 único, offline sem loop, recovery sem reload.

### Fase 3 — fechar Radar → Vendas → WhatsApp → Retorno

1. URL canônica para conversa e helper único.
2. Estado assíncrono com cancelamento em Radar/Vendas.
3. Contrato de data/hora/fuso do retorno.
4. E2E ponta a ponta com perfis admin/vendedor e tiers.

**Gate:** lead certo chega à conversa certa; retorno aparece no instante certo; latência invertida não troca resultado.

### Fase 4 — sistema visual e acessibilidade

1. Criar HbxGuide1/4/5 e primitives Dialog/Drawer/Popover.
2. Migrar primeiro Vendas/Radar, depois Atendimento, Cadastros, Gerencial e Master.
3. Trocar seleções exclusivas por Glass Pill.
4. Validar light/dark, teclado, reduced motion e 1366×768.

**Gate:** axe crítico zero; desktop sem scroll documental; mobile sem corte; mesma semântica nos quatro temas registrados.

### Fase 5 — performance e decomposição

1. Otimizar assets de auth.
2. Separar CSS por rota e lazy-load Radar/modais/voz.
3. Extrair arquivos monolíticos sem alterar regra de negócio.
4. Fixar budgets no CI.

**Gate:** metas de FE-06/12 e E2E crítico verdes.

### Fase 6 — hardening

1. CSP report-only→enforce.
2. Cookie HttpOnly/CSRF em coordenação com backend.
3. Contrato gerado/validado e documentação sincronizada.

## 6. Matriz mínima de aceite de release

- Viewports: 1366×768, 1440×900, 1920×1080, 397×860 e 360×800.
- Temas: aurora, ember, rose e hbx-cyber; light e dark.
- Perfis: system master, admin, gerente/política restrita e seller.
- Comercial: List, Lead e Pro/Implantação; pagando, trial, pendente, vencido e suspenso.
- Rede: normal, 3G lento, offline, 401, 403, 500 e resposta fora de ordem.
- Fluxo: buscar empresa → puxar → abrir em Vendas → abrir conversa correta → enviar/receber → agendar retorno → retorno reaparecer.
- Acessibilidade: teclado completo, foco de modal, zoom 200%, reduced motion e axe.
- Segurança: payload/DOM sem dado de tier superior; logout troca de conta; CSP/headers.

## 7. Inventário examinado

- Normas/config: `CLAUDE.md`, `docs/Rules/FRONTEND.md`, `package.json`, `frontend/package.json`, `tsconfig.json`, `next.config.ts`, ESLint, scripts de build/pele e baseline.
- Inventário automatizado: 220 arquivos TS/TSX/CSS em `frontend/src` (~62 mil linhas no início da auditoria), todas as rotas App Router, imports, usos de fetch/storage/timers, overlays, seleções, temas e artefatos `.next`.
- Leitura profunda: `lib/api.ts`, roles, planos, WhatsApp, handoff, agenda; shell/app-shell/auth/bloqueio/mobile-tab; Radar/Leads, Vendas, Atendimento, Relatórios, Configurações, Master; `DetalhesNegocio`, checkout e conexão WhatsApp; kit/screens/mobile/skeleton/temas.
- Cross-check mínimo de backend apenas para provar FE-01: catálogo comercial e serializer de Vendas. A auditoria completa de backend pertence ao worker correspondente.
- Testes: Playwright config e seis specs E2E; dois testes Node de frontend; build manifests e tamanhos de chunks/assets.

## 8. Comandos e resultados

- `cd frontend && npm run lint`: **passou** (ESLint + check-pele) novamente após as alterações concorrentes observadas no fechamento.
- `cd frontend && npm run build`: **passou** novamente no mesmo fechamento com Next 16.1.4/Turbopack.
- `node --test tests/frontend-vendas-channel-icons.test.mjs tests/frontend-radar-channel-filter.test.mjs`: **falhou 2/2** por arquivos removidos.
- `npx playwright test --list`: **44 casos declarados** em 6 specs × 2 projetos, com skips internos por projeto.
- O browser integrado não iniciou por falha do conector de execução (`sandboxPolicy` ausente). Não houve validação visual autenticada, captura de Network nem screenshot nesta rodada.

## 9. Lacunas de cobertura e hipóteses a validar

1. **Visual/responsivo:** light/dark, overflow vertical de desktop 1366×768, contraste e foco precisam de rodada real no Chrome. O E2E atual cobre essencialmente overflow horizontal mobile.
2. **Produção:** não foram consultados logs/RUM, payloads reais de clientes ou Lighthouse de produção.
3. **P0:** o caminho é confirmado no código; ainda deve ser reproduzido com contas reais de cada tier antes e depois da correção, usando dados descartáveis.
4. **Retorno:** validar com produto se retorno é por hora ou somente por dia. A conversão atual continua tecnicamente dependente do fuso em ambos os casos.
5. **Acessibilidade:** contagem estática não substitui axe/leitor de tela.
6. **E2E completo:** não foi executado porque o config não sobe o app/backend e o worktree estava sendo alterado; executar após estabilizar o snapshot.
7. **Performance:** tamanhos são não comprimidos/on-disk; confirmar transferência, cache e Core Web Vitals no Network/RUM.

## 10. Regra para o fiscal aceitar a implantação

O Fable deve entregar por fase: diff pequeno, evidência antes/depois, testes do achado, comando executado e rollback explícito. “Build passou” sozinho não fecha nenhum P0/P1. A ordem obrigatória é **dados/cobrança → sessão/rede → fluxo principal → acessibilidade/visual → performance/refatoração**.
