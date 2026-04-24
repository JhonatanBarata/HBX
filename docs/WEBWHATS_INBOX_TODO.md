# WebWhats Inbox Todo

## Objetivo

A Inbox deve ser um espelho funcional do Web WhatsApp: o backend salva o historico local, compara com o motor WebWhats e atualiza somente o que mudou, sem esconder mensagens ja persistidas.

## 1. Audio

- [x] Receber audio do motor e persistir como `audio`.
- [x] Baixar audio para asset local quando o motor entrega `base64`/midia.
- [x] Exibir player de audio na conversa.
- [x] Aceitar upload de audio no composer.
- [x] Enviar audio via `sendMedia` quando o WhatsApp modal esta conectado.
- [ ] Validar em producao com audio real recebido e audio real enviado.

## 2. Mensagens

- [x] Enviar texto via WebWhats.
- [x] Receber texto e persistir com `providerMessageId`.
- [x] Exibir ticks de status (`SENT`, `DELIVERED`, `READ`, `FAILED`).
- [x] Reagir a mensagem via `sendReaction`.
- [x] Apagar mensagem para todos via `deleteMessageForEveryone`.
- [x] Apagar/ocultar mensagem localmente sem apagar no WhatsApp.
- [x] Marcar conversa como lida localmente e zerar contador local.
- [x] Impedir que sync antigo mova `lastMessageAt` da conversa para tras.
- [x] Reparar leitura de conversa stale usando a mensagem mais nova salva.
- [ ] Validar em producao: enviado, entregue, lido, reacao, delete local e delete para todos.

## 3. Imagens e documentos

- [x] Receber imagem/video/documento/audio e normalizar metadata.
- [x] Baixar midia recebida para `/uploads/inbox` quando o motor fornece conteudo.
- [x] Abrir imagem em visualizador.
- [x] Abrir documento em preview ou nova aba.
- [x] Aceitar upload de imagem, video, PDF, DOC, XLS, TXT, CSV e audio.
- [x] Enviar anexo via `sendMedia`.
- [ ] Validar em producao: imagem recebida, documento recebido, imagem enviada e documento enviado.

## 4. WebWhats completo

- [x] Listar chats do motor e espelhar em `CompanyConversation`.
- [x] Buscar paginas de mensagens do motor e reconciliar com `Message`.
- [x] Manter nomes, foto, unread count, arquivado e janela ativa quando o motor retorna esses campos.
- [x] Arquivar/desarquivar chat via motor.
- [x] Bloquear/desbloquear contato via motor.
- [x] Deletar chat localmente no HBX sem apagar no WhatsApp.
- [ ] Deletar chat no WhatsApp: backend tem bridge, mas a Inbox atual usa exclusao local por decisao de produto.
- [ ] Presenca online/typing: depende de o motor expor endpoint/evento estavel.
- [ ] Confirmacao real de "cliente online": depende do payload do motor conter presenca/online.
- [ ] Marcar como lida no WhatsApp remoto: depende de endpoint do motor para read receipt, hoje so zera local.

## O que preciso para fechar o que esta pendente

- Payload real do motor para audio, imagem, documento, status, presenca e delete, quando existir.
- Nome dos endpoints do motor para: presenca/online, typing, marcar como lida no WhatsApp remoto e deletar chat remoto.
- Um numero de teste e uma conversa de teste em producao para validar: texto, audio, imagem, documento, reacao, leitura e delete.
- A decisao de produto sobre exclusao de conversa: local-only ou apagar tambem no WhatsApp.
