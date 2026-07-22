# S8 — QA INTEGRAL: teste de qualidade das 3 frentes (gate de publish)

> Roda por último, com S1–S7 commitadas. Não corrige nada grande — registra veredito
> ✅/⚠️/❌ por item; ❌ pequeno e seguro pode ser corrigido na hora (anotar). Formato de
> saída: `S8-RESULTADO.md` com tabela + screenshots, veredito final GO / GO-COM-RESSALVAS
> / NO-GO (mesmo modelo do S10 da frente PADRAO-MERCADO).

## Matriz de resoluções (Chrome DevTools, 100% zoom, tema Aurora Mod claro + escuro)

| Apelido | Viewport |
|---|---|
| Notebook da vendedora | 1368x768 |
| HD | 1280x720 |
| Full HD | 1920x1080 |
| 4K | 3840x2160 |

## Roteiro

### A. Leis da casca (uma vez)
1. `cd frontend && npm run lint` — check-pele VERDE (zero hex/inline novo; catraca
   `pele-baseline.json` NÃO subiu).
2. `npm run build` verde; `cd backend && npm run build` verde.
3. Grep de auditoria: nenhum `font-size`/altura estrutural novo em `theme-*.css`/
   `casca-modern.css`; nenhum `*/` dentro de comentário CSS novo.

### B. Detalhes (cockpit) — nas 4 resoluções
4. Abrir lead → cockpit: header, 3 guias, coluna direita (Contato rápido, Agenda,
   Inteligência, Mensagem sugerida) e ações TODAS visíveis; `scrollHeight <=
   innerHeight` true; scroll interno só nos painéis.
5. Guias trocam com Glass Pill; conteúdo de cada guia sem corte; fechar por X e por
   clique no veil.
6. 4K: conteúdo cresce (comparar screenshot com FHD — fonte visivelmente maior, sem
   ilha de espaço morto).

### C. /vendas planilha — FHD + 1368
7. Colunas: ligar/desligar/reordenar; F5 mantém; relogin mantém; 2º usuário tem layout
   próprio; "Reiniciar layout" volta o default na hora.
8. Edição inline: nome, telefone (máscara BR ao exibir), e-mail, próximo passo, valor —
   Enter salva (persiste após F5), Esc cancela, Tab navega; erro de rede faz rollback
   visível. Célula não-editável não abre input.
9. 1 linha por lead (nada empilhado) nas 4 resoluções; ≥9 linhas visíveis em 1080p.
10. Checkbox do cabeçalho: marca todos → excluir em lote pede motivo (fluxo antigo);
    desmarca todos. Barra velha "Selecionar todos" NÃO existe mais.
11. Toolbar: 5 ações presentes e do mesmo tamanho; exportar CSV abre no Excel com
    acento certo e só colunas visíveis; "N cards" sumiu.
12. LEI DO VENDEDOR: logar com vendedor comum → coluna/célula Valor invisível e
    ineditável, CSV sem valor.
13. Buscar empresas: select-all no cabeçalho + linhas em 1 linha; puxar lead continua ok.
14. Quadro (kanban): NADA regrediu (drag entre colunas, valores por coluna).

### D. /automacao — FHD + 1368
15. Primeira dobra: 4 cards premium clicáveis (card todo), hover/teclado, skeleton novo,
    chip WhatsApp discreto, ZERO resto do hero antigo.
16. Cada seção: trilho de objetivos com Glass Pill, 2 colunas com preview onde há,
    fluxo configurar→salvar funciona (roteiro, sem disparo real de WhatsApp).
17. Empresa SEM os módulos (gate): cards certos escondidos, deep-link `?secao=` de seção
    bloqueada cai no hub.

### E. Transversal
18. Dark mode nas 3 frentes (amostra em cada resolução extrema).
19. Console do Chrome sem erro novo nas 3 frentes (warning pré-existente: anotar).
20. Smoke de não-regressão: /atendimento e /leads abrem e funcionam (compartilham
    detalhes-negocio/kit).

## Pronto-quando

`S8-RESULTADO.md` preenchido com os 20 itens + screenshots das 4 resoluções (cockpit e
/vendas no mínimo), veredito final dado, e lista de ressalvas (se houver) com dono da
correção. Publish continua sendo decisão do dono.
