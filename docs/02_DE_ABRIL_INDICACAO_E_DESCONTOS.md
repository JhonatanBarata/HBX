# 02 de abril — indicação e descontos configuráveis

## Decisão
Adicionar no login/signup do HBX um campo de origem/indicação.

Pergunta sugerida:
**De onde você ouviu falar da HBX?**

### Regra
- campo **não obrigatório**
- deve ser leve e elegante
- pode aceitar texto livre ou opções rápidas

---

## Objetivo
Usar indicação como motor de prospecção e crescimento.

### Motivos
- ajuda a entender canais de entrada
- melhora leitura comercial
- fortalece marketing boca a boca
- permite premiar clientes que indicam
- cria mais um argumento de venda

---

## Campo de origem no cadastro/login
### Sugestões de opções
- indicação de cliente
- Instagram
- Google
- WhatsApp
- YouTube
- anúncio
- outro

### Extra opcional
Se escolher indicação, permitir informar:
- nome da pessoa/empresa que indicou
- ou código de indicação

---

## Programa de indicação
### Decisão
Oferecer descontos por indicação para clientes.

### Regra
O cliente que indicar pode receber desconto de até **X%**, conforme regra definida no MASTER.

### Exemplos
- 5% por indicação convertida
- 10% por campanha especial
- limite máximo configurável
- desconto único ou recorrente, conforme regra do MASTER

---

## Controle pelo MASTER
### O MASTER deve poder configurar
- porcentagem máxima de desconto por indicação
- se o desconto é único ou recorrente
- prazo de validade do desconto
- se a campanha está ativa ou não
- desconto padrão de indicação
- desconto manual por cliente indicado ou indicador

### O MASTER também deve poder ver
- quem indicou quem
- quais indicações viraram cadastro
- quais viraram cliente pagante
- descontos concedidos
- impacto financeiro do programa

---

## Regras inteligentes
### Regra 1
Só conceder desconto real quando a indicação virar cliente válido.

### Regra 2
Separar:
- origem declarada no cadastro
- indicação confirmada pelo MASTER

### Regra 3
Não deixar desconto por indicação ficar hardcoded.
Tudo precisa ser configurável no MASTER.

---

## Vínculo com o Financeiro
O programa de indicação deve conversar com o módulo Financeiro.

### Exemplos
- aplicar desconto automático em próxima cobrança
- registrar crédito promocional
- mostrar no histórico financeiro
- deixar claro quando desconto veio de indicação

---

## Vínculo com onboarding
No onboarding/cadastro:
- perguntar de onde conheceu a HBX
- se veio por indicação, registrar isso desde o começo

Isso ajuda a leitura comercial sem atrapalhar a conversão.

---

## Regra de UX
- não tornar obrigatório
- não travar cadastro
- não deixar pesado
- manter simples e útil

---

## Decisão final
Sim, isso ajuda muito na prospecção.

Porque transforma cliente satisfeito em canal de aquisição e ainda te dá leitura melhor de marketing e vendas.

---

## Prompt-base para Codex / Copilot
Adicionar no signup/login do HBX um campo leve e não obrigatório de origem/indicação com a pergunta “De onde você ouviu falar da HBX?”. Permitir opções rápidas e, quando for indicação, possibilitar registrar nome da pessoa/empresa indicadora ou um código. Criar uma lógica de descontos por indicação integrada ao Financeiro, em que o MASTER possa configurar a porcentagem máxima, se o desconto é único ou recorrente, o prazo de validade e o status da campanha. Também permitir ao MASTER visualizar quem indicou quem, quais indicações viraram clientes e quais descontos foram concedidos.
