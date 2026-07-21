# S08 — Galeria de templates ("fácil de cadastrar")

**Worker: Sonnet · Depende de: S02-S07 · Front-only**

## Objetivo
O "fácil de cadastrar" do pedido do dono, no padrão ManyChat/Intercom: a entrada
principal de quem chega zerado é ESCOLHER um modelo pronto e editar — nunca
construir do zero. Os modelos JÁ EXISTEM como seeds/templates no código; a sprint
os torna visíveis e bonitos.

## Inventário do que já existe (reusar, zero conteúdo novo)
- Atendente IA: templates `ágil/flexível/avançado` (wizard passo 3, com contagem
  de mensagens/condições).
- Atendente Roteiro: roteiro 7 peças seed.
- Prospecção: 3 personas de cadência (Confiável/Estratégico/Determinado) com
  timeline completa.
- Regras: exemplos QUANDO→ENTÃO dos empties (S07).

## Arquivos
- EDITAR `secao-atendente.tsx` (wizard), `secao-prospeccao.tsx`, `page.client.tsx`
  (hub — entrada "começar por um modelo" quando tudo é rascunho/vazio)
- EDITAR `frontend/src/app/hbx-theme/automacao.css`

## Tarefas
1. **Card de template padrão** (classe central): `MiniFluxo` do fluxo + nome ≤3
   palavras + métricas do modelo (ex.: "3 toques · 1 WhatsApp") + CTA "Usar".
   Um único componente/classe pros 3 contextos.
2. **Wizard do Atendente**: passo dos templates vira galeria com esses cards
   (mini-preview do fluxo em vez de linha de texto). Escolher → pré-carrega →
   usuário edita — fluxo atual mantido, só a cara muda.
3. **Prospecção**: os 3 cards de persona ganham o MESMO tratamento visual de card
   de template (já são templates — a S05 pôs a prévia; aqui alinha a moldura).
4. **Hub**: empresa com tudo rascunho/vazio (estado real de quem acabou de ganhar
   o módulo) vê no topo uma faixa "Começar por um modelo" com os cards — 1 clique
   cai na seção certa com o template pré-selecionado (query param, ex.
   `?secao=atendente&template=agil` — VERIFICAR o mecanismo de secao existente e
   seguir o padrão).
5. QA local: fluxo completo de empresa "zerada" (usar conta de teste, NÃO a
   empresa 5 do dono se implicar sobrescrever config real — na dúvida, testar só
   até a pré-seleção sem salvar).

## Aceite
- Nenhum template novo inventado — só os seeds existentes, visíveis e clicáveis.
- Entrada por modelo funciona do hub até a seção com pré-seleção.
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S08 — galeria de modelos prontos como porta de entrada`
