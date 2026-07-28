// Distribuição do app de celular (Loghbx.apk) — FONTE ÚNICA do link de download.
//
// Este valor nasceu copiado em 5 telas (painel de Configurações → Aplicativo,
// card de login mobile, topbar do dispositivo, landing e a página /rota do
// site). Mudar a env num lugar deixava os outros 4 apontando pro caminho velho —
// exatamente o que a Lei nº2 do Design System proíbe ("uma fonte só", a mesma
// regra que manda as máscaras BR viverem em lib/format.ts).
//
// NEXT_PUBLIC_ANDROID_APK_URL é trocada em BUILD (Dockerfile/compose e os
// scripts de deploy); o fallback é a rota dedicada que o nginx serve
// (deploy/nginx/hbx-android-download.conf) — assim a tela nunca fica sem link.

export const MOBILE_APK_URL = String(
  process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/download/android-logistica",
).trim();
