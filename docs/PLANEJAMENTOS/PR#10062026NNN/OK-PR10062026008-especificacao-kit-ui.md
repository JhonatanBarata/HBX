# PR10062026008 — Especificação do kit UI HBX

Data: 11/06/2026
Status: CONCLUÍDO — Parte 5 da contenção de entropia.
Escopo: especificação. Não cria componentes ainda.

---

## Objetivo

Fechar o kit mínimo para que tela nova não nasça mais como composição sob medida.

O kit deve ser compatível com o PR10062026003 e com o contrato obrigatório de frontend.

---

## Camada de layout

### `PageShell`

Responsável por:

- grid principal;
- variação com ou sem painel de contexto;
- topbar/sidebar quando o shell corporativo estiver pronto;
- largura útil e respiro padrão;
- suporte claro/escuro.

Não deve:

- buscar perfil;
- decidir acesso comercial;
- fazer prefetch de módulos;
- guardar regra de negócio.

### `Section` / `Panel`

Responsável por:

- header de seção;
- título;
- descrição curta;
- aside/actions;
- densidade `default` ou `compact`;
- tom `default` ou `plain`.

Não deve:

- virar card dentro de card;
- conter navegação primária;
- substituir guia operacional.

---

## Camada de dados visuais

### `KpiGrid` e `KpiCard`

Uso:

- indicadores curtos;
- contadores de operação;
- riscos agregados;
- métricas sem drilldown complexo.

Regras:

- não usar para explicar produto;
- número principal com escala fixa;
- label curto;
- estado visual por token, não por cor local.

### `DataTable`

Uso:

- listas comparáveis;
- master/admin;
- financeiro;
- relatórios.

Estados obrigatórios:

- carregando;
- vazio;
- erro;
- linhas selecionáveis;
- ação por linha;
- paginação ou limite claro.

### `StandardList`

Uso:

- feed operacional;
- itens com ação rápida;
- mobile ou painéis laterais.

Estados obrigatórios:

- carregando;
- vazio;
- erro;
- ação primária evidente.

---

## Camada de overlays

### `Modal`

Para formulário ou fluxo curto.

Obrigatório:

- título;
- descrição opcional;
- fechamento claro;
- ações no rodapé;
- erro inline perto do campo/ação.

### `ConfirmDialog`

Para decisão.

Obrigatório:

- título direto;
- descrição objetiva;
- botão cancelar;
- botão confirmar;
- estado `busy`;
- variante destrutiva.

### `PersistentNotice`

Para aviso que precisa permanecer até o usuário agir.

Uso:

- erro operacional persistente;
- bloqueio neutro;
- orientação importante após falha de ação.

Não usar para:

- cobrança para vendedor;
- toast disfarçado;
- banner global que esconde erro local.

### `Toast`

Para feedback efêmero.

Não pode ser a única evidência de erro crítico.

### `Drawer`

Para detalhe lateral, edição contextual ou histórico.

Obrigatório:

- título;
- fechamento;
- foco visual;
- largura responsiva;
- ações fixas quando houver formulário.

---

## Rota `/dev/ui`

Quando implementada, deve renderizar:

- todos os componentes do kit;
- estados vazio/carregando/erro;
- claro e escuro;
- corporativo e friendly;
- exemplos com texto PT-BR realista;
- variações compactas.

Essa rota é catálogo vivo, não tela de produto.

---

## Critério para criar componente novo fora do kit

Só criar fora do kit quando:

- o comportamento é específico de domínio;
- não cabe em `Panel`, `DataTable`, `StandardList` ou overlay existente;
- a exceção foi registrada;
- existe plano de voltar para o kit se o padrão evoluir.

