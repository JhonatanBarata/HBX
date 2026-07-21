# S03 — Atendente: Ajustes da IA + copy no teto

**Worker: Sonnet · Depende de: S01 · Front-only**

## Objetivo
Fechar o buraco A2 (QA 21/07): o cérebro IA não tem painel de Ajustes — persona
(nome/tom/perfil/produtos) só existe no wizard; mudar qualquer coisa = "Refazer" do
zero. Todo concorrente edita persona em 2 cliques. E aplicar as Leis de copy na seção.

## Arquivos
- EDITAR `frontend/src/app/(app)/automacao/secao-atendente.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css` (se precisar de classe nova)

## Tarefas
1. **Ajustes do cérebro IA**: no editor com `cerebro === "ia"`, botão "Ajustes"
   (espelho do que o Roteiro já tem no canvas — mesma linguagem) abrindo painel com
   nome, tom (pills), perfil (pills), produtos, nome da empresa — os MESMOS campos
   do wizard (`IaConfig`, linha ~84). Salvar usa o MESMO `PUT /automation/agent`
   com `{ia: {...}}` que o wizard/seedIa já usam (linhas ~622-636) — zero rota nova.
   O view (`view.ia`) já traz os valores atuais (linhas ~588-591) — pré-popular.
2. **"Refazer" deixa de ser a única porta** — mantê-lo, mas o rótulo/posição não
   pode sugerir que é o jeito de editar (Ajustes assume esse papel).
3. **Copy no teto** (Lei 1): varrer a seção — subtítulos de rail ("o que a IA fala,
   na ordem" / "como interpretar a resposta do cliente") podem ficar (≤70 chars,
   1 linha), mas qualquer frase acima disso vira tooltip ou some. Placeholder do
   sandbox e microtextos: revisar contra o teto.
4. **Sandbox**: quando cair no roteiro de reserva (IA indisponível — timeout A1),
   a nota "roteiro de reserva — IA indisponível" deve ser VISÍVEL e honesta
   (StatusChip `atencao` + 1 linha), não rodapé apagado — o usuário precisa saber
   que aquilo NÃO foi a IA.
5. QA local: wizard → editor → Ajustes → salvar → recarregar (valores persistem);
   trocar cérebro; sandbox nos 2 cérebros; nada de regressão no canvas do Roteiro.

## Aceite
- Persona editável pós-wizard sem Refazer, persistindo via PUT existente.
- Fallback do sandbox visualmente inconfundível com resposta da IA.
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S03 — ajustes do cérebro IA + copy enxuta no atendente`
