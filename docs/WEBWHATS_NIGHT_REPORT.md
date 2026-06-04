# WEBWHATS Night Pass Report

Data: 2026-06-04

## Commits

- Baseline antes da passada: `5e2c8403` - parent de `42185bd0`.
- Commit inicial da passada Webwhats/Atendimento: `42185bd0` - `docs: audit Webwhats Atendimento performance and UX`.
- Commit final funcional antes deste relatorio: `6dfcb160` - `feat: add Atendimento Webwhats health diagnostics`.
- Commit final do relatorio: este commit - `docs: add Webwhats night pass report`.

Observacao: houve commits automaticos `chore: publish` intercalados. As camadas 12, 13 e 15 existem como commits limpos de referencia (`ee2bda1e`, `716f20fd`, `70614115`), mas a ponta atual carrega essas mudancas por commits de publish (`53a79875`, `bbd1b762`, `f534870e`).

## O que melhorou

- Webwhats ganhou auditoria operacional documentada em `docs/WEBWHATS_ATENDIMENTO_AUDIT.md`.
- Query de chats no Webwhats foi normalizada com paginacao segura (`take`, `skip`, `limit`, `cursor`, `search`) e limites defensivos.
- Foi criado endpoint leve de lista de chats para reduzir payload, evitar message JSON completo na listagem e entregar preview/cursor.
- Foram adicionados indices de banco para acelerar lista de chats e mensagens por `instanceId`, timestamp e `remoteJid`.
- Presenca WebWhats passou a ter snapshot em memoria com TTL, suporte a online/digitando/gravando/unknown e subscribe throttle.
- HBX passou a preferir lista fast e presenca via bridge, com fallback para endpoint antigo e caches curtos.
- Inbox passou a aceitar bootstrap leve (`light=true`) e carregar conversa/mensagens progressivamente.
- Atendimento passou a abrir com lista primeiro, skeleton de 10 itens, carregamento lazy da conversa selecionada e cancelamento de fetch anterior.
- UI do Atendimento passou a mostrar presenca estilo WhatsApp: online, digitando, gravando audio, visto por ultimo e indicador verde no avatar.
- Lista de chats ficou mais estavel: altura fixa, preview curto, horario alinhado, unread badge e avatar lazy.
- Mensagens passaram a usar pagina de 30 itens com `before`, carregamento de historico anterior e scroll preservado.
- Midias ficaram mais leves: base64 fora da lista, preview/thumbnail sob demanda e sem autoplay.
- Testes foram adicionados para Webwhats, inbox backend e smoke Playwright do Atendimento.
- Atendimento ganhou diagnostico Webwhats compacto para admin/master ou debug, com status, ultima sync de chats, ultima sync de conversa e modo bootstrap.

## Endpoints novos ou contratos reforcados

- Webwhats: `POST /chat/findChatsFast/:instanceName`
  - Lista leve de chats, com preview, unread, timestamps, cursor e sem payload grande de mensagens.
- Webwhats: `GET /chat/presence/:instanceName?remoteJid=...`
  - Snapshot de presenca por JID; retorna `unknown` sem quebrar quando provider nao entrega presenca.
- HBX: `GET /inbox/bootstrap?take=40&light=true`
  - Bootstrap leve com `bootstrapMode`, `selectedConversationId`, `hasMoreConversations` e `nextSkip`.
- HBX: `GET /inbox/conversations/:id/presence`
  - Resolve a conversa e consulta presenca pelo bridge Webwhats.
- HBX: `GET /inbox/conversations/:id/messages?limit=30&before=...`
  - Contrato de mensagens paginadas usado pelo Atendimento para scroll estavel.

Nao houve endpoint novo na camada 17; o painel de diagnostico reaproveita dados do bootstrap/sessao ja existentes.

## Comandos de teste

Rodados na reta final desta passada:

```powershell
cd frontend
npm run build
```

```powershell
npm run test:e2e -- atendimento.spec.ts --project=chromium
```

Comandos recomendados para revalidar o pacote completo:

```powershell
cd Webwhats
npm run typecheck
npm run build
npm run test:ci
```

```powershell
cd backend
npm run build
npm run test:inbox-smoke
```

```powershell
cd frontend
npm run build
```

```powershell
npm run test:e2e -- atendimento.spec.ts
```

## Como testar de manha

