// ============================================================
// MOBILE-CASCA — constantes NEUTRAS de ambiente da casca de celular.
//
// Este módulo NÃO importa React e NÃO tem "use client" DE PROPÓSITO. O
// breakpoint/atributo é compartilhado entre o SERVIDOR (o script de boot em
// app/layout.tsx, um Server Component) e o CLIENTE (o hook useCascaMobile em
// casca-mobile.ts, que chama useSyncExternalStore — só-cliente). Se o server
// importasse QUALQUER símbolo de casca-mobile.ts, o bundler puxaria o módulo
// INTEIRO — incluindo o hook client — pro bundle do servidor, e o Next recusa
// (500 em TODA rota). A fronteira limpa é: constante mora AQUI; hook mora lá.
// casca-mobile.ts re-exporta estes nomes, então quem já importava de lá (client)
// continua funcionando sem mudança.
// ============================================================

export const CASCA_BP = 768; // px — abaixo disto = celular (casca)

export const QUERY = `(max-width: ${CASCA_BP - 1}px)`;

// <html data-casca-boot="mobile|desktop"> — stamp pré-hidratação (layout.tsx)
// que o CSS usa pra esconder a sidebar desktop / mostrar o loader HBX antes de
// o React hidratar. Só a CHAVE do atributo; o valor nasce sempre de um
// matchMedia(QUERY) fresco.
export const CASCA_BOOT_ATTR = "data-casca-boot";
