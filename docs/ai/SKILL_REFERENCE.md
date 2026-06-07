# HBX Skill Reference

Esta e a referencia documental da skill HBX `project-standards`.

A skill real fica fora do repositorio Codex, mas este arquivo registra o conteudo operacional essencial para que agentes futuros encontrem o mesmo norte dentro do repo.

## Norte do produto

HBX e uma esteira de prospeccao:

```text
Radar -> Vendas -> WhatsApp -> Retorno
```

Antes de editar:

1. ler o padrao atual do arquivo/modulo;
2. reutilizar componente, service, DTO, helper, rota e estilo existentes;
3. fazer a menor mudanca que resolve o pedido;
4. nao refatorar fora do escopo;
5. manter textos publicos em PT-BR;
6. validar build/lint/teste quando tocar area critica.

## UI operacional

Padronizar UI deve reduzir codigo especifico de pagina.

- Criar tokens, keyframes e classes globais uma vez.
- Aplicar classes globais nas paginas em vez de duplicar CSS local.
- Remover animacoes locais quando o padrao global substituir.
- Nao criar variacao nova se um `hbx-*` existente resolve.

Padroes obrigatorios:

- `guia1`: usar `HbxGuide1`, `hbx-guide1-slot`, `hbx-guide1`, `hbx-tab-glide`.
- `guiaesquerdovertical`: usar `HbxGuide4`, `hbx-guide4-slot`, `hbx-guide4`.
- `subguia`: usar `hbx-guide5` quando houver trilho horizontal operacional.
- Containers desktop: `hbx-desktop-container`, `hbx-content-container`, `hbx-content-container--plain`.

Paginas operacionais desktop (`Vendas`, `Cadastros`, `Financeiro`, `Gerencial`, `Banco de Dados`, `Master`) nao devem usar hero/header visivel do `DashboardScaffold`; devem usar `hideHeader` e comecar por `hbx-guide1-slot`.

## Mobile e desktop

- Mobile: simples, rapido, guiado; poucos botoes, cards claros, WhatsApp facil, retorno facil.
- Desktop: cockpit; pode ter filtros, paines, funil, campanhas, motores, relatorios e visao avancada.

## Tipografia

Fonte padrao:

```css
font-family: var(--font-body, "Plus Jakarta Sans", Inter, "Segoe UI", Roboto, Arial, sans-serif);
```

Regras:

- texto comum: 400-600;
- labels/badges/metadados: 600-700;
- botoes/chips importantes: 650-750;
- titulos/heroes: 700-800;
- evitar peso 900+ salvo caso pontual;
- evitar text-shadow, filter, blur ou glow em texto;
- manter `letter-spacing: 0` em titulos e botoes, salvo label uppercase pequeno.

## Radar e negativos

Radar Digital e banco/memoria de leads e oportunidades.

- Radar nao vende resultado de busca.
- Radar vende oportunidade real.
- Fonte generica serve para descobrir empresa, nao para virar card.
- Card sem empresa real e lixo, mesmo com texto bonito.
- Card de empresa real com canal publico e util, mesmo sem telefone.
- Negativo nao e lixo; e protecao contra repeticao e bagunca.

## Cobranca e acesso

Regra basica: nao deixar cliente usar recurso pago sem estar cobrado/autorizado.

Nao bypassar:

- plano;
- pagamento;
- assinatura;
- entitlement;
- quota;
- status comercial;
- backend como fonte de verdade.

## Tema claro/escuro

Qualquer mudanca visual nova deve funcionar em light e dark.

- Nao hardcodar card branco, texto azul/preto, borda clara ou sombra clara sem par dark.
- Preferir tokens (`--surface`, `--foreground`, `--muted`, `--line`, etc.).
- Se o arquivo usa seletores de tema, adicionar/revisar equivalente claro/escuro.
- Validar contraste de texto, botao, borda, input, placeholder, badge e icone.

## Seguranca

Nunca:

- remover auth/autorizacao para resolver rapido;
- expor segredo/token/senha;
- usar mock em fluxo real;
- quebrar pagamento, plano ou WhatsApp;
- apagar historico comercial sem pedido explicito;
- criar fallback que libera modulo pago ou critico.

## Checklist final

Antes de finalizar, confirmar:

- fortalece `Radar -> Vendas -> WhatsApp -> Retorno`;
- mantem cobranca/acesso corretos;
- preserva negativos/historico;
- mobile ficou simples;
- desktop ficou poderoso sem baguncar;
- light e dark continuam legiveis;
- nao mexeu fora do escopo;
- build/lint/teste relevante foi rodado ou explicado.

