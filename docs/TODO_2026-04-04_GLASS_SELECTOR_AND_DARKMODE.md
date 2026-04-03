# PRIORIDADE — 2026-04-04 — Glass selector + correção real do modo escuro

## 1) Padrão visual de transição viva entre botões irmãos

### Objetivo

Criar uma assinatura visual mais forte para o HBX usando efeito de continuidade entre botões lado a lado.

### Ideia visual

Ao trocar entre botões irmãos, o seletor não deve simplesmente pular.

Ele deve parecer que viaja lateralmente pelo menu, com sensação de continuidade viva.

### Sensação desejada

- vidro
- blur
- transição líquida
- continuidade
- interface viva
- seletor viajando pelo grupo

### Direção correta

Aplicar esse efeito somente em grupos de botões que representam troca entre estados irmãos.

### Exemplos de uso

- tabs do MASTER
- filtros do MASTER
- abas do Atendimento
- abas do Recovery
- alternância entre segmentos
- trocas de modo no WhatsApp
- seleção de trilha no Webscraping
- alternância de ciclo mensal/anual
- seletores lado a lado no sistema

### Regra importante

Não aplicar esse efeito em qualquer botão do sistema.

### Não usar em

- salvar
- excluir
- arquivar
- confirmar
- pagar
- ações isoladas
- botões destrutivos
- formulários pesados

### Motivo

Se espalhar em tudo, o sistema pode ficar:

- poluído
- lento
- mole visualmente
- confuso operacionalmente

### Direção técnica desejada

Criar um componente padrão do design system para isso.

Sugestão de conceito interno:

- HBX Liquid Glass Selector

### Resultado esperado

- identidade visual mais premium
- sensação de continuidade viva
- navegação entre estados mais elegante
- sem exagero visual

---

## 2) Correção real do modo escuro

### Problema

O modo escuro do sistema não está trocando corretamente as cores em várias partes.

Em alguns pontos a leitura fica ruim ou praticamente inviável.

### Impacto

- baixa legibilidade
- contraste ruim
- experiência quebrada
- áreas difíceis de enxergar
- inconsistência visual entre telas

### Revisar amanhã

- componentes que não respeitam corretamente o dark mode
- textos com contraste fraco
- cards e fundos com mistura errada
- bordas invisíveis ou fortes demais
- estados de hover/focus/ativo no dark
- badges, pills e botões no dark
- tabelas, drawers, modais e headers no dark
- telas do MASTER e Financeiro no dark
- central WhatsApp no dark
- Webscraping e listas no dark

### Objetivo

Fazer o modo escuro funcionar como tema real do sistema, e não como adaptação parcial.

### Regra desejada

Todo componente precisa responder corretamente ao tema:

- fundo
- texto
- borda
- hover
- foco
- ativo
- desabilitado
- estados de alerta

### Resultado esperado

- leitura clara no modo escuro
- contraste consistente
- menos áreas invisíveis
- menos remendos de cor
- sistema mais premium e utilizável à noite

---

## Conclusão

A próxima refatoração visual não deve ser só estética.

Ela deve:

- criar assinatura visual forte onde faz sentido
- corrigir o modo escuro de verdade
- melhorar leitura, contraste e continuidade
- sem exagerar nos efeitos
