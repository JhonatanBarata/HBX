# PR10062026006 — Inventário de UI legado

Data: 11/06/2026
Status: CONCLUÍDO — Parte 3 da contenção de entropia.
Escopo: relatório. Não altera frontend real. Não altera backend.

---

## Comandos usados para inventário

```powershell
rg --files frontend/src/app | rg 'page\.module\.css$'
rg -n 'HbxPopup[1-4]|HbxPopup' frontend/src -S
rg -n 'DashboardScaffold|HbxPageShell|HbxSection|HbxGuide1|HbxGuide4|hbx-guide1-slot|hbx-guide4-slot' frontend/src/app frontend/src/components -S
rg -n 'redirect\(' frontend/src/app -g 'page.tsx' -S
```

Esses comandos só leem arquivos.

---

## Resumo

| Sinal | Quantidade encontrada | Leitura |
|---|---:|---|
| `page.module.css` em `frontend/src/app` | 21 | CSS local ainda é comum em páginas reais |
| linhas com `HbxPopup*`/`HbxPopup` | 45 | overlay legado ainda está vivo |
| redirects em `page.tsx` | 55 | mapa de rotas tem muitos aliases |
| linhas com import/uso de `DashboardScaffold` no app | 57 | scaffold segue sendo shell dominante |

---

## Páginas com `page.module.css`

- `frontend/src/app/confirm-email/page.module.css`
- `frontend/src/app/night-factory/page.module.css`
- `frontend/src/app/atendimento/page.module.css`
- `frontend/src/app/master/links/page.module.css`
- `frontend/src/app/register/page.module.css`
- `frontend/src/app/master/night-factory/page.module.css`
- `frontend/src/app/atendimento/automacao/page.module.css`
- `frontend/src/app/boasvindas/page.module.css`
- `frontend/src/app/master/email/page.module.css`
- `frontend/src/app/whatsapp/page.module.css`
- `frontend/src/app/bancodedados/page.module.css`
- `frontend/src/app/page.module.css`
- `frontend/src/app/webscraping/page.module.css`
- `frontend/src/app/planos/page.module.css`
- `frontend/src/app/pre-checkout/page.module.css`
- `frontend/src/app/pagamento/page.module.css`
- `frontend/src/app/vendas/page.module.css`
- `frontend/src/app/radar-digital/page.module.css`
- `frontend/src/app/tutorial/page.module.css`
- `frontend/src/app/hbx-recovery/page.module.css`
- `frontend/src/app/hbx-vendedor/onboarding/page.module.css`

Uso deste inventário:

- não apagar agora;
- não migrar durante o DROP paralelo;
- impedir que novas páginas operacionais adicionem CSS local sem exceção.

---

## Usos de `HbxPopup*`

Arquivos com overlay legado:

- `frontend/src/app/atendimento/page.client.tsx` usa `HbxPopup2` e `HbxPopup3`;
- `frontend/src/app/radar-digital/page.client.tsx` usa `HbxPopup2`;
- `frontend/src/app/vendas/page.client.tsx` usa `HbxPopup1` e `HbxPopup2`;
- `frontend/src/components/RadarPopupHost.tsx` usa `HbxPopup4`;
- `frontend/src/components/HbxPopup.tsx` define as variantes.

Regra:

- usos existentes ficam como legado;
- código novo não importa `HbxPopup1/2/3/4`;
- migração real só depois do kit de overlay.

---

## Shells e guias

`DashboardScaffold` ainda é o shell predominante no app.

Arquivos de maior risco visual e estrutural:

- `frontend/src/app/vendas/page.client.tsx`;
- `frontend/src/app/atendimento/page.client.tsx`;
- `frontend/src/app/radar-digital/page.client.tsx`;
- `frontend/src/app/gerencial/page.client.tsx`;
- `frontend/src/components/DashboardScaffold.tsx`.

Sinais positivos existentes:

- `HbxGuide1` já aparece em páginas operacionais;
- `hbx-guide1-slot` já existe em `globals.css`;
- `HbxGuide4` e `hbx-guide4-slot` já aparecem em Vendas/Atendimento;
- `HbxPageShell` e `HbxSection` existem em `frontend/src/components/ui`.

---

## Rotas alias e redirects

Foram encontrados 55 redirects em `page.tsx`.

Categorias principais:

- aliases de `/dashboard/*` para rotas atuais;
- aliases de `/master/*` para tabs/painéis do master;
- aliases mobile antigos para `/mobile/*`;
- aliases de WhatsApp/Webscraping para Atendimento/Boas-vindas;
- aliases de recovery;
- alias `/precheckout` para `/pre-checkout`.

Exemplos de alto sinal:

- `/precheckout` -> `/pre-checkout`;
- `/mobile-vendas` -> `/mobile/vendas`;
- `/dashboard/gerencial` -> `/gerencial`;
- `/dashboard/vendas` -> `/vendas`;
- `/whatsapp` -> `/atendimento/automacao?tab=connection`;
- `/webscraping` -> `/boasvindas?radar=1`;
- `/master/planos` -> `/master`;
- `/master/clientes` -> `/master?tab=clientes`.

Regra:

- alias novo precisa entrar no manifesto conceitual;
- alias não deve ter regra de negócio;
- remoção só depois de rota nova estar validada.

---

## Não interferência com DROP paralelo

Este inventário não recomenda mexer agora em:

- `billing-access.ts`;
- limpeza de campos crus;
- telas do DROP 8;
- E2E/smoke das personas;
- backend.

