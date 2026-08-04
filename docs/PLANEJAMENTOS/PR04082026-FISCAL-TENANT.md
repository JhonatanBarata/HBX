# PR04082026-FISCAL-TENANT — Módulo Fiscal do tenant (NFS-e grátis → NF-e produto → estoque)

Brainstorm fechado com o dono em 04/08/2026 (chat). Este arquivo é o plano executável.
Método: fable.md (Encomenda com Foto) — progresso se mede por CENA funcionando, não por fase técnica.

---

## 0. Decisões CRAVADAS no brainstorm (não reabrir sem o dono)

1. **Módulo novo `backend/src/fiscal/`** — do TENANT. O `contabil/` é o robô contador do DONO
   (/master) e **não é tocado**; o fiscal REUSA por import: `contabil-vault.util.ts` (cofre
   AES-256-GCM), `nfse-national.client.ts` (já paramétrico: `DpsInput` recebe prestador/tomador/
   serviço — serve o tenant sem mudança), padrão do `nfse-cert.service.ts` (extração PEM) e o
   padrão de disjuntor do `nfse-emitter.service.ts`.
2. **Frontend: NÃO nasce módulo "Faturamento"** — emissão mora no fluxo que já existe
   (fechamento do financeiro/logística "pula pro fiscal") + 1 tela de configuração fiscal.
3. **NFS-e = emissão AVULSA** (não depende de OS): CNPJ do tomador auto-preenche da base RFB
   (28M, já dentro do HBX), serviço vem de catálogo do tenant (montado 1× com o contador), valor,
   Emitir. Direto na **API nacional Sefin — gratuita** (`sefin.nfse.gov.br`, restrita p/ teste).
4. **Rollout por CIDADE = allowlist** (`FiscalMunicipio`), NÃO integração por cidade — a API
   nacional é UMA pra todos os municípios (nota carrega IBGE). Cidade nova = validar 1 nota em
   produção-restrita → ligar. **Rio Claro/SP (IBGE 3543907) primeiro.** Zero integração GINFES
   (prédio condenado: CGSN 189/2026 obriga Simples no Emissor Nacional a partir de 01/09/2026).
5. **Adapter com tomada pronta pro PAGO**: interface de emissor com 2 rotas — `NACIONAL_DIRETO`
   (grátis, nosso código) e `PROVEDOR` (Focus/PlugNotas; stub "NÃO CONTRATADO" até precisar).
   Roteamento por município/empresa: cidade problemática migra pro provedor por CONFIG, sem código.
6. **F2 água (produto):** comprovante **sem valor fiscal** na entrega (Whats/e-mail se o cliente
   final pedir) + **NF-e mensal consolidada no fechamento** com os dias entregues. Config POR
   EMPRESA: `fechamento | entrega`. Opcional ligável: **NF-e de remessa diária da carga do
   caminhão** (gerada da conferência de carga que já existe — rota 3 níveis F2) — CFOPs exatos
   validados pelo contador do tenant antes de ligar. NF-e/NFC-e via PROVEDOR (não construir stack
   SEFAZ na mão).
7. **F3 estoque: só revendedora de produto único (1–5 SKUs).** HBX controla QUANTIDADE
   (entrou/saiu/sobrou); contabilidade é do contador do cliente — linha que nunca atravessamos.
   Entrada por upload do XML da nota de compra (v2: Distribuição DF-e automática). Emissão com
   estoque negativo AVISA forte, não trava (trava opcional na config).
   **REFINO DO DONO (04/08, 2ª rodada):**
   - **GATE DURO: sem controle de estoque ativo → SEM emissão de NF-e de produto.** Estoque é
     toggle Sim/Não por empresa, mas quem quer nota de produto é obrigado a ligar (a baixa
     precisa de saldo tangível — "você está dando baixa em produto que não está no sistema").
   - **3 estados de saldo:** `Disponível` (ninguém deu claim) → `Reservado` (motorista/vendedor
     reservou — o claim da carga do caminhão) → `Faturado` (já foi — baixa definitiva).
   - **A baixa definitiva acontece quando o MOTORISTA CONCLUI a entrega e CONFIRMA qual
     produto** — não na emissão da nota. A NF-e do fechamento CONCILIA o que já foi baixado
     nas entregas do mês (estado Faturado ↔ itens da nota).
   Racional fiscal: SEFAZ não confere estoque ao autorizar, mas o cruzamento compra×venda
   ("estouro de estoque") gera presunção de omissão de entrada — entrada controlada blinda.
