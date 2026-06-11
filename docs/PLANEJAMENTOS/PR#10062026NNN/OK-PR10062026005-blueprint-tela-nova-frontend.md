# PR10062026005 — Blueprint de tela nova frontend

Data: 11/06/2026
Status: CONCLUÍDO — Parte 2 da contenção de entropia.
Escopo: documentação de frontend. Não altera backend. Não implementa tela.

---

## Objetivo

Definir como uma tela nova do HBX deve nascer sem criar mais uma variação de shell, CSS, overlay ou regra comercial local.

Este blueprint aplica o contrato de `OK-PR10062026004-contrato-frontend-obrigatorio.md`.

---

## 1. Escolha da superfície

Antes de criar arquivo novo, classifique a tela:

| Tipo | Exemplos | Estrutura |
|---|---|---|
| Operacional desktop | Vendas, Cadastros, Financeiro, Gerencial, Banco de Dados | `DashboardScaffold hideHeader` durante a transição, começando em `hbx-guide1-slot` |
| Admin/utilitária | telas internas menores, listas de governo, suporte | `HbxPageShell` + `HbxSection` |
| Mobile operacional | vendas mobile, radar mobile, onboarding guiado | fluxo simples, poucos botões, card claro, ação evidente |
| Público/onboarding | cadastro, confirmação, landing pública | pode usar composição própria, mas com tokens e tema claro/escuro |

Se a tela não couber em uma dessas categorias, registrar a exceção antes de implementar.

---

## 2. Receita para página operacional desktop

Ordem obrigatória:

1. Shell transicional: `DashboardScaffold` com `hideHeader`.
2. Primeira superfície: `hbx-guide1-slot`.
3. Guia principal: `HbxGuide1`.
4. Subguia, quando necessário: `hbx-guide5`.
5. Conteúdo: `hbx-desktop-container` + `hbx-content-container` ou `hbx-content-container--plain`.
6. Guia vertical opcional: `HbxGuide4` dentro de `hbx-guide4-slot`.

Não criar:

- hero;
- header explicativo acima do guia;
- CSS local para guia;
- container próprio se `hbx-*` resolver;
- card dentro de card.

---

## 3. Receita para admin/utilitária

Usar:

- `frontend/src/components/ui/HbxPageShell.tsx`;
- `frontend/src/components/ui/HbxSection.tsx`;
- componentes existentes de status, empty state e badges de `frontend/src/components/ui`.

Evitar:

- `page.module.css` novo;
- shell local;
- título duplicado dentro de painel;
- ação crítica fora do ponto de ação.

---

## 4. Overlays

Para tela nova:

| Necessidade | Componente |
|---|---|
| confirmação | `HbxConfirmDialog` durante a transição; `ConfirmDialog` no kit alvo |
| erro persistente | `PersistentNotice` no kit alvo |
| formulário em janela | `Modal` no kit alvo |
| painel lateral | `Drawer` no kit alvo |
| feedback efêmero | `Toast` no kit alvo |

Proibido em código novo:

- `HbxPopup1`;
- `HbxPopup2`;
- `HbxPopup3`;
- `HbxPopup4`.

Erro crítico precisa aparecer no formulário, painel ou ação que gerou o erro. Toast pode reforçar, mas não pode ser a única evidência.

---

## 5. Acesso e cobrança

Tela nova não decide regra comercial.

Obrigatório:

- renderizar capacidades vindas da API;
- ocultar cobrança para usuário vendedor/USER;
- não usar `paymentStatus`, `subscriptionStatus` ou `premiumAccess`;
- não abrir checkout por inferência local;
- não transformar 403 genérico em `payment_failed`.

Enquanto o DROP paralelo estiver ativo, não tocar nos arquivos de limpeza de campos crus.

---

## 6. CSS e tema

Prioridade:

1. componente existente;
2. classe global `hbx-*`;
3. token existente;
4. CSS local só com justificativa registrada.

Toda cor nova precisa funcionar em claro e escuro. Texto público fica em PT-BR.

---

## 7. Template de exceção

Quando a tela precisar sair do contrato:

```md
Exceção de frontend

Tela:
Motivo:
Alternativas avaliadas:
Risco:
Prazo de remoção:
Dono:
Checks manuais necessários:
```

Sem esse registro, a exceção não deve entrar.
