# A6 — QA mobile + FECHAMENTO da APPIFICAÇÃO (RESULTADO)

Sprint **A6** do `PLANO-APPIFICACAO.md` — o fechamento. Trabalho LOCAL no `master`,
NÃO publicado. `git add` por caminho. Este é o doc que você lê pra testar no iPhone.

---

## (a) O que a APPIFICAÇÃO entregou (A1–A5) — checklist

| # | Entrega | Estado |
|---|---|---|
| **A1** | Aba "Rota" da barra inferior do dashboard passou a abrir o **app `/entrega`** (não o ERP `/logistica`). Folha "Mais" do celular ganhou **Empresas · Contatos · Produtos · Logística** (mesmo gate da sidebar). **B1** (topo mobile sem overflow) e **B2** (resumo `0`/`R$ 0,00`, sem travessão) consertados. | ✅ |
| **A2** | O app `/entrega` ganhou a **SUA tab bar** (skin entrega): **Rota · Clientes · Produtos · Ajustes**, alvos ≥52px, ativo pelo pathname. Rotas novas `/entrega/clientes`, `/entrega/produtos`, `/entrega/ajustes`. | ✅ |
| **A3** | **Clientes com cara de app**: lista (cards + busca) → ficha → cadastrar/editar (nome, WhatsApp, endereço, **"Salvar local daqui"** via GPS, forma de pagamento, produtos do cliente). Reusa endpoints do núcleo/logística; +1 GET de leitura aditivo (`/nucleo/clientes/:id`). | ✅ |
| **A4** | **Produtos** (lista + editor: nome/unidade/preço/usa-na-logística, inativar/reativar) + **Gestão do dia** na aba Rota (**"Gerar entregas de hoje"** + 3 stats) + **Ajustes** (regras/aviso WhatsApp com preview, raio/velocidade, fechar-mês, instalar app/QR, sair). | ✅ |
| **A5** | **Passe de conserto Vendas mobile** (B4 header do funil + B5 "Buscar empresas" sobreposto) — **só CSS ≤860px**, zero lógica do refab tocada. | ✅ |
| **A6** | **e2e Playwright** (viewport iPhone) + varredura de overflow + varredura estática (build/tsc/check-pele) + esta lista. | ✅ |

**Vertical água fecha 100% dentro do app** `/entrega`, sem cair no dashboard ERP:
cadastrar produto → cadastrar cliente (com produtos/rota) → gerar o dia → rodar a rota →
confirmar entrega → fechar o mês.

---

## (b) Roteiro de QA manual no iPhone (passo a passo REAL)

> Fazer logado como você (USERMASTER/ADMIN — os PATCH de config/financeiro e o
> fechar-mês são @Admin). Safari/Chrome no iPhone, apontando pro ambiente onde
> isto estiver publicado (hoje: só LOCAL, ainda não publicado).

**0. Instalar (PWA)**
1. Abrir `/entrega` no navegador do iPhone (ou pela aba **Rota** da barra inferior do dashboard).
2. Compartilhar → **Adicionar à Tela de Início**. Abrir pelo ícone (roda em tela cheia, sem barra do browser).
3. 1º acesso mostra o **onboarding de 3 telas** → "Começar". (Aparece 1× por device.)

**1. Navegar as 4 abas**
4. Na base do app: **Rota · Clientes · Produtos · Ajustes**. Tocar cada uma — a aba acesa muda, sem corte de label, alvo de toque confortável (≥52px).

**2. Criar um produto**
5. Aba **Produtos** → "Novo produto" → nome "Galão 20L", unidade **Galão**, preço `12,00`, "Usa na Logística" **ON** → Cadastrar. O card aparece na lista.
6. Tocar no card → mudar preço → Salvar. Tocar → "Inativar" (some pro fim, apagado) → "Reativar".

**3. Criar a "Dona Maria" inteira (sem sair do app)**
7. Aba **Clientes** → "Novo cliente" → nome "Dona Maria", WhatsApp, endereço, cidade/UF.
8. Tocar **"Salvar local daqui"** → aceitar o pedido de GPS → o botão confirma o local salvo (vai `lat/lng` no cadastro).
9. Escolher forma de pagamento: "Mensal" (aparece "Fecha todo dia") **ou** "Na hora" (aparece "Recebe por" pix/dinheiro). Ajustar "Entra na contabilidade".
10. Cadastrar → volta pra lista com "Dona Maria".
11. Tocar nela → seção **Produtos** → "Adicionar produto" (escolher do catálogo, qtd 2, "a cada 3 dias", preço opcional) → Adicionar → Salvar.
12. Reabrir a ficha → endereço, forma de pagamento e produto voltam preenchidos (prova do GET de detalhe).

**4. Gerar o dia e rodar a rota**
13. Aba **Rota** → topo: **"Gerar entregas de hoje"** → feedback do nº de entregas ("N geradas" / "Já estava tudo gerado" / "Nada recorrente para hoje").
14. Os 3 stats mostram **`0` / `R$ 0,00`** (nunca travessão — B2 morto).
15. Se houver entregas: **"Iniciar rota"** (pede GPS de origem) → tela **Rota**: card da parada, swipe ←/→, dots, "Navegar" (abre o mapa) e "Cheguei".
16. "Cheguei" → folha de chegada → conferir itens → **Entregue** (grava com GPS; offline entra na fila e sincroniza depois).

