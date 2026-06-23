# PLAN-BOT-D — Pré-voo + modo teste (o portão antes do "ao vivo")

Ler [PLAN-BOT-00-INDICE.md](PLAN-BOT-00-INDICE.md). Este é o bloco que **impede o disparo imbecil**: nenhum
proativo liga sem passar pelo pré-voo, e "testado" é um portão real, não decorativo.

## Pré-voo (3 luzes por tipo) — backend em PLAN-BOT-A, aqui o significado + UX
- **chipConectado** — há WhatsApp conectado no escopo do tipo. Sem chip = não liga (é o que protege de "mandar pro nada").
- **configCompleta** — o tipo tem o mínimo pra operar (atendimento: setup completo; recovery: template+menu;
  prospecção: perfil de vendas + 1º contato seguro).
- **passouModoTeste** — o dono rodou o chat de teste do tipo ao menos uma vez (prova que viu o que o bot vai dizer).

## Modo teste (gravar `passouModoTeste`)
- Reusar o **chat de teste simulado** que já existe na `/bot` (aba Fluxo, aside "Teste seu bot").
- Ao concluir uma rodada de teste do tipo selecionado, marcar a flag persistida por tipo:
  - Atendimento: aproveitar `setup` do `atendimento-config` (campo novo `testedAt` no setup, normalizado).
  - Recovery/Prospecção: campo equivalente no respectivo config (`setup.testedAt`) ou colunas
    `recoveryBotTestedAt`/`prospectingBotTestedAt` em Company (decidir junto com PLAN-BOT-A; preferir dentro do config p/ evitar coluna).
- Endpoint: `POST /bot/activation/mark-tested {type}` (ou reaproveitar o PATCH de config marcando `setup.testedAt`).

## Regra dura
- Proativo (recovery/prospecção): `live:true` **recusado** no backend se qualquer luz estiver vermelha (PLAN-BOT-A já faz; aqui garantir o UX que explica QUAL falta).
- Atendimento: exige `chipConectado` + `configCompleta`; `passouModoTeste` é recomendado, não bloqueante (reativo).

## Aceite
- Sem testar, a chavinha de Prospecção não liga e o tooltip diz "rode o teste primeiro".
- Rodar o teste acende a 3ª luz e libera o switch (se as outras 2 estiverem verdes).
- Estado sobrevive a reload (flag persistida).
