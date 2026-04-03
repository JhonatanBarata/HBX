# PRIORIDADE — 2026-04-04 — Revisão brutal de produto, visual e operação

## Leitura geral

O HBX já tem poder de produto e operação, mas ainda está com cara de protótipo premium mal contido.

O problema principal não é falta de recurso.

O problema é:

- excesso de blocos
- excesso de texto
- excesso de header
- excesso de explicação
- pouca hierarquia operacional
- regra de produto ainda confusa em vários pontos

Amanhã a revisão deve ser feita com brutalidade.

---

## 1) Matar o excesso de texto

### Problema

As telas ainda explicam demais:

- hero longo
- subtítulo longo
- cards com frase demais
- avisos duplicados
- ajuda repetida

### Direção

- 1 título curto
- 1 linha útil
- ações primeiro
- explicação só sob clique

### Objetivo

Parar de inflar a interface e tirar a cara de SaaS antigo.

---

## 2) Encolher headers de uma vez

### Problema

O header global cresce demais, repete contexto, rouba altura da tela e piora muito no celular.

### Direção

Transformar em barra compacta com:

- usuário logado
- empresa ativa
- status operacional
- ações rápidas pequenas

### Regra

Não usar hero gigante em toda tela.

---

## 3) Remover o falso dashboard inicial

### Problema

A tela inicial atual não é dashboard real.

### Regra desejada

Ao entrar no sistema:

- abrir direto no primeiro módulo válido da empresa
- se não houver módulo disponível, abrir tela curta explicando o motivo

### Motivos possíveis

- financeiro pendente
- trial acabou
- módulo inativo
- motor ausente
- acesso não liberado

---

## 4) Separar módulo de guia estrutural

### Problema

Hoje está misturado:

- financeiro
- cadastro
- gerencial
- módulos comerciais

### Regra desejada

#### Módulos comercializáveis

- Atendimento
- Recovery
- Website
- Webscraping
- outros módulos reais

#### Guias estruturais

- cadastro
- financeiro
- gerencial
- integrações
- auditoria

### Objetivo

Limpar:

- menu
- precificação
- onboarding
- leitura do produto

---

## 5) Travar módulo sem motor

### Regra desejada

Sem motor, fecha a porta.

### Exemplos

- sem WhatsApp/Meta -> bloquear Atendimento e Recovery
- sem token de pagamento -> bloquear funções dependentes do financeiro
- sem runtime -> bloquear Webscraping

### Objetivo

Não deixar área quebrada parecer viva.

---

## 6) Refazer o MASTER como painel de ação

### Problema

O MASTER já tem muita coisa boa, mas está tudo no mesmo caldeirão.

### Estrutura desejada

#### Nível 1 — visão curta

- alertas
- empresas críticas
- status de motores
- busca

#### Nível 2 — detalhe da empresa

- acesso
- cobrança
- módulos
- website
- usuários
- integrações
- auditoria

#### Nível 3 — ação perigosa

- modal seco
- impacto claro
- auditoria clara

---

## 7) Mobile precisa virar outro comportamento

### Problema

No celular, o sistema está parecendo desktop comprimido.

### Direção

- 1 card por tela nas áreas críticas
- tabs menores
- drawer em tela cheia
- tabela em lista
- ações perigosas agrupadas
- menos colunas e mais blocos

### Áreas mais críticas

- MASTER
- Financeiro
- Central WhatsApp
- Webscraping herdado para Vendas

---

## 8) Barra superior de motores

### Regra desejada

Criar topo fixo com status de motores:

- Token ativo
- Meta ativo
- WebWhats ativo
- Pagamento ativo
- Trial / acesso

### Comportamento visual

- verde pulsando quando ok
- amarelo atenção
- vermelho bloqueado

### Comportamento funcional

Ao clicar:

- abrir o detalhe correto
- levar para a correção real
- não só mostrar aviso inútil

---

## 9) Financeiro precisa ficar frio e útil

### Problema

Ainda tem traço de landing page interna.

### Direção

Mostrar de forma seca:

- valor atual
- status
- vencimento / trial
- ação pagar
- histórico resumido

### Correção obrigatória

- mostrar `0 dias` apenas quando for bloqueio real
- se valor vier nulo, não mentir como se fosse zero

---

## 10) WhatsApp precisa ter trilho único

### Problema

Hoje está híbrido demais:

- parte oficial
- parte temporária
- parte externa
- parte explicativa

### Direção

- status no topo
- detalhe sob clique
- escolher modo
- resolver o modo
- fim

### Regra

Sem parede de texto na tela principal.

---

## 11) Webscraping está forte, mas mal amarrado visualmente

### O que já está bom

- busca
- histórico
- cache
- herança para CRM

### O que precisa melhorar

- deixar claro o limite por status
- deixar claro a empresa atual no roteiro
- melhorar herança para Vendas no mobile
- casar WhatsApp com trilho interno

---

## 12) Auditoria tem que nascer junto das exceções

### Regra

Se o MASTER pode:

- marcar pago
- liberar premium manual
- suspender
- reativar
- estender trial
- arquivar

então tudo isso precisa deixar rastro.

### Não deixar para depois

Auditoria não pode entrar só no fim.

Ela tem que nascer junto com a evolução administrativa.

---

## Ordem de ataque sugerida para amanhã

### Bloco 1 — produto e regra

1. separar módulo vs guia estrutural
2. definir trial vs free trial
3. definir premium manual sem financeiro
4. corrigir entrada inicial do sistema
5. corrigir regra de bloqueio por motor

### Bloco 2 — visual estrutural

6. reduzir header global
7. matar hero excessivo
8. reduzir textos de tela
9. compactar cards
10. limpar menu e navegação

### Bloco 3 — operação real

11. corrigir cadastro, confirmação e recuperação de senha
12. corrigir QR / central WhatsApp
13. corrigir dias de trial e estados reais
14. garantir abertura automática do primeiro módulo
15. corrigir webscraping por empresa/contexto

### Bloco 4 — MASTER

16. reorganizar drawer
17. separar acesso / trial / cobrança
18. melhorar mobile
19. adicionar auditoria nas ações administrativas
20. preparar exclusão/inativação clara

---

## Melhorias visuais que dão salto rápido

- reduzir fortemente a altura dos headers
- remover a maior parte dos textos explicativos fixos
- trocar cards grandes por cards compactos de ação
- usar chips/status pequenos no lugar de blocos textuais
- deixar uma ação principal por área
- esconder detalhe em drawer/modal
- transformar tabela do MASTER em lista mobile-first
- padronizar topo com usuário + empresa + motores

---

## Conclusão

O HBX não precisa de mais camada bonita agora.

Ele precisa de:

- menos gordura
- menos explicação
- mais status
- mais hierarquia
- mais verdade operacional

Amanhã o foco deve ser podar e organizar com brutalidade, e não inventar mais camada.
