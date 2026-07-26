# S6 — Distribuição profissional dos APKs (parar de pagar download à toa)

## Problemas

1. **Fingerprint global** (`scripts/ops/deploy-vps.js:202-207`): a impressão digital que decide
   "o APK da logística mudou?" cobre `app/src` INTEIRO — incluindo `app/src/vendas/` e
   `app/src/test/`. Efeito: mexer no app de vendas (ou num teste unitário) muda a digital →
   publish carimba versionCode novo da LOGÍSTICA → todo motorista baixa 1,8 MB por nada. Isso
   quebra exatamente a regra do dono que motivou a digital ("se o app não alterou não tem que ter
   incrementação", 22/07).
2. **Piso manual do versionCode** (`EntregaShell/app/build.gradle.kts:24-35`): 3 incidentes
   (8→15, 15→18, 18→38) porque instalar build de teste na mão exige lembrar de subir o literal.
   Hoje o piso é 38 e o ar está no 44.
3. **Lixo em `EntregaShell/dist/`**: 5 APKs de eras diferentes (hbx-entrega-1.0.1/1.0.2,
   Loghbx/Salehbx antigos) — untracked, mas confunde ("qual é o bom?"). O artefato de verdade
   mora no VPS.
4. Sourceset `app/src/videoStudio/` = 1 AndroidManifest morto + buildType videoStudio no gradle:
   escopo de OUTRO produto dentro do shell do entregador.

## O que fazer

1. **Digital por flavor**: `apkFingerprintRoots` da logística passa a ser
   `app/src/main` + `app/src/logistica` + os gradle files (SEM vendas, SEM test). Se o publish de
   vendas continuar existindo (decisão S4), digital própria com `app/src/main` + `app/src/vendas`.
2. **Piso automático**: gravar `EntregaShell/.hbx-versioncode-local.json` (gitignored) toda vez
   que um build manual for instalado (`INSTALAR.md` ganha o passo / script de install grava
   sozinho); o deploy-vps.js lê `max(floor do gradle, floor local, versionCode publicado + 1 se a
   digital mudou)` — o caso "instalei 37 na mão e o publish carimbou 37" morre de vez.
3. **Limpar `dist/`**: apagar os 5 velhos, deixar README de 2 linhas ("artefato oficial = VPS,
   /download/android-logistica; isto aqui é rascunho local").
4. **videoStudio fora do shell**: mover o buildType + sourceset pra fora do EntregaShell (ou
   apagar se `tools/hbx-video-studio` não usa — conferir `doctor.mjs` que referencia o shell).
   Decisão rápida com o dono se houver dúvida de uso.
5. **INSTALAR.md**: revisar pós-split (2 APKs, 2 applicationIds, como instalar cada um, floor).

## Verificação (gate)
- Publish com mudança SÓ em `vendas/`: digital da logística NÃO muda, versionCode NÃO sobe
  (testar com `--dry-run` se o script tiver; senão, comparar digital calculada antes/depois).
- Publish com mudança em `logistica/`: sobe 1x e o version-logistica.json do ar reflete.
- Build local + install manual grava o piso local; publish seguinte carimba acima dele.
