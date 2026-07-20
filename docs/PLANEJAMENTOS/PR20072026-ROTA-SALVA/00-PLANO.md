# PR20072026-ROTA-SALVA — Rota salva vira lista LIVRE (sem dia)

**Tese (dono, 20/07):** vínculo por dia continua sendo a recorrência ("Automática").
Rota salva é OUTRA coisa: lista livre de clientes, sem dia, que roda em qualquer dia.

## O que o código confirma (verificado 20/07)

| Ponto | Estado real |
|---|---|
| Schema | `LogisticaRotaModelo.diaSemana` JÁ é `Int?` (null = sem dia). CRUD (`logistica-rota-modelo.service.ts`) JÁ aceita null. |
| Salvar (Leitura) | O bloqueio é no **finalizar da Leitura**: `FinalizarLeituraDto.diaSemana!: number` (1–7 obrigatório) + validação no `finalizar()` de `logistica-leitura.service.ts:313`. No app, wizard tem passos "Salvar Rotativo {dia}?" e seletor de dia (`leituraSalvarDiaStep`/`leituraSalvarDiaManualStep`, app.js ~1323). |
| Listar (Salvos) | `dayOrderSavedModal` (app.js ~1714) mostra rótulo do dia e ordena "rota de hoje" primeiro. |
| Aplicar | `apply-route-modelo` (app.js ~2448) carrega a **prévia do dia de HOJE** e só REORDENA; cliente do modelo fora da agenda de hoje é **descartado**. |
| Produtos | Modelo guarda só `{customerProfileId, localId?, horaRef?}` — nenhum produto. O "de sempre" do cliente vive em `ClienteProduto` (`qtdPadrao`, `precoAcordado`, `localId`, `ativo`). |
| Cobrança | `gerarDia` NÃO debita ao criar entrega; cobrança é por parada quando a rota roda (claims idempotentes por delivery em `logistica-route-billing.service.ts`). Idempotência de criação: `[companyId, customerProfileId, localId, dia]`. |
| Excluir | Backend `DELETE /logistica/rota-modelos/:id` pronto; ação `delete-route-modelo` + confirmação já existem (hoje só em Ajustes › Minhas rotas). |

**Peça pronta que barateia tudo:** `rota/planejar|iniciar` já aceitam `deliveryIds` (subconjunto)
+ `ordemManual`. Faltando só "materializar a lista do modelo", o resto do trem já anda.

## DECISÃO DE PRODUTO (default do plano — dono pode vetar)
**(a) Puxar os produtos recorrentes do cliente** (`ClienteProduto` ativos, ignorando dia/vencimento):
qtd = `qtdPadrao`, valor = `resolveValorUnit` (precoAcordado > preço do produto).
**Fallback:** cliente sem vínculo ativo → entrega SEM itens, valor 0 (motorista edita na hora —
edição de itens/preço por entrega já existe desde PR18072026). NÃO avança `proximaData`
(rodar rota salva não pode mexer no calendário da recorrência).

---

## F1 — Desacoplar do dia (barato, sem decisão pendente)

### W1-F1 Backend (publicar ANTES do APK)
- `FinalizarLeituraDto.diaSemana` → `@IsOptional()`; `finalizar()` aceita ausente → grava null.
  APK velho continua mandando 1–7 → segue aceito (compat).
- Nome default quando vazio: deixa de ser `diaLabel` → "Rota {dd/mm}" (mantém `assertNomeUnico`).

### W2-F1 App (EntregaShell app.js — exige rebuild APK)
- Finalizar Leitura/Manual: **matar** os passos `dia`/`dia-manual`; timeline → direto ao nome.
  `prepareLeituraNome`: candidato default "Rota {dd/mm}" (dedupe numérico já existe). Não enviar `diaSemana`.
- `dayOrderSavedModal`: remover rótulo do dia e o sort hoje-primeiro; linha = nome + "N parada(s)";
  **+ lixeira (admin)** reusando `delete-route-modelo` + confirmação. Atenção: linha hoje é `<button>`
  inteiro — virar container com botão-aplicar + botão-lixeira (button aninhado é inválido).
- `routeModelosModal` (Ajustes) já trata null ("Sem dia fixo") — não mexer.
- Toggle "Salvar como minha rota de {dia}" (memória de ORDEM do dia) **fica como está** — é feature
  irmã da recorrência, não da lista livre.

## F2 — Aplicar roda a LISTA EXATA (o fundo)

### W1-F2 Backend — `POST /logistica/rota-modelos/:id/gerar`
Materializa as entregas da lista do modelo (date opcional, default hoje). Para cada parada, na ordem:
1. Valida cliente/local da empresa (fail-closed; cliente excluído → pula + aviso).
2. **Idempotência igual ao `gerarDia`**: já existe Entrega (cliente, local, dia) → REUSA o id
   (não duplica com a recorrência; claim de cobrança idempotente por delivery ⇒ sem débito 2x).
3. Senão cria Entrega espelhando o shape do `gerarDia` (contatoId resolvido, escalares coerentes,
   `cobrancaStatus:'pendente'`), com itens da decisão (a) + fallback vazio. `origem:'avulsa'`
   (não criar 3º valor de origem — consumidores de `origem` não são tocados).
4. **NÃO** debita crédito na criação (espelha gerarDia; cobrança segue na rota).
5. **NÃO** avança `proximaData` de nenhum vínculo.
Retorna `{ deliveryIds (na ordem do modelo), avisos[] }`.
Nota: isto NÃO reabre o item 8 cortado do PR20072026 (materializar no FINALIZAR da leitura segue
morto; aqui materializa no APLICAR, que é o pedido novo).

### W2-F2 App — `apply-route-modelo` reescrito
- Chama o `/gerar` do modelo → recebe `deliveryIds` ordenados.
- `setRouteSelection(deliveryIds)` + `setRouteOrdemManual(deliveryIds)` → `rota/planejar` (mode plan)
  ou `iniciar` com `deliveryIds + ordemManual` (mesmo padrão do override manual do `beginManagedRoute`).
- Sem dependência da prévia do dia (adeus descarte de cliente fora da agenda).
- Avisos do backend viram toast ("2 clientes pulados: conta excluída").

## Ordem de deploy (dura)
1. Backend F1+F2 → `npm run publish` (dono).
2. Rebuild APK + instalar no moto g15 (app velho continua funcionando no meio-tempo).

## Testes mínimos
- Backend: finalizar sem `diaSemana` (novo) e com (compat APK velho); `/gerar` — cliente com vínculo,
  sem vínculo (entrega vazia), cliente já agendado hoje (reusa id, sem duplicar), cliente de outra
  empresa (pula+aviso), `proximaData` intocada, rodar 2× no mesmo dia (idempotente).
- E2E VPS (empresa 5): salvar rota manual sem dia → aparecer em Salvos sem rótulo → aplicar num dia
  em que os clientes NÃO estão agendados → rota roda com todos, itens "de sempre" → cobrança 1x.
- Excluir em Salvos (admin) + confirmar que não-admin não vê lixeira.

## Riscos
- Débito 2x conhecido de "limpar+regerar dia" (PR18072026) NÃO é ampliado — idempotência reusa entrega.
- Entrega materializada e rota não iniciada fica `agendada` (mesmo comportamento do gerar-dia; "Limpar dia" resolve).
- Encerrar rota: abertas → pendência (fluxo PR17072026 intocado).
