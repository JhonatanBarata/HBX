# 02 de abril — regras duras de signup, webscraping e planos

## Objetivo
Endurecer o HBX para empresas novas, proteger custo operacional, melhorar qualidade do onboarding e deixar o produto mais vendável e controlado.

---

## 1. Webscraping como ativo compartilhável

### Decisão
O webscraping deve deixar de ser apenas uma busca descartável.
Ele deve virar um **ativo salvo no sistema**.

### Motivo
- economizar custo de API
- evitar repetir pesquisa igual entre empresas
- transformar scraping em base reaproveitável
- acelerar CRM/Vendas

### Direção correta
Criar dois níveis de armazenamento:

#### Nível 1 — histórico privado da empresa
Cada empresa continua vendo suas buscas, seus resultados e seus leads transferidos.

#### Nível 2 — cache global inteligente do HBX
Se outra empresa fizer a mesma busca com assinatura parecida, o sistema pode reaproveitar resultado recente em vez de consumir API de novo.

### Regra recomendada
Permitir reaproveitamento intercompany apenas em modo **cache técnico**, não como “compartilhamento de dados comerciais da empresa”.

Ou seja:
- o HBX reaproveita o resultado bruto da busca
- mas não expõe comentários, status, agenda, notas ou ações internas de outra empresa

### O que pode ser compartilhado globalmente
- cidade
- segmento
- nome do local
- telefone
- site
- endereço
- google maps url
- metadados públicos retornados da busca

### O que nunca deve ser compartilhado intercompany
- observações internas
- status comercial
- responsável
- agenda
- comentários
- histórico de contato
- decisões comerciais

### Conclusão
**Sim, é possível e eu aconselho.**
Mas como cache público de dados encontrados, não como CRM compartilhado.

### Regra prática de cache
- se a busca for igual ou muito parecida
- e tiver sido feita há pouco tempo
- reaproveitar primeiro
- opcionalmente oferecer botão “forçar nova busca”

---

## 2. Signup deve ser reconstruído

### Decisão
Signup sem confirmação de e-mail não deve liberar nada.

### Regra dura
- usuário se cadastra
- recebe e-mail
- enquanto não confirmar, não entra
- sem confirmação = sem login, sem trial, sem módulo

### Estado ideal
Criar estados claros:
- pending_email_confirmation
- active_trial
- active_paid
- suspended

---

## 3. No signup free, mostrar planos e escolher módulo inicial

### Decisão
No cadastro free, mostrar claramente os planos disponíveis.

### No free trial
Perguntar qual módulo deseja testar:
- **Vendas**
- **Recovery**

### Regra
Não liberar os dois por padrão no free trial, a menos que você queira isso explicitamente.

### Motivo
- reduz dispersão
- melhora foco do onboarding
- facilita medir interesse real
- reduz custo operacional
- deixa a proposta comercial mais objetiva

---

## 4. Módulo Vendas

### Deve incluir
- CRM agenda viva
- cards arrastáveis
- agenda do dia
- comentários
- histórico de contato
- próxima ação
- atraso
- leads do webscraping
- importação manual de leads
- botão WhatsApp
- botão ligar
- timeline

### Webscraping no Vendas
Sim, faz total sentido.
O webscraping alimenta Vendas.

---

## 5. Módulo Recovery

### Deve incluir
- cadastro de inadimplentes
- histórico de cobrança
- timeline
- negociação
- acordos
- geração de link de pagamento
- agenda de follow-up financeiro
- bot de cobrança
- fila humana
- status claros de cobrança

### Webscraping no Recovery
**Não faz sentido como parte central.**
Recovery não precisa de webscraping para funcionar bem.

### Regra
No free trial de Recovery:
- não mostrar webscraping como peça principal
- focar só no que ajuda a cobrar e recuperar

---

## 6. Free trial com limite de funcionários

### Decisão
Free trial aceita no máximo **2 funcionários por empresa**.

### Faz sentido?
**Sim. Muito.**

### Motivo
- controla custo
- reduz abuso
- evita que empresa use trial como operação completa
- cria motivo claro para upgrade