1. Subir stack local/staging com backend, frontend e Webwhats apontando para uma instancia real.
2. Entrar como admin e abrir `/atendimento?atendimentoDebug=1`.
3. Confirmar que a barra mostra status WebWhats, ultima sync de chats, ultima sync de conversa e bootstrap `light`.
4. Entrar como vendedor comum sem debug e confirmar que o painel de diagnostico nao aparece.
5. Abrir Atendimento e validar: skeleton inicial, lista renderizada, preview de ultima mensagem, horario e unread badge.
6. Clicar em uma conversa e validar carregamento de mensagens, scroll no fim e composer ativo.
7. Subir no historico e confirmar que "Carregar mensagens anteriores" preserva posicao do scroll.
8. Pedir para um contato digitar/gravar/responder e observar online/digitando/gravando/visto por ultimo quando o provider enviar presenca.
9. Testar midia recebida: imagem, video, documento e audio devem aparecer como preview leve e abrir sob acao do usuario.
10. Forcar Webwhats reconectando/desconectado e confirmar que Atendimento mostra estado correto sem travar a tela.
11. Validar via API: `/inbox/bootstrap?take=40&light=true`, `/inbox/conversations/:id/presence` e `/inbox/conversations/:id/messages?limit=30`.

## Riscos conhecidos

- Presenca depende dos eventos que o provider/Baileys realmente entregar; quando nao houver sinal, o retorno esperado e `unknown`.
- Caches curtos de chat list e presenca podem mostrar estado com alguns segundos de atraso.
- Indices do Webwhats precisam estar aplicados no banco alvo antes de medir ganho real de latencia.
- O endpoint fast tem fallback para o caminho antigo; se o provider recusar o novo endpoint, a UX continua, mas o ganho de performance diminui.
- Teste Playwright atual usa API mockada; ele valida UI/fluxo, nao conectividade real do WhatsApp.
- Houve commits automaticos de publish intercalados; revisar a pilha antes de push/PR para evitar surpresa de historico.
- Nenhum deploy/Hostinger/infra foi executado nesta passada.

## Pendencias

- Rodar a bateria completa Webwhats + backend + frontend em ambiente limpo antes de publicar.
- Aplicar/verificar migrations de indices no banco Webwhats de destino.
- Medir tempo real de `/chat/findChatsFast`, `/inbox/bootstrap?light=true` e abertura de conversa com dados grandes.
- Validar presenca real com contatos individuais, grupo e reconexao de instancia.
- Ampliar E2E para cenarios de erro: Webwhats desconectado, presence unknown, mensagens antigas e midia pesada.
- Revisar se os commits limpos de referencia das camadas 12, 13 e 15 devem ser preservados em branch separada ou se os publish commits atuais bastam.

## Rollback por commit

Preferir `git revert <commit>` em ordem inversa, revisando conflitos quando houver commit de publish absorvendo mais de uma camada.

| Camada | Commit principal | Rollback sugerido |
| --- | --- | --- |
| 01 audit | `42185bd0` | Reverter apenas se quiser remover a auditoria docs. |
| 02 query pagination | `9ad51b3e` | Reverter junto com fast list se o tipo/helper quebrar compatibilidade. |
| 03 fast chat list | `d9b4b838` | Reverter endpoint fast; bridge cai para endpoint antigo se camada 06 tambem for ajustada/revertida. |
| 04 indices | `c61224f6` | Reverter migration/doc; em banco ja aplicado, remover indices manualmente se necessario. |
| 05 presence Webwhats | `fabb6b7c` | Reverter endpoint/store de presenca. |
| 06 bridge fast/presence | `318138fe` | Reverter consumo fast/presence no HBX; Atendimento volta ao caminho antigo. |
| 07 bootstrap light | `1c9ad2aa` | Reverter contrato light; tambem reverter frontend progressivo se necessario. |
| 08 presence inbox | `41ded0fe` | Reverter `/inbox/conversations/:id/presence`. |
| 09 frontend progressivo | `7bacd5d4` | Reverter carregamento light/lazy do Atendimento. |
| 10 presenca frontend | `472af153` | Reverter indicadores online/digitando no Atendimento. |
| 11 lista otimizada | `fd642f10` | Reverter layout/renderizacao da lista. |
| 12 mensagens/paginacao | `53a79875` / ref `ee2bda1e` | Reverter publish `53a79875` com cuidado ou aplicar rollback pontual em `page.client.tsx`. |
| 13 midia lazy | `bbd1b762` / ref `716f20fd` | Reverter publish `bbd1b762` com cuidado ou rollback pontual de midia. |
| 14 testes Webwhats | `f58f40cf` | Reverter apenas testes se a suite bloquear indevidamente. |
| 15 smoke inbox backend | `f534870e` / ref `70614115` | Reverter publish `f534870e` se quiser remover o smoke backend. |
| 16 Playwright Atendimento | `777d9e22` | Reverter `tests/e2e/atendimento.spec.ts`. |
| 17 diagnostico Atendimento | `6dfcb160` | Reverter painel de diagnostico e estados de sync. |
| 18 relatorio | este commit | Reverter este arquivo se precisar remover a documentacao final. |
