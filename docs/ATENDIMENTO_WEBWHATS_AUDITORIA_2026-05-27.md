# Auditoria Atendimento WebWhats - 2026-05-27

## Escopo

Auditoria e fase 1 aplicada no fluxo WebWhats / Atendimento desktop, envolvendo backend, frontend e a integracao operacional com WhatsApp.

Foco do trabalho:

- deixar o Atendimento mais fiel ao uso diario do WhatsApp Desktop;
- reduzir perda de contexto do operador;
- melhorar confiabilidade de envio e diagnostico de sessao;
- reduzir trabalho de renderizacao na tela principal;
- preservar mobile simples, sem fluxo de pareamento WhatsApp no celular.

## Checklist Antes x Depois

| Area | Antes | Depois |
| --- | --- | --- |
| Leitura da conversa | Abrir conversa nao garantia baixa visual/operacional clara de nao lidas. | Conversa aberta marca leitura no backend/WebWhats. |
| Falha de envio | Mensagem com falha ficava pouco acionavel. | Mensagens falhas mostram aviso e botao de reenviar quando aplicavel. |
| Diagnostico WhatsApp | Operador tinha pouca visibilidade da sessao/provedor. | Barra de diagnostico mostra sessao, provider health e estado de conexao. |
| Atualizacao em tempo real | Tela dependia mais de refresh manual/polling simples. | SSE/eventos e polling de diagnostico atualizam conversas/status automaticamente. |
| Envio manual | Envio aguardava retorno do backend para aparecer com clareza. | Mensagens de texto, midia e audio aparecem de forma otimista na timeline. |
| Composer | Digitando/anexo/audio pronto nao tinham microestado claro. | Header e composer exibem digitando, gravando audio, enviando, anexo pronto e audio pronto. |
| Rascunho | Trocar de conversa podia descartar texto em andamento. | Rascunho fica preservado por conversa ate envio/limpeza. |
| Timeline | Ao ler historico, novas mensagens nao tinham contador no retorno ao fim. | Botao de ir ao fim mostra contador de novas mensagens. |
| Performance da timeline | Parsing de midia, agrupamento e reacoes eram recalculados junto com renders do composer. | Itens da timeline sao preparados com memoizacao. |
| Performance da fila | Status, preview, unread e disponibilidade eram recalculados no JSX da lista. | Itens da fila sao preparados com memoizacao. |
| Pintura fora da tela | Mensagens e itens fora da viewport ainda participavam mais do custo de layout/pintura. | `content-visibility` reduz pintura/layout offscreen. |
| Separacao de paineis | Lista, chat e contexto estavam amarrados no mesmo pacote de render. | Lista, chat principal e contexto foram isolados em panes memoizados. |
| Mobile | Havia risco de levar o fluxo de WhatsApp desktop para celular. | Mobile ficou fora do escopo de pareamento; celular segue com app/ligacao/email. |

## Commits Aplicados

Backend / confiabilidade:

- `67b2606` - marca conversas do Atendimento como lidas.
- `5bcff13` - mostra avisos de entrega na conversa.
- `747946b` - permite reenviar mensagens falhas.
- `1c00b21` - exibe diagnosticos de WhatsApp no Atendimento.
- `598f3c1` - atualiza Atendimento em tempo real e diagnostico.

Frontend / fidelidade WhatsApp:

- `9344811` - mostra envios otimistas no Atendimento.
- `b318915` - adiciona indicadores de atividade do composer.
- `4fedaab` - preserva rascunhos por conversa.
- `2edcb04` - conta novas mensagens na timeline.

Performance / estrutura:

- `072ef47` - memoiza itens da timeline.
- `0b5a6df` - memoiza itens da fila.
- `a6d1b30` - reduz pintura offscreen.
- `dff0fb4` - isola render da fila.
- `ea4a195` - isola render do painel principal.
- `5717938` - isola render do painel de contexto.

## Validacao Final

Executado em 2026-05-27:

- Frontend lint: `npm run lint` em `frontend` passou.
- Frontend build: `npm run build` em `frontend` passou.
- Backend build: `npm run build` em `backend` passou.
- Backend inbox test: `node --test dist/inbox/inbox.service.test.js` passou com 27 testes.
- Frontend local: `http://localhost:3001/atendimento` respondeu `200`.
- Backend local: na primeira checagem `http://localhost:3000` recusou conexao; na revalidacao posterior respondeu `200`.

