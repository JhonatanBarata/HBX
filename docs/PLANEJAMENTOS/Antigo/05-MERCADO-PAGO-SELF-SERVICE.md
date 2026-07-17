# 05 — CONECTAR MERCADO PAGO PELA TELA

## Objetivo

Permitir que master e lojista conectem e validem a conta Mercado Pago sem comando, SQL ou IA.

## Microetapas

- [ ] 1. Auditar o modelo atual de token, origem e permissões.
- [ ] 2. Definir fluxo de conexão: OAuth quando disponível; token colado apenas como transição controlada.
- [ ] 3. Criar endpoint de validação que confirma dono da credencial e nunca retorna o token.
- [ ] 4. Armazenar segredo cifrado e registrar rotação/revogação.
- [ ] 5. Criar UI do lojista com estados desconectado, validando, conectado, inválido e revogado.
- [ ] 6. Criar UI do Master para suporte e diagnóstico, sem revelar o segredo.
- [ ] 7. Testar conta de sandbox ponta a ponta pela tela.
- [ ] 8. Testar revogação e confirmar que o sistema deixa de gerar novos links sem quebrar histórico.

## Segurança

- Token nunca em log, payload de leitura, HTML ou auditoria.
- Autorização financeira explícita; vendedor comum não conecta conta.
- Conta inválida bloqueia link e oferece caminho humano honesto.

## Pronto quando

Uma empresa de teste conecta, valida, cobra e revoga a conta inteira pela interface.