8. **OS (ordem de serviço): gatilho = 3º cliente de manutenção** → sobe pra fila de construção.
   O pipeline já nasce com `origem` (`AVULSA | FECHAMENTO | ENTREGA | OS`) pra OS plugar sem reforma.
   **REFINO DO DONO:** OS é toggle Sim/Não por empresa — e a NFS-e avulsa **emite de qualquer
   jeito**, com OS ligada ou desligada (o contrário do gate do estoque: serviço não tem baixa
   física, nota avulsa nunca depende de controle operacional).
9. **Leis herdadas:** copiloto-não-piloto (sistema NUNCA transmite sozinho — clique do dono do
   tenant); IA nunca calcula imposto (perfil fiscal = tabela curada + contador); multi-tenant
   (nada atravessa empresa); código financeiro/fiscal = eu edito + **verificação adversarial
   independente antes de publicar**; cancelamento de nota segue rito legal com rastro — nada de
   apagar/esconder.

---

## 1. CENAS (aceite = as 3 perguntas: LIGADO? MOSTRA a cena? Teste que GRITA?)

### CENA F1 — NFS-e avulsa (Rio Claro)
> Tenant prestador de serviço clica "Emitir nota de serviço" → digita CNPJ da empresa X (razão
> social/endereço/município auto-preenchem da RFB) → escolhe serviço Y do catálogo → valor →
> **Emitir** → nota volta **AUTORIZADA** na tela com **PDF + XML** → tomador recebe por e-mail
> automático (se o tenant optou) e/ou WhatsApp. Os 2 dias de digitação viram 30 segundos.

**Prova:** 3 notas em produção-restrita mostradas na tela (PDF+XML baixáveis) + depois 1 nota
REAL do cliente de Rio Claro conferida no portal gov.br/nfse.
**Gates do dono:** print/PDF de uma nota atual do cliente (gabarito de enquadramento) antes de
cravar o catálogo; certificado A1 (.pfx+senha) do tenant para a nota real.

### CENA F2 — Água (NF-e produto)
> Entrega confirmada na rota gera **comprovante sem valor fiscal** (Whats/e-mail opcional) →
> no fechamento do mês a tela lista a NF-e consolidada por cliente mensal com os dias entregues →
> dono do tenant clica "Emitir todas" → notas autorizadas com DANFE em PDF → cliente final recebe
> no WhatsApp. Config da empresa escolhe `fechamento × entrega`; remessa diária opcional.

**Prova:** comprovante chegando no Whats + NF-e autorizada em HOMOLOGAÇÃO do provedor na tela.
**Gates do dono:** contratação do provedor (Focus cotado: Retail R$59,90/mês, 500 NFC-e + 100
NF-e, exc. R$0,05; Retail+ R$629,90 multi-CNPJ ilimitado); CFOP de remessa validado com contador.

### CENA F3 — Estoque produto único (pré-requisito da NF-e de produto)
> Tenant liga o estoque na config (sem isso, NF-e de produto nem aparece) → sobe o XML da nota
> de compra → entrada lança sozinha → a tela mostra os 3 saldos: **Disponível / Reservado /
> Faturado** → motorista monta a carga = RESERVA → motorista conclui a entrega e CONFIRMA o
> produto = BAIXA (vira Faturado) → NF-e do fechamento concilia os Faturados do mês → devolução
> devolve saldo → cancelamento reverte → **perda dá baixa com motivo** (quebrou, venceu,
> extraviou) → **inventário**: digita a contagem física e o sistema acerta o saldo lançando a
> diferença → negativo AVISA (ou trava, se configurado).

