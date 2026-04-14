# Correções HBX — Trindade

**Data:** 2026-04-14  
**Sistema:** HBX  
**Contexto:** cadastro, confirmação por email, login e onboarding inicial

> Observação: o primeiro item salvo desta conversa foi desconsiderado conforme solicitado pelo usuário.

## MINI — nível mini

### Básicas

1. **Cadastro PJ: unir responsável e usuário**
   - O campo de responsável deve virar o próprio usuário.
   - Evitar duplicidade entre "nome do responsável" e "usuário".

2. **Cadastro PF: simplificar nome**
   - Remover "nome completo".
   - Deixar apenas "nome do usuário".

3. **Ajuste de texto e espaçamento**
   - Corrigir para: `Reenviar email / Ir para login`.
   - Corrigir para: `Ir para login / Voltar ao cadastro`.

4. **Mensagem auxiliar na confirmação de email**
   - Abaixo de `Reenviar email / Ir para login`, exibir:
   - `Checar sua caixa de spam`

5. **Links clicáveis**
   - `Ir para login` deve ser hiperlink funcional.
   - `Voltar ao cadastro` deve ser hiperlink funcional.
   - `Reenviar email` e `Ir para login` devem manter comportamento claro e clicável.

## COPILOT — nível high

### Médias

6. **Tela aberta pelo link do email com UI melhor**
   - A tela acessada pelo link do email está feia.
   - Recriar com a mesma linha visual da caixa de login.
   - Manter padrão de UI/UX do login para consistência.

7. **Boas-vindas simples para módulo de vendas**
   - Criar um onboarding básico de boas-vindas.
   - Explicar de forma simples as 3 funções principais que a pessoa vai usar quando entrar em vendas.

## CODEX — nível xhigh

### Avançadas

8. **Primeiro passo obrigatório no vendas: WebWhats com QR Code**
   - Ao entrar no fluxo inicial, abrir direto o WebWhats.
   - Exibir QR Code imediatamente.
   - Enquanto não houver vínculo concluído, não permitir sair dessa etapa.

9. **Permissão de QR Code para todos os usuários criados por email**
   - Hoje o usuário criado por email fica como `user` e não acessa o QR Code.
   - Alterar a regra para que todos os usuários consigam configurar seu próprio QR Code.
   - Revisar permissão, role e fluxo inicial para não bloquear esse acesso.

---

## Resumo executivo

O foco desta leva é deixar o cadastro mais simples, reduzir atrito na confirmação por email, melhorar a navegação entre login e cadastro, padronizar a interface visual pós-email e tornar o onboarding de vendas realmente utilizável, com QR Code como etapa obrigatória e acessível para qualquer usuário criado por email.
