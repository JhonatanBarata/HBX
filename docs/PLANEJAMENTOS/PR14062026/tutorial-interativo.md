# Tutorial interativo "TOP" (PLANO, 14/06/2026)

> Ordem do dono: tutorial estilo JOGO que força o clique e mostra o que cada coisa
> faz. Abre com splash estilo Windows. Foco clique-a-clique em **Leads, Vendas,
> Atendimento**. Dashboard/Relatórios = resumo que "digita" (letra por letra).
> THEMES logo no começo (mudar cor, escurecer/clarear). Fim: "quer ver os planos
> avançados?" Sim/Fechar + "ficou dúvida?" → WhatsApp pro dono. Por CARGO (raso).
> Vamos ÍCONE POR ÍCONE, juntos.

## Minhas LIMITAÇÕES (o dono pediu sinceridade)
1. **Não "vejo" as telas.** Elas exigem login (não entro na conta do dono) e o
   screenshot trava nesta máquina. Eu "abro tela por tela" LENDO O CÓDIGO (já li
   todas hoje) — sei o que é clicável por aí, não por ver. Pro mapa de cliques
   isso basta; o RITMO/"como humano vê" o dono confirma.
2. **Não vejo o MOVIMENTO** (aba do preview oculta pausa animação CSS). O dono é
   meus olhos pra timing/feel.
3. **Apontar no elemento real é frágil** (acopla no DOM). Ancoro nos ESTÁVEIS: itens
   da sidebar têm id fixo (dash/leads/scrape/vendas/atend/bot/relat/config) e o topbar.
4. **"Forçar clique" (game)** ok, mas trato quando o alvo não existe pro cargo/plano
   (vendedor não tem Planos; Atendimento desligado) — senão trava o jogo.
5. **WhatsApp do "ficou dúvida" — JÁ EXISTE no backend (consultado).** Rota
   `POST /support/contact-admin` (público), body `{companySlug, username, phone, message}`
   → `SupportService.contactAdmin`: e-mail pro dono (`ADMIN_SUPPORT_EMAIL`=jbinformatica1100@gmail.com)
   + WhatsApp saindo da empresa pro `ADMIN_SUPPORT_PHONE` (hoje ++5519997024884; pra ir
   pro chip HBX 19 92012-1720, setar a env) + ticket do dono. SEM abrir wa.me externo. No
   F5 o botão "ficou dúvida" chama essa rota com nome/telefone/empresa do current-user.
6. **Não invento imagem.** Pro passo "ativar pelo Meta", preciso da IMAGEM do Meta.

## O que preciso do dono pra perfeição
- [ ] **Imagem do Meta** (ele vai subir) → frontend/public/.
- [ ] **Número do dono** p/ "ficou dúvida" (achei 55 19 99702-4884 no código antigo) e
      POR ONDE manda (WhatsApp empresa / e-mail / sino) → define se é backend.
- [ ] **OK nos textos** (eu rascunho os resumos/passos, ele aprova).

## Mapa por tela — o que dá pra clicar (lido do código)
- **Topbar (sempre):** seletor de PELE (`Aurora ▾` = mudar cor), sol/lua (escurecer/
  clarear), "+" (novo lead), sino (avisos), balão (atendimento), avatar (Config/
  Tutorial/Gerencial/Reset senha/Sair). → **TEMAS entram AQUI, no começo do tutorial.**
- **Sidebar:** Dashboard, Leads, Radar, Vendas, Atendimento, Bot, Relatórios, Config
  (cada um aparece só se o cargo/plano libera).
- **Leads** (foco clique-a-clique): chips de etapa (filtro), painel "puxar leads"
  (alcance 0/25/50/100km), linha da tabela, painel direito (Iniciar conversa), distribuir.
- **Vendas** (foco): Lista/Quadro, cards da esteira, painel direito (Fechar venda,
  Resultado da ligação, Agendar, **Cadastrar cliente** ← passo do Gerente, Mover etapa,
  tarefas), gavetas (Cliente/Prospecção/Agenda).
- **Atendimento** (foco): se LIGADO, ensina (conversas, responder); se DESLIGADO,
  mostra que existe + "Conectar WhatsApp" → QR (modal já existe) **ou** Meta (imagem).
- **Dashboard / Relatórios:** sem clique-a-clique — resumo que DIGITA (typewriter).
- **Configurações (Dono):** Plano e cobrança / Planos.

## Fluxo proposto do tutorial
1. **Splash boot** — Detectando acesso → Localizando empresas → Aquecendo os motores. ✅ FEITO (boot-splash.tsx, na /tutorial por ora).
2. **Boas-vindas + TEMAS** — "essa é a sua casa; troque a cor e o claro/escuro aqui"
   (destaca PeleSwitch + sol/lua). As "patifarias" logo de cara.
3. **Tour por cargo (raso):**
   - Vendedor: Leads → Vendas → Atendimento (clique-a-clique, força o clique).
   - Gerente: + como **cadastrar clientes** (Vendas → Cadastrar cliente).
   - Dono: tudo do gerente + **Planos**.
4. **Dashboard & Relatórios** — card de resumo com efeito de digitar.
5. **Fim** — "Quer conhecer os planos mais avançados / tudo que dá pra fazer?"
   [Sim] [Fechar]. Abaixo: "Ficou alguma dúvida?" → dispara pro WhatsApp do dono
   ("cliente X, telefone Y precisa de atenção"), sem abrir o app externo (BACKEND).

## Motor técnico (a construir, ícone por ícone)
- **Engine de coachmark:** overlay com "buraco" no elemento-alvo (clip), balão de
  texto, e BLOQUEIO até clicar no alvo certo. Ancora por seletor estável.
- **Typewriter:** componente que escreve o texto letra a letra (respeita reduced-motion).
- Tudo em classe central (.tut-*), por token (Leis 4/5). Conteúdo por cargo/plano
  numa fonte única (estende tutorial-chapters.ts).

## Faseamento
- **F1 (feito):** splash.
- **F2:** boas-vindas + TEMAS + engine de coachmark (1 passo de prova).
- **F3:** Leads → Vendas → Atendimento (com você, ícone por ícone).
- **F4:** typewriter Dashboard/Relatórios + tela final (planos).
- **F5:** "ficou dúvida" → WhatsApp do dono (backend; precisa nº + canal).