**Prova:** ciclo completo na tela: XML sobe → Disponível; carga → Reservado; entrega confirmada
→ Faturado; fechamento emite conciliando; cancela → reverte; perda baixa com motivo; inventário
acerta pela contagem.

---

## 2. Schema Prisma (ADITIVO PURO — prefixo Fiscal*/Estoque*)

> ⚠️ `prisma migrate dev` está QUEBRADO no repo (shadow-DB) — aplicar via `db execute` +
> `migrate resolve` (prod usa `migrate deploy`). Ver BACKEND.md.

```
FiscalTenantProfile   companyId Int @unique — NÃO é singleton (diferença central do FiscalProfile
                      do contabil). cnpj, razaoSocial, inscricaoMunicipal?, inscricaoEstadual?,
                      regimeCrt Int (1=Simples), municipioIbge String, ambiente 'restrita'|'producao',
                      certA1Encrypted?, certA1ExpiresAt?, serieDps @default("1"),
                      proximoNumeroDps Int @default(1)  // numeração: incremento DENTRO de transação
                      escopoServico Bool, escopoProduto Bool,
                      modoEmissaoProduto 'fechamento'|'entrega' @default('fechamento'),
                      emailAutoEnvio Bool @default(false), whatsAutoEnvio Bool @default(false),
                      estoqueAtivo Bool @default(false), estoqueNegativo 'avisar'|'travar' @default('avisar')

FiscalServicoCatalogo id, companyId, descricao, codigoTributacaoNacional ('XX.XX' LC116),
                      cnae (7 díg), aliquotaIss Float?, issRetido Bool @default(false), ativo Bool
                      // seed vazio; tela de config cria; curadoria ajuda, contador confirma

FiscalDocumento       id, companyId, tipo 'NFSE'|'NFE'|'NFCE'|'NFE_REMESSA',
                      origem 'AVULSA'|'FECHAMENTO'|'ENTREGA'|'OS',
                      originKey String @unique  // idempotência: 'avulsa:<cuid>' |
                                                // 'fechamento:<financeiroChargeId>' | 'remessa:<data>:<veiculo>'
                      status 'PENDENTE'|'AUTORIZADA'|'REJEITADA'|'CANCELADA'|'ERRO',
                      tomadorDoc?, tomadorNome?, tomadorEmail? (snapshots),
                      valorCents Int, chaveAcesso? @unique, serie?, numero?,
                      xmlGzB64?, pdfPath? (disco, padrão FiscalComprovante), erroMsg?, tentativas Int,
                      emissorRota 'NACIONAL_DIRETO'|'PROVEDOR', emitidaEm?, canceladaEm?, motivoCancelamento?
                      @@index([companyId, status]) @@index([companyId, createdAt])

FiscalMunicipio       ibge @unique, nome, uf, rotaNfse 'NACIONAL_DIRETO'|'PROVEDOR',
                      status 'HOMOLOGADO'|'EM_VALIDACAO'|'BLOQUEADO', obs?
                      // seed: Rio Claro/SP 3543907, EM_VALIDACAO → HOMOLOGADO após 3 notas restrita

EstoqueProduto        id, companyId, nome, unidade, ncm, cest?, cfopSaida?, csosn?, ativo Bool
                      // saldos DERIVADOS (SUM de movimentos) — nunca coluna editável.
                      // 3 estados: Disponível | Reservado (claim motorista/vendedor) | Faturado
EstoqueMovimento      id, companyId, produtoId, tipo 'ENTRADA_XML'|'ENTRADA_MANUAL'|
                      'RESERVA'|'LIBERA_RESERVA'|        // claim/desistência (carga do caminhão)
                      'BAIXA_ENTREGA'|                   // motorista concluiu E confirmou o produto
                      'SAIDA_EMISSAO'|                   // venda avulsa sem entrega (balcão)
                      'PERDA'|                           // baixa por perda (quebra/validade/extravio) — motivo OBRIGATÓRIO
                      'INVENTARIO'|                      // acerto pela CONTAGEM FÍSICA (tela de inventário lança a diferença)
                      'DEVOLUCAO'|'AJUSTE'|'REVERSA_CANCELAMENTO',
                      quantidade Float (sinal pelo tipo), refDocumentoId?, refEntregaId?,
                      refChaveNfe? (da compra), motivo? (obrigatório em AJUSTE), createdAt
                      @@unique([companyId, tipo, refChaveNfe, produtoId]) — XML da mesma compra 2× não duplica
                      // GATE DURO: FiscalTenantProfile.escopoProduto exige estoqueAtivo=true —
                      // sem estoque ligado não existe emissão de NF-e de produto.
                      // Fluxo físico: Disponível --RESERVA--> Reservado --BAIXA_ENTREGA--> Faturado;
                      // a NF-e do fechamento CONCILIA os Faturados do mês (não gera baixa nova).
                      // INVENTÁRIO (tela): tenant digita a contagem física por produto → sistema
                      // calcula a diferença vs saldo derivado e lança movimento INVENTARIO (+/-)
                      // com rastro. NUNCA edita saldo na mão — saldo segue 100% derivado.
                      // PERDA: baixa com motivo obrigatório e trilha (perda relevante tem
                      // tratamento fiscal próprio — contador do tenant orienta; nós damos o rastro).
```

