# APPIFICAÇÃO — logística mobile com cara de APP, não de ERP (feedback do dono 04/07 20h)

> Dono testou no iPhone (hbxsystem.com.br) e reprovou: "refatore essa tela, está inteira bugada...
> esse menu logístico, cadastro, tudo q envolve entregas, tem q ter cara de app. Não cara de sistema
> ERP." + screenshots com bugs de front. Workers implementam LOCAL no **master** (sem branch, sem
> stash, `git add` por caminho), NÃO publicam sem ordem; dono testa no celular a cada aterrissagem.

## 0. Diagnóstico (por que ele viu ERP em vez do app)
1. **A aba "Rota" do celular aponta pro lugar ERRADO**: `mobile-tab-bar.tsx:29` → `href: "/logistica"`
   (página ERP do dashboard, skin aurora). O app de verdade (M4, skin `entrega`) está em **`/entrega`**
   e o dono nunca chegou nele por navegação — só por QR/URL direta.
2. **No mobile, Empresas/Contatos/Produtos NÃO existem no menu** — a folha "Mais" é hardcoded
   (Relatórios/Configurações/Tutorial). N3/N4/N5 só entraram em `NAV_LINKS` (sidebar desktop).
   Resultado: no celular não dá pra cadastrar cliente/produto — o passo-a-passo do teste não bateu.
3. **A separação "app = entregador / gestão = dashboard" está errada pra este vertical**: o dono do
   negócio de água É o entregador. Gestão (gerar dia, resumo, fechar mês, regras) e cadastro
   (cliente/produto) precisam morar DENTRO do app, no skin entrega.

## 1. Catálogo de bugs das screenshots (04/07 20:03)
| # | Tela | Bug |
|---|---|---|
| B1 | `/logistica` mobile | Título truncado "Lo…" + fileira de ícones do topo estoura a largura (linha de bolinhas embaixo dos ícones = overflow) |
| B2 | `/logistica` mobile | Card resumo com travessões soltos ("—" sem valor) em ENTREGUES/RECEBIDO/A RECEBER — deve mostrar `0` / `R$ 0,00` ou esconder até carregar |
| B3 | `/logistica` mobile | Cara de ERP: card administrativo denso, links sublinhados ("Regras", "Instalar app"), sem hierarquia de app |
| B4 | Vendas funil mobile | Header quebrado: "de vendas 1 cards" vazando em 2 linhas por cima dos KPIs; botão "Modo foco" cortado na borda direita |
| B5 | Vendas "Buscar empresas" mobile | Painel flutuante "Buscando empresas / Todo o Brasil / ← Voltar" SOBREPOSTO à lista; chips de stats (Total no Brasil / Disponíveis / Cota) amontoados/cortados; campo busca coberto pelos chips |
| B6 | Tab bar | Com "Rota" são 6 itens espremidos — ok manter, mas conferir toque ≥48px e labels sem corte |

> B4/B5 são as telas do REFAB do dono (`leads/page.client.tsx`, `vendas/page.client.tsx`,
> `filtro-avancado-modal.tsx`) — worker DEVE consertar SÓ o CSS/layout mobile, sem mexer na lógica
> que ele construiu, e commit separado pra ele revisar fácil.

## 2. O menu (pedido explícito: "eu quero esse menu para mobile")
Leitura: o padrão **barra de abas inferior** está aprovado — é o menu do mobile. Consequências:
- O dashboard mantém a tab bar (Início · Vendas · Conversas · Buscar · Rota · Mais).
- **O app `/entrega` ganha a SUA tab bar própria** (skin entrega, mesmas 4-5 abas grandes):
  **Rota · Clientes · Produtos · Ajustes** — o "app de entregas" completo navegável por abas.
- O topo mobile (fileira de ícones redondos) NÃO pode estourar (B1): no mobile, colapsar pra
  essencial (regra simples, sem redesenho do shell desktop).

