# RISCOS — noite 24/06

## Fechar venda no Atendimento
- **Mexi em lógica de dinheiro** (comissão/handoff). Reversível por código (`git revert`). O fechamento NÃO
  cobra nada sozinho — só gera o link; a cobrança/ativação continua sendo o cliente que dispara. Nada live foi acionado.
- **Amarração do dono:** card SEM vendedor passa a ser do quem fecha. Card que JÁ tem vendedor não muda (não rouba carteira). Se isso te incomodar, é a função `resolveCloserAssignmentPatch` no `vendas.service.ts`.
- **Duas telas fecham venda** (Atendimento novo + Vendas antigo) até a convergência — ver PLAN.
- **Backend roda em Docker e NÃO recarrega sozinho** com edição no Windows (o watch não vê o bind mount). Eu
  reiniciei o container (`docker compose restart backend`) pra valer as mudanças. Se rodar de novo e parecer
  "sumiu", reinicie o backend.

## Dados de teste que eu deixei (localhost — reverte fácil)
1. Coloquei **20% de comissão** no teu usuário pra a estimativa aparecer (estava 0%):
   `UPDATE "User" SET "commissionPercent"=0 WHERE id=36;`  ← roda isso pra voltar ao zero.
2. Deixei a lead **Camila Barsotti** fechada como exemplo (pra ver a comissão no Gerencial). Pra limpar:
   `UPDATE "VendasLead" SET "saleStatus"='none',"commissionStatus"='none',"assignedUserId"=NULL,"commissionPercentSnapshot"=0,"saleValue"=NULL,"setupValue"=NULL,"salePlanKey"=NULL WHERE id='cmqrkt3ji0070132d8sumhc74';`
   (rodar no banco: `docker compose exec db psql -U admin -d jhonatan_dev -c "…"`)
3. **Verificação da venda-pronta (24/06):** re-fechei a Camila com implantação=500 pra testar A/B/C via API (prefill + handoff + aviso de implantação). Deixou 1 registro de demo no log do master (aparece na janela Pagamentos). Pra limpar: `DELETE FROM "MasterPaymentNotificationLog" WHERE target='implantacao';` (o revert do item 2 zera a Camila).

## Construtor de Bot — reforma "painel integrado tipo jogo" (working tree, NÃO publicado)
Tudo localhost/reversível. Build + lint verdes (front e back). **Runtime visual NÃO testado** (precisa login+backend) — testar.md tem o roteiro pra você bater o olho.
- **IA nova:** `/bot` virou **3 GUIAS por tipo** (Atendimento/Recovery/Prospecção) + um painel só (ativação compacta + montar=configurar). Sumiram os 3 cards de ativação, o seletor "Tipo de bot" e as abas (Fluxo/Config/Integrações/Publicação/Análises).
- **3 modos de montagem** (switcher Tabuleiro/Trilha/Bandeja) — você escolhe qual curtir; depois apago os outros 2 (sem legado).
- **Editor desliza do lado** ao clicar a peça (mensagem + Variáveis + botões; peça "Ajustes" = regras). **Bug do menu que não fechava: CORRIGIDO** (o véu não trava mais a tela).
- **Variáveis:** castelo ganhou **busca**; +2 reais no atendimento (`telefone`, `primeiro_nome`). **NÃO inventei lead** (cidade/segmento): no inbound a conversa não tem lead ligado → seria variável vazia/fake. Pra elas funcionarem precisa de uma feature que BUSCA o lead pelo número — deixei de fora de propósito (te avisei).
- **Mais fraco:** o "arrastar" da Bandeja é drag nativo; soltar só abre o editor da peça (as fases são fixas, não reposiciona) — clicar no chip é o fallback. Editado por worker; **revisei** (padrão anti-trava do editor ok, sem órfãos, build/lint verdes).
- **Auto-ligar (NOVO — atenção):** tirei a faixa de ativação (a "chavinha" + chips) do painel pra dar espaço. Agora **o bot LIGA SOZINHO** quando o pré-voo fica OK (chip conectado + config; proativos exigem também o teste feito). Status fica no **pontinho da guia** (verde = ligado) + tooltip ao passar o mouse. **CUIDADO:** pra Recovery/Prospecção (que INICIAM contato), o auto-ligar **pula o antigo "confirma? começa devagar"** — fica travado só pelo teste-feito. Em **localhost não dispara** (nunca tem chip). O envio em si continua com disjuntor/backoff (não é o auto-ligar que spamma). Se quiser o freio de confirmação de volta pros proativos antes de publicar, peça — é rápido. (Removi também o código morto: `BotTypeCard`/`PreflightChip`/`TYPE_DESC`.)
- **Reverter:** `git checkout -- "frontend/src/app/(app)/bot/page.client.tsx" frontend/src/app/hbx-theme/bot-builder.css frontend/src/app/hbx-theme/bot-flow.css frontend/src/app/hbx-theme/bot-variables.css frontend/src/components/hbx/bot-flow-canvas.tsx frontend/src/components/hbx/bot-variables-drawer.tsx backend/src/inbox/atendimento-config.ts backend/src/messaging/messaging.service.ts` + `rm frontend/src/components/hbx/bot-phase-editor.tsx`.
