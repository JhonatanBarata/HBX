# RELATÓRIO FINAL — fusão MOTOR-ÚNICO (bot + automações + assistente)

> Leitura de 2 minutos pro dono. Detalhe técnico completo: `CONTRATO.md` (vocabulário),
> `RELATORIO-S21.md` (revisão adversarial final, em Fable), `QA-VPS.md` (roteiro
> pós-publish). Sem jargão daqui pra baixo — quando precisar de um termo técnico,
> ele vem entre parênteses.

---

## O que mudou (em 5 pontos)

1. **3 telas viraram 1.** Antes você tinha `/bot`, `/automacoes` e `/assistente` —
   3 gavetas separadas pra configurar basicamente a mesma coisa (quem responde o
   cliente no WhatsApp). Agora é **1 painel só, `/automacao`**, com 4 seções por
   objetivo: Atender sozinho, Cobrar quem deve, Buscar clientes, Reagir e
   abastecer. É o mesmo padrão que Intercom/HubSpot/ManyChat usam — 1 central de
   comando, não 3 apps escondidos um do outro.
2. **O "atendente" agora é 1 config só, com 2 modos.** Antes existiam 2 sistemas
   de configuração brigando pelo mesmo posto (o bot de menu de um lado, o
   assistente de IA do outro, cada um com seu próprio "ligar/desligar"). Agora é
   **1 agente por empresa**, e você escolhe o motor: **roteiro** (botões/menu,
   como já era) ou **IA** (conversa livre). Pense assim: era como ter 2
   funcionários disputando o mesmo telefone; agora é 1 funcionário só, que você
   pode treinar de dois jeitos diferentes.
3. **O agente é DA EMPRESA, não do vendedor.** Só o Admin/dono configura; todo
   vendedor usa a MESMA configuração (herda, não inventa a própria). É assim que
   todo concorrente sério faz — imagina se cada vendedor pudesse programar um
   robô diferente falando em nome da sua marca; vira bagunça de identidade e
   risco de a empresa "falar com 2 vozes" pro mesmo cliente.
4. **Quem responde primeiro tem uma ordem fixa, agora escrita em código
   explícito** (antes estava espalhada dentro de um arquivo gigante de
   mensageria): interrupção de contato comercial → cadência → assistente IA →
   atendimento de menu → cobrança. Isso é o "quem atende o telefone primeiro" —
   a ordem NÃO MUDOU (é a mesma de sempre, só ficou mais fácil de auditar e
   mexer sem quebrar).
5. **Sai tudo pela mesma porta de envio de sempre** (o mecanismo que já existia,
   com os freios de sempre — teto diário, disjuntor contra ban). Isso é o
   "caixa único" — não importa se a mensagem veio da cadência, da IA ou do menu,
   ela passa pela MESMA fila com os MESMOS limites. Nada de atalho novo que
   pudesse furar o freio de segurança do WhatsApp.

## O que morreu

- As 3 telas velhas (`/bot`, `/automacoes`, `/assistente`) — agora são só
  **redirecionamentos automáticos** pra `/automacao`; ninguém perde link salvo
  nos favoritos.
- 3 "modos de montagem" do construtor de bot antigo (Tabuleiro/Trilha/Bandeja) —
  eram 3 jeitos diferentes de fazer a MESMA coisa (gimmick triplicado).
- O chat de teste falso do `/bot` (simulação sem backend por trás) — o sandbox
  novo é de verdade (roda a IA local igual à produção, sem gastar chip).
- O assistente-de-boas-vindas duplicado (`BotOnboarding`) — o assistente novo
  substitui os dois.
- **O que NÃO morreu, por ser feature separada**: o Copiloto (o "assistente de
  redação" que ajuda o vendedor a escrever mensagem melhor dentro da ficha do
  lead) — continua exatamente onde estava, intocado.

## Os 3 pontos de atenção da revisão final (P1 — não travam a publicação, mas merecem correção logo)

A revisão final (feita no modelo mais forte disponível — Fable — por pedido seu, pra
auditar o pacote inteiro antes de você publicar) achou **zero problema grave**. Achou
3 coisas que funcionam hoje mas que merecem colo antes de virarem dor de cabeça:

1. **O painel de status e o "trabalhador" real da Cobrança podem ficar
   dessincronizados no futuro.** Hoje os dois concordam (porque o valor no VPS é o
   mesmo dos dois jeitos). Mas se um dia você trocar o nome da variável de ambiente
   pra versão nova, o PAINEL vai dizer "ligado" enquanto o TRABALHADOR real ficou
   desligado (ou o contrário). Correção é pequena (1 linha) — arrumar antes de
   trocar qualquer nome de variável no servidor.
