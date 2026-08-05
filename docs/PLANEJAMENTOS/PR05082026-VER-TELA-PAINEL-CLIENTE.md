# PR05082026 — VER TELA + PAINEL DO CLIENTE no /master (o Pulso muda de casa)

Plano ditado pelo dono 05/08/2026 (madrugada) + 4 emendas do Claude ACEITAS.
**Este documento é AUTOSSUFICIENTE: outra sessão executa sem esta conversa.**
Substitui a moradia do PULSO (PR04082026-PULSO-DO-APP): a ESCRITA do pulso
fica, a janela solta morre. Domínio APK → ler a memória `hbxapk.md` ANTES
(regra de teste §1, allowlist §6, leis de UI §2).

## 0. Estado do mundo ao escrever isto (publicado 04/08 ~23h)

- EM PROD: pulso de tela (poll 5s manda `tela`; `MobileDevice.ultimaTela/At`;
  trilha `MobileTelaTrilha` por TROCA de tela; `GET /master/pulso` +
  `GET /master/pulso/:deviceId/trilha`), janela "Pulso" no /master
  (`frontend/src/app/(app)/master/janela-pulso.tsx` — VAI MORRER aqui),
  MODO CADERNETA completo no Loghbx (venda por toque, medidor do dia, tranca
  do Iniciar), bug do CEP desktop corrigido.
- `modoCaderneta = true` na empresa 41 (o dono ligou pelo g15 em 04/08).
- Aviso de atualização do APK funciona (1× por versionCode).
- Payload do pulso JÁ carrega `deviceName` + `pareadoEm` (commit 8dc969e7).
- Empresa 41 tem 5 aparelhos: g15 (dono, teste, pareado 25/07), moto e13
  hw `95381881` (o REAL do André, pareado 17/07) e 3 pareamentos-fantasma
  1.2.1 de julho sem hardwareId (candidatos ao "Remover").

## 1. O plano do dono (literal) + as 4 emendas aceitas

1. Construir **VER TELA** de verdade (ver o que o cliente está vendo).
   **EMENDA 1:** espelho do NOSSO app (session replay, padrão LogRocket/
   Smartlook/UXCam), NUNCA MediaProjection/print do sistema (banner do
   Android + vê o celular inteiro = constrangimento e fora do escopo).
   Digitação mascarada por default; 1 linha na política de privacidade.
2. **Remover a janela "Pulso"** do /master e injetar DENTRO da ficha da
   empresa cliente: botão **"Ver tela"** ao lado do "Entrar como" — clicável
   SÓ com o aparelho online (🟢).
3. **Remover "Quem está online"** — mentia porque olha sessão WEB e o André
   só vive no APK. O pulso é a fonte de presença.
4. **Painel bem feito do cliente**: aparelhos conectados (NOMES — "moto g15"
   × "moto e13"), derrubar / remover aparelho, trilha do dia, erros.
   **EMENDA 4:** derrubar/remover com confirmação de 2 cliques mostrando o
   NOME do aparelho (derrubar o e13 real do André no meio do dia = autogol).
5. **Consultas só no CLIQUE do cliente** (lazy). O poll de 5s não engorda:
   espelho só com flag ativa, erros só quando existirem novos.
6. **Histórico de ERROS que apareceram pro cliente** (Sentry-lite: só o que o
   usuário VIU — toast vermelho/crash — com tela+hora; retenção 7 dias).
7. APK: **"Rota" some com o modo caderneta ligado** + convite quando a base
   provar. **EMENDA 2:** sumir = trocar o RÓTULO da aba pra "Caderneta"
   (mesma posição/ícone — lei das MESMAS TELAS; a tela do dia mora ali).
   **EMENDA 3:** a régua do convite é a BASE DA AGENDA (todos os clientes COM
   dia de entrega cadastrado provados) — avulso sem dia nunca trava o GPS.

## 2. Desenho por fatia (ordem de execução: V1 → V4 → V2 → V3)

### V1 — Painel do cliente no /master (backend + web), LAZY
- `GET /master/empresas/:companyId/aparelhos` (novo, master-only — copiar
  guard/padrão de `backend/src/pulso-app/master-pulso.controller.ts`):
  devolve por aparelho `{deviceId, deviceName, pareadoEm, userName,
  appVersion, ultimaTela, ultimaTelaAt, abertoAgora}` — `PulsoAppService.
  listarAparelhos` já monta quase tudo; criar variante por companyId (SEM
  withoutTenantScope: escopada por empresa é query normal).
- `POST /master/aparelhos/:deviceId/derrubar` → revokedAt=now +
  tokenVersion++ (mata a sessão; o aparelho volta pela tela de pareamento).
- `POST /master/aparelhos/:deviceId/remover` → derrubar + esconder da lista
  (não deletar linha: trilha/erros/hardwareId ficam; re-parear reconecta a
  MESMA vaga — lei 1 celular = 1 vaga).
- Web: na ficha da empresa (`frontend/src/app/(app)/master/page.client.tsx`,
  o painel da screenshot com "Entrar como") entra a seção "Aparelhos",
  carregada AO ABRIR a ficha; linha = nome · pessoa · pareado DD/MM · versão
  · 🟢/⚪ ("no app"/"fora do app", NUNCA "offline") · tela atual · expandir =
  trilha do dia (`GET /master/pulso/:deviceId/trilha` já existe) · ações
  [Ver tela (desabilitado se ⚪)] [Derrubar] [Remover].
- MORREM: `janela-pulso.tsx` (componente vira parte da ficha ou é apagado) e
  a janela "Quem está online" (procurar no page.client do master).
