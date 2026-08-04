# PR04082026-MORDER-O-CONTADOR — certificado no onboarding + o mensal do contador vira produto

Origem: ligação do dono com cliente real (distribuidora de água, paga R$160/mês de contador)
+ chat paralelo sobre emissão de certificado via API (TecnoSpeed/ACs). Este plano ENCAIXA os
dois no que já existe e crava o posicionamento de venda. Método fable.md (cena, não fase).

---

## 0. A DESCOBERTA QUE ANCORA O PLANO (verificada no código em 04/08)

O "contador de R$160/mês" JÁ ESTÁ ESCRITO NO REPO — para a empresa do DONO (contabil S1–S7):

| Peça | Arquivo | O que faz |
|---|---|---|
| Cliente Serpro Integra Contador | `contabil/serpro-integra.client.ts` | OAuth + as 4 operações PGDAS-D: **declarar a mensal, gerar o DAS (PDF), consultar declaração, extrato**. Opera por PROCURAÇÃO — sem contador no meio. Custo por chamada: ~R$0,40 declarar + R$0,32 DAS = **~R$0,72/mês por CNPJ** |
| Motor de cálculo | `contabil/fiscal-engine.service.ts` + `fiscal-tables.ts` | Simples determinístico c/ golden tests (RBT12, faixas, fator R) — hoje anexos III/V (serviço) |
| Livro caixa | `contabil/livro-caixa.service.ts` | Receita/despesa por competência + reconciliação caixa×notas |
| Obrigações | `contabil/obligation-scheduler.service.ts` | Calendário de obrigações com vencimento |
| Fechamento | `contabil/contabil-close.service.ts` | Fecha a competência com conferências |
| Wizard de transmissão | `contabil/serpro-autopost.service.ts` | ARMAR→confirmar→transmitir (copiloto, clique do dono) |

**Tenant-izar isso é o MESMO movimento da F1a** (que pegou o `nfse-national.client` do contabil
e virou o fiscal do tenant). O caminho está pavimentado e provado.

## 1. POSICIONAMENTO (decisão de rumo — pergunta principal do dono)

**Veredito: VERTICAL COMO CUNHA, CHASSI HORIZONTAL.** Não forkar o produto — forkar o PITCH.

- Horizontal puro (CRM+financeiro+logística genérico) = oceano vermelho: Bling/Tiny/Omie/Conta
  Azul com preço de guerra e marca. Não se ganha de frente.
- Vertical "distribuidora de produto repetitivo" (água → gás é a MESMA operação) = mercado
  fragmentado, atendido por sistemas fracos que só fazem rota/pedido — NENHUM tem
  zap-com-IA + rota + fiado + nota fiscal + estoque + CONTADOR EMBUTIDO. O HBX já é 80%
  esse ERP vertical; o que falta é EMPACOTAR e NOMEAR.
- Matemática da mordida: cliente hoje paga contador R$160/mês + (às vezes) sistema de rota
  R$100–200 + faz nota na mão. HBX a R$197–297/mês substitui os dois e ainda VENDE (IA no
  WhatsApp). O DAS via Serpro custa ~R$0,72/CNPJ/mês — margem de >99% no pedaço "contador".
- Os módulos continuam genéricos por baixo (multi-tenant, allowlist, adapters) — o segmento
  nº2 (gás/galão/bebidas) entra sem reforma.

**O que o contador FAZ pelos R$150–250/mês de uma distribuidora Simples sem CLT — e o corte:**
| Tarefa mensal | Quem fica |
|---|---|
| PGDAS-D + emitir DAS | 🥩 HBX (T2/T3) — é declaratório, a própria empresa pode |
| "Organizar as notas" (compras/vendas) | 🥩 HBX — malote + DF-e (já ✅ / T4) |
| Livro caixa | 🥩 HBX (T1) — deriva do financeiro que JÁ registra tudo |
| Lembrar prazos/guias | 🥩 HBX — obligation-scheduler tenant-izado |
| Pró-labore/INSS simples | 🥩 HBX (fase 2 — motor já calcula INSS) |
| Fechamento anual, balanço, responsabilidade técnica (CRC), folha CLT | 🤝 CONTADOR — exatamente o instinto do dono ("deixar só o fechamento"); base legal: LC 123 permite livro caixa no Simples |

## 2. FRENTE A — CERTIFICADO NO ONBOARDING (encaixe do chat paralelo)

Alinhamento com o que temos: ✅ total. `consultaCnpj` (RFB 28M) pronto; cofre A1 pronto;
`certA1ExpiresAt` no schema; padrão adapter+stub (PROVEDOR_NAO_CONTRATADO) é a nossa gramática.
**Correções ao texto do chat:** (a) M1 NÃO é pendência — chave própria `HBX_FISCAL_VAULT_KEY`
resolvida e injetada na VPS em 04/08; (b) concordo: NÃO é fonte de receita (R$3k/ano é ruído) —
é mata-gate + mata-objeção + dono da RENOVAÇÃO anual.

