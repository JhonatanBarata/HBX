# PR10062026007 — Manifesto conceitual de rotas canônicas

Data: 11/06/2026
Status: CONCLUÍDO — Parte 4 da contenção de entropia.
Escopo: documentação. Não move rotas. Não altera redirects.

---

## Objetivo

Definir o formato do manifesto de rotas antes de implementar qualquer check ou alteração de rota.

O problema atual não é a existência de aliases. O problema é alias sem dono, prazo e rota canônica documentada.

---

## Formato proposto

Quando virar código, o manifesto pode ser um arquivo TS ou JSON versionado, por exemplo:

```ts
type HbxRouteManifestEntry = {
  canonical: string;
  aliases: string[];
  surface: "public" | "app" | "mobile" | "master" | "legacy";
  owner: "frontend" | "master" | "growth" | "ops";
  reason: string;
  removalTarget: string | null;
  notes?: string;
};
```

Campos obrigatórios:

- `canonical`: rota que recebe implementação real;
- `aliases`: rotas que só redirecionam;
- `surface`: superfície de navegação;
- `owner`: dono da decisão;
- `reason`: motivo da compatibilidade;
- `removalTarget`: data, PR futuro ou `null` quando o alias é permanente por produto.

---

## Candidatos iniciais

| Canônica | Aliases conhecidos | Observação |
|---|---|---|
| `/pre-checkout` | `/precheckout` | manter só como compatibilidade |
| `/mobile/vendas` | `/mobile-vendas` | alias mobile antigo |
| `/mobile/radar-digital` | `/mobile-radar-digital` | alias mobile antigo |
| `/mobile/boas-vindas` | `/mobile-boas-vindas`, `/mobile/boasvindas` | padronizar vocabulário |
| `/gerencial` | `/dashboard/gerencial` | legado dashboard |
| `/vendas` | `/dashboard/vendas` | legado dashboard |
| `/pagamento` | `/dashboard/financeiro` | legado dashboard |
| `/atendimento` | `/dashboard/inbox` | legado dashboard |
| `/atendimento/automacao` | `/whatsapp`, `/dashboard/whatsapp`, `/vendas/automacao`, `/atendimento/automacao` redirects internos | revisar quando o kit de Atendimento entrar |
| `/boasvindas?radar=1` | `/webscraping`, `/dashboard/webscraping` | compatibilidade com nome antigo |
| `/master` | `/master/clientes`, `/master/financeiro`, `/master/operacao`, `/master/planos`, `/dashboard/master/*` | master usa tabs/painéis |

---

## Regras

- Alias novo não pode conter chamada de API.
- Alias novo não pode importar CSS de página.
- Alias novo não pode renderizar layout.
- Alias novo deve preservar query string quando necessário.
- Alias novo precisa estar no manifesto.
- Remoção de alias exige checar links externos, campanhas e bookmarks operacionais.

---

## Check futuro

Depois do DROP paralelo, criar check report-only primeiro:

1. ler o manifesto;
2. listar `page.tsx` com `redirect(`;
3. comparar aliases encontrados com aliases registrados;
4. reportar entradas ausentes;
5. só transformar em CI obrigatório depois da primeira limpeza.

