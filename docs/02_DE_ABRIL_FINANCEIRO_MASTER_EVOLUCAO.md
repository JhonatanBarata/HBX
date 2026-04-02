# 02 de abril — Financeiro + evolução do MASTER

## Decisão principal
Criar e fortalecer um módulo obrigatório chamado **Financeiro**.

Esse módulo precisa cuidar de:
- plano atual
- assinatura
- trial
- cartão
- PIX
- descontos
- histórico financeiro
- trocas de forma de pagamento
- falhas de pagamento
- estornos

---

## Regra de UX
### Cliente
O Financeiro deve existir, mas sem ficar esfregando trial ou cobrança na cara do cliente.

### Regra
- nada de banner irritante
- nada de pop-up insistente
- nada de propaganda agressiva de upgrade

### Mostrar de forma discreta
- plano atual
- status da conta
- dias restantes do trial ou ciclo

Exemplos elegantes:
- Plano Free Trial · 18 dias restantes
- Plano ativo · renovação em 12 dias
- Pagamento pendente

### Conclusão
O HBX deve informar com classe, não humilhar o cliente.

---

## Estrutura ideal do módulo Financeiro

### Resumo
- plano atual
- módulos ativos
- status da assinatura
- trial ou renovação

### Pagamento
- cartão cadastrado
- trocar cartão
- remover cartão
- mudar para PIX
- escolher mensal / anual

### PIX
- QR Code
- copia e cola
- status aguardando / pago
- liberação automática quando aprovado

### Descontos
- desconto global
- desconto manual por cliente
- promoções
- meses grátis / crédito promocional

### Histórico
- pagamentos
- falhas
- reembolsos
- trocas de método

---

## Webhook e billing
### Decisão
Aproveitar o que já existe no repo do Abner guincho.

### Motivo
Se lá já existe:
- webhook funcional
- pagamentos
- estornos
- fluxo mais maduro

Então o certo é:
- puxar a lógica
- adaptar ao HBX
- não reinventar billing do zero

---

## Regra de desconto global
### Decisão
Existe uma regra global de desconto para plano anual.

### Regra atual desejada
Ter como padrão algo como 10%, mas isso **não deve ficar fixo no código**.

### O MASTER deve poder escolher a porcentagem
O Financeiro do MASTER deve permitir:
- definir desconto global anual
- alterar a porcentagem
- ativar ou desativar essa regra

### Exemplos
- anual com 10% off
- anual com 15% off em campanha
- anual sem desconto temporariamente

### Conclusão
A regra global não pode ser engessada.
Precisa ser configurável no MASTER.

---

## Descontos por cliente
Além da regra global, o MASTER precisa poder fazer exceções por cliente.

### Exemplos
- dar desconto especial de retenção
- liberar meses grátis
- oferecer proposta personalizada
- negociação comercial manual

### Onde controlar
No financeiro do cliente e também no financeiro MASTER.

---

## Trial e cobrança
### Regra
O cliente precisa poder ver sua situação financeira, mas sem o sistema ficar lembrando isso de forma irritante.

### Mostrar no Financeiro
- dias restantes do trial
- data do fim do trial
- data da próxima cobrança
- plano atual
- valor atual

### Mostrar fora do Financeiro
Apenas um status discreto.

---

## Autoatendimento do cliente
### O cliente deve conseguir
- cadastrar cartão
- remover cartão
- trocar cartão
- mudar para PIX
- ver QR ou copia e cola
- pagar sem depender de você
- ter módulos liberados automaticamente quando o pagamento for aprovado

---

## Evolução necessária do Financeiro MASTER
### Diagnóstico
O financeiro do MASTER precisa de uma grande evolução.

### O MASTER precisa enxergar
- quem está em trial
- quantos dias faltam
- quem pagou
- quem falhou
- quem recebeu desconto
- quem tem desconto global
- quem tem desconto manual
- quem recebeu meses grátis
- quem teve estorno
- quem está com pagamento pendente
- quem está próximo de vencer

### O MASTER também precisa poder agir
- alterar desconto global
- alterar desconto por cliente
- conceder meses grátis
- encerrar ou estender trial
- mudar status manualmente se necessário
- consultar histórico financeiro por empresa

---

## Regra final de produto
### Cliente
Fluxo financeiro elegante, discreto e self-service.

### MASTER
Fluxo financeiro completo, analítico e cirúrgico.

---

## Decisão final
O HBX precisa tratar o Financeiro como parte central do produto.

Não apenas como cobrança.
Mas como:
- ativação
- retenção
- desconto
- conversão de trial
- controle real da base

---

## Prompt-base para Codex / Copilot
Criar e evoluir fortemente o módulo obrigatório **Financeiro** no HBX. O objetivo é permitir que o cliente gerencie plano, assinatura, trial, cartão, PIX, histórico financeiro e mudanças de forma de pagamento sem depender do suporte, mas de forma discreta e elegante, sem banners agressivos ou pressão excessiva de trial/upgrade. No MASTER, evoluir o financeiro para mostrar claramente trials, dias restantes, pagamentos, falhas, descontos, meses grátis, estornos e pendências por empresa. Criar uma regra global de desconto anual configurável no MASTER, com possibilidade de alterar a porcentagem, ativar ou desativar a regra, além de descontos manuais por cliente. Aproveitar a lógica já existente no repo do Abner guincho para webhook, pagamentos e estornos, adaptando ao HBX em vez de reconstruir tudo do zero.
