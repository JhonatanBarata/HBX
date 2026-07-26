# PR26072026 — LOGHBX-DESBAGUNÇA (auditoria completa do app do entregador)

**Pedido do dono (26/07):** "preciso entender o app, está bagunçado — ache os problemas sem eu guiar."
Auditoria feita por leitura de TODO o código do APK (app.js 7.643 linhas, native.js, app.css,
45 arquivos Kotlin, build, deploy, backend da config) + estado publicado no ar (build 44).

## O veredito em 1 parágrafo

O app **não está podre por dentro** — CSS por token segurou, Kotlin é bem fatiado, allowlist tem
90 asserts de teste, os incidentes recentes (som 2x, carimbo velho, disco duplicado) estão mortos.
A bagunça real é de **PRODUTO e de PROCESSO**: (1) duas frentes inteiras publicadas e MORTAS no ar
por flag/coluna (ROTA-CONFERIDA e AGENDA-SEMANAL) — código pago que ninguém vê e caminho duplo de
manutenção; (2) a separação vendas/logística feita hoje às 2h da manhã precisou de 2 hotfixes e
deixou resto de app unificado (switch placebo, máquina de módulos morta); (3) o APK de Vendas é um
protótipo FORA das 10 Leis que ainda por cima cobra crédito sem guard de duplo-toque; (4) o
monólito de 7.6k linhas funciona mas ficou caro de entender (estado não declarado, ramos mortos,
170 ifs num dispatcher); (5) o teste final da frente APK-PADRAO (S5/S6) nunca rodou.

## O que está SAUDÁVEL (não mexer, é referência)

- `app.css`: zero hex fora de token, "duplicatas" são media queries legítimas. Lei 2 de pé.
- Ícones: contrato de geometria respeitado (`app.js:314`).
- Kotlin: `NativeApiClient` (ticket nunca vai pro JS, allowlist por flavor testada),
  manifest limpo (backup off, exported=false), `RotaService`/outboxes bem separados.
- Reconciliador do `native.js`: sofisticado e ESTÁVEL após os fixes de 22–25/07. Não reescrever.
- `clientAddressText` (número duplicado): já corrigido no S1 de 21/07.
- handleBack: cobre todos os modais atuais (conferência inclusive).
- `moduloFinanceiroAtivo` no hotfix de hoje: verificado — o backend MANDA o campo pra todo ator
  (`logistica-config.service.ts:473`), a chegada não quebra.

## Os problemas (por ordem de dor)

| # | Problema | Prova | Sprint |
|---|---|---|---|
| 1 | **Migrations TRAVADAS**: drift `VendasCardComplaint` (tabela em prod sem migration) impede `migrate dev`; por isso `rotaConferidaAtiva` foi lida por cast e NÃO tem coluna | `logistica-config.service.ts:479-495`; schema:2841 sem migration | **S0** |
| 2 | **ROTA-CONFERIDA (8 sprints) morta no ar**: flag sempre OFF → conferência/congelar/custo-preview inalcançáveis | idem acima | S0+S2 |
| 3 | **AGENDA-SEMANAL (4 sprints) morta no ar**: `agendaV2Ativa` false nas 9 empresas; APK mantém V1 (dia-preview) + V2 juntos = 2 caminhos pro mesmo fluxo | schema:1981; app.js:2329, 2377 | **S2** |
| 4 | **Resto do split de madrugada**: switch "Módulos" é PLACEBO (escreve cache que ninguém lê — `moduleActive` é `true` fixo); native.js ainda carrega navegação vendas/`salesModule`/swipe de app unificado | app.js:3921, 6153-6162, 238; native.js:438-451, 469-476, 741-742 | **S1** |
| 5 | **APK Vendas fora da lei**: `confirm()` nativo (Lei 3), sem contrato de teclado (Lei 4/5), erro cru sem `humanApiError` (Lei 6), "Puxar" lead **cobra crédito sem guard de reentrância**, listener morto (`lead-search`), sem auto-update/manifesto de versão | vendas/app.js:290, 237-250, 292-300 | **S4** |
| 6 | Monólito caro de entender: estado com ~90 campos + 3 NÃO declarados (`updateInfo`, `modalClient`, `modalProduct`), `isAdmin()` por duck-typing, clique de `data-day` com caminho delegado morto + listener direto | app.js:7-236, 1935, 2515, 6360, 436, 6127×4824 | **S3** |
| 7 | S5 (voltar/transições) e S6 (E2E assistido) do APK-PADRAO nunca rodaram — o "teste geral" está devendo | PR21072026-APK-PADRAO/ | **S5** |
| 8 | Fingerprint do publish cobre `app/src` INTEIRO: mexer no app de vendas (ou num teste) bumpa o versionCode da LOGÍSTICA → 1,8 MB de download à toa pra todo motorista | deploy-vps.js:202-207 | **S6** |
| 9 | Vendas APK sem canal de update (versionCode fixo 9, sem version-vendas.json) — quem instalar apodrece | build.gradle.kts:104, nginx conf | S4/S6 |
| 10 | Piso do versionCode é manual e já mordeu 3× (8→15, 15→18, 18→38) | build.gradle.kts:24-35 | S6 |
| 11 | `deliveryOfflineSheet` virou alias do simple sheet no hotfix — a CONSTITUIÇÃO ainda descreve 3 molduras de chegada | app.js:4104-4106 | S1 |
| 12 | Lixo: `dist/` com 5 APKs velhos; sourceset `videoStudio` é só um manifest morto no shell do entregador | EntregaShell/dist, app/src/videoStudio | S6 |

