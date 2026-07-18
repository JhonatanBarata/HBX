# Módulo Financeiro liga/desliga + painel Avançado (PR18072026, decisões do dono 18/07)

Conceito em 3 níveis. `moduloFinanceiroAtivo` (Company) JÁ EXISTE e já é fail-closed no backend.
NADA é removido — tudo é toggle. Desligar NUNCA apaga saldo/cobrança do banco, só esconde.

## Contrato de config (fonte da verdade p/ os dois workers)
GET /logistica/config passa a retornar (além dos campos atuais):
- `moduloFinanceiroAtivo: boolean` (mestre, Company — já existe)
- `cobrancaSimples: boolean` (JÁ EXISTE — Deve/Pago/Próximo na chegada)
- `aceitaNaHora: boolean` (default true) — forma à vista (Pix/Dinheiro); UNIFICA "aberto"+"na_hora"
- `aceitaMensal: boolean` (default true)
- `aceitaFiado: boolean` (default true)
- `precoPorClienteAtivo: boolean` (default true)
- `avisoWhatsEnabled: boolean` (JÁ EXISTE — "Mensagens automáticas", vai pro painel Avançado)
- `cobrancaAutomatica: boolean` (default false) — painel Avançado (novo)

PATCH /logistica/config aceita todos esses (todos @IsOptional @IsBoolean, operacionais — não exigem billing owner, igual cobrancaSimples).

## Níveis de chegada (deliverySheet)
1. Financeiro OFF → nova folha ULTRA-SIMPLES: nome + "Não atendeu" / "Entregue" (Entregue confirma e carrega próximo automático). ZERO dinheiro, sem Deve/Pago.
2. Financeiro ON + cobrancaSimples ON → deliverySimpleSheet atual (Deve R$ / Pago / Próximo).
3. Financeiro ON + cobrancaSimples OFF → folha completa atual (produtos, comprovante).

## Formas de pagamento (unificação)
Hoje: aberto("Na entrega") / na_hora("Na hora") / mensal / pendura("Fiado").
UNIR "aberto"+"na_hora" → uma só forma "Na hora" (com Pix/Dinheiro). Cliente legado com
formaPagamento="aberto" é exibido como "Na hora" (aberto continua válido no backend — NÃO quebrar).
No editar cliente, cada forma só aparece se sua chave estiver ON:
- Na hora → aceitaNaHora; Mensal → aceitaMensal; Fiado → aceitaFiado.
Preço por cliente (campo precoAcordado) só aparece se precoPorClienteAtivo.

---

# W-A — Backend (Sonnet)
Arquivos: backend/prisma/schema.prisma (+migration aditiva), backend/src/logistica/dto/logistica.dto.ts,
backend/src/logistica/logistica-config.service.ts.
1. LogisticaConfig ganha colunas: `aceitaNaHora Boolean @default(true)`, `aceitaMensal Boolean @default(true)`,
   `aceitaFiado Boolean @default(true)`, `precoPorClienteAtivo Boolean @default(true)`,
   `cobrancaAutomatica Boolean @default(false)`. 1 migration aditiva (`20260718...financeiro`). NÃO rodar prisma format.
2. Company: o default de `moduloFinanceiroAtivo` para empresa NOVA deve ser false (simples). NÃO faça UPDATE em
   empresas existentes (a migration só muda o default da coluna p/ futuras). Confirme o default atual antes.
3. UpdateLogisticaConfigDto: adicionar os 5 campos acima (@IsOptional @IsBoolean) — espelhar o padrão do
   cobrancaSimples que já está lá.
4. updateConfig: aplicar cada `if (input.X !== undefined) data.X = !!input.X;` — todos operacionais.
5. serializeConfig / getConfig: expor os 5 novos + garantir avisoWhatsEnabled e moduloFinanceiroAtivo já saem
   (avisoWhatsEnabled: confirmar que sai no GET; se não, expor). Tudo no bloco OPERACIONAL (lido por qualquer ator).
6. LogisticaConfigDTO + UpdateLogisticaConfigInput: tipos.
7. `npx tsc -p tsconfig.json --noEmit` limpo. Rodar testes de config se houver.
Relatório: campos/linhas exatos, default de moduloFinanceiroAtivo confirmado, tsc limpo.

# W-B — App.js (Sonnet, DEPOIS do W-A commitar OU em paralelo contra o contrato acima)
Arquivo único: EntregaShell/app/src/logistica/assets/app/app.js. Ler estado atual antes.
1. Ajustes (`settingsScreen`): REMOVER a seção "Como você trabalha" com o toggle "Cobrança simples na chegada"
   solto. No lugar, na seção Administração (admin-only), 2 linhas novas: "Financeiro" (data-action="open-financeiro")
   e "Avançado" (data-action="open-avancado"), estilo settings-row com chevron.
2. Modal "financeiro": toggle mestre "Ativar financeiro" (PATCH {moduloFinanceiroAtivo}). Quando ON, mostra
   sub-toggles: Cobrança simples (cobrancaSimples), Na hora (aceitaNaHora), Mensal (aceitaMensal), Fiado
   (aceitaFiado), Preço por cliente (precoPorClienteAtivo) — cada um PATCH /logistica/config do seu campo, padrão
   visual dos switches existentes. Quando OFF, só o mestre (sub-toggles escondidos).
3. Modal "avancado": toggles Mensagens automáticas (avisoWhatsEnabled) e Cobrança automática (cobrancaAutomatica).
   Estrutura pronta p/ crescer (o dono vai pedir mais).
4. Editar cliente seção 3 (client-editor-finance / paymentFields): só renderiza a seção inteira se
   `state.config.moduloFinanceiroAtivo`. Em paymentFields, filtrar botões: "Na hora"(na_hora) só se aceitaNaHora,
   "Mensal" só se aceitaMensal, "Fiado"(pendura) só se aceitaFiado. REMOVER o botão "Na entrega"(aberto) —
   cliente legado com "aberto" mostra "Na hora" ativo. Campo "Preço para este cliente" (precoAcordado) só se
   precoPorClienteAtivo. Se todas as formas estiverem OFF, esconder o seletor de forma (só limite/saldo).
5. Chegada (deliverySheet / simpleModeActive): 3 níveis conforme o contrato. Nível 1 (financeiro OFF): nova
   `deliveryOfflineSheet(item)` — nome grande + observações + 2 botões grandes "Não atendeu" / "Entregue"; Entregue
   = confirmDelivery(item, {}) (sem receiptMethod) e dispara o próximo automático; "Não atendeu" = fluxo de
   não-entregue existente (motivo opcional? deixar direto: marca não entregue e vai pro próximo). Reusar
   confirmDelivery e o fluxo de próxima parada. GPS-check preservado.
6. `simpleModeActive` passa a exigir moduloFinanceiroAtivo ON (senão cai no nível 1). node --check no fim.
Relatório: mudanças por item, os 3 níveis de chegada, paths PATCH usados, node --check.
