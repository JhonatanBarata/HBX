# S3 — Conferência de divergência plano × parada

**Dor real (empresa 41, terça):** 16 planos × 17 paradas na rota salva. O sistema faz o certo
ao NÃO corrigir sozinho — mas não avisa. A parada sobrando fica invisível até o entregador
estranhar na rua.

## O que é divergência (definição fechada)

Para um dia da semana, comparar:
- **Planos do dia** (`LogisticaPlanoEntrega` via paradas da rota do dia — fonte `getDay`), com
- **Rota salva "espelho" do mesmo dia** (`LogisticaRotaModelo` com `diaSemana` igual,
  `paradasJson`).

Tipos: `SO_NO_PLANO` (cliente tem plano, não está na rota salva) · `SO_NA_ROTA` (parada na
rota salva sem plano no dia — o caso da 17ª de terça) · `DUPLICADO` (mesmo cliente 2× na
rota salva).

## Backend

`GET logistica/agenda/dias/:dia/divergencias` em `logistica-agenda.controller.ts`:
- **Reusar o matcher da S2** (mesma chave `customerProfileId + localId`, mesma regra de
  ambiguidade) — extrair pra função compartilhada no service, não duplicar.
- Resposta: `{ total, itens: [{ tipo, clienteNome, endereco?, planoId?, detalhe }] }`.
- Read-only absoluto. Nenhuma escrita, nenhuma "correção automática" — a decisão é do cliente.
- Se não existir rota salva do dia: `{ total: 0, itens: [], semRotaSalva: true }`.

## Front — aba Agenda (`weekly-agenda.tsx`)

- No cabeçalho de cada dia: badge discreto `⚠ N diferenças` (token warning) SÓ quando `total>0`.
  Zero divergência = NADA na tela (sem poluir).
- Clicar no badge → modal de conferência: lista agrupada por tipo, linguagem de gente
  ("Está na rota de terça mas não tem plano: Fulano — Rua X"). Sem jargão, sem ID na tela.
- Ação por item (opcional, só navegação): abrir a ficha do plano/cliente já existente. NÃO
  criar botão "corrigir tudo".

## O que NÃO fazer

- NÃO corrigir nada sozinho (nem oferecer "sincronizar" em massa — decisão consciente do
  design da Agenda V2).
- NÃO calcular divergência no front — matcher é um só, no servidor (senão os números divergem
  entre telas, e aviso que mente é pior que aviso nenhum).

## Prova (gate da sprint)

1. Builds verdes.
2. Local: montar dia com 3 planos + rota salva do dia com 4 paradas (1 cliente extra) →
   badge `⚠ 1`, modal mostra `SO_NA_ROTA` com o nome certo.
3. Remover a parada extra da rota salva → badge some (sem F5 forçado, refetch no fechar modal).
4. Dia sem rota salva → sem badge, sem erro no console.
5. Empresa com agendaV2 desligada → aba continua só leitura, endpoint volta o guard padrão
   (`assertAgendaV2`) sem 500.
