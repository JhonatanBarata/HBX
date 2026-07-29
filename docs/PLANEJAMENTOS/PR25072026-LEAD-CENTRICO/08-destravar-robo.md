# S8 — Destravar Automação: SÓ config do Admin + WhatsApp liberam (regra do dono 26/07)

## A REGRA (ordem literal do dono)
"Verifique todas as travas do bot e remova elas. A única vai ser a config do Admin — feito, já
libera. E LÓGICO, ter o WhatsApp; se não tiver, garantir que tenha explicação. O cliente
entender o porquê não dá pra ativar é PRIMORDIAL."

Tradução operacional — travas de ATIVAÇÃO da Automação passam a ser SOMENTE:
1. **Config do Admin feita** (a config enxuta do S5 — `VendasComercialConfig`): existe linha
   salva pra empresa → libera. Não existe → bloquear COM EXPLICAÇÃO e caminho ("Peça ao
   dono/gerente pra configurar horário e teto em Automações comerciais" — e se o próprio
   usuário PODE configurar, dizer/atalhar direto). ATENÇÃO: hoje esse gate NEM EXISTE no
   `ligarRoboForUser` — criar.
2. **WhatsApp da empresa conectado**: sem chip conectado → não ativa, com explicação clara e
   onde conectar. Usar a fonte de status de conexão QUE O APP JÁ USA (nunca API crua do motor).

Tudo o MAIS que impeça LIGAR deve ser REMOVIDO ou AUTO-RESOLVIDO com mensagem clara.

## O que auditar (varra TUDO — a lista abaixo é ponto de partida, não teto)
- Front: condições que desabilitam o botão da Automação na aba Planejar
  (`frontend/src/components/hbx/lead-cockpit-modal.tsx`) — ex.: exigência de prontidão
  "pronto", zap confirmado do lead, persona selecionada, pré-voo carregado.
- `ligarRoboForUser` + `resolveRoboCadencia` (`backend/src/vendas/vendas.service.ts` ~6044):
  cadência desativada ("ative-a antes") → AUTO-RELIGAR a seed em vez de mandar o cliente
  ativar; sem personaKey → usar a recomendada do pré-voo (heurística) como default.
- `createCadenciaInscricao`/`canCadenciaRun`/enrollments (`commercial-contact-control.service`,
  `commercial-automation-state.service`): conflito com "outra automação ativa" — com o motor de
  campanha morto isso só pode ser resíduo; conflito com campanha LEGADA não pode travar (limpar
  /ignorar resíduo automaticamente), conflito cadência×cadência vira religa/troca com aviso.
- Runner (`cadencia.service.ts`): gates de PROCESSAMENTO por lead que na prática significam
  "liguei e nada acontece" — flag runner (JÁ ON em prod), módulo/entitlement extra, exigência
  de e-mail configurado etc. O que for freio de ENVIO fica; o que for burocracia sai.
- Entitlements/módulos: exigência de módulo além de `vendas` (ex.: "requer módulo Bot IA") no
  caminho da Automação — remover do caminho da Automação.

## O que NÃO é trava de ativação (FICA, é freio/lógica — mas com mensagem clara):
- Freios de ENVIO: janela de horário, teto diário por user/chip, intervalo, disjuntor/warmup,
  supressão/opt-out (S7), parou-na-resposta, identidade obrigatória pro PASSO de e-mail (S6 —
  pula só o e-mail, robô segue).
- Lead `qualificado`/`encerrado` (humano assumiu — modelo do dono). Mensagem atual ok.
- Permissão de time `canEditCards` (governança de quem pode clicar). Mensagem atual ok.
- Lead SEM NENHUM canal (sem zap, sem e-mail, sem telefone): não tem o que disparar —
  bloquear com explicação + apontar o "Buscar dados".

## Entrega
1. Auditoria completa em tabela no relatório: cada trava achada → decisão (removida /
   auto-resolvida / mantida como freio) → mensagem ao cliente.
2. Código: gate novo da config do Admin + gate do WhatsApp com explicação; remoção/auto-cura
   das demais; endpoint do pré-voo (ou novo campo) expõe `roboBloqueado: {motivo, acao}` pro
   front mostrar o PORQUÊ sem adivinhar.
3. Front: botão da Automação NUNCA fica desabilitado mudo — desabilitado sempre acompanha o motivo
   e o próximo passo (1 linha). Strings novas listadas no relatório (copy provisória).
4. Testes: config ausente bloqueia com motivo; config feita + chip conectado → liga; chip
   desconectado bloqueia com motivo; cadência seed desativada religa sozinha; resíduo de
   campanha legada não trava; lead sem canal bloqueia com motivo.

## Guardrails
- Os do `00-FRENTE.md` (master direto, add por caminho, sem publish, sem tocar
  atendimento/recovery/Webwhats, tokens/check-pele no front).
- NÃO mexer nos freios físicos de envio. NÃO chamar API crua do motor WhatsApp — status de
  conexão pela rotina existente do app.
- Commit LOCAL: `feat(vendas): destravar robo — so config do admin + whatsapp liberam (S8 LEAD-CENTRICO)`.
