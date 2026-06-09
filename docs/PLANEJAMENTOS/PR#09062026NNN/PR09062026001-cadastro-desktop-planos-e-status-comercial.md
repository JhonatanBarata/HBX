# PR#09062026001 — Cadastro desktop, planos e status comercial no Master

## Objetivo

Corrigir a entrada de cliente novo no HBX para que:

1. O cadastro desktop mostre a escolha de plano antes do formulário.
2. O cliente escolha entre HBX List e HBX Lead Plus no cadastro público.
3. HBX Full seja tratado como implantação assistida/sob consulta, não como assinatura simples de R$ 149,90/mês no cadastro público.
4. O Master pare de misturar `premiumAccess` com status financeiro/comercial.
5. Uma empresa em trial seja exibida como trial, e não como “Premium manual”.

Este PR deve ser pequeno e focado. Não alterar vendedor, WhatsApp, produtos, permissões profundas ou cobrança real fora do necessário para corrigir rótulo/fluxo/status.

## Contexto observado

No teste local em `http://localhost:3001/master`, uma empresa recém-cadastrada apareceu assim:

- Acesso: Trial
- Cobrança: Trial
- Plano: HBX Lead Plus
- Próxima ação: Aguardar trial
- Perfil comercial: provider de cobrança `Manual`
- Status assinatura `Trial`
- Checkbox/rótulo: `Premium manual`

O cadastro desktop também abriu direto no formulário, sem exibir os planos antes.

Isso confunde a leitura comercial. O cliente pode estar em:

- Trial do HBX Lead Plus;
- Plano HBX List;
- Plano HBX Lead Plus pago/trial;
- HBX Full com implantação assistida/sob consulta;
- Acesso manual liberado pelo Master.

Esses estados não podem aparecer todos como “Premium manual”.

## Erros

### Erro 1 — Cadastro desktop pula seleção de planos

A página de cadastro já possui os planos, mas no desktop o fluxo começa no formulário. A seleção aparece apenas em etapa específica e, no clique atual, a tela pode tentar submeter o cadastro imediatamente em vez de apenas selecionar o plano.

Fluxo atual indesejado:

```txt
/register desktop → formulário direto → selectedPlanKey padrão → cliente não escolhe plano
```

Fluxo esperado:

```txt
/register desktop → escolha de plano → formulário → cadastro com selectedPlanKey escolhido
```

### Erro 2 — “Premium manual” aparece para empresa em trial

`premiumAccess` é uma flag técnica de acesso operacional. Ela pode ser verdadeira durante trial, mas isso não significa pagamento manual nem plano manual.

A tela deve separar:

```txt
Trial ativo            → empresa em trial
Acesso manual liberado → Master liberou acesso manualmente
Premium access técnico → flag interna, não rótulo comercial principal
```

### Erro 3 — HBX Full aparece como mensal simples

HBX Full é implantação assistida/sob consulta. No cadastro público e nos cards comerciais, não deve ser vendido como simples “R$ 149,90/mês” se a regra comercial atual é implantação.

O valor interno pode continuar existindo para cálculo técnico, mas a apresentação comercial deve ser:

```txt
HBX Full — Implantação assistida
Sob consulta / montar com HBX
```

## Regras de negócio novas

### Cadastro público

1. Desktop sem query string deve abrir em seleção de planos.
2. Mobile pode manter fluxo otimizado, mas sem quebrar seleção.
3. `/register?start=form` deve abrir formulário.
4. `/register?start=plans` deve abrir seleção de planos.
5. Cadastro público deve exibir no máximo:
   - HBX List;
   - HBX Lead Plus;
   - card informativo de HBX Full como implantação/sob consulta, se fizer sentido visual.
6. Clique em HBX List ou HBX Lead Plus apenas seleciona o plano e abre o formulário.
7. O submit final deve enviar `selectedPlanKey` escolhido.
8. HBX Full não deve criar signup direto como assinatura mensal simples. Deve encaminhar para contato/WhatsApp/fluxo comercial.

### Master

1. Empresa com `paymentStatus=TRIAL` ou `subscriptionStatus=trialing` deve aparecer como Trial.
2. Empresa com `selectedPlanKey=hbx_lite` deve aparecer como HBX List.
3. Empresa com `selectedPlanKey=hbx_padrao` deve aparecer como HBX Lead Plus.
4. Empresa com `selectedPlanKey=hbx_melhor` deve aparecer como HBX Full — Implantação assistida.
5. “Premium manual” só pode aparecer quando:
   - `paymentStatus=MANUAL`; ou
   - `subscriptionStatus=manual`.
6. `premiumAccess=true` sozinho não deve gerar rótulo “Premium manual”.
7. Se a empresa está em trial, o checkbox/rótulo do perfil não deve dizer “Premium manual”.
8. Trocar rótulo visual de “Premium manual” por “Acesso manual liberado” quando realmente for manual.
9. Quando `premiumAccess=true` em trial, exibir como “Acesso operacional ativo” ou não exibir no resumo comercial.

## Arquivos prováveis

### Frontend

- `frontend/src/app/register/page.tsx`
- `frontend/src/app/master/_command-center/MasterCommandCenter.utils.ts`
- `frontend/src/app/master/_command-center/MasterCommandCenter.tsx`
- `frontend/src/app/master/_command-center/MasterCommandCenter.hooks.ts`
- `frontend/src/lib/commercial-plans.ts`
- `frontend/src/components/PlanSelectionExperience.tsx`, se a apresentação pública dos planos for reutilizada ali.

### Backend