- `GET /master/pulso` (lista global) pode morrer junto — conferir se sobra
  algum consumidor antes de apagar o endpoint.

### V4 — APK: rótulo "Caderneta" + medidor global + convite pro GPS
- app.js (`EntregaShell/app/src/logistica/assets/app/app.js`, bloco MODO
  CADERNETA no fim): com `cadernetaTelaAtiva()`, o item de navegação "Rota"
  troca o RÓTULO pra "Caderneta" (mesma posição/ícone).
- Backend: `GET /logistica/caderneta/resumo` ganha `base: {total, provados,
  pronto}` = TODOS os clientes vivos com plano ativo em QUALQUER dia
  (LogisticaPlanoEntrega ativo, customerProfile vivo), provado = geoFonte do
  local principal (fallback perfil) ∈ {gps_entrega, gps_cadastro} — mesma
  conta do `dia` em `logistica-caderneta.service.ts`, sem o filtro de
  diaSemana. Campo ADITIVO (APK velho ignora).
- Medidor da tela do dia passa a mostrar a BASE ("Mapa: X de N").
- Convite (`base.pronto === true`, 1× por atingimento): `centerModal` com a
  copy LITERAL do dono: **"Clientes estão ok, gostaria de ativar o modo
  comum, e começar utilizar nosso GPS?"** → [Ativar GPS] = PATCH
  `/logistica/config {modoCaderneta:false}` (admin; rótulo volta a "Rota") ·
  [Agora não] = `H.cache` marca d'água com `base.provados` (só reoferece se a
  base crescer). Saída manual segue no toggle de Ajustes.
- A palavra "pino" segue PROIBIDA em tela (Lei 8) — é "Mapa".

### V2 — VER TELA (espelho do app, on-demand)
- `POST /master/aparelhos/:deviceId/espelho` → flag com TTL 60s (tabela leve
  ou coluna em MobileDevice, ex. `espelhoAte DateTime?`); o painel renova a
  cada 10s enquanto aberto; fechar = expira sozinho.
- Resposta do poll de 5s (`POST /logistica/recados/pendentes`) ganha campo
  ADITIVO `espelho: true` quando a flag vive (mexer no retorno de
  `puxarRecadosSeguro` em `logistica.controller.ts` — hoje devolve lista
  crua; envelopar SEM quebrar o APK velho exige cuidado: preferir header ou
  manter lista e o app checar por outro caminho — DECIDIR na implementação;
  o APK velho PRECISA continuar funcionando com a resposta atual).
- app.js: com espelho ativo, a cada ~2s `POST /logistica/espelho/quadro`
  com `{tela, html}` — innerHTML da tela SANITIZADO (sem <script>, inputs
  substituídos por •••), comprimido se preciso.
- Painel: réplica renderizada em sandbox (iframe srcdoc sem JS) + CSS do
  app embutido 1×. Não é vídeo: é a tela reconstruída.
- **Allowlist Kotlin** (`NativeApiClient.kt`, isMobileEndpointAllowed):
  `POST logistica/espelho/quadro` — os TRÊS ou nada (app.js + allowlist +
  rebuild). Backend publica ANTES do APK (DTO whitelist).
- Política de privacidade: linha da telemetria de tela do próprio app.

### V3 — ERROS que o cliente viu (Sentry-lite)
- app.js: buffer local (máx ~20) alimentado por TODO toast(erro=true) + erro
  JS global (window.onerror); vai DE CARONA no poll como campo ADITIVO
  `erros: [{tela, msg, at}]` SÓ quando houver novidade; limpa após 200.
- Backend: DTO aceita opcional (mesmo padrão `@Allow` do `tela` — validador
  estrito derrubaria o poll); tabela `MobileErroTrilha` (companyId, deviceId,
  tela, msg VarChar(300), at) + faxina lazy 7 dias (padrão MobileTelaTrilha).
- Painel do cliente: "Erros recentes" (últimos 50, lazy no clique).

## 3. Gates e leis de execução (regras da casa — NÃO pular)

- **Ordem de deploy**: backend SEMPRE publica antes do APK (campo novo em DTO
  com forbidNonWhitelisted derruba o app novo se a ordem inverter).
- Endpoint novo chamado pelo app.js = allowlist Kotlin + rebuild (os TRÊS).
- Migrations ADITIVAS à mão (padrão das 20260805*), `IF NOT EXISTS`.
- Teste: typecheck/tsc + testes node:test dos serviços; APK builda
  (`gradlew.bat -p EntregaShell :app:assembleLogisticaRelease`); prova REAL
  no celular DEPOIS do publish (aviso de update sozinho — nunca adb como
  entrega); `node scripts/clip.mjs` (e2e ~6min — NUNCA 2 rodadas em paralelo,
  dá falha fantasma) e `frontend/scripts/check-pele.mjs` (rodar de dentro de
  frontend/) sem violação nova.
- Commit LOCAL; **publicar só quando o dono mandar**. Stage cirúrgico
  (nunca `git add -A` — pode haver trabalho paralelo na árvore).
- Suíte vermelha PRÉ-EXISTENTE conhecida: 4-5 testes de tracking/rota-modelo
  falham sem relação com estas frentes — reportar em 1 linha e seguir.
- `withoutTenantScope` só com motivo escrito; modelo novo com companyId entra
  em `TENANT_SCOPED_MODELS` (tenant-guard.extension.ts) + na lista do
  `backend/scripts/check-tenant-scope.mjs`.
- Copy do dono é LITERAL; erro pra humano; "pino" proibido em tela.
