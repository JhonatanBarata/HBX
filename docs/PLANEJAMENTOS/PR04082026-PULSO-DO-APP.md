# PR04082026 — PULSO DO APP (ver a tela dos clientes, sem depender de IA)

Pedido do dono 04/08/2026: *"ver a tela real dos clientes (o que eles estão usando) sem precisar
de você"*. Hoje isso só existe lendo o log do nginx na mão (foi como se provou que o André estava
arrumando cadastro sozinho em 04/08 21:02). Este plano dá isso pro dono no cockpit, sozinho.

## 1. O que é

Painel **master-only** no cockpit web: uma linha por aparelho pareado —
**empresa · pessoa · 🟢/⚪ (app aberto agora) · tela atual · há quanto tempo · trilha do dia**.

Não é imagem da tela: é telemetria do NOSSO app (nome da tela + hora). O espelho literal
(vídeo/print do aparelho) é v2 e SÓ com consentimento apertado pelo cliente — sem botão dele,
não existe espelho; espionagem de aparelho não entra no produto.

## 2. Desenho v1 — o pulso pega carona (quase de graça)

- O app JÁ bate no servidor **a cada 5s** com o app aberto (`POST /logistica/recados/pendentes`,
  já na allowlist Kotlin). O pulso NÃO cria requisição nova: o body desse poll ganha
  `tela` (string curta: `rota`, `clientes`, `cliente:ficha`, `chegada`, `financeiro`, `ajustes`…).
- **app.js**: `navigateTo` + abertura de sheets gravam a tela atual numa variável única; o poll
  manda junto. 1 ponto central, zero bateria extra.
- **Backend**: DTO aceita o campo OPCIONAL (APK velho não manda → ignora; nada quebra).
  Grava última tela por aparelho (colunas aditivas em `MobileDevice`: `ultimaTela`,
  `ultimaTelaAt`) + trilha do dia em tabela leve `MobileTelaTrilha` (deviceId, tela, at) com
  **faxina diária** (guarda hoje + D-1; trilha sem faxina vira lixão).
- **Painel**: no cockpit web onde já vivem os Recados (moradia exata confirmada na implementação);
  🟢 = poll há <15s; ⚪ = "fora do app" (nunca dizer "offline do mundo" — o painel lê o pulso,
  não inventa). Expandir a linha = trilha do dia ("21:01 abriu · 21:02 Clientes · 21:02 ficha…").
- Visibilidade: **só o /master do dono (plataforma)** no v1 — admin de tenant não vê.

## 3. Ordem de deploy e armadilhas

- Backend PRIMEIRO (aceita e ignora o campo), APK depois passa a mandar — nunca o contrário
  (DTO whitelist do Nest rejeita campo desconhecido → quebraria o poll do app novo).
- O poll é endpoint JÁ permitido na allowlist → mudar o body não exige mexer no Kotlin
  (conferir na implementação que a allowlist filtra por caminho, não por corpo).
- Contadores/carimbo: `ultimaTelaAt` compara no servidor, nunca confiar em relógio do aparelho.

## 4. Fatias

- **P1** — campo `tela` no poll + colunas aditivas + gravação.
- **P2** — painel no cockpit (linhas por aparelho, 🟢/⚪, tela atual).
- **P3** — trilha do dia expandível + faxina.
- **v2 (só se a dor pedir)** — espelho REAL com consentimento: botão "Ajuda ao vivo" no app do
  cliente → Android MediaProjection (banner nativo obrigatório do sistema) → frames pro cockpit
  enquanto ELE mantiver ligado; desligou, morreu.

## 5. Privacidade (o que torna isso vendável, não assustador)

v1 não captura imagem, digitação nem conteúdo — só o NOME da tela (padrão de analytics de app).
É ferramenta de SUPORTE da vertical: o dono enxerga onde cada cliente trava (ex.: cliente que
nunca sai de Clientes = candidato ao Modo Caderneta) e age antes do churn.
