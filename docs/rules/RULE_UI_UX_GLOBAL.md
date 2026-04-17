# RULE UI UX GLOBAL

## Objetivo

Padronizar comportamentos globais de interface no HBX para evitar diferencas entre modulos, reduzir retrabalho e impedir que elementos nativos do navegador vazem para a experiencia do produto.

---

## Regra-mãe

**Nenhum fluxo visivel ao usuario pode depender de UI nativa do navegador quando existir impacto de experiencia, identidade visual ou consistencia do sistema.**

Isso inclui, principalmente:
- `alert()`;
- `confirm()`;
- `prompt()`;
- mensagens soltas sem componente visual do HBX;
- estados de sucesso/erro sem padrao visual;
- botoes com variacao arbitraria de tamanho, hierarquia ou rotulo.

---

## Regra 1 — Proibido usar alert, confirm e prompt nativos

### Motivo

Esses elementos quebram a identidade do sistema, variam conforme navegador/dispositivo e fazem o produto parecer inacabado.

### Regra

Fica proibido usar:

```ts
window.alert(...)
window.confirm(...)
window.prompt(...)
```

em fluxos normais do sistema.

### Substituicao obrigatoria

- `alert` deve virar **toast**, **banner inline** ou **modal de aviso**;
- `confirm` deve virar **modal de confirmacao HBX**;
- `prompt` deve virar **modal ou drawer com formulario proprio do sistema**.

---

## Regra 2 — Toda acao destrutiva exige confirmacao visual propria do HBX

### Exemplos

- deletar arquivo;
- excluir configuracao;
- remover credencial;
- encerrar conversa;
- cancelar integracao;
- apagar registro importante.

### Padrao obrigatorio

Toda acao destrutiva deve usar um componente padronizado com:
- titulo claro;
- descricao objetiva do impacto;
- CTA destrutivo explicito;
- CTA secundaria de cancelar;
- estado de loading;
- bloqueio contra clique duplo.

### Exemplo de linguagem

**Titulo:** Excluir arquivo?

**Descricao:** Esta acao remove o arquivo permanentemente do sistema. Essa operacao nao pode ser desfeita.

**Botoes:**
- Cancelar
- Excluir arquivo

---

## Regra 3 — Feedback de sucesso, erro e aviso deve seguir padrao unico

### Sucesso
Usar toast, banner ou estado inline com linguagem curta e direta.

Exemplos:
- E-mail confirmado com sucesso.
- Arquivo excluido com sucesso.
- Configuracao atualizada.

### Erro
Erro deve ser humano, claro e acionavel.

Exemplos:
- Nao foi possivel excluir o arquivo. Tente novamente.
- Nao foi possivel confirmar o e-mail.
- Sua sessao expirou. Entre novamente.

### Aviso
Aviso deve orientar, nao assustar.

Exemplos:
- Voce tem alteracoes nao salvas.
- Esta acao pode impactar automacoes ativas.

### Regra de UX
Nao exibir mensagem crua, jogada, sem componente visual do sistema.

---

## Regra 4 — Botoes devem obedecer hierarquia fixa

### Hierarquia minima global

#### 1. Primario
Usado para a principal acao da area.
Exemplos:
- Salvar
- Confirmar
- Continuar
- Criar

#### 2. Secundario
Usado para apoio sem competir com a principal.
Exemplos:
- Cancelar
- Voltar
- Fechar
- Ver detalhes

#### 3. Destrutivo
Usado apenas para acoes irreversiveis ou de risco.
Exemplos:
- Excluir
- Remover
- Desativar
- Cancelar integracao

#### 4. Ghost / neutro
Usado para acoes leves e pouco prioritarias.
Exemplos:
- Agora nao
- Ignorar
- Depois

### Regras obrigatorias

- nao inverter hierarquia visual de forma arbitraria;
- nao usar botao destrutivo como se fosse botao comum;
- nao usar mais de uma acao primaria competindo na mesma area sem motivo forte;
- rotulo do botao deve usar verbo claro.

