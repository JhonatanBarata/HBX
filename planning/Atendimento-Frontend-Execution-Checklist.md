# Atendimento Frontend Execution Checklist

Data: 2026-03-29
Uso: checklist operacional para reabrir a frente sem rediscutir escopo.

## Fase 1 - Shell Fixa

- Garantir workspace com altura util e `overflow: hidden` no container raiz.
- Garantir `min-height: 0` nas tres colunas.
- Garantir scroll interno apenas em fila, timeline e contexto.
- Garantir timeline separada de header e composer.
- Garantir composer sem crescimento indefinido.
- Remover qualquer loading global que substitua a tela inteira.
- Validar troca de conversa sem flicker da pagina.
- Validar troca de filtro sem reaproveitar conversa antiga.

Aceite:
- filtro vazio limpa centro e direita
- pagina nao mexe ao trocar chat
- shell nao recalcula inteira

## Fase 2 - Sistema Glass de Botoes

- Centralizar tokens visuais do glass em componentes reutilizaveis.
- Aplicar glass aos filtros primarios da fila.
- Aplicar glass aos filtros secundarios.
- Aplicar glass nas abas do contexto.
- Aplicar glass em toggles e segmented controls.
- Garantir highlight movel entre botoes.
- Garantir blur / saturacao / brilho sem vazamento para a tela inteira.

Aceite:
- trocar opcao move o destaque entre botoes
- chat permanece solido e legivel
- efeito parece iPhone nos controles, nao overlay na tela

## Fase 3 - Acoes Rapidas

- Reduzir a altura total da secao.
- Organizar em grid forte e compacto.
- Aplicar borda e contraste adequados.
- Garantir icone a esquerda.
- Evitar quebra feia de palavras.
- Garantir uma linha por botao quando possivel.
- Restaurar o terceiro comportamento de ocultar avisos/sistema apenas visualmente.

Aceite:
- leitura imediata
- sem cinza lavado
- sem texto cortado
- sensacao visual de painel premium

## Fase 4 - Contexto do Cliente

- Reorganizar os blocos com separadores claros.
- Melhorar tipografia e hierarquia visual.
- Trocar alguns labels por icones quando ajudar.
- Destacar cliente, telefone, status, contexto, motivo, atualizado e etapa recovery.
- Refinar abas `Conversa`, `Financeiro` e `Agenda`.

Aceite:
- leitura rapida do estado operacional
- nenhuma informacao importante truncada
- painel com cara de cockpit operacional

## Fase 5 - Templates Meta

- Restaurar biblioteca e fluxo de novo / editar.
- Tornar insercao de variaveis facil novamente.
- Limpar preview e reduzir escala em 25% quando necessario.
- Manter editor dentro do contexto do Atendimento.
- Reutilizar animacao existente para abrir editor.

Aceite:
- usuario entende o template ao olhar o preview
- inserir variavel nao vira friccao
- nao existe redirecionamento estranho

## Fase 6 - Agenda e Automacao

- Garantir abertura em popup externo.
- Nao usar popup interno para essas duas areas.
- Restaurar organograma e builder com espaco suficiente.
- Manter vinculo funcional com o Atendimento.

Aceite:
- organograma visivel sem estrangulamento
- troca entre Atendimento e popup sem perder contexto

## Fase 7 - Identidade Visual Final

- Reintroduzir pink como cor de assinatura.
- Reequilibrar green / teal como camada operacional.
- Revisar contraste geral.
- Consolidar o padrao glass como linguagem do sistema.

Aceite:
- o frontend volta a ter identidade marcante
- nao parece tema generico ou desbotado

## Validacao Final

- Testar filtro que zera a fila.
- Testar troca rapida entre conversas.
- Testar troca rapida entre filtros e abas.
- Testar painel direito sem truncamento importante.
- Testar `Acoes Rapidas` com textos maiores.
- Testar abertura de Templates Meta.
- Testar abertura externa de Agenda e Automacao.
- Testar desktop e mobile largo o suficiente para garantir que a shell nao colapse.