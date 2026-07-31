# RELATÓRIO — TURNO NOTURNO 2 (30/07/2026, 22:40–23:50 -03)

> Sessão de USO como vendedor noturno, em PRODUÇÃO (company 5, chip ...884 `open`),
> logo depois do publish `af72a6b1` que levou o S1–S6 pro ar. Base: `00-PLANO.md`.
> **Nenhuma mensagem saiu. Nenhum disparo ficou agendado pra amanhã** (motivo no fim).

## VEREDITO

O modo noturno **existe agora** — o bloqueador B1/B2 morreu: dá pra escolher dia e hora,
o motor reserva o slot e o banco guarda o horário certo. O que ainda reprova não é mais
"não existe", é **a tela mentir sobre o teto** e **a régua anti-carimbo não ser cobrada
no caminho que o vendedor usa**. Com esses dois de pé, o vendedor planeja 17 e o freio
entrega 10 — a diferença ele descobre amanhã, cancelamento por cancelamento.

---

## 1. O QUE FOI VERIFICADO FUNCIONANDO (medido, não inferido)

| # | O que | Prova |
|---|---|---|
| S1 | Agendar disparo com DATA+HORA existe na Central do Lead | popup "Agendar disparo · <lead>" com os 2 campos |
| S1/B6 | 03:00 vira próximo horário útil **na criação** | pedi 31/07 03:00 → banco gravou `nextStepAt 2026-07-31 11:00 UTC` (= 08:00 -03) |
| B3 | Preview não mente mais | "03:00 está fora do horário comercial — ficou sex, 31/07 às 08:00." |
| B4 | Dois no mesmo horário | pedi 08:00 de novo → `conflito: intervalo_minimo`, virou **08:15**, com aviso legível |
| B4 | Intervalo curto | pedi 08:20 (5 min depois) → virou **08:35** |
| B7 | Hora podre | `99:99`, `25:00`, `31/07/2026 09:00`, vazio, `2026-13-45` → **400 nos 5** |
| S3/B8 | "Gerar variações (IA)" | **funcionou de primeira**, `201`, 3 variações; `POST .../aquecer-ia` deu `201` ao abrir a gaveta |
| S4/B11 | Alerta de lead quente sem campanha rodando | alerta do Tagliágua aceso o tempo todo, campanha `canceled` |
| S5/B9 | Vitrine "Linhas" | renderiza as linhas (32 achados na varredura) — não é mais 0 de 317 |
| (h) | Cancelar mata de verdade | 3 agendamentos → `Desligar robô` → banco: `status = cancelada` nos 3 |
| Gate | Freio físico no ar | `coldGate: enabled, maxPerDay 10, minSpacing 10min, similaridade 85%, remainingToday 10` |

---

## 2. BUGS / ACHADOS DESTA NOITE

### N1 — ALTO · O teto tem TRÊS números diferentes (B5 sobreviveu fora da tela nova)
- Tela **Disparo frio → configuração**: "RESTAM HOJE 17 · LIMITE/DIA 17" e o aviso
  "Teto fixo de 80/dia"; a peça "Limite diário" diz "até 17/dia · teto 80".
- `GET /vendas/agenda-disparo/config` (o que o S2 consertou): `tetoEfetivoPorDia: 10` ✅.
- **Motor de slots**: `findNextFreeSlot` usa `config.dailyLimitPerSender` — hoje **40**
  (`agenda-disparo.service.ts:83` + `:100`). Não consulta o cold gate.
- **Consequência real:** a agenda aceita reservar até 40 disparos pra amanhã; o freio
  deixa sair 10. O vendedor descobre no dia, um cancelamento por vez.
- Cura: o teto do motor de slots tem que ser o mesmo `min(tenant, cold gate)` que o
  endpoint já sabe calcular — e a tela do Disparo frio precisa ler esse número.

