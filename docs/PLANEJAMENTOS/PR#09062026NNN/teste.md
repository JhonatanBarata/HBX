# HBX — Diretiva PR#09062026NNN

Arquivo de planejamento para correção do fluxo de acesso, cobrança, trial e vendedores.

Este documento é contrato operacional para IA/Codex/dev. Não é sugestão visual. Não é pedido aberto de refatoração. Não é “melhorar tela”.

---

## 1. Correção do diagnóstico

O problema real reportado:

- empresa em free trial;
- trial permite, no máximo, o dono/admin + 1 vendedor extra ativo;
- existe apenas 1 vendedor cadastrado como vendedor;
- ao tentar cadastrar outro vendedor, o sistema propagou estado/erro errado;
- o vendedor que ainda deveria ter autorização ficou sem acesso ou caiu em fluxo de pagamento;
- a rota exibiu contexto de `/pre-checkout?reason=payment_failed`;
- o erro foi visível no F12/Preview, mas não ficou visível de forma correta para usuário normal;
- o aviso visual gerado ficou fora do ponto de ação e exigiu scroll para ser encontrado.

Diagnóstico correto:

> O HBX está misturando limite de trial, status de pagamento, papel do usuário e redirecionamento de checkout.

Isso não é problema primário de CSS. É problema de contrato de regra de negócio.

---

## 2. Regra-mãe

**Backend é a fonte da verdade para trial, cobrança, papel, permissão, bloqueio e limite.**

O frontend não pode inferir sozinho:

- se a empresa pagou;
- se o trial venceu;
- se o trial atingiu limite;
- se vendedor pode acessar;
- se checkout deve abrir;
- se usuário pode ver billing.

O frontend deve renderizar apenas capacidades e mensagens seguras vindas do backend.

---

## 3. Regra comercial crítica

**VENDEDOR/USER nunca pode ver cobrança, checkout, `payment_failed`, assinatura vencida ou qualquer mensagem que exponha que o dono não pagou.**

Funcionário não precisa saber se o dono da empresa não pagou. Isso queima o HBX perante o cliente.

### Matriz obrigatória

| Papel | Pode ver billing? | Pode abrir checkout? | Pode ver falha de pagamento? |
|---|---:|---:|---:|
| OWNER / dono | Sim | Sim | Sim |
| ADMIN financeiro, se existir | Sim | Sim | Sim |
| ADMIN operacional | Não por padrão | Não por padrão | Não por padrão |
| VENDEDOR / USER | Nunca | Nunca | Nunca |
| MASTER HBX | Só em contexto master | Não como usuário comum da empresa | Não como usuário comum da empresa |

Mensagem segura para vendedor em bloqueio real:

> Acesso temporariamente indisponível. Fale com o administrador da empresa.

Mensagens proibidas para vendedor:

- “pagamento recusado”;
- “assinatura vencida”;
- “atualize pagamento”;
- “checkout”;
- “plano expirado”;
- `payment_failed`;
- qualquer detalhe financeiro do dono.

---

## 4. Limite de trial não é falha de pagamento

Proibido tratar limite de trial como `payment_failed`.

Códigos mínimos esperados:

| Código | Quando usar | Pode abrir checkout? | Quem pode ver |
|---|---|---:|---|
| `TRIAL_SELLER_LIMIT_REACHED` | tentativa de criar vendedor acima do limite do trial | Não automaticamente | OWNER/admin autorizado |
| `SUBSCRIPTION_PAYMENT_FAILED` | cobrança real falhou | Sim | OWNER/financeiro |
| `SUBSCRIPTION_PAST_DUE` | assinatura vencida | Sim | OWNER/financeiro |
| `COMPANY_SUSPENDED` | bloqueio administrativo da empresa | Não automático | OWNER vê ação; vendedor vê neutro |
| `USER_NOT_ALLOWED` | usuário sem permissão para ação | Não | usuário atual |
| `COMPANY_REQUIRED` | ausência de empresa efetiva | Não | usuário atual |
| `PLAN_REQUIRED` | recurso exige plano superior | OWNER vê upgrade; vendedor vê neutro | conforme papel |

Regra absoluta:

> `TRIAL_SELLER_LIMIT_REACHED` nunca pode virar `SUBSCRIPTION_PAYMENT_FAILED`.

---

## 5. O vendedor existente não pode ser punido por tentativa de cadastro

Ao tentar criar vendedor acima do limite do trial:

- não pode alterar status da empresa para pagamento falho;
- não pode alterar assinatura;
- não pode alterar acesso do vendedor já existente;
- não pode invalidar sessão do vendedor existente;
- não pode redirecionar vendedor existente para checkout;
- não pode gravar estado global que transforme limite de trial em bloqueio financeiro.

Comportamento correto:

1. OWNER/admin tenta criar vendedor acima do limite.
2. Backend nega a criação com `TRIAL_SELLER_LIMIT_REACHED`.
3. Frontend mostra erro no formulário/modal de cadastro.
4. Vendedor já cadastrado continua acessando normalmente, se a empresa ainda estiver dentro das regras do trial.
5. Nenhum usuário não financeiro vê tela de pagamento.

