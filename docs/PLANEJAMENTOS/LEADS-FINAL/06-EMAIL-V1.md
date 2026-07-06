# 06 — E-mail v1: conectar conta (SMTP) + enviar da timeline do lead

## Objetivo
Tab **E-mail** na página do lead (plano 02): conectar a conta do usuário (senha de app,
presets Gmail/Outlook/etc. como no anexo 4 do Biz), testar conexão e **enviar** e-mail da
timeline do lead, com histórico do que foi enviado. **IMAP/recebimento = v2 explícito** —
sync de caixa é poço de edge case e não pode travar esta entrega.

## Por quê ($)
Fecha a tríade de canal no lead (Anotações | WhatsApp | E-mail) que o comparativo com o
Biz mostrou. Custo de envio = zero (conta do próprio cliente). Recebimento na timeline é
o caro — só se o uso do envio provar demanda.

## Estado atual
- Não existe módulo de e-mail do usuário no app (verificar se o backend tem algum
  transportador SMTP interno — ex.: MasterAlert/notificações — e reusar lib/padrão).
- Padrão de secrets: lição do website-kit (P0 04/07 — guard fail-hard crash-loopou o
  backend; hoje degrada gracioso). E-mail segue o mesmo: **secret de cifra ausente =
  feature OFF graciosa**, nunca crash no boot.
- Config-in-place é regra da frente (plano 02): sem conta conectada, a tab mostra o
  formulário ALI, não manda pra engrenagem.

## Desenho

### Backend
- Prisma: `EmailAccount` (id, companyId, userId, address, senderName, provider,
  smtpHost, smtpPort, smtpSecure, username, `credentialsEnc` cifrado, status
  connected|draft|error, lastTestedAt, createdAt) e `EmailMessage` (id, companyId,
  leadId, accountId, direction='out', to, subject, bodyText/bodyHtml simples, status
  sent|failed, error, sentAt).
- Cifra: AES-256-GCM com secret dedicado em env (`HBX_EMAIL_CRED_SECRET`); secret ausente
  → módulo desliga gracioso (padrão website-kit pós-P0). **Senha NUNCA em log** (nem em
  erro de conexão — sanitizar).
- Envio: nodemailer (ou lib já presente) SMTP; síncrono com timeout curto (15s); sem fila
  v1 — 1 e-mail por vez, erro volta claro pro front. Rate leve por usuário (ex.: 30/h)
  pra não virar canhão de spam com a marca dos outros.
- Endpoints: CRUD conta (test-connection SÓ por ação explícita do usuário), POST send
  (leadId + subject + body), GET histórico por lead. Guards de company/RBAC existentes.
- Presets de provedor (Gmail/Outlook/Yahoo/UOL/Hostinger/KingHost/Locaweb/outro): host/
  porta/SSL pré-preenchidos + dica de senha de app com link (conteúdo NOSSO, não copiar
  texto do Biz).

### Front
- Tab E-mail na página do lead: sem conta → formulário de conexão embutido (3 blocos:
  identidade, SMTP, testar/salvar — SEM bloco IMAP no v1); com conta → compose (para =
  e-mail do lead pré-preenchido, assunto, corpo texto) + lista de enviados com status.
- Espelho da conta em Configurações (mesma tela/rota canônica — componente compartilhado,
  **sem tela duplicada**; a tab embute o mesmo componente).
- Vendedor pode conectar a própria conta e enviar; valores/planos continuam invisíveis
  pra vendedor (nada de e-mail de cobrança aqui — é canal de prospecção).

## Passos
1. Verificar transportador/lib de e-mail existente no backend; decidir reuso.
2. Migrations + módulo NestJS (conta+envio+histórico) + cifra + testes (cifra, sanitização
   de log, rate).
3. Front: componente de conexão (presets) + compose + histórico; embutir na tab e em
   Configurações.
4. Teste real com conta Gmail de teste (senha de app) — enviar pro próprio endereço.

## Riscos / guardrails
- **Boot da VPS**: migration + env novo = RECREATE + conferir `docker ps`/logs
  ("build verde ≠ boot ok").
- Credencial: cifra em repouso, sanitização em log/erro, endpoint de leitura NUNCA
  devolve senha (nem cifrada).
- Deliverability é do cliente (conta dele) — não prometer inbox; erro SMTP mostrado cru
  e honesto no histórico.
- Escopo: **NÃO implementar IMAP/recebimento, NÃO fila, NÃO templates, NÃO campanha em
  massa** no v1 — anotar como v2 e parar.

## Checks / DoD
- Conectar conta de teste → testar conexão OK → enviar da timeline → status `sent` →
  histórico lista → erro de senha errada aparece claro e sem vazar credencial no log.
- Backend sobe SEM o secret (feature OFF graciosa) e COM o secret (feature ON).
- lint/build/testes verdes; tab só aparece quando o plano 02 está no ar.