## 3. Sprints (A1–A6, sequenciais)

### A1 — P0 de navegação + consertos cirúrgicos (PEQUENO, primeiro)
- `mobile-tab-bar.tsx`: aba **Rota → `/entrega`** (o app), não `/logistica`.
- Folha "Mais" (mobile) ganha: **Empresas, Contatos, Produtos, Logística (gestão)** — gate
  `isModuleVisible` igual sidebar. (Desbloqueia o passo-a-passo do teste JÁ.)
- B1: título + fileira de ícones do topo sem overflow no mobile. B2: resumo sem travessão (0/R$ 0,00).
- **Check:** tsc+build+check-pele; screenshot mobile viewport das 2 telas.

### A2 — Tab bar do app `/entrega` (o menu de app)
- Bottom tabs no skin entrega: **Rota · Clientes · Produtos · Ajustes** (componentes `ent-*`,
  alvos ≥52px). Rotas novas `/entrega/clientes`, `/entrega/produtos`, `/entrega/ajustes` (cascas).
- "Instalar app" e onboarding continuam; wake-lock/geofence intactos.
- **Check:** navegação por abas funciona; Lighthouse instalável segue ok.

### A3 — Clientes com cara de app (`/entrega/clientes`)
- Lista (cards grandes, busca) → ficha → **cadastrar/editar cliente** em telas app-like (sheets,
  1 coluna, zero jargão ERP): nome, zap, endereço, **"salvar local daqui"** (geolocation → lat/lng),
  forma de pagamento (aberto/mensal/na_hora/pendura + contabilizar), **produtos do cliente**
  (produto + qtd padrão + frequência). REUSA os endpoints prontos (nucleo/logistica) — zero endpoint novo.
- **Check:** criar a "Dona Maria" inteira SEM sair do app, em <2 min, no viewport iPhone.

### A4 — Produtos + Gestão do dia com cara de app
- `/entrega/produtos`: lista + form simples (nome, unidade, preço, usa na logística).
- `/entrega` (Rota, admin): a gestão que hoje é o card ERP vira app: **"Gerar entregas de hoje"**
  como ação grande, resumo do dia como stats do app (B2 morto), "Fechar mês" e "Regras" dentro de
  **Ajustes** (A2). A página `(app)/logistica` do dashboard segue existindo pro DESKTOP.
- **Check:** fluxo completo do vertical água 100% dentro do app.

### A5 — Passe de conserto Vendas mobile (B4+B5, telas do refab do dono)
- SÓ layout/CSS mobile: header do funil sem quebra, "Modo foco" visível, chips/painel do Buscar
  empresas sem sobreposição (o painel "Buscando empresas" vira bloco em fluxo no mobile, não flutuante).
- **NÃO mexer em lógica/estado do refab.** Commit isolado `fix(vendas): passe mobile` p/ revisão fácil.
- **Check:** screenshots antes/depois nos 2 viewports (375px e 414px).

### A6 — QA mobile de verdade + varredura final
- Playwright viewport iPhone: fluxo app completo (abas, cadastro, rota, confirmar c/ GPS mock).
- Varredura visual minha (preview/Chrome mobile) em TODAS as telas tocadas + check-pele verde nos
  arquivos do plano. Lista final de sobras pro dono.

## 4. Regras duras (todas as sprints)
- Trabalhar no **master** (sem branch/stash), `git add` por caminho, NÃO publicar sem ordem do dono.
- Skin: telas do app SÓ com tokens/classes `ent-*` (`entrega.css`); dashboard segue hbx-theme. Zero
  hex/inline em TSX (check-pele).
- ZERO texto explicativo nas telas do app (Lei do plano-mãe). Reusar endpoints existentes.
- WhatsApp/cobrança: flags e caminhos blindados INTOCADOS (isso é UI).

## 5. Ordem
A1 (P0, destrava o teste do dono) → A2 → A3 → A4 → A5 (pode intercalar) → A6.