---

## 6. `hbx-popup2` não pode ser muleta

O `hbx-popup2` só serve se respeitar contrato de backend.

Ele não pode:

- receber texto solto sem código de erro;
- transformar erro desconhecido em pagamento;
- aparecer fora do ponto de ação;
- exigir scroll;
- mostrar billing para vendedor;
- esconder erro operacional apenas em console/network.

Para erro de criação de vendedor, o correto é:

- erro inline no formulário/modal;
- foco visual no campo/ação relevante;
- toast opcional apenas como reforço;
- nenhum redirect para pre-checkout.

---

## 7. `SKILL.md` não é garantia suficiente

Regras salvas em `SKILL.md` ajudam, mas não bastam.

Regra crítica precisa virar artefato executável ou verificável:

- teste automatizado;
- middleware/guard centralizado;
- enum/tipo compartilhado;
- contrato de API;
- checklist versionado;
- validação no backend;
- fixture de cenário.

Se a regra só existe em texto solto, a IA pode ignorar, reinterpretar ou aplicar pela metade.

---

## 8. Contrato de acesso esperado

Criar, consolidar ou revisar um contrato semelhante a este:

```ts
type AccessContext = {
  userId: string;
  companyId: string | null;
  role: 'OWNER' | 'ADMIN' | 'SELLER' | 'USER' | 'MASTER';

  billing: {
    status: 'OK' | 'PAST_DUE' | 'PAYMENT_FAILED' | 'SUSPENDED' | 'NONE';
    canSeeBilling: boolean;
    canOpenCheckout: boolean;
  };

  trial: {
    isTrial: boolean;
    sellerLimit: number | null;
    activeSellerCount: number;
    canCreateSeller: boolean;
  };

  capabilities: {
    canAccessSales: boolean;
    canCreateSeller: boolean;
    canManageSellers: boolean;
    canSeeBilling: boolean;
    canOpenCheckout: boolean;
  };

  blockingReason: null |
    | 'TRIAL_SELLER_LIMIT_REACHED'
    | 'SUBSCRIPTION_PAYMENT_FAILED'
    | 'SUBSCRIPTION_PAST_DUE'
    | 'COMPANY_SUSPENDED'
    | 'USER_NOT_ALLOWED'
    | 'COMPANY_REQUIRED'
    | 'PLAN_REQUIRED';

  publicMessageKey: string | null;
  ownerActionRequired: boolean;
};
```

O nome final pode mudar. O comportamento não.

---

## 9. UX obrigatória para erro crítico

Erro crítico precisa aparecer no ponto de ação.

Proibido depender de:

- F12;
- console;
- aba Network;
- scroll até o topo;
- banner escondido;
- redirecionamento confuso;
- tela bonita que não explica o problema real.

Para tentativa de criar vendedor acima do limite:

- permanecer na tela onde a ação foi feita;
- mostrar mensagem perto do botão/formulário;
- informar limite de trial de forma simples;
- não abrir checkout automaticamente;
- não afetar vendedor existente.

Mensagem sugerida para OWNER/admin:

> Limite do trial atingido. Seu trial permite 1 vendedor ativo além do dono. Para adicionar mais vendedores, atualize o plano.

Mensagem para vendedor, caso ele tente acessar algo bloqueado por motivo financeiro real:

> Acesso temporariamente indisponível. Fale com o administrador da empresa.

---

## 10. Fases de correção

### PR001 — Separar trial limit de payment_failed

Objetivo:

- corrigir o fluxo em que limite de vendedor no trial vira `payment_failed`;
- criar ou usar código específico `TRIAL_SELLER_LIMIT_REACHED`;
- impedir redirecionamento automático para `/pre-checkout` quando o motivo não for pagamento real;
- garantir que o vendedor existente continue autorizado.

Critérios de aceite:

- tentativa de cadastrar vendedor acima do limite retorna `TRIAL_SELLER_LIMIT_REACHED`;
- nenhum `payment_failed` é gerado nesse caso;
- nenhum vendedor existente perde acesso por causa dessa tentativa;
- erro aparece no formulário/modal;
- nenhum F12 necessário;
- nenhum scroll necessário.

### PR002 — Guardião de billing por papel

Objetivo:

- garantir que só OWNER/financeiro veja cobrança;
- bloquear billing/pre-checkout para vendedor;
- proteger backend e frontend.

Critérios de aceite:

- vendedor acessando `/pre-checkout?reason=payment_failed` não vê checkout;
- vendedor recebe mensagem neutra ou é redirecionado para área segura;
- OWNER continua vendo checkout quando pagamento realmente falhar.

### PR003 — Frontend por capabilities

Objetivo:

- parar de decidir regra comercial no React;
- consumir capacidades vindas do backend;
- exibir estados conforme `capabilities` e `blockingReason`.

Critérios de aceite:

