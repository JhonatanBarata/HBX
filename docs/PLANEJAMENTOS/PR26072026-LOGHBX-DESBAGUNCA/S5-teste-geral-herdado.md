# S5 — Teste geral herdado (S5+S6 do PR21072026-APK-PADRAO, nunca rodados)

## Contexto
A frente APK-PADRAO parou no S4 parcial ("verificação de tela interrompida pelo dono"). S5
(voltar/navegação/transições) e S6 (E2E assistido) estão escritos em
`docs/PLANEJAMENTOS/PR21072026-APK-PADRAO/` e NUNCA foram executados. Desde então entraram:
navegação HBX com voz, leitura de rota viva, conferência, agenda V2, som central, GPS de cadastro
por amostragem, split de apps — ou seja, o roteiro de lá está DEFASADO e o app nunca teve uma
passada de qualidade de ponta a ponta.

## Tarefas

1. **Atualizar o roteiro S6-TESTE-E2E-ASSISTIDO.md** com os fluxos novos:
   - Leitura de Rota completa (iniciar → parada nova/existente → obs → resumo → finalizar/salvar).
   - Navegação interna (painel, voz, recálculo com disjuntor, mudo).
   - Conferência (se S2 já ligou a flag na cobaia).
   - Chegada nos 3 (ou 2 — decisão nº3) níveis de financeiro.
   - Update do APK (modal, obrigatória bloqueando Voltar).
   - Limpar dia / encerrar rota / retomar após fechar o app no meio.
2. **Auditoria do Voltar físico (Lei 10) por tabela**: pra CADA modal do `modal()`
   (app.js:4158-4271) e overlay global (`confirmation`, `dddPrompt`, `leituraPausaPendente`,
   `creditsLock`, `nextStop`), registrar: fecha? volta passo? consome? A tabela vira anexo da
   constituição. (Leitura do código diz que está coberto — PROVAR na tela é o ponto.)
3. **Transições (Lei 9)**: abre/fecha seco em algum lugar? Conferir especialmente os fluxos novos
   (conferência, editor de rota salva, sons) nos 2 temas + `prefers-reduced-motion`.
4. **E2E assistido com o dono** (1 sessão marcada): o roteiro atualizado, no moto g15, com a
   config real (lembrar: "Avisar chegada" DESLIGADO pra não mandar zap de verdade — achado de
   21/07; ligar "Na hora" se o roteiro pedir folha completa).
5. Registrar TUDO em S5-RESULTADO.md (o que passou, prints, o que virou tarefa).

## Verificação (gate)
- Tabela do Voltar 100% preenchida com evidência de tela.
- E2E rodado com o dono presente; cada furo achado vira item numerado (não corrigir no meio do
  teste — anotar, corrigir depois, retestar só o furo).

## Dependências
- Roda DEPOIS de S1 (fumaça do split) e idealmente depois de S2 (pra testar conferência ligada).
- Aparelho: moto g15 via ADB (memória apk-teste-via-adb), build com floor atualizado.
