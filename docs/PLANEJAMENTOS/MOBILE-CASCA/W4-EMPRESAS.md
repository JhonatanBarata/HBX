# W4 — EMPRESAS mobile (mockup aprovado 3)

> Ler PLANO.md + docs/Rules/FRONTEND.md + W1-RESULTADO.md. Componentes da casca nova. Desktop de
> `/empresas` INTOCADO. Endpoints do NÚCLEO-CRM existentes; edição reusa os modais do núcleo
> (`editar-nucleo-modais.tsx`) apresentados dentro de CascaSheet. Zero backend.

## Lista (registrada pra `/empresas`)
- Topo: "Empresas" + botão compacto 28px "+ Nova".
- Busca 36px (nome, CNPJ, cidade…). Stats 1 linha 11px: "{n} empresas · {n} clientes".
- Linhas 60px: avatar quadrado 32 (iniciais), nome 13px/500, "cidade/UF · segmento" 11px muted,
  **badge única** ("cliente" verde | "lead" neutro), chevron. **≥8 visíveis.**

## Ficha (CascaSheet sobre a lista)
- Header: avatar 40 + nome 15px/500 + "cidade · segmento · status" + lápis (editar → modais núcleo).
- **3 ações que cruzam a casca:** "Conversar" (→ chat da empresa em Conversas), "Ligar" (`tel:`),
  ícone funil (→ card dela em Vendas). Navegação com transição IR.
- Tabela resumo 12px: Telefone · CNPJ · Endereço · Contato · Origem · No funil (etapa + valor).
  Dado sem cadastro = "—". Rodapé micro: "Última conversa {quando} · {n} não lidas".
- "+ Nova" abre cadastro mínimo em CascaSheet (nome, telefone, cidade) — resto se completa depois.
- Estados: carregando, vazio ("Cadastre a primeira empresa" + CTA), erro.

## Leis
Transição em tudo (sheet sobe/desce, navegações IR/VOLTAR). Casca inalterada. Anti-placona.
check-pele verde.

## Checks
Viewport 375×812: 8+ empresas; ficha sobe/fecha com transição; 3 ações navegam certo. Desktop
intocado. lint+tsc+build. Commit `feat(mobile-casca): W4 empresas`.
Gravar `W4-RESULTADO.md`, apagar este arquivo.
