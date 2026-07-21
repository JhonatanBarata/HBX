# PR21072026-APK-PADRAO — App Android 100% padronizado + Teste E2E assistido

**Dor do dono (21/07):** "cansei de achar um erro e aparecer outro q já foi corrigido antes" —
regressão e tela fora do padrão. Meta: UM app, UMA cara, zero layout bagunçado, e uma prova
de ponta a ponta gravada pelo dono no celular.

**Fonte da verdade dos padrões:** memória `androidapk.md` (10 Leis + catálogo de componentes).
Todo worker LÊ ela antes de editar. Resumo das Leis: excluir = segurar pressionado (NUNCA
lixeira); 3 molduras únicas (centerModal / sheet / app-confirm); teclado nunca cobre campo/CTA;
Enter avança e confirma no fim; cor só por token; erro humano via `humanApiError`; estados
padrão (skeleton/empty/aviso); copy mínima; transição em tudo; handleBack cobre tela nova.

## Escopo de arquivos

- `EntregaShell/app/src/logistica/assets/app/app.js` (~4300 linhas) — o app
- `EntregaShell/app/src/main/assets/app/app.css` (~800 linhas) — design system
- `EntregaShell/app/src/main/assets/app/native.js` — casca compartilhada (SÓ ler; mexer = pedir)
- **Backend/Kotlin: NÃO TOCAR** (nenhum sprint precisa; endpoint novo não existe nesta frente)

## Regras de execução (duras)

1. **SEQUENCIAL, 1 worker por vez** — S1→S2→S3→S4→S5 tocam o MESMO app.js/app.css;
   2 workers em paralelo no mesmo arquivo = colisão (regra da casa).
2. Branch atual (master), commit local por sprint, **NÃO publicar** — publish é do dono.
   O E2E (S6) NÃO depende de publish: APK rebuildado local fala com a API de prod.
3. Check mínimo por sprint: `node --check app.js` + screenshot ADB das telas tocadas
   (moto g15 serial `ZF5255SMWF`; coordenada = screenshot×1,2). Rebuild rápido:
   `gradlew.bat -p EntregaShell :app:assembleLogisticaRelease` + `adb install -r`.
4. **Não inventar copy nem componente novo** — é auditoria + convergência pro padrão que JÁ
   existe. Dúvida de forma = seguir o item mais novo aprovado pelo dono (centerModal da
   Leitura, chegada simples, rp2-*).
5. Worker que achar coisa fora do escopo do seu .md: ANOTA no resultado, não conserta.

## Sprints (ordem de execução)

| # | Arquivo | Tema | Risco |
|---|---------|------|-------|
| S1 | S1-limpeza-moldura-unica.md | Código morto + inline→classes + moldura/cabeçalho único | baixo |
| S2 | S2-teclado-enter-auditoria.md | Teclado não cobre nada + Enter avança/confirma em TODO form | médio |
| S3 | S3-exclusao-confirmacao.md | Segurar-pra-excluir em TUDO que remove + app-confirm nas destrutivas | baixo |
| S4 | S4-avisos-erros-chegada.md | Aviso único, erro humano em todo catch, chegada consistente nos 3 níveis | baixo |
| S5 | S5-voltar-navegacao-transicoes.md | handleBack completo + overlay nunca abre seco + setas padrão | médio |
| S6 | S6-TESTE-E2E-ASSISTIDO.md | Prova de fogo gravada pelo dono (roteiro completo) | — |

Cada sprint tem: Evidência (linha real do código), Tarefas, NÃO-fazer, Checks, Pronto-quando.

## Critério de pronto da frente

- As 6 telas-mãe (Rota, Clientes, Produtos, Ajustes, wizard Leitura/Manual, Salvos) e TODOS os
  popups usam exclusivamente as 3 molduras + componentes do catálogo.
- Zero lixeira/botão de excluir; zero alert/confirm nativo; zero hex fora do app.css.
- Teclado aberto: campo focado e CTA visíveis em TODOS os forms (não só nos 3 que já têm sticky).
- S6 roda liso de ponta a ponta com o dono gravando, incluindo fiado→pagamento na 2ª rota,
  edição de itens na chegada, observações aparecendo e saldo batendo.
