# W3 — App embutido: "Criar rota manual" + destaque do modelo do dia no Montar Rota

Ler ANTES: `00-ORQUESTRACAO.md`, `SPEC-LEITURA-DE-ROTA.md` §1.2, e o RELATÓRIO do W2 (o wizard
de leitura já estará no app.js — REUSAR as folhas/passos dele, não duplicar).
Arquivos: `EntregaShell/app/src/logistica/assets/app/app.js`, `app.css` (tokens, prefixo `lrt-`).
NÃO tocar: backend, Kotlin (allowlist já cobre /logistica/leitura/**), billing.

## Parte A — Criar rota manual (adição do dono, 20/07)
Pedido literal: "criar rota manualmente, onde vai ser feito tudo manualmente, sem a pessoa usar
localização, mas vai cadastrar tudo igual, e salvar no final".

- **Entrada:** junto do "Iniciar Leitura de Rota" (W2), segundo botão **"Criar rota manual"**.
  Toque → `POST /logistica/leitura/iniciar { modo: 'MANUAL' }`. Mesma sessão/retomada do W2
  (se `GET /logistica/leitura/atual` devolver sessão MANUAL aberta, retoma no modo manual).
- **Fluxo por parada — MESMOS passos do W2, SEM localização:**
  - Botão **"Adicionar cliente"** (equivalente ao "Cadastrar Local", sem GPS): "Cliente novo ou
    existente?".
    - Existente: mesma busca do W2 (sem ordenação por distância — alfabética + busca).
    - Novo: aqui o endereço É digitado (form de cliente EXISTENTE no app — nome, telefone,
      CEP/endereço com o "Consultar local"/geocode opcional que já existe). NADA de GPS
      (`clienteNovo` sem lat/lng do aparelho; se o geocode preencher lat/lng, manda com
      `geoFonte: 'geocode'`).
  - Telefone → Produto → Valor: MESMAS telas do W2 (reusar funções/folhas).
  - Parada vai pelo MESMO `POST /leitura/:id/parada` com `capturadoEm` = agora e SEM lat/lng
    (contrato já aceita) + mesma fila offline do W2.
- **Ordenação:** no modo manual a ordem importa e não veio da rua: na tela da sessão ativa,
  lista das paradas com ▲▼ grandes (≥52px, padrão rp2 do passo "Sua ordem") pra reordenar antes
  de finalizar. Reordenar = atualizar ordem localmente e refletir no resumo (a ordem final enviada
  é a exibida — enviar `ordemParadaIds` no `finalizar`, que o contrato aceita exatamente pra isso).
- **Resumo/salvar:** MESMA tela do W2 (timeline sem hora fazer sentido? no manual mostrar sem a
  coluna de hora ou com "—"), mesma pergunta "Salvar Rotativo {dia}?", mesmo campo Nome
  pré-preenchido com o dia (único, "Segunda-feira 2" se repetido), mesmo "Feito.".

## Parte B — Montar Rota oferece o modelo do dia (spec §1.2)
Hoje o modo "Rota salva" (order-mode-saved) é um dos 3 cards do passo 2. Adicionar: quando
existir `LogisticaRotaModelo` com `diaSemana` == dia da semana do dia operacional
(`operationalDate()`), mostrar NO TOPO do passo 2 um card destaque de 1 toque:
**"Aplicar rota de {dia} ({N} paradas)"** → aplica o modelo direto (mesmo efeito de escolher
"Rota salva" + aquele modelo). Manter os 3 cards como estão. Padrão visual rp2 (card âmbar da
Rota salva). Não mexer na máquina de estados além do atalho.

## Voltar do Android
Todo passo novo entra no `handleBack` (fechar folha → voltar passo → sair do wizard com confirm).

## Checks
`node --check` no app.js. Testar mentalmente os data-action novos (sem colisão com existentes).
NÃO commitar. Relatar arquivos tocados + gaps.
