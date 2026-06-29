# Modo Foco GAME — conceito e decisões (travadas no brainstorm)

Por que existe: **centralizar o foco do vendedor**. Tira a mistureba de
segmento/cidade da frente; deixa cristalino o que fazer. Tipo "modo jogo": a tela
só aceita o teu foco. Ótimo pra novato e pra hiperativo (caso do dono).

## Decisões DURAS (não reabrir)

### 1. As 4 etapas = JORNADA, não tempo
`Pesquisa → Análise → Atendimento → Fechamento` (uma esteira/kanban; o lead anda da
esquerda pra direita; tem progressão e "gol" no fim).
- **Rejeitado:** `Atrasado / Hoje / Futuro / Negativados`. Reintroduz passado e
  fracasso — a zona que o modo quer matar. Num modo com pesquisa nova + teto de 10,
  as caixas de tempo nascem vazias e sem sentido. "Negativado" nem é etapa (é lista
  de exclusão).

### 2. Modelo = SPRINT/missão RECUPERÁVEL (não arquivo destrutivo)
- Cada foco é uma **sala limpa, autocontida**: 1 cidade + 1 segmento, até 10 leads.
- Trocar de foco/sair = a missão atual vai pra um arquivo **acessível e recuperável**
  (ao sair do modo). **Arquivado ≠ deletado.** O efeito visual pode dramatizar
  ("queimou"), mas o dado fica resgatável em 1 clique.
- **Por quê:** versão destrutiva (esconder pipeline pra sempre ao trocar de foco)
  destrói carteira = destrói comissão = churn. A mesma feature constrói OU destrói —
  o que decide é a recuperabilidade.

### 3. Missões paralelas — modelo de divisão
- **Uma missão na tela por vez.** As outras ficam *paradas* (pílula no topo), **nunca
  renderizadas juntas**. Troca, não empilha (tipo abas de navegador onde você só olha
  uma).
- Teto **10 leads POR missão**; **máximo 2 missões** (3 no plano alto).
- "Trocar o foco" que ARQUIVA = **sair do modo** ou **fechar a missão**. Flipar entre
  as abas paradas **não** arquiva (são todas a jornada atual). Resolve a contradição
  com a regra "trocou, arquiva".

### 4. Teto de 10 leads ativos (por missão)
- É **opt-in do vendedor** (ele escolhe entrar no foco), não admin amordaçando. Por
  isso NÃO contradiz a "Lei do Vendedor" (cap de 20 morto). Filosoficamente OK.
- Pode virar config por plano/cargo depois (10 pode ser pouco pro closer experiente).

### 5. Entrada gated por Atendimento configurado
Só entra no modo se o módulo **Atendimento** está configurado (sem inbox, a coluna
"Atendimento" é morta). Reusar o sinal `canAtendimento` (`/modules/me`).

### 6. Plano: consome + descarta — COM guardrail de confiança
- Avisar no ritual: **consome do plano enquanto pesquisa** + **pesquisa fora do foco é
  descartada** (recuperável ao sair).
- **Guardrail (não furar a confiança):** cache da pesquisa por X horas / **não
  recobrar** a re-busca do mesmo `segmento+cidade` dentro da janela. Senão vira
  pegadinha ("paguei 500 buscas e o sistema apagou quando troquei de cidade") →
  reembolso + reputação.

### 7. WhatsApp realce = só do NOSSO lado
Cards de Atendimento derivados do foco ganham um **realce/badge no NOSSO inbox**.
**Nunca toca o chip/conexão/envio** (zona de ban — ver CLAUDE.md / Webwhats). É tag
visual, ponto.

### 8. Sem modo lista dentro do foco
No foco não existe "modo lista" — só o tablado. Sair do foco devolve a lista normal.

### 9. Config: vendedor monta a dele, admin põe o teto
Filosofia do dono: **"config chata no começo, deixa pronto, depois uma criança de 5
anos ativa."** Cada vendedor monta o foco dele; o admin aplica os **limites do plano**
por cima (máx de missões, teto de leads). O robô v2 é o que automatiza a "config
chata" depois (ver `05-robo-prospector.md`).
