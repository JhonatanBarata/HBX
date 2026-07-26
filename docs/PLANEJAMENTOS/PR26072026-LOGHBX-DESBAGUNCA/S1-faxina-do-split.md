# S1 — Faxina do split vendas/logística (o resto da cirurgia de madrugada)

## Contexto
A separação dos apps (c82db62a, 26/07 02:04) precisou de 2 hotfixes em 90 min (25f8e182 03:35,
f2baa652). Ficou resto de "app unificado" dentro dos dois APKs. Esta sprint fecha a cirurgia.

## Tarefas

1. **Matar o switch placebo "Módulos"** — `logistica/assets/app/app.js`:
   - Remover a seção Módulos do `settingsScreen()` (linha ~3921).
   - Remover a action `module-toggle` do dispatcher (linhas ~6153-6162).
   - Prova de que é placebo: os únicos leitores de `H.modules` no app são essas duas pontas;
     `moduleActive` é `let moduleActive = true` fixo (linha 238). O toggle grava um cache que
     NINGUÉM consome → usuário desliga "Logística" e nada acontece.
2. **Enxugar a máquina de módulos do `native.js`** (main/assets/app/native.js):
   - `HBX.modules` (438-451): remover (checar antes se o app de VENDAS também não lê — hoje não).
   - `mobileShell.navigation()`/`navigate()` (469-476, 646-652): cada flavor só tem UM conjunto de
     telas agora; manter a assinatura, mas apagar o ramo do outro app é opcional — se apagar,
     conferir que o app de vendas continua navegando (ele usa o ramo "vendas").
   - Handler `[data-destination]` (734-744): as referências `HBX.salesModule`/`HBX.logisticaModule`
     não existem em nenhum flavor → simplificar pro caminho único do `context.navigate`.
3. **Constituição × código da chegada**: o hotfix fez `deliveryOfflineSheet()` virar alias de
   `deliverySimpleSheet()` (app.js:4104-4106) — a folha financeiro-OFF agora mostra o bloco
   "Entregar" (produtos), sem dinheiro. A memória ANDROIDAPK descreve 3 molduras distintas.
   → Colher a decisão nº3 do dono (00-ORQUESTRACAO) e ALINHAR: ou reverte o alias, ou atualiza a
   constituição (`~/.claude/.../memory/androidapk.md`) pra "2 molduras + flag de dinheiro".
4. **Passada de fumaça no aparelho (moto g15)** — roteiro mínimo pós-split:
   - Abrir cada uma das 4 telas (Rota, Clientes, Produtos, Ajustes) nos DOIS temas.
   - Abrir cada modal do `modal()` (app.js:4158-4271 — lista completa lá) e fechar por: X, toque
     no fundo (quando aplicável) e Voltar físico.
   - Montar rota → prévia → gerar; chegada nos 3 níveis de config; recarga (vitrine).
   - No app de VENDAS: boot, funil, radar, recarga — só conferir que ABRE (a lei dele é S4).
5. Registrar no arquivo `S1-RESULTADO.md` o que passou/quebrou com print de tela.

## Verificação (gate)
- `grep -n "H.modules" EntregaShell/app/src -r` → zero uso fora de `native.js` (ou zero total se
  o passo 2 remover a definição).
- Roteiro do passo 4 executado no aparelho — **sem publicar antes de rodar o roteiro**
  (regra: publicar sem abrir o app = entregar quebrado, 22/07).
- versionCode piso: se instalar build manual no g15, SUBIR o floor em `build.gradle.kts:35`
  (já mordeu 3×).