## 3. Backend `src/fiscal/` (arquivos)

| Arquivo | Papel |
|---|---|
| `fiscal.module.ts` / `fiscal.controller.ts` | Rotas company-scoped; emissão/config = RolesGuard + @Admin |
| `fiscal-profile.service.ts` | Perfil + cofre (importa `contabil-vault.util`); upload .pfx multipart, senha via STDIN no openssl (padrão S6); obrigação sintética de renovação de cert |
| `emissor-adapter.ts` | Interfaces `EmissorNfse`/`EmissorNfe` + roteador (lê `FiscalMunicipio.rotaNfse` e config da empresa) |
| `nfse-tenant.service.ts` | Monta `DpsInput` do tenant → `NfseNationalClient` (reuso DIRETO) → `FiscalDocumento`; numeração transacional; retry máx 3; **disjuntor: 3 ERROs consecutivos POR EMPRESA pausam a fila + alerta** (padrão S6) |
| `nfse-pdf.util.ts` | DANFSe em PDF a partir do XML retornado (layout sóbrio próprio, v1) |
| `emissor-provedor.adapter.ts` | STUB honesto: implementa interface, responde erro claro "PROVEDOR_NAO_CONTRATADO" — a tomada da F2b |
| `fiscal-envio.service.ts` | E-mail (verificar transporte existente do e-mail comercial S6 LEAD-CENTRICO antes de criar novo) + WhatsApp via messaging existente. Envio é TRANSACIONAL (consequência de clique do dono) — não é disparo frio, não passa pela trava de horário de prospecção |
| `estoque.service.ts` | Movimentos + parser do XML de NF-e de compra (itens/qtd/NCM); mapeamento item-do-XML → EstoqueProduto com tela de conferência no primeiro upload |
| `comprovante-entrega.util.ts` | Comprovante SEM VALOR FISCAL (texto obrigatório no rodapé) da entrega |

Trilha: toda chamada externa loga em `FiscalAutomationLog` (modelo já existe; `sistema='NFSE_TENANT'`).
Sem flag OFF de feature (lei: entregar LIGADO) — o gate natural é onboarding: perfil fiscal completo
+ cert válido + município HOMOLOGADO. Ambiente `restrita|producao` é campo do perfil (empresa de
teste roda restrita; tenant real sobe pra producao no gate do cert).

## 4. Frontend (tokens hbx-theme centrais, zero hex solto — check-pele)

