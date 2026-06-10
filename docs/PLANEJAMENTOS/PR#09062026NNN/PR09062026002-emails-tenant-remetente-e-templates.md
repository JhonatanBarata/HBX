# PR09062026002 — E-mails por tenant, remetente correto e templates da empresa

## Objetivo

Separar definitivamente e-mail de plataforma HBX de e-mail operacional da empresa/tenant.

O sistema deve continuar usando o e-mail oficial HBX para fluxos de segurança e plataforma, mas os fluxos operacionais de uma empresa comum precisam usar identidade, resposta e texto configuráveis da própria empresa.

---

## Diagnóstico

### 1. O MailService é global

O serviço de envio lê `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `SMTP_USER` e credenciais SMTP/Resend do ambiente. Se `MAIL_FROM` existir, ele usa esse remetente. Se não existir, monta o remetente com `MAIL_FROM_NAME` + `SMTP_USER`.

Consequência prática:

- Se o ambiente estiver com `SMTP_USER=barataimports@gmail.com`, esse endereço pode aparecer como relay técnico.
- Se o Gmail não tiver o alias `jhonatan@hbxsystem.com.br` autorizado em “Enviar e-mail como”, o Gmail pode reescrever ou expor o usuário autenticado.
- `MAIL_FROM="HBX <jhonatan@hbxsystem.com.br>"` só funciona como identidade visual estável se o provedor aceitar esse remetente.

Arquivos envolvidos:

- `backend/src/mail/mail.service.ts`
- `backend/.env.example`

### 2. Confirmação e reset são e-mails de plataforma

Os fluxos de confirmação de e-mail e recuperação de senha são transacionais de segurança. Eles chamam `MailService.sendMail()` sem remetente específico de tenant, então caem no remetente global HBX.

Isso está correto para:

- confirmação inicial de conta;
- recuperação de senha;
- reenvio de confirmação;
- mensagens de segurança do login.

Esses e-mails devem continuar sendo HBX, porque o sistema/identidade de autenticação é da plataforma.

Arquivos envolvidos:

- `backend/src/auth/auth.service.ts`

### 3. E-mail de boas-vindas do vendedor é operacional do tenant, mas hoje também usa o global

Quando uma empresa comum cria vendedor, o fluxo passa por `UsersController.sendWelcomeAccessEmail()`. Esse método monta o template `seller_welcome` e chama `MailService.sendMail()` sem `from` e sem `replyTo` de empresa.

Resultado atual:

- o e-mail sai pela identidade global HBX ou pelo relay SMTP;
- o texto termina com `Equipe comercial`, sem identidade clara da empresa;
- a empresa não controla frase padrão, assinatura ou resposta;
- o vendedor recebe um e-mail que parece vir da HBX/master, mesmo tendo sido criado por uma empresa comum.

Arquivos envolvidos:

- `backend/src/users/users.controller.ts`
- `backend/src/mail/email-template.service.ts`

### 4. O sistema já possui campos de comunicação do tenant, mas eles não estão ligados ao envio

A tabela `Company` já possui:

- `supportEmail`
- `replyToEmail`
- `supportWhatsapp`
- `communicationSettingsJson`

Também existe painel em Gerencial para editar esses dados:

- `frontend/src/app/gerencial/_components/TenantCommunicationPanel.tsx`
- `backend/src/tenant-communication/tenant-communication.service.ts`
- `backend/src/tenant-communication/tenant-communication.controller.ts`

Problema: esses campos existem, mas o envio de boas-vindas do vendedor não consulta esses dados.

---

## Regra de negócio correta

### E-mails que continuam HBX

Usar identidade global HBX:

1. Confirmação de cadastro inicial.
2. Recuperação de senha.
3. Reenvio de confirmação.
4. Avisos de segurança da plataforma.
5. E-mails do Master comercial HBX para apresentação do sistema.

Motivo: são fluxos de confiança, autenticação e plataforma.

### E-mails que devem ser do tenant

Usar identidade operacional da empresa:

1. Boas-vindas para vendedor criado pela empresa.
2. Pedido de documentos/contrato para vendedor da empresa.
3. Comunicação comercial enviada pela empresa para sua equipe.
4. Futuramente: cobrança/avisos internos próprios do tenant, se aplicável.

### Como enviar sem quebrar SPF/DKIM

Não tentar falsificar `From` com e-mail da empresa sem domínio verificado.

Regra segura:

- `From`: remetente verificado da HBX ou domínio verificado do provedor.
- `Reply-To`: `company.replyToEmail` quando configurado e permitido.
- Nome/assinatura/texto: usar nome da empresa.
- Futuro opcional: permitir SMTP próprio do tenant somente quando validado.

Exemplo correto:

```txt
From: HBX <jhonatan@hbxsystem.com.br>
Reply-To: contato@empresa.com.br
Assinatura: Equipe comercial da Empresa X
```

Se o provedor permitir domínio verificado por tenant no futuro:

```txt
From: Empresa X <contato@empresa.com.br>
Reply-To: contato@empresa.com.br
```

---

## Solução solicitada ao Codex

### 1. Criar resolvedor central de identidade de e-mail

Criar um serviço/helper para resolver identidade de envio por contexto.

Nome sugerido:

- `backend/src/mail/mail-identity.service.ts`

Responsabilidade:

- Dado um tipo de e-mail e `companyId`, retornar:
  - `from` seguro;
  - `replyTo` seguro;
  - `brandName`;
  - `signatureName`;
  - `supportEmail`;
  - `sourceKind`: `platform` ou `tenant`.

Tipos sugeridos:

```txt
platform_auth
platform_master
seller_welcome
tenant_seller_onboarding
tenant_commercial
```

### 2. Manter autenticação como plataforma

Para `password_reset`, `email_confirmation` e reenvio de confirmação:

- continuar sem tenant `from`;
- usar identidade global HBX;
- garantir que não use `company.replyToEmail`.

### 3. Aplicar identidade do tenant no seller_welcome

Em `UsersController.sendWelcomeAccessEmail()`:

- buscar empresa por `companyId`;
- carregar `supportEmail`, `replyToEmail`, `communicationSettingsJson` e `name`;
- resolver identidade de e-mail como `seller_welcome`;
- passar `replyTo` para `MailService.sendMail()`;
- personalizar assinatura e frase final com base no tenant.

Se a empresa não tiver configuração:

- usar fallback HBX seguro;
- mas corpo deve informar a empresa pelo nome, por exemplo:

```txt
Equipe comercial de {empresa}
```

Nunca usar `barataimports` como identidade visual.

### 4. Melhorar configuração de comunicação da empresa

Expandir `TenantCommunicationPanel` para deixar claro que a empresa configura:

- e-mail de suporte;
- e-mail para resposta;
- WhatsApp de suporte;
- assinatura padrão;
- frase final padrão de boas-vindas;
- texto curto de boas-vindas para vendedor.

Não deixar isso apenas como JSON cru.

O `communicationSettingsJson` pode continuar existindo por trás, mas a UI deve oferecer campos amigáveis.

Campos sugeridos dentro do JSON:

```json
{
  "brandName": "Empresa X",
  "sellerWelcomeGreeting": "Olá {vendedor}, seja bem-vindo à equipe comercial da {empresa}.",
  "sellerWelcomeClosing": "Conte com a equipe da {empresa} e boas vendas.",
  "signatureName": "Equipe comercial da {empresa}",
  "sellerWelcomeSubject": "Bem-vindo à equipe comercial da {empresa}"
}
```

### 5. Ajustar template `seller_welcome`

O template padrão atual pode continuar existindo, mas deve receber novas variáveis:

- `{empresa}`
- `{assinatura}`
- `{saudacaoEmpresa}`
- `{fraseFinalEmpresa}`
- `{emailSuporteEmpresa}`
- `{whatsappSuporteEmpresa}`

O texto não deve terminar genericamente com `Equipe comercial` quando existir empresa identificada.

### 6. Remover anexo/cartão HBX do e-mail operacional de vendedor, salvo decisão contrária

Hoje o welcome do vendedor tenta anexar/usar cartão de visita da HBX. Isso mistura marca da plataforma com comunicação operacional do tenant.

Regra:

- Seller welcome de tenant não deve anexar cartão HBX por padrão.
- Se existir `communicationSettingsJson.attachHbxCard=true`, permitir por exceção.
- Master/presentation emails continuam usando anexos HBX.

### 7. Auditar origem no retorno da API

Quando criar vendedor, o retorno deve incluir resumo do envio sem vazar senha além do necessário:

```json
{
  "welcomeEmail": {
    "ok": true,
    "transport": "smtp",
    "sourceKind": "tenant",
    "fromKind": "platform_verified",
    "replyTo": "contato@empresa.com.br"
  }
}
```

Não retornar senha temporária em logs permanentes.

---

## Correção de ambiente

Além do código, validar ambiente local/produção:

1. Se usar Gmail como SMTP, configurar o alias `jhonatan@hbxsystem.com.br` em “Enviar e-mail como”.
2. Se o alias não estiver autorizado, Gmail pode mostrar o `SMTP_USER` ou rejeitar/reescrever o remetente.
3. Preferir Resend ou SMTP de domínio verificado para produção.
4. `MAIL_FROM` precisa ser remetente verificado.
5. `MAIL_REPLY_TO` pode ser HBX para fluxos de plataforma.
6. Tenant `replyToEmail` deve ser salvo por empresa e aplicado só nos e-mails operacionais do tenant.

---

## Testes manuais obrigatórios

### Auth/platform

1. Criar conta nova.
2. Confirmar que e-mail de confirmação sai como HBX.
3. Solicitar reset de senha.
4. Confirmar que reset sai como HBX.
5. Confirmar que esses fluxos não usam dados de tenant como remetente.

### Tenant/seller

1. Entrar como empresa comum.
2. Ir em Gerencial > Comunicação.
3. Configurar:
   - suporte da empresa;
   - reply-to da empresa;
   - assinatura padrão.
4. Criar vendedor sem comissão.
5. Confirmar que o e-mail:
   - não aparece como identidade visual do relay técnico;
   - usa `Reply-To` da empresa;
   - cita a empresa na assinatura;
   - mostra comissão 0% sem parecer erro;
   - não anexa cartão HBX, salvo exceção configurada.

### Master

1. Enviar e-mail de apresentação pelo Master.
2. Confirmar que continua HBX.
3. Confirmar cópia interna se essa regra continuar ativa.
4. Confirmar que fluxo Master não usa identidade de tenant sem contexto.

---

## Critério de aceite

- Fluxos de segurança continuam com remetente HBX.
- Empresa comum não envia boas-vindas de vendedor parecendo ser o Master.
- `replyToEmail` do tenant é usado no seller welcome.
- O corpo do seller welcome usa nome/assinatura da empresa.
- O painel da empresa permite editar frase padrão sem mexer em JSON cru.
- Gmail/SMTP não deve exibir `SMTP_USER` como identidade final quando o ambiente está corretamente configurado.
- Não há senha temporária exposta em logs permanentes.

---

## Fora de escopo

- Criar provedor SMTP próprio por tenant nesta etapa.
- Verificação DNS por tenant.
- Reescrever todo o sistema de templates.
- Alterar WhatsApp.
- Alterar cobrança.