| Fatia | Entrega | Gate |
|---|---|---|
| A0 | 🔒 DONO: 3 ligações — TecnoSpeed (API), 1 AC direta (Soluti/Valid/Safeweb), SERPRO (Integra Contador produção). Perguntas da AC: preço atacado por faixa; "parceiro basta ou precisa ser AR credenciada pra usar a API?"; webhook de status?; lote/cupom antecipado?; videoconferência é do agente da AC? | dono |
| A1 | Onboarding fiscal ganha passo "Emitir meu certificado": `certificado-provider.adapter.ts` (stub CERTIFICADO_NAO_CONTRATADO), pré-preenche da RFB, tela de status/agendamento | — |
| A2 | 🔒 contrato: pedido+agendamento+webhook por API; .pfx baixa DIRETO pro cofre (fiscalVault, chave própria); semáforo fica verde sozinho | A0 |
| A3 | Renovação automática: vigia `certA1ExpiresAt` ≤30d → abre pedido de renovação + avisa (a obrigação sintética que hoje é só aviso na tela) | A2 |
| A4 | v2 nuvem (BirdID/VIDaaS…) — SÓ após validar com fornecedor que resolve o **mTLS** (assinar hash ≠ handshake TLS com a Sefin; pegadinha real). Até lá, .pfx é o caminho provado | A2 |

## 3. FRENTE B — O MENSAL DO CONTADOR VIRA PRODUTO (o prato principal)

| Fatia | Entrega (cena visível) | Gate |
|---|---|---|
| T1 | **Livro caixa do TENANT automático**: deriva de financeiro/logística (charges, fechamento) + fiscal (notas) por competência; aba na tela fiscal; malote passa a incluir o livro | — |
| T2 | **DAS pré-calculado na tela**: `fiscal-tables` ganha **Anexo I (comércio)** com golden tests; RBT12 da receita do tenant; card "Simples desta competência: R$X — confira com seu contador". Copiloto: MOSTRA, não transmite | — |
| T3 | **Declarar PGDAS-D + emitir DAS dentro do HBX** (1 clique do dono do tenant, wizard ARMAR igual S7): tenant-izar `serpro-integra.client` + autopost | 🔒 Serpro produção (A0) + procuração eletrônica do cliente (e-CAC, usa o e-CNPJ dele — o cert da Frente A!) |
| T4 | **DF-e Distribuição**: compras do CNPJ entram SOZINHAS no estoque (mesmo A1 do cofre) — mata "organizar notas" de vez (v2 do estoque, já tem moradia no plano fiscal) | cert real |
| T5 | **Modo "contador só no fechamento"**: pacote anual exportável + acesso convidado read-only pro contador do cliente | — (moradia) |

Leis que mandam aqui: IA nunca calcula imposto (o motor DETERMINÍSTICO calcula, com golden
tests — decisão 11); copiloto-não-piloto (transmitir = clique com confirmação); multi-tenant.

## 4. O PITCH DO CHIP (amanhã)

Não vender "sistema de logística". Vender a EMPRESA INTEIRA num sistema, pra distribuidora:
> "Pedido chega no seu WhatsApp e a IA atende. A rota sai pronta no celular do entregador.
> O fiado é controlado sozinho. A nota fiscal sai de dentro do sistema. O estoque se ajusta
> a cada entrega. E no fim do mês a guia do Simples e a pasta do contador estão prontas —
> você paga contador só pra FECHAR O ANO, não por mês."

Âncora de preço: contador R$160/mês + sistema de rota R$150/mês = R$310 que ele JÁ gasta.
HBX cobra menos que isso e faz mais. (T2/T3 podem entrar como plano "Fiscal+" — decisão
comercial do dono no /master.)

## 5. Ordem de execução sugerida (sem depender de gate nenhum)
T1 → T2 (Anexo I + card do DAS) → A1 (passo do certificado com stub) → [gates do dono: A0
ligações, procurações] → T3 → A2/A3 → T4. F1c (cert real do cliente Rio Claro) continua
sendo o destravador de TUDO que é live.

## 6. Decisões pendentes do DONO
- ⬜ A0: as 3 ligações (TecnoSpeed, AC, Serpro).
- ⬜ Preço/empacotamento: Fiscal+Contador embutido no plano ou add-on "Fiscal+"?
- ⬜ Nome da vertical pra venda (ex.: "HBX Distribuidora") — o produto não forka, o pitch sim.
