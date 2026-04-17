# RULE LOGIN

## Regra 1 — O login deve seguir a preferencia de tema salva

O login do HBX nao deve decidir entre claro e escuro por horario do dia.

### Regra obrigatoria

A tela de login deve usar o tema salvo do usuario ou do navegador conforme a selecao persistida pelo sistema.

### Fallback oficial

Se nao existir preferencia salva, o login deve abrir em **light** como padrao inicial oficial.

### Proibido

- trocar claro/escuro automaticamente por hora;
- inventar regra local so para a tela de login;
- usar comportamento diferente do restante do sistema sem justificativa real.

### Objetivo

Manter previsibilidade, consistencia visual e evitar comportamento que pareca aleatorio para o usuario.
