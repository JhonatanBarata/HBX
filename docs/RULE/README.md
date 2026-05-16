# HBX — RULE

Este documento define a regra-mãe do produto HBX. Ele deve ser usado como referência antes de qualquer decisão de design, motor, mobile, desktop, onboarding, checkout, CRM, automação ou priorização de feature.

## Pensamento-mãe

**HBX é uma máquina simples de prospecção para pequenos negócios: o usuário encontra empresas no Radar, transforma em cards de venda, chama no WhatsApp e controla retornos sem se perder.**

Tudo que não ajuda diretamente esse fluxo deve ser tratado como secundário, avançado ou futuro.

## Fluxo principal

**Radar → Vendas → WhatsApp → Retorno**

Essa é a espinha dorsal do produto.

Toda tela, botão, card, módulo, automação ou motor deve responder a uma pergunta:

**Isso ajuda o usuário a achar, chamar, acompanhar e não repetir erro?**

Se sim, fortalece o HBX.
Se não, deve ser simplificado, escondido, adiado ou movido para contexto avançado.

## Regras fixas do produto

### 1. HBX vende prospecção simples, não sistema gigante

O cliente não deve sentir que está comprando um CRM complexo, uma central operacional pesada ou um sistema cheio de módulos.

A promessa comercial precisa ser simples:

**Procure cards, fale no WhatsApp, marque retorno e venda.**

### 2. Mobile é o produto de venda

O mobile deve ser o caminho mais simples para o cliente comum entender e usar o HBX.

No celular, o usuário precisa conseguir:

- buscar cards no Radar;
- abrir cards em Vendas;
- chamar no WhatsApp;
- marcar retorno;
- descartar ou negativar leads ruins;
- entender o próximo passo sem treinamento longo.

Mobile deve ter pouca opção, ação clara e fluxo guiado.

### 3. Desktop é cockpit avançado

Desktop não é o self-checkout principal e não deve tentar ser a primeira experiência obrigatória do cliente leigo.

Desktop serve para:

- visão ampla;
- gestão pesada;
- configuração;
- master/admin;
- saúde do sistema;
- automações;
- auditoria;
- relatórios mais completos;
- operação avançada.

Se algo é complexo demais para mobile, provavelmente pertence primeiro ao desktop/cockpit.

### 4. Motor é invisível

O cliente não compra "motor".

O cliente compra resultado:

- cards bons;
- menos duplicidade;
- menos bagunça;
- motivo do lead;
- próxima ação clara;
- contatos que não se repetem quando já deram negativo.

A complexidade do motor deve ficar escondida. O usuário final deve ver apenas o benefício.

### 5. Criatividade deve servir clareza

Design bonito é bem-vindo, mas não pode atrapalhar entendimento.

Criatividade boa:

- reduz confusão;
- destaca a próxima ação;
- faz o produto parecer premium;
- aumenta confiança;
- deixa o usuário agir mais rápido.

Criatividade ruim:

- cria distração;
- esconde botão importante;
- transforma tarefa simples em espetáculo;
- faz o produto parecer maior e mais difícil do que é.

### 6. Negativos são parte vital do banco

Recusas, bloqueios, opt-outs, números ruins, duplicados, leads descartados e motivos de descarte não são lixo.

Eles são memória operacional.

O Radar Digital deve ser o banco único de leads e oportunidades, incluindo os negativos, para evitar repetição, duplicidade e bagunça em Vendas/Prospecção.

## Perguntas obrigatórias antes de aprovar qualquer mudança

Antes de aprovar uma tela, feature, card, automação ou motor, responder:

1. Isso fortalece o fluxo Radar → Vendas → WhatsApp → Retorno?
2. Isso ajuda o cliente a vender mais rápido?
3. Isso reduz confusão para um usuário leigo?
4. Isso deveria aparecer no mobile ou ficar no desktop/cockpit?
5. O motor está entregando benefício visível ou só complexidade visível?
6. Estamos guardando negativos e evitando repetir erro?

## Frase de decisão

**HBX não é um CRM. HBX é uma esteira de prospecção: achar, chamar, acompanhar e não repetir erro.**

Quando houver dúvida entre duas direções, escolher a que deixa essa frase mais verdadeira.