### Regra
- owner/admin conta como 1
- permitir mais 1 usuário adicional
- acima disso, exigir plano pago

---

## 7. Perguntar CPF ou CNPJ no cadastro

### Decisão
Sim, faz sentido perguntar.

### Fluxo ideal
#### Se for CPF
- não insistir em nome da empresa
- pedir nome da pessoa/profissional
- permitir trabalhar como autônomo
- usar isso como nome principal da conta

#### Se for CNPJ
- pedir razão social ou nome fantasia
- tratar como empresa

### Regra de modelagem
O HBX precisa aceitar dois perfis:
- pessoa física
- pessoa jurídica

### Sugestão prática
No backend, isso pode refletir em campos como:
- entityType = CPF | CNPJ
- displayName
- companyName opcional quando CPF

### Conclusão
**Sim, isso faz sentido e melhora muito o onboarding.**

---

## 8. Bloquear e-mails públicos em cadastro CNPJ

### Decisão
Para CNPJ, bloquear Gmail/Hotmail/Yahoo faz sentido **como endurecimento**, mas com uma ressalva.

### Vantagem
- melhora qualidade da base
- reduz cadastro de curiosos
- força empresa real a entrar com domínio próprio
- ajuda sua venda B2B

### Risco
- pequenas empresas reais no Brasil ainda usam Gmail
- você pode perder lead bom que ainda não tem domínio profissional

### Regra mais inteligente
#### Opção rígida total
- CNPJ não aceita e-mails públicos

#### Opção recomendada
- CNPJ com e-mail público entra, mas recebe status de validação mais fraco
- ou mostrar aviso: “Preferencialmente use um e-mail corporativo para melhor validação e suporte”
- ou restringir certos recursos até validação manual

### Minha recomendação brutal
**Não bloquear 100% no começo.**
Endureça, mas não se autossabote.

Melhor regra:
- CPF: aceita e-mail público normalmente
- CNPJ: aceita, mas destaca que e-mail corporativo é preferencial
- se quiser endurecer mais, marque CNPJ com e-mail público como lead de menor confiança

---

## 9. Regras finais endurecidas que eu aprovo

### Signup
- sem confirmação de e-mail = sem acesso
- CPF e CNPJ separados logo no começo
- CPF não exige nome de empresa
- CNPJ pede nome da empresa

### Trial
- 30 dias
- escolher módulo inicial: Vendas ou Recovery
- máximo 2 funcionários por empresa no free

### Vendas
- recebe webscraping
- CRM agenda viva
- cards, timeline, follow-up

### Recovery
- sem webscraping como foco
- cobrança, negociação, agenda financeira

### Webscraping
- 1 vez por dia no free
- ilimitado no pago
- histórico salvo
- cache inteligente reaproveitável entre empresas para economizar custo
- sem compartilhar dados internos comerciais entre empresas

---

## 10. Decisão final
Essas regras endurecem o HBX do jeito certo:
- protege custo
- melhora qualidade de onboarding
- reduz curiosos ruins
- mantém flexibilidade para quem realmente pode virar cliente

---

## Prompt-base para Codex / Copilot
Endurecer o HBX nas regras de signup, trial, planos e webscraping. Reconstruir o signup para exigir confirmação de e-mail antes de liberar acesso. No cadastro, perguntar se a conta é CPF ou CNPJ; se CPF, não exigir nome da empresa; se CNPJ, pedir nome da empresa e tratar o cadastro como pessoa jurídica. No free trial, liberar apenas um módulo inicial escolhido pelo usuário entre Vendas e Recovery, com limite de no máximo 2 funcionários por empresa. O módulo Vendas deve incluir CRM agenda viva, cards arrastáveis, agenda, timeline, webscraping e follow-up. O módulo Recovery deve focar cobrança, negociação, timeline, bot, acordos e agenda financeira, sem depender de webscraping. O webscraping deve salvar histórico e também usar um cache inteligente reaproveitável entre empresas para reduzir custo de API, mas nunca compartilhar comentários, status ou dados internos comerciais entre empresas.