**5. Ajustes / fechar o mês**
17. Aba **Ajustes** → editar a mensagem de aviso (chips de variáveis + preview ao vivo) → Salvar. Mexer raio de chegada / velocidade (salva no blur). Toggles "avisar na entrega" e "gerar o dia sozinho".
18. **"Fechar o mês"** (confirmação) → feedback do nº de faturas.
19. **"Instalar o app"**: QR do `/entrega` + copiar link. **"Sair da conta"** → volta ao login.

**6. Telas do dashboard mobile (consertos B1/B2/B4/B5)**
20. Barra inferior do dashboard → tocar **"Mais"**: a folha lista **Empresas · Contatos · Produtos · Logística** (destrava o cadastro pelo celular).
21. Aba **Rota** do dashboard → o topo (`/logistica` desktop) não estoura a largura (B1); resumo sem travessão (B2).
22. Aba **Vendas**: header do funil sem quebra em 2 linhas, "Modo foco" visível (B4). Entrar em "Buscar empresas": os 3 chips (Total/Disponíveis/Cota) numa linha, painel "Buscando empresas" em fluxo (não sobreposto), campo de busca visível (B5).

---

## (c) Sobras / pendências conhecidas (pro dono)

1. **NÃO publicado.** Todo A1–A6 está no working tree do `master`, local. Publicar só sob sua ordem (`npm run publish`). Migration do GET de detalhe do A3 é só leitura (não há migration nova — o endpoint reusa tabelas existentes).
2. **QA autenticado real** (criar cliente/gerar dia batendo no backend de verdade) é o roteiro (b) acima, no seu celular — o e2e do A6 roda **sem credencial** (mocks), então valida estrutura/navegação/anti-corte, não o fluxo de escrita ponta a ponta.
3. **Efeitos de entrega atrás de flag OFF**: o disparo de WhatsApp/cobrança na confirmação de entrega segue blindado por flag (intocado nesta appificação — é UI). Ligar é decisão sua, à parte.
4. **`check-pele` fecha VERMELHO por pele PRÉ-EXISTENTE de terceiros** — NÃO é nossa (detalhe na seção Checks). Zero violação nos arquivos A1–A5.
5. **PATCH de config / financeiro / fechar-mês são @Admin.** Você (USERMASTER) passa. Um **vendedor puro** tomaria 403 nesses (o resto do cadastro é livre) — se um dia o entregador não for admin, é ajuste de guard, fora do escopo.
6. **A5 (Vendas B4/B5) é só CSS mobile** — nenhuma lógica do seu refab foi tocada (2 arquivos, ambos `.css`). Vale conferir no seu olho nos 2 viewports (375px e 414px), como pedido.

---

## Checks (A6) — resultado REAL

- **e2e Playwright** `tests/e2e/entrega-app-mobile.spec.ts` (projeto `mobile-chromium`, Pixel 5 397×860):
  **8/8 PASSOU** (rodado `--repeat-each=2` = 16/16, estável). No projeto desktop `chromium` os 8 são **skipped** de propósito (QA mobile). Cobre:
  - as 4 abas do app existem, exatamente 1 ativa por rota, e **navegam** (Rota→Clientes→Produtos→Ajustes, URL + aba acesa mudam);
  - **sem overflow horizontal** em `/entrega`, `/entrega/clientes`, `/entrega/produtos`, `/entrega/ajustes`, **`/logistica`** (B1) e **`/vendas`** (B4) — todas verdes;
  - a folha **"Mais"** do dashboard lista **Empresas · Contatos · Produtos**.
  - *Nota técnica:* o app exige login → o teste injeta token falso no `localStorage` + mocka a API (mesma técnica de `mobile-no-overflow.spec.ts`) e dispensa o onboarding (chave `hbx:entrega:onboarded:v1`). `waitUntil:"domcontentloaded"` é deliberado (com "load" o XHR do app corria antes do mock assentar → 401 → redirect pro login). **Não é** QA autenticado de escrita — isso é o roteiro (b).
- **`npx tsc --noEmit`** (frontend) → **exit 0** ✅
- **`npm run build`** (Next) → **exit 0** ✅ — `/entrega` + as 3 subrotas + `/logistica` + `/vendas` compilam.
- **`check-pele.mjs`** → exit 1, mas **100% PRÉ-EXISTENTE de terceiros**, NADA nosso:
  - `bot-builder.css:163`, `screens.css:1564/1579` (o `.vnd-segbtn`/`.vnd-stats .kpi` do SEU refab Vendas), `whatsapp.css:19–328` (várias).
  - Os 3 arquivos estão **sem modificação no working tree** (git limpo pra eles). Nenhum arquivo A1–A5 (`entrega.css`, `mobile.css`, TSX, `mobile-tab-bar.tsx`, `logistica/page.client.tsx`) aparece na lista. Regra do repo: não consertar pele alheia.