- botão de criar vendedor já sabe se pode criar;
- falha de criação mostra erro local;
- banner global não é a única forma de aviso;
- mensagem crítica não fica escondida no topo.

### PR004 — Matriz de regressão

Criar testes ou checklist manual obrigatório para:

| Cenário | OWNER | VENDEDOR |
|---|---|---|
| Trial com 0 vendedores extras | pode criar 1 vendedor | não vê billing |
| Trial com 1 vendedor extra | bloqueia próximo cadastro | vendedor existente mantém acesso |
| Trial acima do limite por dado legado | OWNER vê correção/upgrade | vendedor não vê cobrança |
| Pagamento real falhou | OWNER vê checkout | vendedor não vê checkout |
| Assinatura ok | acesso normal | acesso normal |
| Empresa suspensa | OWNER vê ação | vendedor vê mensagem neutra |

### PR005 — Limpeza Prisma/regras comerciais

Só depois dos PRs anteriores.

Objetivo:

- separar trial, assinatura, plano e implantação;
- remover boolean solto ambíguo;
- impedir que `premiumManual`, `trial`, `payment_failed`, `HBX_LIST`, `HBX_FULL` e mensalidade sejam misturados sem contrato.

---

## 11. Prompt fechado para Codex

Usar este prompt para o próximo PR:

```text
PR001 — HBX Access/Error Contract

Leia AGENTS.md, SKILL.md, hbx-popup2 e o arquivo docs/PLANEJAMENTOS/PR#09062026NNN/teste.md antes de alterar qualquer arquivo.

Objetivo:
Corrigir o fluxo em que tentativa de cadastrar vendedor acima do limite do free trial gera estado/erro de pagamento e afeta o vendedor existente.

Regras absolutas:
1. Backend é fonte da verdade.
2. Frontend não decide billing/trial/role sozinho.
3. VENDEDOR/USER nunca pode ver cobrança, checkout, payment_failed ou mensagem financeira do dono.
4. Limite de trial não pode usar reason=payment_failed.
5. Tentar criar novo vendedor acima do limite não pode bloquear o vendedor já existente.
6. Erro crítico deve aparecer no ponto de ação, sem F12 e sem scroll.
7. Não fazer redesign amplo.
8. Não criar migration sem justificar.
9. Não mexer em secrets, gateway ou pagamento real.
10. Fazer o menor diff seguro.

Investigar:
- fluxo de criação de vendedores;
- contagem de vendedores ativos;
- diferença entre OWNER/admin e vendedor;
- rota /vendas;
- rota /pre-checkout;
- guards/middlewares de autenticação;
- regras de Company/trial/subscription;
- hbx-popup2;
- componentes de erro/toast/banner.

Implementar:
- código específico para limite de vendedores no trial;
- bloqueio correto no backend;
- erro visível no formulário/modal;
- impedimento de redirect para checkout quando o motivo não for pagamento real;
- proteção para que USER/VENDEDOR nunca veja billing/pre-checkout;
- garantia de que vendedor existente mantém acesso quando a tentativa de criar outro vendedor falha.

Critérios de aceite:
- trial com 1 vendedor extra ativo bloqueia o próximo cadastro com mensagem visível;
- o vendedor extra já existente continua acessando normalmente;
- nenhum F12 necessário;
- nenhum scroll necessário;
- nenhum redirect para pre-checkout nesse caso;
- OWNER vê cobrança apenas quando pagamento realmente falhar;
- VENDEDOR nunca vê cobrança;
- testes ou checklist manual documentado no PR.

Saída obrigatória:
- resumo dos arquivos alterados;
- motivo técnico;
- riscos;
- comandos rodados;
- evidência do cenário corrigido.
```

---

## 12. Comandos de validação esperados

Ajustar aos scripts reais do projeto:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Se algum comando não existir, registrar no PR:

- comando tentado;
- erro recebido;
- comando equivalente usado.

---

## 13. Definição de pronto

Este PR só está pronto quando todas as afirmações abaixo forem verdadeiras:

- [ ] limite de trial não gera `payment_failed`;
- [ ] vendedor existente não perde acesso após tentativa falha de cadastrar outro vendedor;
- [ ] vendedor nunca vê checkout;
- [ ] vendedor nunca vê mensagem financeira do dono;
- [ ] OWNER/admin vê erro correto no ponto da ação;
- [ ] erro não depende de F12;
- [ ] erro não depende de scroll;
- [ ] hbx-popup2 não mascara o motivo real;
- [ ] backend possui regra centralizada;
- [ ] frontend renderiza capacidade/mensagem, não regra comercial solta;
- [ ] cenário foi testado manualmente ou automaticamente.

---

## 14. Anti-escopo

Não fazer neste PR:

- redesign geral;
- trocar layout do pre-checkout;
- mexer em gateway de pagamento real;
- recriar todo o Prisma;
- criar plano comercial novo;
- alterar preço;
- mudar onboarding inteiro;
- “refatorar tudo”.

Primeiro corrigir regra crítica. Depois limpar arquitetura.
