# HBX Owner - desenho operacional em decisao

Data: 2026-06-06

Esta nota registra a direcao decidida para o HBX Owner durante a revisao operacional.

## Direcao principal

O Kanban deve ser o centro operacional unico do Owner.

Todo trabalho entra como card/ticket no Kanban:

- ticket manual;
- ticket criado a partir de PDF;
- ticket vindo do backend;
- ticket que sera executado com Codex.

A diferenca entre tickets nao deve ser a tela onde eles vivem, mas o nivel/classificacao do card.

Tickets vindos do backend podem ter comportamento diferente conforme nivel:

- nivel seguro/baixo risco: pode entrar em execucao automatica;
- nivel alto/sensivel: deve parar para revisao humana antes de executar;
- qualquer item que toque deploy, publish, migration, auth, billing, secrets, pagamento ou acesso comercial deve ser bloqueado para revisao.

## Modo IA

O Modo IA foi decidido para remocao como guia separada.

Motivo: ele cria uma camada paralela de decisao/plano fora do fluxo real de trabalho.

O Owner deve operar por card, com contexto no Kanban. Planejamento, execucao, bloqueio, teste e commit precisam estar vinculados ao card.

Historico local antigo nao deve ser apagado sem pedido explicito.

## Execucao

A guia Execucao separada nao deve ser o lugar principal para executar trabalho.

Execucao de card deve morar no Kanban, porque o contexto certo e o proprio card:

- titulo;
- descricao;
- criterio de aceite;
- comando de teste;
- lane;
- bloqueio;
- saida local;
- dispatch Codex;
- commit;
- status de teste.

A guia Execucao, se existir, deve ser reduzida para checks globais do Owner:

- self-check;
- py_compile;
- smoke no-gui;
- git status;
- diagnosticos locais seguros.

## Tickets

A guia Tickets separada perde forca como tela principal, porque o Kanban ja recebe todos os tickets.

Tickets deve ser entendido como origem/inbox, nao como lugar de execucao.

Fluxo esperado:

1. ticket manual, PDF ou backend entra;
2. vira card no Kanban;
3. nivel/classificacao define se roda automatico ou exige revisao;
4. execucao, teste, commit e bloqueio acontecem no Kanban.

Se uma tela de Tickets continuar existindo, ela deve ser auxiliar: inbox, filtro ou auditoria de tickets backend.

## Git

A guia Git deve evoluir para um painel de teste e auditoria por branch/card, nao apenas comandos Git simples.

Depois que um card executar, o painel deve guardar e mostrar:

- card relacionado;
- branch;
- commit;
- status do worktree;
- arquivos alterados;
- areas alteradas: frontend, backend, motores, banco, docs, scripts ou outras.

O painel deve deixar explicito o que foi alterado para orientar teste local.

Exemplos:

- frontend alterado: normalmente nao precisa reiniciar se estiver em dev server na porta 3001;
- backend alterado: pode precisar reiniciar backend;
- motores/servicos alterados: pode precisar reiniciar processo especifico;
- alteracao mista: pode precisar reiniciar todos os servidores locais relevantes.

## Acoes desejadas no painel Git

O painel deve ter atalhos claros para:

- abrir localhost usando a branch/worktree do card;
- subir servidor local;
- parar servidor local;
- reiniciar todos os servidores;
- reiniciar apenas os servicos afetados pelo card;
- ver o que foi alterado por area;
- confirmar que teste apropriado foi feito antes de aprovar.

O painel Git deve ajudar a responder:

- qual branch estou testando?
- qual commit veio do card?
- o que mudou?
- qual servidor preciso reiniciar?
- qual localhost devo abrir?
- o card esta pronto para testar, revisar ou bloquear?

## PR Lab / Branches

O PR Lab e a base mais proxima do painel desejado para branches.

A direcao e transformar ou renomear o PR Lab para algo como Branches, mantendo nele:

- branch por card;
- worktree isolado;
- localhost da branch;
- validacoes;
- servidores locais;
- merge;
- publicacao.

O Git ainda deve alimentar esse painel.

Papel do Git:

- manter historico;
- mostrar commits;
- permitir auditoria;
- apoiar rollback quando algo der errado;
- preservar rastro do que foi alterado antes de merge/publicacao;
- injetar no painel de branches o commit, status, diff e areas alteradas.

Merge e publicacao devem ser acoes explicitas e protegidas.

- merge joga a branch aprovada no master/main;
- publicacao publica depois da aprovacao;
- publicacao/deploy nunca deve rodar automaticamente sem comando claro do dono na tarefa atual.

## ChatGPT

A guia ChatGPT continua util se for uma bancada de pesquisa e importacao, nao uma tela de execucao.

Fluxo decidido:

1. o Owner monta o prompt de pesquisa HBX com variaveis;
2. variaveis incluem data atual, repo `Jhonatanbarata/HBX`, branch atual, ultimos commits, cards concluidos com commit, cards pendentes/bloqueados, areas do produto e objetivo do ciclo;
3. o Owner copia o prompt;
4. o Owner abre o ChatGPT;
5. o dono dispara/envia manualmente no ChatGPT;
6. quando o resultado ficar pronto, o dono cola ou importa o resultado no Owner;
7. o Owner transforma a pesquisa em cards no Kanban.

Sem API paga, o Owner nao deve depender de capturar resultado automaticamente do ChatGPT como pilar principal.

Opcoes aceitaveis sem API:

- copiar/colar manualmente o resultado;
- detectar clipboard quando o dono clicar em copiar no ChatGPT;
- importar arquivo `.md` ou `.txt` salvo manualmente;
- tentar automacao local de navegador apenas como experimento fragil, sem burlar login, captcha, limite, paywall ou controles do site.

O resultado da pesquisa nunca deve executar direto. Ele gera cards no Kanban, e a classificacao do card decide revisao humana ou execucao automatica.

Implementacao inicial decidida:

- `Preparar pesquisa HBX`: monta prompt com data, repo `Jhonatanbarata/HBX`, branch, commits recentes, cards concluidos com commit, pendentes e bloqueados; copia para o clipboard; abre ChatGPT.
- `Importar pesquisa`: caminho manual, com colagem do resultado.
- `Importar clipboard`: tenta puxar o resultado copiado do ChatGPT e, se `Criar cards ao importar` estiver ligado, transforma em cards no Kanban.

## Modelo mental consolidado

Kanban executa.

Tickets entram.

Branches testa, valida, faz merge e publica.

Git audita, guarda historico e apoia rollback.

ChatGPT pesquisa e importa insumos.

Execucao vira diagnostico global.

Modo IA sai.
