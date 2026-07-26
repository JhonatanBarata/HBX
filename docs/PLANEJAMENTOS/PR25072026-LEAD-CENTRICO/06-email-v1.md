# S6 — E-mail v1: perfil do remetente + assinatura + registro no lead

## Conceito (decisão do dono 25/07)
"Não posso mandar email sem nem uma apresentação, pelo menos uma assinatura bem feita."
SMTP primeiro (SEM OAuth Google — pedágio adiado). Sem caixa de e-mail salva: só a interação
comercial registrada no lead. Sem pixel de abertura (piora reputação; o sinal que vale é
RESPOSTA). Infra existente em `backend/src/mail/` (`CompanyMailerService`,
`EmailOutboxService`+worker, `company-email-settings.service.ts`) — mapear ANTES de criar
qualquer coisa; é evolução, não módulo novo.

## Entrega
1. **Perfil do remetente por usuário**: nome, cargo, telefone, site (+ empresa do tenant).
   Assinatura HTML SÓBRIA gerada disso (nome / cargo | empresa / telefone / site — sem banner,
   sem logo pesado, sem lista de links). Cadastro mínimo na tela de perfil/config existente.
2. **Assinatura em todo e-mail comercial**: passos de e-mail da cadência e envio manual do
   detalhes saem com a assinatura do remetente. E-mail sem perfil preenchido → NÃO envia passo
   de e-mail (pula com log "sem identidade"), regra dura do plano: e-mail sem identidade não sai.
3. **Frase de saída limpa** no rodapé dos e-mails de prospecção (1 linha, tipo "Se não fizer
   sentido pra vocês, me avisa por aqui que não volto a incomodar.") — copy exata no relatório
   pro dono revisar. Resposta reconhecida como "sem interesse/remover" → marcar o lead
   (motivo estruturado do S4) e suprimir novos e-mails pro contato.
4. **Registro no lead**: enviado / bounce / respondido viram eventos visíveis na história do
   lead (atividades existentes) — nunca caixa de entrada. Bounce permanente invalida o e-mail
   do lead (não tenta de novo).
5. **Resposta por thread (best-effort)**: guardar `Message-ID` do que saiu; se a config de
   e-mail da empresa tiver IMAP/recepção disponível, detectar respostas SÓ dessas threads
   (In-Reply-To/References) e registrar no lead + parada global (S4). Se a infra atual não der
   IMAP sem obra grande: entregar só envio+bounce+registro e documentar o gap no relatório —
   NÃO inventar polling frágil.

## O que NÃO fazer
- SEM OAuth Google. SEM pixel/open-tracking. SEM caixa de entrada/pastas/rascunhos.
- NÃO mexer nos tetos do runner (50/dia) nem no worker do outbox além do necessário.
- NÃO tocar atendimento/recovery/Webwhats.

## Aceite
- Testes: e-mail sai com assinatura; sem perfil → passo pulado com log; bounce invalida;
  resposta de remoção marca sem_interesse/supressão.
- Typecheck + suítes tocadas verdes. Commit local:
  `feat(mail): perfil do remetente + assinatura + registro no lead (S6 LEAD-CENTRICO)`.
- Relatório: strings/copy novas, o que existe de IMAP/recepção hoje e o que ficou de gap.
- Guardrails gerais: `00-FRENTE.md`.
