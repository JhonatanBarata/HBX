# PR04082026-BALCAO-DISTRIBUIDORA — frente de caixa do balcão (modo balcão da vertical)

Origem: pedido do dono 04/08 ("painel, frente de caixa, integração com maquininha").
Brainstorm fechado no chat: **NÃO é PDV genérico pra loja/mercadinho** (oceano vermelho —
Stone/PagBank/MP dão PDV grátis subsidiado pelo MDR; preço de referência R$0–60) — **É o MODO
BALCÃO da vertical distribuidora** (água/gás/bebidas/depósito), a perna que faltava no pitch
"a empresa inteira num sistema". Dono confirmou o corte em 04/08. Método fable.md (cena, não fase).

---

## 0. Decisões CRAVADAS (não reabrir sem o dono)

1. **Escopo = balcão da distribuidora, não PDV de varejo.** Sem balança, sem gaveta, sem
   sangria na v1. Produto único (1–5 SKUs) — botões grandes por produto.
2. **CÓDIGO DE BARRAS SIM** (correção do dono 04/08: "até a distribuidora fedida da esquina
   tem o Bip"):
   - `EstoqueProduto.gtin` (EAN, `@@unique [companyId, gtin]`) — **tratar SEMPRE como STRING**
     (EAN tem zero à esquerda; virar número corrompe o código).
   - Leitor USB/Bluetooth funciona como TECLADO (keyboard wedge): o bip "digita" os números
     + Enter. A tela escuta — **zero driver, zero app, qualquer leitor de R$80 serve**.
   - Cadastro de produto: campo "Código de barras" preenchível BIPANDO (foca o campo e bipa).
   - Venda: bip acha o produto pelo GTIN e soma 1 unidade; botões grandes CONTINUAM
     (bip e botão convivem — galão retornável às vezes não tem etiqueta).
   - **Entrada por XML = PRÉ-CADASTRO pela nota (refino do dono 04/08 — "passa a nota apenas
     com pré cadastro"):** parser passa a ler o `cEAN` de cada item. Item cujo EAN casa com
     `gtin` existente → entra SOZINHO (match exato, antes do match por NCM/nome). Item novo →
     a conferência já vem com o cadastro PRONTO (nome do `xProd`, unidade do `uCom`, NCM, EAN)
     — um clique confirma e o produto NASCE amarrado ao bip. Cadastrar produto na mão vira
     exceção, não regra — o caminho normal é: chegou mercadoria, passou a nota, estoque
     cadastrado e bipável. Zera o erro de digitação de código.
     ⚠️ HOJE o parser NÃO lê cEAN (conferido 04/08) — é trabalho novo do B1.
     ⚠️ `cEAN` pode vir com o literal `"SEM GTIN"` (produto sem código de barras) → tratar
     como vazio, nunca gravar essa string como gtin.
     ⚠️ O XML traz preço de COMPRA (`vUnCom`), não de venda — o pré-cadastro nasce SEM preço
     de venda (dono põe a margem dele); o balcão avisa "produto sem preço" na hora de vender.
3. **Reuso máximo do que está no ar:** baixa da venda = movimento `SAIDA_EMISSAO` (já existe
   no motor do estoque, esperando exatamente isso); cliente vem da base; FIADO vira cobrança
   no financeiro existente; comprovante SEM VALOR FISCAL reusa o padrão da F2a.
4. **Preço:** `EstoqueProduto.precoBalcaoCents?` + fallback pro preço do Product da logística
   vinculado (estoque hoje só controla QUANTIDADE — preço entra agora, junto com o balcão).
5. **Tela própria `/balcao`** — frente de caixa é tela de OPERAÇÃO contínua: cheia, densa,
   teclado-first (bip, atalhos, Enter finaliza). Tokens hbx-theme centrais, zero hex solto.
6. **GATE DURO herdado:** balcão só liga com `estoqueAtivo=true` (venda dá baixa; sem estoque
   ligado não existe balcão — mesma lei da NF-e de produto).
7. **Maquininha — 2 mundos, decisão clara:**
   - **TEF de cabo (SiTef/PayGo): FORA.** Certificação + custo + suporte não pagam a v1.
     Moradia na seção 4 (só se cliente grande exigir).
   - **Smart POS via API na nuvem: DENTRO (B2).** Adapter `pagamento-presencial.adapter.ts`
     com stub honesto `NAO_CONTRATADO` (nossa gramática de sempre). 1ª integração sugerida:
     **Mercado Pago Point** (cria a cobrança → aparece na maquininha → webhook confirma;
     MP já é LIVE na casa) — ⬜ confirmação do dono. Stone Connect/PagBank entram pelo
     mesmo adapter depois.
8. **Pagamentos da v1 SEM integração nenhuma:** `DINHEIRO | PIX | CARTAO | FIADO`.
   Cartão não-integrado = digita na maquininha e registra a forma no HBX (como 90% dos
   pequenos operam). Pix v1 = QR/chave estática do tenant na tela; dinâmico é B2.
   FIADO exige cliente da base → gera cobrança no financeiro.
9. **NFC-e do balcão = B3, gated no provedor (F2b).** Mesmo contrato: Focus Retail R$59,90
   já inclui 500 NFC-e/mês — o balcão fiscal já estava precificado. CSC é da NFC-e 65
   (pegadinha mapeada no CNPJ.md). Até lá a v1 emite comprovante SEM VALOR FISCAL
   (rodapé padrão F2a).
10. **Impressão v1 = navegador/PDF + WhatsApp.** Térmica ESC/POS = moradia (se tenant pedir).
11. **Leis herdadas:** multi-tenant (nada atravessa empresa) · código financeiro = eu edito +
    verificação adversarial antes do publish · cancelamento com rito e rastro (nunca apagar) ·
    entregar LIGADO (gate natural = estoque ativo + produto com preço) · IA nunca calcula imposto.
12. **DOIS MODOS + RITO DE ATIVAÇÃO (3ª rodada do dono, 04/08 — aprovado a+b):**
    - Nomes: **"HBX Comum"** (padrão) × **"HBX Gestão Fiscal"** (avançado). NUNCA usar a
      palavra "Simples" pra modo — colide com Simples Nacional na cabeça do cliente.
    - **Nomenclatura (4ª rodada do dono, 04/08): o módulo chama ESTOQUE; DENTRO dele moram
      os produtos.** (O rename pra "Produtos" foi feito e DESFEITO a pedido — o título do
      bloco é Estoque; produto é o item do cadastro lá dentro.) O ponto conceitual fica:
      **unificação dos DOIS cadastros de produto (Product da logística × EstoqueProduto) é
      FASE PRÓPRIA com pesquisa profunda** — cirurgia de coração, não se faz no braço quente
      (rota/entrega/carga usam o Product em produção).
    - **Rito de ativação (ordem EXATA do dono):** ① AVISO da irreversibilidade → ② POLÍTICA
      nova versionada explicando o modo (sem enfeitar, resumida, protege o HBX pela lei;
      aceite gravado com usuário/data/versão) → ③ **EXIGIR E CONFERIR CNPJ** (dígito
      verificador de verdade + base RFB 28M: situação precisa ser ATIVA; coisa que o HBX
      Comum não faz) → ④ dados PUXADOS e mostrados (razão social, CNAE, porte, natureza,
      Simples/MEI → sugere CRT, abertura, endereço) + menu do TIPO DE EMPRESA
      (água/gás/bebidas/depósito/outro) → ⑤ ativa o modo, com trilha.
    - **TRAVA IRREVERSÍVEL:** existiu lançamento (movimento de estoque OU XML de compra) →
      o modo NUNCA mais desliga (o histórico é parte da escrituração — desligar destruiria a
      defesa contra presunção de omissão de entrada). Virgem (zero lançamento) → pode desligar.
      Ligar por fora do rito (PUT perfil) = recusado.
    - CNPJ não encontrado na base local: NÃO bloqueia (base pode estar defasada; empresa
      recém-aberta) — ativa COM aviso gravado no perfil e na trilha.

---

## 1. CENA (aceite = LIGADO? MOSTRA? Teste que GRITA?)

> Cliente entra no depósito → atendente abre `/balcao` → **BIPA** o galão (ou toca no botão
> grande) → quantidade ajusta na tela → escolhe DINHEIRO / PIX / CARTÃO / FIADO (fiado pede
> o cliente da base) → **FINALIZAR** → estoque baixa NA HORA (Disponível cai, Faturado sobe),
> venda entra no financeiro, comprovante sem valor fiscal sai (imprimir/Whats). No fechamento
> do mês, as vendas de balcão aparecem ao lado das entregas.

**Prova:** venda completa no Chrome com EAN bipado/digitado + saldo conferido no bloco Estoque
do /fiscal + fiado virando cobrança visível no financeiro + comprovante com rodapé sem valor fiscal.

## 2. Schema Prisma (ADITIVO PURO)

> ⚠️ `migrate dev` quebrado → `db execute` + `migrate resolve` (prod: `migrate deploy`).

```
EstoqueProduto   += gtin String?  @@unique([companyId, gtin]) · precoBalcaoCents Int?
BalcaoVenda      id, companyId, clienteId?, byUserId, pagamento 'DINHEIRO'|'PIX'|'CARTAO'|'FIADO',
                 totalCents, status 'CONCLUIDA'|'CANCELADA', canceladaEm?, canceladaPorId?,
                 motivoCancelamento?, financeChargeId? (fiado), createdAt
BalcaoVendaItem  id, vendaId, produtoId, quantidade, precoCents, subtotalCents
EstoqueMovimento += refVendaId?  — dedup @@unique([companyId, tipo, refVendaId, produtoId])
                 (cancelar venda = REVERSA_CANCELAMENTO com rastro, nunca apagar)
```

## 3. Fatias (cada uma = cena parcial VISÍVEL; commit local ao fechar)

| Fatia | Entrega visível | Gate |
|---|---|---|
| **B0** | **A CHAVE BEM FEITA (decisão 12):** wizard de ativação do modo HBX Gestão Fiscal (aviso → política com aceite → CNPJ com DV + conferido na RFB + dados puxados → tipo de empresa → ativar com trilha) + trava irreversível pós-lançamento + rename Estoque→Produtos na UI | nenhum |
| **B1** ✅ 04/08 | Tela `/balcao` completa: bip (GTIN) + botões grandes + carrinho + 4 formas de pagamento + baixa `SAIDA_EMISSAO` + fiado→financeiro + comprovante F2a + cancelamento com rito. Cadastro de produto ganha código de barras (bipável) e preço. **Entrada por XML vira PRÉ-CADASTRO**: parser lê `cEAN`, EAN conhecido entra sozinho, item novo confirma com 1 clique e nasce amarrado ao bip. | EXECUTADA: testes 180/180 (11 do balcão: preço do servidor, agregação, travar×avisar, fiado com teto limiteFiado, idempotência do clique, rito do cancelar, multi-tenant, cEAN/SEM GTIN, GTIN primeiro no preview). PROVADA no Chrome: EAN digitado como bip → carrinho → Dinheiro → venda R$15 concluída, Disp. 100→99, caixa do dia; cancelar com motivo → reversa 99→100, selo Cancelada. Fiado/comprovante provados por teste (charge ONCE/MANUAL + render F2a reusado). |
| **B2** | Pix dinâmico + maquininha smart POS pelo adapter (stub `NAO_CONTRATADO` no ar desde o B1; 1ª real: MP Point — cobrança aparece na maquininha, webhook confirma na tela) | ⬜ dono confirma MP Point; conta MP do tenant |
| **B3** | NFC-e da venda de balcão (nota-a-nota, o modo varejo que já tinha moradia no plano fiscal) | 🔒 F2b — provedor |

## 3b. REVISÃO DO CICLO DO ESTOQUE (pedido do dono 04/08 — "estamos assim?")

Verificado NO CÓDIGO (logistica-estoque.service.ts + estoque.service.ts). Estado REAL:

| O que o dono descreveu | Hoje | Onde |
|---|---|---|
| Balcão dá baixa NA HORA | ✅ SIM | B1 — `SAIDA_EMISSAO` na venda |
| .apk reserva ao CRIAR A ROTA | ❌ NÃO — a reserva é na **DECLARAÇÃO DA CARGA** (tela "estoque de carga": "carregou X no caminhão", ação manual, plano Advanced+) | `declararCarga` → `reservarCargaDia` |
| Libera a reserva ao CANCELAR A ROTA | ❌ NÃO — a liberação é na **CONFERÊNCIA DO RETORNO** (fim do dia) e na redeclaração; cancelar rota não mexe em estoque | `conferirRetorno` → `liberarCargaDia` |
| Baixa no reservado ao ENTREGAR | ✅ SIM | entrega confirmada → `BAIXA_ENTREGA` com a ref da carga (sai da "gaveta" da reserva do dia) |

**Fatia B4 — RESERVA AMARRADA AO CICLO DA ROTA — ✅ EXECUTADA 05/08:**

Decisão do dono (05/08, no chat): *"ao sair na rota, reserva — a loja NÃO vende o que está
com o motorista; se está reservado pelo motorista, TRAVA e dá problema no caixa"* +
momento = **ao INICIAR** (não ao planejar). Desenho aprovado: rota preenche, contagem manda.

- **Fonte única = a GAVETA DO DIA é uma só** (`LogisticaCargaDia` + coluna nova `origem
  MANUAL|ROTA`). `iniciarRota`/`encerrarRota` chamam UMA reconciliação
  (`reconciliarReservaRota`) que recalcula o alvo da gaveta a partir da VERDADE do banco:
  `alvo = vendido do dia + previsto das paradas abertas em rota` (mesmo sinal
  `estavaNaRota` do encerrar). Dupla reserva morre por construção; replanejar/2ª leva
  convergem (reconciliação por delta já era idempotente); multi-caminhão soma na mesma gaveta.
- **Quem declarou manda:** gaveta `MANUAL` (contagem física — caminhão muitas vezes leva
  MAIS que o previsto) NUNCA é sobrescrita pela rota; redeclarar na tela é TAKEOVER
  (gaveta `ROTA` vira `MANUAL`). `CONFERIDA` é imutável.
- **Encerrar rota devolve sozinho:** paradas voltam pra pendência → previsto cai → a
  reconciliação libera o remanescente (gaveta ROTA). Gaveta MANUAL continua fechando SÓ
  na conferência do retorno ("bateu/sobrou/faltou" — snapshot imutável, intocado).
- **Entrega confirmada → baixa** (já existia, intocada — desconta da gaveta pela ref).
- **BALCÃO TRAVA SEMPRE por reserva** (a cena do dono): falta causada por RESERVA (tem
  físico, mas o galão está no caminhão) recusa a venda INDEPENDENTE do `estoqueNegativo`;
  a config travar/avisar continua valendo só pra falta FÍSICA (inventário furado).
- Gates: reserva automática só com `estoqueAtivo` (Gestão Fiscal); SEM gate de nível
  (a TELA de carga é Advanced+, a reserva da rota é de todo mundo). Best-effort COM VOZ
  na rota (falha de estoque nunca derruba iniciar/encerrar, mas loga — lição CNEFE).
- Migration aditiva `20260805130000_logistica_carga_origem_b4`.
- ⚠️ Moradia (edge não coberto): declaração manual COM `entregadorId` (a tela hoje nem
  manda) cria gaveta própria fora da reconciliação da rota — se o multi-caminhão real
  chegar, revisitar a chave da gaveta.

## 4b. APP INSTALÁVEL DO BALCÃO — .exe (pedido do dono 04/08; irmão do .apk)

> "o app vai ter q ser empacotado tudo q vai ser necessário para usar o HBX pelo .exe"

**Fatia B5 — HBX Desktop (.exe):** mesmo desenho do .apk (casca que carrega o HBX
hospedado), empacotado pra Windows:
- Wrapper desktop (decisão técnica Electron × Tauri — recomendação na hora de executar;
  Tauri = binário menor/menos RAM, Electron = auto-update maduro/ecossistema) apontando
  pro HBX; abre DIRETO no /balcao (modo caixa), com a casa toda acessível.
- O que o .exe dá que o navegador não dá: atalho na área de trabalho + abrir no boot,
  tela cheia/kiosk (caixa não "perde" a aba), leitor de código de barras sempre capturado,
  e a PORTA pra impressão térmica silenciosa (ESC/POS — a moradia da térmica muda pra cá).
- Auto-update (o publish do HBX já atualiza o web; o wrapper se atualiza sozinho —
  padrão electron-updater/tauri-updater).
- 🔒 GATES do dono: certificado de code-signing Windows (sem assinar, SmartScreen
  assusta o cliente — custo anual, decisão de compra) · instalador hospedado onde
  (site/painel).
- Entrega em 2 passos: B5a = wrapper funcional sem assinatura (uso interno/beta);
  B5b = assinado + auto-update + página de download.

## 4. Pendências COM MORADIA (lei: sem moradia = nunca)

- ~~B4 — reserva amarrada ao ciclo da ROTA~~ — ✅ executada 05/08 (seção 3b; decisão do
  dono cravada: reserva ao INICIAR + balcão TRAVA o reservado).
- **B5 — HBX Desktop .exe** (seção 4b) — 🔒 gates: code-signing + onde hospedar o instalador.
- **UNIFICAÇÃO Product×EstoqueProduto → cadastro único "Produtos"** (pilar 1 da decisão 12) —
  fase própria com pesquisa profunda + plano dedicado ANTES de codar; a logística usa o
  Product dela em rota/entrega/carga em produção — migração tem que ser aditiva e por etapas.
- **TEF de cabo** (SiTef/PayGo) — só se cliente grande exigir; até lá, smart POS cobre.
- **Impressora térmica ESC/POS** — moradia mudou pro B5 (.exe imprime silencioso); até lá,
  v1 imprime do navegador/manda no Whats.
- **Caixa por operador** (abertura/fechamento/sangria) — quando houver tenant com 2+ atendentes.
- **Multi-balcão simultâneo** — junto com caixa por operador.

## 5. Decisões pendentes do DONO
- ⬜ MP Point como 1ª maquininha integrada (recomendo: MP já é LIVE na casa, API na nuvem, sem TEF).
- ⬜ Empacotamento: balcão dentro do plano padrão ou add-on (decisão comercial no /master).

## 6. Armadilhas conhecidas
- EAN é STRING (zero à esquerda) — nunca Number() no GTIN.
- `cEAN = "SEM GTIN"` (literal do layout da NF-e) → é AUSÊNCIA de código, tratar como null.
- Preço de venda NÃO vem no XML da compra (só o de custo) — pré-cadastro sem preço + aviso no balcão.
- Leitor manda sufixo Enter (às vezes Tab) — listener da tela trata os dois.
- Bip só entra com a tela focada — listener global no `/balcao`, não input escondido.
- Fuso: venda entra na competência do dia LOCAL do tenant (container UTC × dono -03).
- Contraste se mede nos 2 modos; check-pele (zero hex solto).
- Multi-tenant: TODA query com companyId.