2. **A "faxina" que apaga as tabelas antigas do banco não pode rodar ainda.**
   Ela já está pronta e guardada num lugar seguro (fora do caminho normal de
   publicação — não roda sozinha por acidente). Mas o sistema, hoje, ainda
   LÊ as tabelas antigas de propósito, como um cinto de segurança (é o que permite
   "desligar tudo e voltar pro jeito de antes" se algo der errado). Se a faxina
   rodar antes de tirar esse cinto de segurança, ela pode até PASSAR nos testes
   e mesmo assim quebrar o sistema depois. **Não mexer nessa faxina sem avisar** —
   é trabalho de uma frente futura própria.
3. **Cuidado com o "meio do caminho" no servidor.** O código publicado no GitHub
   (`origin/master`) hoje só tem A PRIMEIRA METADE da fusão (as telas velhas ainda
   convivem, sem os redirecionamentos, sem a demolição). Se algum dia alguém fizer
   uma atualização manual do servidor puxando direto do GitHub (sem publicar o
   restante primeiro), o servidor sobe com metade nova e metade velha ao mesmo
   tempo — bagunça. Ver seção abaixo, é o ponto mais importante deste relatório.

## O estado real: GitHub × sua máquina (leia isto antes de publicar)

Durante o trabalho, os comandos `npm run publish`/`npm run new` que você rodou em
paralelo (nas suas próprias tarefas) acabaram **empurrando pro GitHub** parte do que
os workers desta frente já tinham terminado — sem querer, isso é normal (o publish
sempre manda tudo que está pronto). Resultado:

- **`origin/master` (o que está no GitHub agora) já tem as sprints S01 a S14** — a
  parte de baixo risco: o motor novo nasceu, mas ainda **convive** com o antigo (nada
  foi apagado, os interruptores continuam desligados por padrão). Isso é seguro por
  si só, mas é só METADE do trabalho.
- **7 commits existem SÓ no seu computador** (nunca foram publicados): as sprints
  S15 a S21 — são justamente as que **cortam a barra de navegação pra 1 item só**,
  criam os **redirecionamentos**, **apagam as telas velhas** e fazem a **limpeza
  final de backend** (flags/endpoints órfãos). Sem publicar esses 7, o produto fica
  com "2 portas pra mesma sala" — as telas velhas E a nova, ao mesmo tempo, o que
  NÃO é o resultado desejado.

**Pra ir ao ar do jeito certo, o caminho é 1 só: publicar (`npm run publish`) a
partir do seu computador AGORA, com os 7 commits locais presentes.** O `publish`
sempre manda o estado completo — não existe risco de "publicar só metade" usando
ele; o risco de metade só existe se alguém, no futuro, fizer uma atualização manual
direto do GitHub sem passar pelo publish primeiro (ver P1-3 acima).

## O que você precisa fazer, em ordem

1. **Publicar** (`npm run publish`) a partir do seu computador — isso manda os 7
   commits locais (S15→S21) junto com o resto, e o servidor sobe com a fusão
   COMPLETA de uma vez.
2. **Rodar o backfill** (comando único, coberto no passo (b) de `QA-VPS.md`) —
   copia a configuração de cada empresa pro formato novo. Enquanto isso não roda,
   tudo continua funcionando exatamente como hoje (o sistema é esperto o bastante
   pra usar o formato antigo até a cópia acontecer).
3. **Decidir a única variável que importa**: deixar `HBX_AUTOMATION_AGENT` como
   está (recomendação — já nasce ligada, com um "botão de pânico" embutido que
   volta tudo pro jeito antigo se algo não bater) ou desligar explicitamente
   enquanto testa.
4. **Rodar o roteiro de teste** (`QA-VPS.md`, passos a-e): conferir que o servidor
   subiu limpo, entrar como empresa de teste, passear pelas 4 seções, testar o
   assistente nos 2 modos, criar um gatilho de teste, confirmar que os links
   antigos redirecionam. Teste de envio real pelo WhatsApp SÓ com número
   descartável seu — nunca no seu chip real, e só se você pedir.

## Mapa de segurança (se algo der errado)

- **Backup físico completo**: pasta `Desktop\Backup 20-07 alteracaomotor` (cópia de
  tudo antes da fusão começar).
- **Ponto de restauração no Git**: commit `127b9166` — é o "antes de tudo". Reverter
  com `git reset --hard 127b9166` (e depois copiar o backup físico por cima, se
  quiser ter 2 camadas de segurança).
- **Banco de dados**: nada a restaurar até você rodar o backfill (ele só COPIA,
  nunca apaga o formato antigo) — e a "faxina" que apagaria tabelas antigas está
  guardada e não roda sozinha (ver P1-2 acima).
- **Atenção durante um reset**: na revisão de ontem havia trabalho SEU, não
  commitado, dentro da pasta do app de entregador (`EntregaShell/`) — um reset
  bruto teria apagado esse trabalho junto. **Conferido agora**: esse trabalho já
  foi commitado nos seus próprios `publish`/`new` (commits `d4eb91c7`/`240e2470`) —
  a árvore de trabalho está limpa hoje, então esse risco específico não existe mais
  neste momento. Mesmo assim, antes de qualquer `git reset --hard`, sempre vale
  rodar `git status` primeiro e confirmar que não sobrou nada solto.