---

## Regra 5 — Janelas do sistema devem seguir padrao unico de comportamento

### Tipos padrao

#### Modal central
Usar para:
- confirmacoes;
- formularios curtos;
- avisos importantes;
- decisoes que exigem foco.

#### Drawer lateral
Usar para:
- edicao contextual;
- detalhes complementares;
- configuracoes que nao exigem ruptura total de contexto.

#### Popover / menu contextual
Usar para:
- acoes rapidas;
- menus de item;
- opcoes secundarias.

### Regras obrigatorias

- mesma linguagem de cantos, espacamento e sombra;
- mesmo comportamento de fechar;
- mesmo tratamento de ESC quando aplicavel;
- mesmo tratamento de clique fora quando aplicavel;
- mesmo cabecalho visual;
- mesmo padrao de rodape com acoes.

---

## Regra 6 — O sistema deve parecer o mesmo produto em qualquer modulo

Mesmo que cada modulo tenha sua propria identidade funcional, os elementos compartilhados devem parecer da mesma familia.

### Devem ser compartilhados/globalizados quando possivel

- modais;
- drawers;
- toasts;
- banners;
- botoes;
- campos;
- estados de loading;
- estados vazios;
- estados de erro;
- dropdowns;
- menus de acao.

### Nao pode acontecer

- um modulo parecer sistema premium e outro parecer navegador cru;
- um fluxo abrir modal bonito e outro usar `confirm()`;
- um sucesso aparecer como toast e outro como texto perdido na tela;
- botoes iguais semanticamente com visuais contraditorios.

---

## Regra 7 — Toda nova feature deve decidir explicitamente seus estados de interface

Antes de implementar qualquer acao nova, definir:
- estado normal;
- loading;
- sucesso;
- erro;
- confirmacao, se houver risco;
- estado vazio, se aplicavel;
- bloqueios/permissoes, se aplicavel.

Se isso nao estiver definido, a feature ainda nao esta pronta para UI final.

---

## Regra 8 — Padrao primeiro, customizacao depois

Se um modulo quiser fugir do comportamento global, a excecao deve ser consciente e justificada.

### Ordem correta

1. usar componente global existente;
2. estender o componente global sem quebrar a base;
3. criar excecao apenas quando houver motivo real de produto.

Nao criar componente novo so porque e mais rapido naquele momento.

---

## Regra 9 — Linguagem de interface deve ser curta, humana e profissional

### Fazer
- usar verbos claros;
- explicar impacto sem enrolacao;
- escrever como produto real;
- manter consistencia de tom.

### Evitar
- texto tecnico exposto ao usuario sem necessidade;
- mensagens vagas como `Deu erro`;
- excesso de exclamação;
- mensagens frias demais ou roboticas demais.

---

## Regra 10 — Esta regra deve orientar Codex, ChatGPT, Copilot e qualquer executor

Toda IA, dev ou colaborador que alterar o HBX deve seguir este documento ao mexer em:
- exclusao;
- confirmacoes;
- feedback visual;
- botao;
- modal;
- drawer;
- popup;
- mensagens de sucesso/erro/aviso.

Se nao houver componente global pronto, a tarefa correta nao e improvisar com navegador nativo.
A tarefa correta passa a ser:

1. criar o componente padrao reutilizavel;
2. aplicar no fluxo atual;
3. deixar a base pronta para os proximos fluxos.

---

## Checklist rapido antes de publicar UI nova

- Usa algum `alert`, `confirm` ou `prompt` nativo?
- A acao destrutiva tem confirmacao propria do HBX?
- Sucesso, erro e aviso seguem padrao visual?
- Os botoes respeitam hierarquia semantica?
- A janela segue comportamento padrao do sistema?
- Essa tela parece HBX de verdade ou remendo de navegador?

Se qualquer resposta for "nao", a implementacao ainda nao esta no padrao.