## Estado Final da Fase 1

O Atendimento desktop agora esta mais proximo do comportamento esperado de uma central WhatsApp:

- operador ve status de conexao antes de agir;
- mensagens manuais aparecem imediatamente;
- falhas de envio ficam acionaveis;
- rascunhos nao se perdem ao alternar conversas;
- novas mensagens ficam visiveis sem arrancar o operador do historico;
- lista, timeline e contexto ficaram menos acoplados no render.

## O Que Ficou Para Uma Proxima Fase

Nao aplicado nesta auditoria para manter risco baixo:

- extrair timeline, composer e fila para componentes/arquivos proprios;
- virtualizar lista/timeline se o volume real de conversas/mensagens exigir;
- adicionar teste end-to-end autenticado do fluxo completo quando backend local estiver ativo;
- criar medicao com React Profiler antes/depois para quantificar ganho real;
- evoluir suporte a templates/midia conforme capacidades reais do provider conectado.

## Revalidacao do Smoke Local

Executado apos a conexao local voltar:

- Backend local: `http://localhost:3000` respondeu `200`.
- Frontend local: `http://localhost:3001/atendimento` respondeu `200`.
- Rotas protegidas sem token, como `/inbox/bootstrap`, `/inbox/whatsapp-session` e `/inbox/conversations?take=5`, responderam `401`, confirmando que o servidor esta de pe e a guarda de autenticacao continua ativa.
- `node --test dist/inbox/inbox.service.test.js` passou com 27 testes.

## Observacao Operacional

Nao foi feito login novo no smoke para nao substituir/revogar a sessao ativa do navegador. A validacao autenticada de comportamento ficou coberta pelos testes focados de Inbox.


## Checklist Complementar - 2026-05-28

Regra operacional desta rodada: analisar e aplicar correcoes sem rodar testes, sem reiniciar servicos e sem Playwright ate o passo 8.

- [x] 1. Mapear no Playwright, no passo 8, alteracoes de telas, bloqueios e encerrados.
  - Preparado: fila `Encerrado` voltou para a ordem oficial do Atendimento e carregamentos filtrados preservam a lista ja carregada.
- [x] 2. Corrigir abertura de fotos dos contatos.
  - Aplicado: avatar do cabecalho abre o visualizador de imagem quando existe `avatarUrl`.
- [x] 3. Corrigir clique no icone de bloqueio desaparecendo com mensagens/contatos.
  - Aplicado: bloquear contato nao muda mais automaticamente para a fila `Bloqueados`; a lista carregada e a conversa atual sao preservadas.
- [x] 4. Criar opcao de alterar meu status e exibir presenca possivel dos contatos.
  - Aplicado: dock do operador abre `Meu status` com `Disponivel`, `Ocupado`, `Indisponivel` e texto livre.
  - Aplicado: cabecalho da conversa mostra digitando/online/ultimo visto/status quando o provider enviar esses metadados; quando nao enviar, informa limite do WebWhats.
- [x] 5. Analisar sumico intermitente de todos os contatos no VPS.
  - Aplicado: carregamento de fila especifica (`Bloqueados`, `Encerrado`, etc.) agora mescla com a lista atual em vez de substituir tudo por uma pagina filtrada/vazia.
  - Aplicado: backend inclui marcadores `atendimentoBlockedAt` e `blocked_manual` na consulta operacional para bloqueados nao dependerem de recencia.
- [x] 6. Alterar relogio da Prospecção/robo para `HH:MM:SS`.
  - Aplicado: contador do robo lateral e contador do card de Prospecção usam `HH:MM:SS`.
- [x] 7. Corrigir cards encerrados invisiveis, incluindo validacao do caso `(19) 97815-4334` no VPS.
  - Aplicado: `archived` foi reinserido no mapa/ordem real das filas, permitindo contagem, filtro e busca de encerrados.
  - Validado local no passo 8: aba `Encerrado` aparece e a tela nao quebra ao alternar filtros.
  - Baseline VPS no passo 8: numero `(19) 97815-4334` nao apareceu na busca do ambiente publicado antes de deploy das correcoes locais.

## Passo 8 Executado - 2026-05-28

