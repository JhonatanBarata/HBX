# RULE SHUTDOWN / LOGOUT SCREEN

## Objetivo

Garantir que a tela de encerramento de sessão (logout / farewell) seja legível, acessível e consistente com a linguagem visual do HBX em todos os temas (light/dark).

## Motivo

A tela de encerramento aparece em fluxo crítico de saída. Texto e indicadores devem manter contraste suficiente e hierarquia visual clara para evitar confusões e dar feedback confiável ao usuário.

## Regra

- A tela de "encerrando sessão" deve usar os tokens globais de cor (`--foreground`, `--surface-raised`, `--background`, `--line`) e garantir contraste adequado entre texto e fundo.
- Título principal (`Até já.`) precisa ter peso tipográfico forte (por exemplo `font-weight: 800/900`) e um sombreado leve para separar do plano de fundo quando houver efeitos visuais.
- O container (card) deve ter fundo e borda com mistura suficiente para se destacar do backdrop (usar `color-mix` com `--surface-raised` e `--background`), não ficar quase transparente.
- Evitar textos com opacidade reduzida sobre fundos com gradientes/pulsos que comprometam leitura.

## Implementacao recomendada

- Ajustar `.ui-shutdown-overlay__content` para usar `color-mix(in srgb, var(--surface-raised) 86%, var(--background))` como base do cartão, borda de `color-mix(in srgb, var(--line) 92%, var(--background))` e `backdrop-filter: blur(8-12px)`.
- Tornar o título (`.ui-shutdown-overlay__title`) `font-weight: 900` com `text-shadow: 0 12-16px rgba(6,24,40,0.10-0.14)`.
- Garantir que `--foreground` e `--foreground-soft` sejam usados nos textos e legendas, não valores inline.

## Checklist de aceitação

- [ ] Título principal é legível em light e dark (passa checagem manual).
- [ ] Texto secundário tem contraste suficiente com o fundo (passa checagem manual).
- [ ] O card se separa visualmente do backdrop (sombra/borda clara).
- [ ] Não há dependência de `alert()`/nativos; é um componente visual HBX.

## Referências

- [RULE UI UX GLOBAL](../RULE_UI_UX_GLOBAL.md)
- Variáveis globais em `frontend/src/app/globals.css`
