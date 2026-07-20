# 01 — UX da Leitura de Rota "pra velho usar" (feedback dono 20/07)

Base: walkthrough REAL no moto g15 via ADB (APK release de hoje, publish `90acf397`,
instalado e dirigido tela a tela — prints na sessão de 20/07).

## Evidência colhida no aparelho
1. **Preço (item 1 do dono) — REPRODUZIDO**: toquei no meio do "20" e digitei 5 → campo virou
   `5|20` (R$ 520). O caret cai onde o dedo acerta; input `type=number` cru, sem máscara.
2. **Cliente existente (item 2) — CONFIRMADO**: escolhi cliente e caí DIRETO em "Telefone".
   O GPS capturado não aparece em lugar nenhum; zero comparação com o cadastro; nenhum passo
   de endereço/número.
3. **Preço com financeiro OFF (item 3) — CONFIRMADO no código**: `leituraProdutoStep` renderiza
   o campo R$ sempre; não existe check de `moduloFinanceiroAtivo` no wizard.
4. **Sem status GPS/Rede (item 4)**: nenhum indicador no header. Mapa da tela Rota abre no
   Brasil inteiro mesmo com permissão de localização dada (não centraliza no usuário).
5. Pós-permissão de GPS o wizard NÃO retoma sozinho — volta pro banner e o usuário tem que
   tocar "Cadastrar Local" de novo.
6. Lista "Cliente existente" diz "Mais perto primeiro" mas não mostra distância nenhuma
   (clientes sem GPS) — na prática é ordem alfabética; rótulo mente.
7. Passo produto da CRIAÇÃO de rota pergunta "O que foi entregue?" (nada foi entregue ainda).
8. "Cancelar leitura" TEM confirmação (ok!), mas os botões "Cancelar" × "Cancelar leitura"
   são ambíguos pra idoso.
9. Catálogo do cliente com duplicatas (Galao / Galao20l / Galão 10 Litros / Galão 20Litros) —
   problema de DADO do tenant, não de código; sugerir limpeza/fusão à parte.

## F3.1 — Preço estilo banco (app)
Campo de moeda de verdade em TODO lugar que digita preço no APK (leitura, itens da entrega):
- Guarda em **centavos**; exibe formatado `R$ 20,00`, alinhado à direita.
- **Digitação estilo banco**: tocar no campo abre com valor SELECIONADO (primeiro dígito
  substitui tudo) e cada dígito empurra dos centavos → `2` = R$ 0,02 · `2,0,0,0` = R$ 20,00.
  Caret não existe pro usuário (sempre no fim); impossível cair "no meio do 20".
- `inputmode=numeric`, fonte grande.

## F3.2 — Sequência do cliente na LEITURA + GPS→endereço (backend + app)
**Backend novo**: `GET /logistica/geo/reverse?lat&lng` — Nominatim `/reverse` server-side
reusando o padrão de `nucleo-geo.util.ts` (User-Agent, timeout 2,5s, flag
`HBX_GEO_SERVER_ENABLED`, degrada pra null). Cache em memória por célula (~30 m, 24h) e
1 chamada por parada — respeita o rate-limit de 1 req/s. Conferir flag ligada na VPS.

**App (modo LEITURA — MANUAL fica como está)** — ordem nova:
cliente → **ENDEREÇO** → **NÚMERO** → telefone → produto → observações.
- **Existente COM endereço**: compara GPS×cadastro (distância se tem pino; senão rua
  normalizada do reverse). Bate → cartão verde "Endereço confere ✓" (1 toque).
  Não bate → "Cadastrado: X · Você está em: Y (a Z m). **Atualizar substitui o endereço
  anterior.**" [Atualizar endereço] / [Manter o cadastrado]. Atualizou → pede o número
  (campo grande, tela própria).
- **Existente SEM endereço**: mostra o endereço do GPS reverso + [Usar este endereço] →
  grava endereço + pino da captura → pede número.
- **Cliente novo**: reverse PREENCHE rua/bairro/cidade/UF/CEP sozinho ("rastreou → endereço
  atual já vem escrito"); usuário confere e põe o número.
- Persistência via PATCH conta/local existentes; pino da captura vira GPS do cadastro.

## F3.3 — Preço × Financeiro desligado (app)
Tela do produto fica IGUAL; com `moduloFinanceiroAtivo` OFF o campo R$ aparece travado
(cadeado). Tocar → popup: "Preço faz parte do módulo Financeiro, que está desligado.
Deseja configurar o Financeiro?" **[Sim]** → abre Ajustes›Financeiro ativando o necessário
(spec do dono) e volta pro passo · **[Agora não]** → segue sem preço.
Sem financeiro: salva parada com valor 0 e NUNCA grava `precoAcordado`.

## F3.4 — Ícones vivos GPS + Rede no topo (app)
Dois chips no header do shell mobile:
- **Rede**: verde ok / vermelho sem conexão (fonte: `navigator.onLine` + resultado da última
  `H.api`; fila offline M8 já existe — enfileirando = vermelho "salvando offline").
- **GPS**: verde (fix ≤60s e precisão ≤50 m) / amarelo buscando / vermelho sem permissão.
- Toque no chip → popup de 1 frase + botão de ação (Tentar de novo / dar permissão via
  `H.requestLocationPermission`).
- Banner de leitura ativa mostra "GPS ok · ±XX m" ao vivo.

## F3.5 — Lapidação (mesma leva, tudo barato)
- Pós-permissão de GPS retoma o wizard SOZINHO (bug provado no aparelho).
- Mapa da Rota centraliza na posição do usuário quando há permissão (1 flyTo por sessão).
- "Mais perto primeiro" só quando houver distância; senão subtítulo "Ordem alfabética".
- Título do passo produto na criação: "O que ele recebe?".
- Botões da confirmação de cancelar: "Voltar" / "Sim, cancelar leitura".

## Ordem de execução (integrada ao 00-PLANO.md)
1. **Leva BACKEND (1 publish)**: F1-W1 (diaSemana opcional) + W1-F2a (ponte ClienteProduto)
   + W1-F2 (`/rota-modelos/:id/gerar`) + F3.2 (`/geo/reverse`).
2. **Leva APP (1 rebuild + install via ADB)**: F1-W2 + F2-W2 + F3.1 + F3.2 + F3.3 + F3.4 + F3.5.
3. **Teste**: unit no backend + eu mesmo dirigindo o APK no moto g15 via ADB (fluxo completo:
   leitura → endereço → número → produto sem/com financeiro → finalizar só-nome → Salvos →
   aplicar rota salva → cobrança 1x).

## Riscos
- Nominatim reverse: nunca em loop; 1 chamada/parada + cache. Flag OFF → passo endereço
  degrada pra "sem comparação" (fluxo atual), nunca trava.
- Atualizar endereço apaga o anterior — texto de aviso explícito e ação só no botão.
- Ligar financeiro pelo popup = ação explícita do usuário (spec do dono), nunca automática.