- [x] Reiniciado somente o necessario: frontend local em `http://localhost:3001` e backend local via Docker Compose.
- [x] Login Playwright local executado.
- [x] Login Playwright VPS executado como baseline de producao antes de deploy.
- [x] Smoke local `local4` em `tmp-playwright-step8-local4-report.json`.
  - Atendimento carregou em `/atendimento`, sem redirecionar para login.
  - Abas `Pessoais`, `Atendimento`, `Prospecção`, `Grupos` e `Encerrado` visiveis.
  - Clique em `Bloqueados` nao derrubou a tela nem limpou a aplicacao.
  - Abertura de foto do contato validada com lightbox.
  - Modal `Meu status` abre e persiste `Ocupado em validacao Playwright`.
  - Presenca/status do contato renderizada no cabecalho.
  - Nenhum contador ativo de proxima prospeccao estava renderizado no momento do smoke; formatacao `HH:MM:SS` ficou validada por codigo.
- [x] Smoke VPS baseline `vps-baseline` em `tmp-playwright-step8-vps-baseline-report.json`.
  - Atendimento carregou em `/atendimento`, sem redirecionar para login.
  - Abas principais visiveis.
  - Producao ainda nao tinha as correcoes locais de `Meu status` e presenca.
  - Numero `(19) 97815-4334` nao apareceu na busca de encerrados durante o baseline.
- [x] Evidencias visuais geradas:
  - `tmp-playwright-step8-local4-home.png`
  - `tmp-playwright-step8-local4-blocked.png`
  - `tmp-playwright-step8-local4-archived.png`
  - `tmp-playwright-step8-local4-archived-phone.png`
  - `tmp-playwright-step8-local4-final.png`
  - `tmp-playwright-step8-vps-baseline-home.png`
  - `tmp-playwright-step8-vps-baseline-blocked.png`
  - `tmp-playwright-step8-vps-baseline-archived.png`
  - `tmp-playwright-step8-vps-baseline-archived-phone.png`
  - `tmp-playwright-step8-vps-baseline-final.png`

## Passo 2 Executado - 2026-05-28

- [x] Validacao pre-deploy local.
  - `git diff --check` passou nos arquivos da correcao.
  - `npm run build` em `backend` passou.
  - `npm run lint` em `frontend` passou.
  - `npm run build` em `frontend` passou.
- [x] Commit isolado da correcao criado e enviado.
  - Commit: `d92ee73 fix: stabilize atendimento webwhats audit`.
  - A alteracao pre-existente em `frontend/src/app/vendas/page.client.tsx` ficou fora do commit.
  - Uploads/midias locais ficaram fora do commit.
- [x] Deploy seletivo no VPS concluido.
  - VPS atualizado de `11fca3d` para `d92ee73`.
  - Backend Docker rebuildado e recriado como `hbx-backend`.
  - Frontend Docker rebuildado e recriado como `hbx-frontend`.
  - `https://www.hbxsystem.com.br/atendimento` respondeu apos deploy.
  - `https://api.hbxsystem.com.br/health` respondeu apos deploy.
- [x] Playwright no VPS publicado executado apos deploy.
  - Relatorio final: `tmp-playwright-step8-vps-step2b-report.json`.
  - Atendimento carregou em `/atendimento`, sem redirecionar para login.
  - Abas `Pessoais`, `Atendimento`, `Prospecção`, `Grupos` e `Encerrado` visiveis.
  - Clique em `Bloqueados` nao derrubou a tela nem limpou a aplicacao.
  - Abertura de foto do contato validada com lightbox.
  - Modal `Meu status` abre e persiste.
  - Presenca/status do contato renderizada no cabecalho.
  - Contador `HH:MM:SS` renderizado no VPS.
  - Sem erros de console e sem `pageerror`.
  - Numero `(19) 97815-4334` nao apareceu na busca de encerrados; a fila `Encerrado` apareceu com 3 cards no VPS publicado.
- [x] Evidencias visuais pos-deploy:
  - `tmp-playwright-step8-vps-step2b-home.png`
  - `tmp-playwright-step8-vps-step2b-blocked.png`
  - `tmp-playwright-step8-vps-step2b-archived.png`
  - `tmp-playwright-step8-vps-step2b-archived-phone.png`
  - `tmp-playwright-step8-vps-step2b-final.png`
