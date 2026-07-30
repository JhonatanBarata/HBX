# DIA DO VENDEDOR 1 — 2º PERÍODO NOTURNO (plano do chip de teste, 30/07/2026)

> Ordem do dono: "fazer todos os testes igual foi feito até hoje, porém agora o modo
> noturno: disparos AGENDADOS. O vendedor trabalha, deixa pronto para o próximo dia,
> escolhe o horário do disparo e a empresa. Sem disparos. Localizar empresas, selecionar
> se veio bonitinho do radar, achar a frase inicial perfeita com a IA particular, e
> programar disparos respeitando limitação — impossibilitando NEM QUE EU FORCE enviar
> 2 mensagens dentro do período de tempo."

## O que é o teste
Sessão de USO REAL (como vendedor), não de código. O produto do turno noturno:
amanhã de manhã os disparos saem sozinhos nos horários escolhidos, dentro de TODAS
as travas. Hoje à noite: preparar, agendar e TENTAR QUEBRAR as travas. Cada brecha
achada é BUG numerado no relatório — nada de corrigir código nesta sessão.

## REGRAS DURAS (violar qualquer uma = parar e reportar)
1. **ZERO disparo imediato.** Nesta sessão nenhuma mensagem sai AGORA. Só agendamento
   futuro (amanhã, dentro da janela comercial 08:00–18:00 da empresa).
2. **Login SEMPRE pelo e-mail** (o username "Jhonatan" loga como master sem empresa e
   o /vendas morre). Navegador: Chrome.
3. **Burla DESTRUTIVA só em localhost** (`npm run up`, localhost:3001, credenciais em
   `.test-login.local.md`): tentativas que, se a trava falhar, ENVIAM mensagem de
   verdade (ex.: forçar envio manual dentro do intervalo) são proibidas em produção
   com número de cliente. Em produção, burla apenas nas superfícies de AGENDAMENTO
   (agendar 2 no mesmo slot, encurtar intervalo na config e tentar de novo, reagendar
   por cima) — a negação tem que vir ANTES de qualquer envio.
4. **Chip real nunca é cobaia.** Nada de conectar/desconectar/reparear chip. O chip
   `company-5-user-6` está open — não encostar.
5. **O que ficar agendado pra amanhã fica LISTADO no relatório** (empresa, horário,
   copy) para o dono revisar de manhã. Agendar no máximo o teto do dia (10) e só em
   lead que passou na triagem. Teste que não deva virar mensagem amanhã = CANCELAR
   antes de encerrar (e testar se o cancelamento realmente mata o agendamento!).

## ROTEIRO (na ordem — é o trabalho do vendedor noturno)
1. **Radar**: buscar segmento+cidades (mesma pesquisa do dia 1: DDD 19, distribuidora
   de água, ou segmento novo se esgotado). Puxar leads.
2. **Triagem "veio bonitinho?"**: conferir cada card — nome real (não CNPJ no nome),
   telefone celular vs fixo, segmento confirmado, cidade certa. Card podre = bug de
   qualidade do Radar (anotar id + o que veio errado).
3. **Catálogo**: conferir/preencher o cartão "O que a sua empresa vende" (drawer
   Automações comerciais). Sem catálogo a IA não oferta — o selo tem que refletir.
4. **Frase inicial perfeita**: escrever a frase-base e usar o botão "Gerar variações
   (IA)" (lista "Primeiro contato (frio)"). Conferir: variações voltam DIFERENTES de
   verdade (a régua de 85% recusa as parecidas — o painel diz quantas recusou)?
   Placeholders preservados? Salvar só o lote revisado.
5. **Agendar os disparos de amanhã**: escolher empresa + horário por lead
   (agenda-disparo respeita janela/teto/intervalo; usar o preview de próximo-slot).
   Espaçar como humano (não 10 disparos em sequência de 10 em 10 minutos cravados).
6. **TENTAR QUEBRAR (a parte principal)** — cada tentativa vira linha do relatório
   com o resultado (NEGOU como? mensagem de erro honesta?):
   a. Agendar 2 disparos no MESMO horário → o 2º tem que reagendar sozinho.
   b. Agendar 2 com intervalo menor que o mínimo da config → NEGAR/reagendar.
   c. Baixar o intervalo mínimo na config para 1 min e repetir (a) e (b) → o freio
      físico (gate do frio: 10 min entre frios, teto 10/dia) tem que segurar MESMO
      com a config frouxa.
   d. Agendar o 11º disparo do dia → teto tem que negar.
   e. Duas copies ≥85% iguais agendadas → o que acontece? (Hoje o anti-carimbo roda
      no ENVIO; se o agendamento aceita e o corte só vem amanhã, isso é bug de UX:
      o vendedor descobre tarde. Reportar como achado, não corrigir.)
   f. Agendar fora da janela (ex. 03:00) → tem que cair pro próximo horário útil.
   g. Em LOCALHOST: forçar envio manual imediato 2x dentro do período mínimo (UI e
      POST direto com o token da sessão) → o gate tem que negar o 2º SEM enviar.
   h. Cancelar um agendado e conferir que morreu de verdade (não dispara amanhã).
7. **Painel de disparos no shell**: com agendamentos vivos, o painel intercala com
   créditos e mostra o estado real? Alerta de lead quente continua funcionando?
8. **Encerrar**: relatório final — bugs numerados (repro passo a passo + print),
   lista do que ficou agendado pra amanhã, e o veredito: o modo noturno está pronto
   pro vendedor real?

## Referências no repo
- Agenda/slots: `backend/src/vendas/agenda-disparo.service.ts` (janela/teto/intervalo).
- Gate do frio: `backend/src/messaging/wa-cold-contact-gate.service.ts` (10/dia,
  10 min, anti-carimbo 85% — freio FÍSICO, roda no envio).
- Variações IA: POST `/vendas/automation/prospecting/gerar-variacoes`.
- Catálogo: GET/PATCH `/vendas/catalogo-comercial`.
- Memória da frente: `dia-de-vendedor-frente.md` (armadilhas do dia 1: login por
  e-mail, logout não limpa impersonator, suíte com vermelhos pré-existentes).
