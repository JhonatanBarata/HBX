# HBX — Tema CLARO (referência de design)

Abra qualquer .html direto no navegador. Tudo auto-contido (HTML + CSS + imagens).

## Estrutura
- styles.css + tokens/ — design tokens (fonte da verdade de cores/tipo/raios/sombras)
- corporate/ — app Corporativo: Login, Dashboard, Leads, Webscraping, Vendas (index.html),
  Atendimento, Bot, Relatorios, Configuracoes (+ corporate.css e shell.jsx compartilhados)
- workspace/ — workspace Friendly (glass)
- assets/ — ícones SVG e logo

## Como os modos funcionam
A diferença claro/escuro é SÓ o atributo no <html> + os tokens:
- Corporativo: escuro é o padrão; claro = data-theme="corporate" data-theme-mode="light"
- Friendly: claro é o padrão; escuro = data-theme-mode="dark"
Nesta pasta os arquivos já vêm com o atributo do modo CLARO fixado.

Guia completo de implementação: ver README.md na raiz do pacote de handoff.
