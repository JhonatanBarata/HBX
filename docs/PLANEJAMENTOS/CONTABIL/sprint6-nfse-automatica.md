# CONTABIL S6 — NFS-e Nacional automática 🔒 GATE DONO: certificado e-CNPJ A1

**Objetivo:** cada assinatura recebida vira NFS-e emitida sozinha, pela API oficial do Sistema
Nacional. Primeiro sprint com braço externo — nasce em produção-restrita e atrás de flag.

**GATE:** dono precisa ter comprado o certificado e-CNPJ A1 (~R$ 130–250/ano) e feito upload no
cofre. Sem gate cumprido, sprint não inicia.

## Referências técnicas (conferidas 02/07/2026)
- Swagger contribuinte: https://www.nfse.gov.br/swagger/contribuintesissqn/
- Docs + ambientes (produção-restrita e produção): https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica
- Requisitos: mTLS com certificado ICP-Brasil A1, DPS em XML assinado (XMLDSIG), payload JSON
  com XML GZip+Base64; modo síncrono devolve a NFS-e com chave de acesso de 50 chars.

## Entregas

### 1. Cofre de certificado
- Upload do .pfx + senha pela UI (drawer do perfil fiscal, S3) → criptografar AES-256-GCM com
  chave `HBX_CONTABIL_VAULT_KEY` (env da VPS; gerar e guardar fora do repo) → `certA1Encrypted`;
- Senha NUNCA em log/response; decrypt só em memória no momento do uso;
- Card com validade (`certA1ExpiresAt` extraída do próprio cert) + obrigação sintética
  "renovar certificado" gerada 30 dias antes de expirar (pluga no alertador S2).

### 2. `nfse-national.client.ts`
- mTLS com o cert do cofre; montagem da DPS (dados do FiscalProfile + serviço "licenciamento de
  software" cód. tributação municipal do CNAE 6203-1/00 + tomador = empresa cliente do HBX);
- Assinatura XMLDSIG, GZip+Base64, POST /nfse (síncrono) → salvar chave de acesso + XML retornado;
- Ambiente por env: `HBX_CONTABIL_NFSE_ENV=restrita|producao` (default restrita);
- Flag mestre: `HBX_CONTABIL_NFSE_ENABLED` (default OFF).

### 3. Migration `FiscalInvoice` + emissor
```prisma
model FiscalInvoice {
  id            String   @id @default(cuid())
  paymentRefId  String   @unique      // pagamento MP que originou
  companyId     Int                   // tomador (cliente HBX)
  valorCents    Int
  status        String   @default("PENDENTE") // PENDENTE | EMITIDA | ERRO | CANCELADA
  chaveAcesso   String?  @unique
  xmlGzB64      String?
  erroMsg       String?
  tentativas    Int      @default(0)
  emitidaEm     DateTime?
  createdAt     DateTime @default(now())
}
```
- Job: pagamento MP aprovado → cria FiscalInvoice PENDENTE → emite (retry com backoff, máx 3;
  depois ERRO + alerta ao dono — **disjuntor: 3 ERROs seguidos pausam a fila** e alertam, nunca
  martelar a API);
- Reconciliação na janela: pagamentos × notas (o que está sem nota fica 🔴);
- `receitaNotasCents` do FiscalRevenueMonth passa a ser real → card de divergência
  caixa × notas na janela.

### 4. Trilha `FiscalAutomationLog`
```prisma
model FiscalAutomationLog {
  id        String   @id @default(cuid())
  sistema   String              // NFSE | SERPRO
  operacao  String              // EMITIR_DPS | DECLARAR_PGDASD | GERAR_DAS ...
  requestResumo String          // SEM dados sensíveis
  httpStatus Int?
  sucesso   Boolean
  resultRef String?             // chave de acesso / nº recibo
  aprovadoPor String?           // "auto-flag" | userId
  createdAt DateTime @default(now())
}
```
(Modelo compartilhado com S7 — criar aqui.)

## Roteiro de validação (nesta ordem, sem pular)
1. Produção-restrita: emitir 3 DPS de teste → 3 chaves de acesso válidas;
2. Produção, flag ON, **modo manual**: botão "emitir nota" em 1 pagamento real escolhido pelo dono;
3. Conferir a NFS-e no painel do Emissor Nacional (a fonte da verdade é o portal, não nosso banco);
4. Só então ligar o job automático — e acompanhar 1 semana com reconciliação diária.

## Aceite
- 3 notas em produção-restrita + 1 real conferida no portal + job automático emitindo sem ERRO
  por 7 dias (ou N pagamentos) + disjuntor testado (simular falha 3x → fila pausa + alerta).
- tsc + testes verdes (montagem/assinatura da DPS com cert de teste, idempotência do job).

## Guardrails
- Flags default OFF; deploy com flag OFF é inerte por design.
- Cancelamento de NFS-e emitida errada: SEMPRE manual pelo portal nesta fase (não automatizar
  cancelamento — é raro e perigoso).
- Frente financeira/fiscal: revisão de diff obrigatória.
