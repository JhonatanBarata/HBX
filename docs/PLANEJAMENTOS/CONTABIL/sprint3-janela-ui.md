# CONTABIL S3 — Janela Contabil no /master (a cara do app)

**Objetivo:** a UI de altíssima qualidade. Uma `janela-contabil.tsx` no padrão das janelas do
master, com os números vivos do S1 e o calendário do S2. Referência visual: dashboard da
Contabilizei (imposto do mês grande + prazo + status) + gauge de meta do Conta Azul.

## Leia antes
- `docs/Rules/FRONTEND.md` + 5 Leis do Design System (tokens em `frontend/src/app/hbx-theme/`;
  `check-pele.mjs` reprova hex/inline solto).
- `frontend/src/app/(app)/master/janela-cockpit.tsx` e `janela-pagamentos.tsx` — copiar padrão de
  estrutura, fetch e registro da janela em `page.client.tsx`.

## Entregas

### 1. `janela-contabil.tsx` (+ subcomponentes `contabil/` se crescer)
Blocos, de cima pra baixo:

**a) Herói do mês** — o que a Contabilizei acerta: UM número grande.
- "Tributos previstos de {mês}: R$ X" (DAS + INSS + IRRF), com breakdown ao expandir;
- Receita do mês (auto-MP) ao lado, com selo "fonte: Mercado Pago · atualizado há Xmin";
- Estado geral: 🟢 tudo em dia / 🟡 obrigação próxima / 🔴 atrasada.

**b) Fator R ao vivo** — o coração da economia:
- Gauge 0→28%→50% com `fatorR` atual (folha12m/rbt12) e a linha vermelha nos 28%;
- Abaixo do gauge: *"Pró-labore recomendado deste mês: R$ X"* (endpoint S1) com botão
  "usar este valor" (grava `folhaMesCents` da competência);
- Se fatorR projetado < 0,28: banner de aviso com o custo do erro em R$ (diferença V vs III).

**c) Simulador "pensa comigo"**:
- Slider/inputs: receita prevista × pró-labore → total de tributos, lado a lado Anexo III vs V
  (usa `GET /master/contabil/simulador`). É a seção 6 do guia do dono virando ferramenta.

**d) Linha do tempo de obrigações** (S2):
- Cards por obrigação: tipo, vencimento, countdown, estado (chip colorido pela máquina de
  estados), botão de ação contextual ("marcar pago", "ver números", "abrir sistema do governo"
  com deep-link).

**e) Rodapé de contexto**: RBT12 acumulado, faixa atual do Simples e distância pra próxima faixa
("faltam R$ X pro RBT12 pular pra 2ª faixa — alíquota vai de 6% pra ~7,3% efetiva").

### 2. Registro da janela
- Adicionar em `page.client.tsx` do master no padrão das outras (nome exibido: **Contabil**).
- Badge com contagem de obrigações 🔴/🟡 no seletor de janelas (endpoint `/proximas`).

### 3. Perfil fiscal (drawer/modal de configuração)
- Form do `FiscalProfile`: CNPJ, data de abertura, CNAE, alvo do Fator R (default 28%);
- Placeholder visual (desabilitado) das seções "Certificado A1" e "Serpro" com nota
  "ativa no S6/S7" — a arquitetura da tela já nasce completa.

## Aceite
- Janela viva no /master com dados reais (localhost:3001, login de teste em `.test-login.local.md`,
  testar no Chrome — regra da casa; MUITOS erros no preview Claude, não usar como veredito).
- Zero cor/borda/sombra fora de token (check-pele verde). tsc verde.
- Fluxo manual completo: abrir janela → ver tributos do mês → simular → definir pró-labore →
  ver obrigação mudar de AGUARDANDO_DADOS pra PRONTO.

## Guardrails
- Só Admin/master vê a janela (mesmo gate das demais janelas do /master).
- Valores monetários formatados por util central existente (não formatar na mão).
