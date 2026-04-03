# PRIORIDADE — 2026-04-04 — Fluxo crítico de e-mail do cadastro

## Prioridade

**ALTA / BLOQUEADOR DE OPERAÇÃO**

## Problema

O HBX depende de envio real de e-mail para girar os fluxos críticos abaixo:

- confirmação de e-mail no cadastro;
- ativação do trial após confirmação;
- recuperação de senha;
- reentrada do cliente no sistema.

Se o envio real não estiver operacional em produção, então o sistema fica com o fluxo de onboarding quebrado.

## Impacto de produto

Se isso falhar:

- o cliente novo não conclui cadastro;
- a conta pode ficar presa em confirmação pendente;
- o login pode continuar bloqueado;
- recuperação de senha deixa de funcionar;
- o SaaS não gira sozinho;
- vira falha crítica de operação, não detalhe técnico.

## Objetivo de amanhã

Validar e fechar ponta a ponta o fluxo completo de e-mail do sistema.

## Checklist obrigatório

### 1) Envio real em produção

Verificar no ambiente de produção se o backend possui configuração real de envio:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

### 2) Cadastro novo

Testar ponta a ponta:

- envio do formulário de cadastro;
- criação do usuário/empresa;
- envio real do e-mail de confirmação;
- recebimento do e-mail pelo cliente;
- clique no link;
- confirmação do token;
- ativação do trial;
- liberação de login.

### 3) Recuperação de senha

Testar ponta a ponta:

- solicitação de recuperação;
- envio real do e-mail;
- recebimento do link;
- redefinição de senha;
- login com a nova senha.

### 4) Estados corretos do sistema

Garantir que o sistema diferencie corretamente:

- confirmação pendente;
- e-mail confirmado;
- token inválido;
- token expirado;
- falha de envio SMTP;
- indisponibilidade temporária do backend.

### 5) UX / mensagens

Não deixar o usuário preso em estado ambíguo.

As mensagens precisam deixar claro:

- quando o e-mail foi enviado com sucesso;
- quando o link expirou;
- quando deve reenviar;
- quando o problema é do servidor e não do usuário.

## Observação crítica

O sistema não pode depender de suposição do tipo "deve estar enviando".

Esse fluxo precisa ser validado de forma real em produção, porque ele sustenta o cadastro e a recuperação de acesso.

## Resultado esperado

Ao final da revisão:

- cadastro funcionando ponta a ponta;
- confirmação de e-mail funcionando ponta a ponta;
- recuperação de senha funcionando ponta a ponta;
- mensagens claras para erro, lentidão e confirmação.