- `backend/src/commercial-plans/commercial-plan-catalog.ts`
- `backend/src/modules/modules.service.ts`

## Implementação solicitada ao Codex

### 1. Corrigir fluxo inicial do cadastro desktop

Ajustar `RegisterPage` para:

- abrir em `plans` no desktop por padrão;
- abrir em `form` somente se `start=form` ou se o fluxo precisar preservar estado anterior;
- respeitar `start=plans`;
- não forçar `setRegisterStep("form")` no final do `useEffect` quando a intenção é mostrar planos.

### 2. Corrigir ação de clique no plano

No painel de planos:

- clique em HBX List ou HBX Lead Plus deve apenas:
  - gravar `selectedPlanKey`;
  - voltar/avançar para `form`;
  - não chamar cadastro ainda.

O cadastro deve ocorrer somente no submit do formulário.

### 3. Corrigir HBX Full no cadastro público

HBX Full deve aparecer, se aparecer, como card de implantação:

- título: `HBX Full — Implantação assistida`;
- preço: `Sob consulta` ou `Implantação com HBX`;
- ação: `Falar com HBX` / WhatsApp;
- não submeter signup direto;
- não exibir `R$ 149,90/mês` no cadastro público.

Se o time decidir esconder HBX Full no cadastro, manter apenas um card informativo “Plano empresarial / implantação assistida”.

### 4. Corrigir catálogo comercial público

No catálogo de planos, preservar preço interno se necessário para cálculo, mas expor flags suficientes para frontend distinguir:

- plano público assinável;
- plano de trial;
- plano de implantação assistida;
- plano sob consulta.

Para `hbx_melhor`, a apresentação pública deve usar implantação/sob consulta.

### 5. Corrigir rótulos no Master

No Master:

- substituir “Premium manual” por “Acesso manual liberado” apenas quando o status é manual;
- quando empresa está em trial, mostrar “Trial ativo”;
- quando `premiumAccess=true` mas status é trial, não chamar de manual;
- deixar o checkbox de `premiumAccess` menos ambíguo, por exemplo:
  - label: `Acesso operacional ativo`;
  - hint: `Flag técnica. Não indica pagamento manual.`

### 6. Corrigir classificação se necessário

No backend, revisar `companyStatusBucket` e qualquer helper equivalente:

- `MANUAL_PREMIUM` deve depender apenas de status manual explícito;
- `TRIAL` e `TRIAL_ENDING` têm prioridade quando `subscriptionStatus=trialing` ou `paymentStatus=TRIAL`;
- `premiumAccess=true` não pode sozinho transformar empresa em manual ou full.

### 7. Garantir consistência da empresa recém-cadastrada

Após signup e confirmação/trial:

- HBX Lead Plus trial deve ficar como:
  - `selectedPlanKey=hbx_padrao`;
  - `paymentStatus=TRIAL`;
  - `subscriptionStatus=trialing`;
  - `premiumAccess=true` permitido, mas exibido como acesso operacional/trial, não manual.

HBX List deve ficar como:

- `selectedPlanKey=hbx_lite`;
- sem trial, se a regra continuar sem trial;
- checkout/pagamento pendente ou conforme regra comercial atual;
- não manual.

HBX Full deve ficar como:

- fluxo de implantação/contato;
- não signup direto mensal simples pelo cadastro público.

## Testes manuais obrigatórios

### Cadastro desktop

1. Abrir `/register` em viewport desktop.
2. Confirmar que a tela inicial mostra planos.
3. Confirmar que aparecem HBX List e HBX Lead Plus.
4. Confirmar que HBX Full não aparece como `R$ 149,90/mês`; deve aparecer como implantação/sob consulta ou ficar fora do signup direto.
5. Clicar HBX List.
6. Confirmar que abre formulário e não cria conta ainda.
7. Criar conta.
8. Confirmar no Master que `selectedPlanKey=hbx_lite`.
9. Repetir para HBX Lead Plus.
10. Confirmar no Master que `selectedPlanKey=hbx_padrao`.

### Master

1. Criar empresa HBX Lead Plus em trial.
2. Abrir `/master`.
3. Confirmar resumo:
   - Acesso: Trial;
   - Cobrança: Trial;
   - Plano: HBX Lead Plus;
   - Próxima ação: Aguardar trial.
4. Confirmar que não aparece “Premium manual” em empresa trial.
5. Confirmar que, se `premiumAccess=true`, o rótulo é técnico ou oculto, nunca financeiro.
6. Simular/liberar status manual pelo Master.
7. Confirmar que aí sim aparece `Acesso manual liberado`.
8. Confirmar que HBX Full aparece como implantação assistida/sob consulta.

### Regressão mobile

1. Abrir `/register` em viewport mobile.
2. Garantir que o fluxo mobile ainda funciona.
3. Garantir que o plano selecionado chega ao backend.
4. Garantir que confirmação de e-mail/trial não quebra.

## Critério de aceite

- Cadastro desktop não pula planos.
- O cliente escolhe List ou Lead Plus antes de preencher cadastro.
- Clique em plano não cria conta diretamente.
- HBX Full não é exibido como mensal simples no cadastro público.
- Empresa em trial não aparece como “Premium manual”.
- `premiumAccess` não é usado como rótulo comercial principal.
- Status manual real aparece como “Acesso manual liberado”.
- Master diferencia claramente trial, list, lead plus, full implantação e acesso manual.

## Fora de escopo

- Criar vendedores.
- Corrigir WhatsApp.
- Refatorar permissões profundas.
- Alterar produtos.
- Implementar checkout real novo.
- Alterar banco manualmente sem necessidade.
