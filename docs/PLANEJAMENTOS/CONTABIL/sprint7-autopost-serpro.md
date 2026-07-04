# CONTABIL S7 — Autopost PGDAS-D + DAS via Serpro Integra Contador 🔒 GATE DONO

**Objetivo:** o passo 4 do wizard (S5) deixa de ser "abrir o site e digitar" e vira
**ARMAR → TRANSMITIR**: o app declara o PGDAS-D e baixa o DAS em PDF pela API oficial do Serpro.
O dono continua sendo o dedo no gatilho (Lei nº1) — só some a digitação.

**GATE:** dono contratar o Integra Contador na Loja Serpro
(https://loja.serpro.gov.br/integra-contador — login com e-CNPJ do S6; custo por chamada, tier 1
~R$ 0,40 declarar + R$ 0,32 gerar DAS ≈ **R$ 0,96/mês de uso completo** — mensalidade de contador
é ~300x isso). Credenciais (consumer key/secret) → cofre, mesmo esquema do S6.

## Referência técnica
- Docs: https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/
  (catálogo PGDAS-D: entregar declaração mensal, gerar DAS, consultar declarações/extrato;
  DEFIS; DCTFWeb; autenticação OAuth2 + certificado; o serviço opera por PROCURAÇÃO — a própria
  empresa autoriza a si mesma, sem terceiro).

## Entregas

### 1. `serpro-integra.client.ts`
- OAuth2 com credenciais do cofre; base URL por env `HBX_CONTABIL_SERPRO_ENV=demo|producao`
  (Serpro tem ambiente de demonstração — validar lá primeiro);
- Operações mínimas: `declararPgdasd(competencia, payload)`, `gerarDas(competencia)` (PDF base64),
  `consultarDeclaracao(competencia)`, `consultarExtratoDas(competencia)`;
- Flag mestre `HBX_CONTABIL_SERPRO_ENABLED` default OFF;
- Toda chamada → `FiscalAutomationLog` (modelo do S6) com `aprovadoPor = userId` do clique.

### 2. Wizard S5 turbinado (passo PGDAS-D)
- Com a flag ON, o cartão do PGDAS-D ganha o fluxo:
  1. **ARMAR** — mostra o payload EXATO que será enviado (receita, folha 12m, anexo, alíquota,
     DAS esperado) + custo da chamada ("esta transmissão custa ~R$ 0,72 de API"); dono revisa;
  2. **TRANSMITIR** — clique com confirmação ("digite TRANSMITIR") → declara + gera DAS →
     PDF anexado à obrigação, estado TRANSMITIDO automático com nº do recibo real;
  3. **Conferência automática:** `consultarDeclaracao` valida que o governo gravou o que enviamos
     e que o DAS oficial = nosso previsto (±R$ 1). Divergência → alerta vermelho + estado
     REVISAR (disjuntor, igual S5).
- Fallback permanente: se API falhar, o cartão degrada pro modo semi-auto do S5 (deep-link +
  marcar manual). O wizard NUNCA fica bloqueado por indisponibilidade do Serpro.

### 3. DEFIS assistida (anual)
- Janeiro–março: card DEFIS com os totais do ano prontos (receitas por mês, folha, distribuição
  de lucros do Livro Caixa) formatados na ordem das telas da DEFIS + deep-link. Transmissão via
  API só se trivial no catálogo contratado; senão fica semi-auto — decidir na execução e anotar.

### 4. eSocial/DCTFWeb — decisão registrada
- NÃO automatizar nesta fase (SOAP + eventos assinados + 1 sócio = custo/benefício ruim).
  O passo 3 do wizard permanece semi-auto. Reavaliar apenas se o Integra Contador expuser
  transmissão DCTFWeb simples no plano contratado (existe consulta/DARF no catálogo — se
  `gerarDarfInss` estiver disponível, incluir: DARF pronto em PDF vale muito e é só leitura).

## Roteiro de validação
1. Ambiente demo do Serpro: declarar competência fictícia + gerar DAS → PDF válido;
2. Produção, mês real, com o dono na tela: ARMAR → conferir payload contra o site do PGDAS-D
   aberto do lado (dupla checagem humana na primeira vez) → TRANSMITIR;
3. Conferir no portal do Simples Nacional que a declaração consta (fonte da verdade = governo);
4. Mês seguinte: fluxo normal sem dupla checagem.

## Aceite
- 1 competência real declarada + DAS baixado e pago via wizard, com trilha completa no
  FiscalAutomationLog e comprovantes anexados.
- Divergência simulada (payload adulterado em teste) → REVISAR + alerta.
- Fallback testado (flag OFF/erro de rede → modo semi-auto intacto).
- tsc + testes verdes.

## Guardrails
- **NUNCA transmitir sem o clique-com-confirmação** — nem por cron, nem por retry. Retry só de
  CONSULTA; transmissão falhou = volta pro dono.
- Credenciais Serpro só no cofre; rotação documentada no card do perfil.
- Frente financeira/fiscal: revisão de diff obrigatória.

---

## Pós-S7 (fora de escopo, registrar pra memória)
- Automação total (transmitir sem clique) — só após ≥3 meses de zero divergência, e mesmo assim
  com janela de veto (alerta "vou transmitir em 24h, cancele se quiser").
- Multi-CNPJ (se o dono abrir outras empresas) — modelos já suportam via FiscalProfile→tabela.
- Vender o Contabil como módulo do HBX pra clientes ME (o mesmo motor serve; aí sim IA-narrativa
  e Integra Contador em escala fazem sentido comercial — potencial de produto real).
