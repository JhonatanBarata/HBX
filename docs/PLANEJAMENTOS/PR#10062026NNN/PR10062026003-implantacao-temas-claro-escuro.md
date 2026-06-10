# PR10062026003 — Implantação dos 2 temas (claro e escuro selecionáveis)

Data: 10/06/2026
Status: PLANEJADO — fila: executa DEPOIS do PR10062026002 (arquitetura pura)
Origem: 2 temas prontos em HTML/CSS criados pelo dono (design system próprio)

## Decisões do dono
- Formato: **HTML/CSS prontos** — tokens serão extraídos direto do código dos temas.
- Relação: **dois visuais selecionáveis, um escuro e um claro** — viram o par oficial do
  sistema, escolhíveis pelo usuário (trilho existente: `themePreferenceConfig`).
- Primeiras telas: **Login + Vendas** (porta de entrada + onde o vendedor vive).
- Ordem: **arquitetura antes, tema depois** — este plano só inicia após o PR10062026002.
- Regra para o que "não bate" (hero etc.): **o design do dono vence**; o que não tiver
  equivalente é proposto na página de calibração ANTES de tocar a tela real, ou morre.
- "Remover tudo do front atual" acontece NO FINAL: CSS antigo morre tela a tela, e os
  órfãos são apagados quando a última tela migrar — nunca um big-bang no começo.

## Pré-requisito (ação do dono)
Colocar os 2 temas em `docs/TEMAS/claro/` e `docs/TEMAS/escuro/` (HTML + CSS + assets),
ou informar os caminhos onde estão.

## Fases
- [ ] **T.1 Extração de tokens:** ler os 2 HTML/CSS e gerar
      `frontend/src/styles/themes/` com variáveis CSS por tema
      (`[data-theme="hbx-claro"]` / `[data-theme="hbx-escuro"]`): cores, tipografia,
      raios, espaçamentos, sombras. Inventário das variáveis atuais do app e mapa
      de-para (token novo → variável existente).
- [ ] **T.2 Página de calibração** (`/dev/tema`, atrás de guard): todos os componentes
      compartilhados renderizados nos 2 temas lado a lado (botões, inputs, cards,
      badges, tabs/guias, modais, tabelas). Iteração com o dono até bater pixel com o
      design. Nada de tela real antes disso.
- [ ] **T.3 Re-skin dos componentes compartilhados:** TopBar, HbxGuide1/4/5, painéis,
      formulários, badges, modais — uma vez, refletindo no app inteiro.
- [ ] **T.4 Migração Login + Vendas:** primeiras telas reais; validação do dono;
      itens sem equivalente no design passam pela calibração primeiro.
- [ ] **T.5 Demais telas em lotes:** gerencial → master → atendimento → radar →
      financeiro → site/landing (hero redesenhado conforme regra acima). CSS antigo
      apagado por tela migrada.
- [ ] **T.6 Seletor e limpeza final:** claro/escuro novos viram os temas oficiais no
      `themePreferenceConfig`; temas/CSS antigos e tokens órfãos removidos (aqui se
      cumpre o "remover tudo do front atual"). Legibilidade validada nos 2 temas
      (invariante do AGENTS.md).

## Salvaguardas
- Nenhuma tela perde funcionalidade na troca de pele — re-skin não é refatoração de
  comportamento (isso é assunto do PR10062026002).
- Cada lote de telas commitado com lint + build verdes e validação visual do dono.