## Fila de sprints (executar em ordem; 1 worker por arquivo S*)

- **S0-banco-destravado.md** — resolver o drift (baseline) + coluna `rotaConferidaAtiva`. Pequena e
  desbloqueia TUDO que precisar de coluna nova. ⚠️ toca prod → gate do dono antes de aplicar.
- **S1-faxina-do-split.md** — matar placebo/módulos, alinhar constituição da chegada, fumaça nas
  4 telas + modais no aparelho. É a resposta direta ao "está bagunçado".
- **S2-ligar-o-que-ja-pagamos.md** — rollout `agendaV2Ativa` + `rotaConferidaAtiva` na empresa
  cobaia → 9 empresas; marcar data pra matar o caminho V1.
- **S3-monolito-legivel.md** — estado declarado, ramos mortos fora, leitura/navegação fatiadas em
  arquivos próprios via `<script>` (zero build novo, zero mudança de comportamento).
- **S4-vendas-na-lei-ou-congela.md** — DECISÃO DO DONO primeiro (investir × congelar). Se investir:
  leis + guard + update. Se congelar: tirar do publish e do ar.
- **S5-teste-geral-herdado.md** — S5+S6 do APK-PADRAO (voltar/transições + E2E assistido).
- **S6-distribuicao-profissional.md** — fingerprint por flavor, piso automático, limpeza dist/,
  INSTALAR.md.

## ⚡ LEI DO DONO (26/07) — vale pra frente inteira

**"Pedi a coisa, você faz e pronto."** Entregar = entregar LIGADO pra todo mundo na mesma entrega.
Flag OFF "pra ligar depois" foi apontado pelo dono como o MAIOR defeito desta operação (as 12
sprints mortas desta auditoria são a prova). Rollout gradual só se ELE pedir. Bloqueio técnico se
resolve dentro da entrega. Gate de toda sprint: "o dono VÊ isso funcionando sem apertar nada?"

## Decisões que SÓ o dono pode tomar (colher ANTES de S4)

1. **APK Vendas**: investir pra valer (entra na lei + auto-update) ou congelar por ora (tira do
   publish, foca 100% logística)? O split de hoje dobrou o custo de build/manutenção.
2. ~~Empresa-cobaia pro rollout~~ **RESPONDIDA 26/07 pela lei acima**: liga nas 9 direto,
   validação é ANTES (no aparelho), não segurando chave.
3. **Chegada financeiro-OFF**: manter a folha nova (mostra o que entregar, sem dinheiro) ou voltar
   à folha mínima zero-produto? Hoje a constituição e o código divergem.
4. **`gps_cadastro` sem piso de accuracy** (pendência herdada de 25/07): fonte intocável aceita fix
   ruim de 300 m pra sempre. Ligar piso de 60 m como no resto?

## Regras desta frente (aprendidas a dor)

- **Nada publica sem abrir o app no aparelho** (memória 22/07: 2 publishes cegos = disco duplicado).
- Gate de cada sprint = checklist de verificação NO PRÓPRIO arquivo da sprint.
- Commits locais na master; publish só quando o dono mandar.
- Worker NÃO usa git stash (contrato ROTA-CONFERIDA 25/07) e NÃO cria branch.
