// ============================================================
// CELULAR — a régua ÚNICA do "isto é um telefone".
//
// LEI (06/08, dono): no celular o HBX não abre. Quem trabalha no telefone é o
// APLICATIVO; o navegador do celular só mostra a tela de baixar o app
// (ParedeCelular). Antes daqui saía a decisão de montar a "casca mobile" —
// um HBX inteiro que se transformava ao redimensionar. Isso foi apagado: não
// existe mais tela que vira outra tela quando muda a largura.
//
// A régua tem DUAS condições, e a segunda é a que importa:
//  · largura < 768px  → cabe num telefone;
//  · pointer: coarse  → é DEDO. Mouse/trackpad é `fine` e NUNCA cai na
//    parede, por mais estreita que a janela do computador fique.
// Foi assim que o remendo de 29/07 matou o "estreitei a janela e o sistema
// virou telefone". Mantido palavra por palavra.
//
// FRONTEIRA SERVER/CLIENT: estas constantes vivem aqui, SEM React e SEM
// "use client", porque o script de boot pré-pintura mora em app/layout.tsx
// (Server Component). Se o server importasse o hook (celular.ts, que chama
// useSyncExternalStore), o bundler puxaria o módulo inteiro pro servidor e o
// Next devolve 500 em TODA rota. Constante aqui; hook lá.
// ============================================================

export const CELULAR_BP = 768; // px — abaixo disto, e com dedo, é telefone

export const CELULAR_QUERY = `(max-width: ${CELULAR_BP - 1}px) and (pointer: coarse)`;

// <html data-hbx-celular="1"> — carimbo pré-hidratação (layout.tsx) que o CSS
// usa pra esconder o shell desktop ANTES do React hidratar, senão o telefone
// pisca a sidebar inteira antes da parede aparecer. Só a CHAVE do atributo; o
// valor nasce sempre de um matchMedia(CELULAR_QUERY) fresco.
export const CELULAR_ATTR = "data-hbx-celular";