### N2 — ALTO · O anti-carimbo do agendamento não existe pra quem usa a tela
`vendas.service.ts:6155` → `const copy = normalizeText(dto?.message); if (copy) await this.assertCopyNaoEhCarimbo(...)`.
O registro (`registrarCopyAgendada`, `:6253`) também é condicionado ao mesmo `copy`.
**O popup "Agendar disparo" só manda data e hora — não tem campo de texto.** Então:
- agendando pela tela, a régua de 85% **nunca roda no preparo** e **nada é registrado**;
- a régua volta a existir só no envio (amanhã), que é exatamente o "descobre tarde"
  que o S2 queria matar. A burla (e) do plano **passa**.

### N3 — MÉDIO · O teto do dia não NEGA, empurra pro dia seguinte
O aceite escrito no `01-CORRECAO.md` era "11º do dia → NEGA com motivo". A implementação
devolve `motivoConflito: 'teto_do_dia'` e joga pro próximo slot ("O teto de disparos desse
dia já estava cheio — ficou <quando>"). É honesto e é o lado seguro, mas **é diferente do
combinado** — decisão sua: negar ou empurrar.

### N4 — MÉDIO · Radar: o score ainda não usa o TERMO (reincidência nº3 do achado nº5)
Busca "distribuidora de agua mineral", DDD 19, 14 cidades — **concluída: 87 leads**
("Entreguei 9 de 25 em Americana; faltaram 16" é a mensagem por cidade). Quem tem CNAE confirmado na
Receita pontua 60–68. **Todo o resto cai num 25 uniforme** — e no mesmo 25 convivem:
- reais: "Ad Mais Distribuidora de Água e Bebidas", "Água em Limeira", "Levíssima Limeira";
- lixo: **"Minoxidil kirkland rio claro"**, "Liceu Capivari — Educação infantil/pré-escola",
  "Dioxide Indústria Química", "Centro de Distribuição Drogal", "Florien Fitoativos" e
  4 empresas de medicamento em Hortolândia (CMEDBRASIL, Kvo Med, Enterprise Care, Unifórmulas).

O score separa "tem CNAE confirmado" de "não tem" — não separa **água de minoxidil**.

### N5 — MÉDIO · A IA de variações trocou o nome da empresa
Uma das 3 variações voltou com **"da HB dos sistemas"** no lugar de "da HBX". A régua de
validação recusa preço-sem-âncora, `{{}}` quebrado, "sou IA" e texto grande — **não protege
nome próprio**. Descartei a variação; salvei as outras 2 + a base. Numa mensagem de primeiro
contato, errar o nome da empresa é pior que texto feio.

### N6 — BAIXO · Erro do validador em inglês
`desiredAt must be a valid ISO 8601 date string`. A tela impede o caso, mas o aceite pedia
400 **legível**.

### N7 — BAIXO · "Abertura hoje" com disparo reservado pra amanhã
Depois de agendar pra 31/07 08:00, o cartão do robô mostra o passo "Abertura `hoje`". A
verdade ("ficou sex, 31/07 às 08:00") só aparece no aviso de rodapé, que some. É a mesma
família do B1: a tela diz uma coisa, a agenda faz outra.

### N8 — BAIXO · Rótulo confuso no próximo horário
"Próximo horário 31/07, 08:00 · **Fora do horário de disparo**" — o "fora" é sobre AGORA
(23h), não sobre o 08:00 proposto. Lido rápido, parece recusa.

### N9 — BAIXO · "Puxar" joga o vendedor de volta pro funil
Cada Puxar volta pra aba "Meu funil"; pra puxar 5 leads são 5 idas e voltas e a lista
perde a posição.

### N10 — BAIXO (dado) · CRISTAL LITE: cidade INDAIATUBA/SP, telefone DDD **15**
Card com cidade e DDD incompatíveis — triagem do Radar deixou passar.

### N11 — BAIXO · O pino do painel no shell não mostra agendado
Com 1 disparo agendado vivo, o pino continua "0 de 17 hoje" (enviadas/limite). O funil
mostra certo ("Robô trabalhando 2", selo "Robô ativo" na linha).

---

## 3. O QUE FICOU PRONTO PRO DONO (munição de amanhã)

**Copy de primeiro contato — 3 variantes salvas** (alinhadas ao catálogo, sem preço):
1. `Aqui é o {{funcionario}}, da HBX. A gente ajuda distribuidora de água a receber o pedido do WhatsApp direto no sistema e mandar a rota do dia pro celular do entregador. Posso te mostrar rapidinho?`
2. `Olá, sou o {{funcionario}} da HBX. Eu conecto distribuidoras de água com o pedido do WhatsApp direto no sistema e envio a rota do dia pelo celular do entregador. Quer ver isso em minutos?`
3. `Ei, sou o {{funcionario}} da HBX. Trabalho com distribuidoras de água: recebemos o pedido do WhatsApp no sistema e passamos a rota do dia para o celular do entregador. Posso te mostrar rápido?`

**4 leads novos puxados** (segmento certo, Receita confirmada):

| Lead | Cidade | Telefone | Serve pra WhatsApp? |
|---|---|---|---|
| **RISSO DISTRIBUIDORA - AGUA MINERAL** | Indaiatuba/SP | (19) 98187-4096 | **SIM — celular** |
| DISTRIBUIDORA BELFANTE LTDA. | Capivari/SP | (19) 3491-5215 | não (fixo) |
| CRISTAL LITE | Indaiatuba/SP | (15) 3333-2963 | não (fixo, e DDD divergente) |
| AGUA JX | Indaiatuba/SP | (19) 3936-2664 | não (fixo) |

Na vitrine ainda esperam, com CNAE de água confirmado e sem custo até o Puxar:
SUPERMERCADO CALLEGARI (Capivari), Mig Distribuidora de Agua (Cosmópolis), Agua Manancial
(Capivari), Borges / Dr Água / RCS / AGUA LI (Piracicaba), Luzzi / RIO GUACU (Rio Claro),
Ad Mais e gua Mineral (Indaiatuba), Água em Limeira e Levíssima (Limeira).

> **Padrão que manda no dia:** distribuidora de água quase sempre tem FIXO. De 15 leads no
> funil, só 5 têm celular — e 3 já foram contatados hoje de manhã. Puxar por volume não
> resolve; o filtro que interessa é "tem celular".

---

## 4. POR QUE NÃO DEIXEI DISPARO AGENDADO PRA AMANHÃ

Criei 3 agendamentos de teste (todos em lead de telefone FIXO, de propósito: se algo
escapasse não viraria mensagem pra estranho) e **cancelei os 3 antes de encerrar** —
banco confere `cancelada`. Zero inscrição ativa, zero job pendente.

Os disparos REAIS não foram agendados porque, na hora de criar agendamento em série, o
**guarda de segurança da minha sessão bloqueou a ação** (criar disparo de WhatsApp pra
terceiro é ação de "mandar mensagem em nome do dono"). Fiz o que dava sem isso: preparo,
munição, triagem e a bateria de burlas. **Pra amanhã sair sozinho, o agendamento tem que
ser você — ou você me autoriza explicitamente no chat pra leads nominais.**

### Burlas que ficaram SEM medir (e por quê)
- **(c) afrouxar o intervalo mínimo na config e repetir** — exigiria alterar config de
  produção; bloqueado na mesma trava.
- **(d) 11º disparo do dia** — exigiria 10 agendamentos reais primeiro.
- **(g) forçar envio manual 2× em localhost** — não feito (o ambiente de teste é o VPS).
- **(item 7) painel com vários agendados vivos** — medido só com 1.

---

## 5. ESTADO EM QUE DEIXEI O SISTEMA

- Chip `company-5-user-6` (…884) e `company-1`: **`open`**, sem loop de reconexão.
- Catálogo comercial: `pronto: true`, sem lacunas (não toquei).
- Config da agenda: **inalterada** (08:00–18:00, intervalo 15 min, teto tenant 40).
- Campanha de prospecção: estava `cancelada`; ao salvar a copy nova ela virou **`Pausada`**
  ("Revise a triagem e inicie novamente"). Não iniciei. **Se você não quer nem pausada,
  é 1 clique em Cancelar.**
- Funil: 15 leads (11 de ontem + 4 puxados hoje). Créditos: 49.776,4 (4 puxadas).
- Agendamentos ativos: **nenhum**. Lembrete de CRM do "Água em Americana" (31/07 09:00)
  continua lá — é lembrete, não vira mensagem.
