# Modo Foco GAME — Robô prospector (v2 PREMIUM)

## Posição
É o **EXTRA pago** — onde mora a receita recorrente. **NÃO trançar na v1** (senão a
casca do foco nunca sai). v1 entrega a casca manual; o robô é a Fase 2.

## O que é
O **disparador controlado virado painel de UMA TECLA**, fácil e colorido. Filosofia do
dono: "o cliente acha difícil; aqui fica fácil até uma criança de 5 anos ativar". Faz:
- **Auto-config** (automatiza a "config chata" que hoje é manual);
- **Auto-prospector do foco** (puxa empresas novas do segmento+cidade da missão);
- Painel simples: 1 botão grande (play), ritmo, status do disjuntor.

## Reaproveitar (NÃO reescrever)
O disparador controlado **já existe** no `/vendas`:
- Drawer "Prospecção automática" (`prospOpen`), `loadProsp`, `prospAcao`.
- Endpoints: `GET /vendas/automation/live-status`, `POST /vendas/automation/
  prospecting/{start|pause|resume|cancel}`. Tem **triagem** (só arma depois que
  dono/gerente confirma) e **gate Bot IA** (402 sem plano).
- O painel do robô no foco **abre/usa esse motor** — só veste de UI fácil/colorida.

## GUARDRAIL INEGOCIÁVEL (anti-ban)
Disparador automático que o vendedor liga com 1 toque **TEM que herdar o
disjuntor/backoff/governor** anti-ban (ver CLAUDE.md / Webwhats — loop de reconexão já
custou chip banido). **A trava entra JUNTO com o botão, não depois.** Reconexão/disparo
sem freio = fábrica de chip banido. O painel mostra "Disjuntor anti-ban: ligado" como
estado real, não decorativo.

## Gate
Só clicável com módulo Bot/plano (`botStatus.botModuleEnabled` / entitlement Bot IA).
Sem plano: painel travado com selo "Premium" (sem barrar a casca do foco — o resto do
modo funciona manual).

## Config: vendedor × admin
- O **vendedor** monta o foco dele (segmento+cidade).
- O **admin** aplica os **limites do plano** (máx de missões, teto de leads, acesso ao
  robô). "Config chata no começo, pronta; depois é 1 toque."
