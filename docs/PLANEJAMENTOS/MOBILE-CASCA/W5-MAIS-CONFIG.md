# W5 — MAIS + CONFIGURAÇÕES mobile (curadas — o resto do sistema mora aqui)

> Ler PLANO.md + docs/Rules/FRONTEND.md + W1-RESULTADO.md. Ordem do dono: Configurações guarda
> "tudo o resto menos logística", **porém tudo que for IA e avançado NÃO existe no mobile** —
> "o sistema é feito para usar no desktop". Sem gambiarras de esconder: o que não entra na
> whitelist simplesmente não é renderizado. Zero backend.

## Folha "Mais" (CascaSheet da tab bar — transição de baixo)
Linhas 52px, mesma densidade da casca:
- Perfil (avatar + nome + empresa) no topo da folha.
- Notificações (sino — lista simples; o que era popover do desktop vira sheet).
- Relatórios → fallback "Disponível no computador" (não é tela mobile).
- Tutorial (link).
- Configurações (abre a tela abaixo, transição IR).
- Tema: modo claro/escuro + pele (controles compactos na própria folha).
- **Tela cheia** (toggle — usa util do W1; toast de aviso ao entrar. LEI do dono).
- Sair (vermelho, com confirmação em sheet).

## Configurações (registrada pra `/configuracoes`)
Whitelist curada (grupos de linhas 52px, chevron → sub-tela ou sheet, SEMPRE com transição):
- **Conta:** nome, e-mail, senha (form simples em sheet).
- **WhatsApp:** status do chip (verde/vermelho + nome da instância) + botão conectar/desconectar —
  reusa o fluxo canônico `whatsapp-connection-flow.ts` (NUNCA API crua do motor).
- **Equipe:** lista simples de membros (leitura; gestão fina = desktop).
- **Aparência:** modo + pele.
- **Fora da whitelist (não renderizar):** bot builder, IA/assistente, automações, integrações,
  cobrança/planos, webhooks e qualquer painel avançado → quem digitar URL direto cai no fallback
  central da casca.
- Gate de papel igual desktop (vendedor não vê o que não pode — `isModuleVisible`/roles existentes).

## Leis
Transição em tudo. Casca inalterada. Anti-placona. check-pele verde. Desktop de /configuracoes intocado.

## Checks
Viewport 375×812: folha Mais abre/fecha com transição; fullscreen com aviso; whitelist confere
(nada de IA visível). lint+tsc+build. Commit `feat(mobile-casca): W5 mais/config`.
Gravar `W5-RESULTADO.md`, apagar este arquivo.