1. **Config fiscal** (tela nova nas configurações da empresa): dados fiscais, cofre do certificado
   (upload + validade + remover — padrão da seção cofre do contabil), catálogo de serviços,
   toggles (escopo, modo de emissão, e-mail/Whats auto, estoque, negativo avisar/travar).
2. **Emissão avulsa NFS-e**: botão + modal (CNPJ → auto-fill RFB; serviço; valor; e-mail tomador);
   lista de documentos com status/PDF/XML; cancelamento com motivo (rito legal).
3. **Fechamento** (logística `fecharMes` — logistica.service.ts:2219): após fechar, painel
   "Notas do mês" → "Emitir todas" (F2); estado por nota; reemissão de rejeitada.
4. **Estoque**: saldo por produto, extrato de movimentos, upload de XML, ajuste com motivo.

## 5. Ordem de construção (fatias = cenas parciais VISÍVEIS)

| Fatia | Entrega visível | Prova |
|---|---|---|
| **F1a** ✅ 04/08 | Schema + perfil + cofre + catálogo + tela config + emissão avulsa | EXECUTADA e provada AO VIVO no localhost (Chrome): perfil+Rio Claro salvos, serviço no catálogo, .pfx de teste no cofre (OpenSSL no container), emissão real na Sefin com cert não-ICP → ERRO 'timeout' limpo na tela + Reemitir, disjuntor pausou em 3 e rearmau pela tela, PDF 200 %PDF, numeração 1/1→1/4. Testes 114/114 (contabil+fiscal, NODE_ENV=test). Nota AUTORIZADA de verdade = F1c (cert ICP real, gate do dono). |
| **F1b** | E-mail/Whats opt-in + disjuntor + cancelamento | e-mail chega com PDF+XML; disjuntor testado |
| **F1c** | 🔒 GATE: cert A1 real + Rio Claro → producao | 1 nota real no portal gov.br/nfse |
| **F2a** | Comprovante sem valor fiscal na entrega + config fechamento×entrega | comprovante no Whats |
| **F2b** | 🔒 GATE: contratar provedor → adapter NF-e + emissão consolidada no fechamento | NF-e homologação do provedor na tela |
| **F2c** | Remessa diária opcional (da carga do caminhão) | 🔒 GATE: CFOP validado com contador |
| **F3** | Estoque completo (entrada XML, baixa, devolução, reversa, aviso) | ciclo completo na tela |

Cada fatia: commit local imediato ao fechar (publish só quando o dono mandar). F1a começa com o
teste da cena (fixture de DPS do tenant + transporte mockado — padrão `nfse-test-cert.fixture.ts`).

## 6. Pendências COM MORADIA (lei: "fica pra depois" sem moradia = nunca)

- **OS completa** — gatilho: 3º cliente de manutenção. Junta frota + CNPJ + catálogo + estoque;
  termina emitindo NFS-e (serviço) e NF-e (peças) pelo pipeline (`origem='OS'` já existe).
- **Distribuição DF-e automática** (entrada de estoque sem upload; serviço SEFAZ gratuito, usa o
  mesmo A1 do cofre) — v2 do estoque.
- **Vasilhame/comodato** (saldo de garrafão por cliente) — extensão do estoque p/ água.
- **NFC-e na entrega** (modo nota-a-nota de varejo) — se algum tenant pedir.
- **Retenções avançadas** (INSS/IRRF em NFS-e p/ tomador PJ) — v1 só ISS (retido ou não).

## 7. Armadilhas conhecidas (o porquê mora na memória/docs)

- `migrate dev` quebrado → `db execute` + `migrate resolve`.
- Fuso: competência/fechamento testar nos 3 fusos (container UTC × dono -03).
- Numeração DPS: sequencial POR TENANT, incremento dentro de transação (colisão = rejeição).
- Multi-tenant: TODA query com companyId; nada atravessa empresa.
- E-mail: conferir transporte existente antes de criar segundo caminho.
- Segredo NUNCA em log/response (cert/senha só no cofre; requestResumo sem dado sensível).
- Financeiro/fiscal: verificação adversarial independente ANTES do publish.
