# L4-A — Backend: `origem` avulsa/recorrente na Entrega

## Problema
O app filtra "Avulsos" por `scheduledAt != null`, mas o backend seta `scheduledAt` em TUDO
(materialize/gerar-dia usam `scheduledAt: start` — ver logistica-admin-route.service.ts:181/417).
Resultado real no celular: rota com 17 paradas recorrentes mostra "Avulsos 17".

## Entrega
1. **Prisma**: coluna aditiva `origem String?` no model `Entrega` (backend/prisma/schema.prisma,
   model na linha ~1192). Migration SQL manual aditiva `20260718120000_l4_origem_entrega`
   (`ALTER TABLE "Entrega" ADD COLUMN "origem" TEXT;`) no padrão das migrations existentes.
2. **Escrita**:
   - `origem: 'recorrente'` em TODO caminho que materializa recorrência do dia
     (gerar-dia/materialize em logistica.service.ts e logistica-admin-route.service.ts —
     os pontos que hoje criam Entrega com `scheduledAt: start`).
   - `origem: 'avulsa'` no createEntrega (POST /logistica/entregas, logistica.service.ts).
   - Reagendar/reabrir (logistica-occurrence.service.ts cria Entrega nova): copiar `origem`
     da original (`origem: original.origem ?? null`).
3. **Leitura**: expor `origem` no item do GET rota mobile (logistica-mobile — o mapper do
   /logistica/mobile/route) e no listRota clássico (mesmo shape).
4. **Testes**: estender os testes de serviço existentes (admin-route/occurrence/logistica) com
   asserts de `origem`; nada de framework novo. Legado com origem null é esperado (app trata
   null como recorrente).

## Regras
- NADA destrutivo; migration só ADD COLUMN. Não tocar em billing/créditos.
- Gate: `cd backend && npx tsc --noEmit` limpo + testes dos arquivos tocados verdes
  (`node --test dist/...` NÃO — usar o runner que os testes vizinhos já usam).
- Não commitar, não publicar — orquestrador cuida.
