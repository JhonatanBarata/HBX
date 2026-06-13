# Pendências de Frontend / Produto — anotadas em 12/06/2026

> Ordens do dono durante a sessão. Não-prioritárias salvo indicação em contrário.
> Triagem 12/06 (sessão seguinte): itens já feitos saíram da lista ativa e
> ficaram no log "✓ Resolvido" no fim. O que continua aberto está em "Pendentes".

## Pendentes

### 2. Dashboard (frontend) — qualidade dos gráficos
- Quando o dono diz "trabalhar no dashboard", é o **frontend**: precisa **melhorar MUITO a qualidade dos gráficos** — **aparência** e **transitions/animações**.
- Hoje está "frouxo".
- Band-aids já removidos na origem (o bug de id/name virou item ✓3 resolvido). Falta o trabalho VISUAL: barras/áreas com entrada animada, gridlines/labels melhores, contadores, microinterações.
- **Status:** PENDENTE — visual e subjetivo; alinhar direção com o dono antes de um passe grande.

### 5. ✓ RESOLVIDO — HBX com 2 temas, não multi app (12/06, ordem do dono)
- **Decisão do dono: TEMA É SÓ PELE** (regra dura em `docs/Rules/FRONTEND.md` + REGRA ZERO do CLAUDE.md). Em seguida veio o go: "corrige isso, e deixe o HBX com 2 temas, não com multi app".
- **Executado (PR12062026005-TEMA-UNICO.md):** app único; tema = preferência `hbx:ws-theme` aplicada por atributo em todas as rotas; chavinha troca a PELE na mesma tela (sem navegação); `/workspace` morto (alias → `/dashboard`, page.client deletado).
- Validado no dev: troca em `/vendas` mantém a tela com tokens friendly; modo claro/escuro por tema persiste; redirect ok; lint+build ✓.
- **Sobras registradas no PR doc:** passe visual fino do friendly (só tokens), faxina do CSS inerte do antigo workspace, Recovery/Cadastros voltam como rotas quando ligarem.

### 6. Dois fluxos divergentes de criar vendedor (unificar)
- **Simples:** `/configuracoes` → "Convidar membro" (só e-mail + perfil).
- **Rico:** `/gerencial` (e `/vendas`, `/trabalhe-conosco`) → "Novo acesso" com documentação, contrato PDF, comissão, D+, CPF, endereço, indicado por/herança, enriquecimentos/dia, solicitar documentos.
- **Ação:** unificar — o cadastro de vendedor deve ser UM fluxo (o rico), e o "Convidar membro" simples aponta pra ele (ou morre).
- **Status:** PENDENTE — **NÃO é prioridade** (ordem do dono).

### 7. Config de e-mail/SMTP no admin
- O admin precisa ter **configuração de e-mail (SMTP)**.
- **Regra:** a empresa **HBX** usa o **SMTP do master (compartilhado)** — é a única compartilhada. As **demais empresas** podem **adicionar o próprio e-mail/SMTP** se quiserem (opcional).
- **Status:** PENDENTE — **gap de backend** (mail service hoje é global: `mail.service.ts` monta UM transport de ENV). Precisa de modelo SMTP por tenant + tela. **Enfileirado como E9** em PLAN12062026001 (toca secrets → ordem explícita do dono; não é edição ao vivo).

### 9. Módulo de onboarding/documentação do vendedor = OFF por padrão
- O fluxo rico de vendedor (documentação, contrato, e-mails **Onboarding do vendedor** + **Boas-vindas do vendedor**) é um **módulo que nasce DESLIGADO para os admins**.
- O admin **ativa em Configurações** se quiser usar. **Se não ativar, o módulo (e os e-mails/abas dele) não aparecem.**
- E-mails envolvidos (defaults no código, sem versão salva): `seller_welcome` (Boas-vindas) e `seller_onboarding_request` (Onboarding).
- **Correção (verificado 12/06):** o "typo `herança\indicação` (barra sobrando)" **NÃO existe** — o default lê `herança/indicação` (barra normal, correto) em `email-template.service.ts:211`. Nada a consertar aí.
- **Status:** PENDENTE — gating (flag de módulo por empresa, default OFF) é **backend+front**. **Enfileirado como E10** em PLAN12062026001.

## ✓ Resolvido (verificado no código em 12/06/2026)

1. **Auto-desativação do admin/master** — botões "Tornar Vendas/Admin", "Desativar" e "Excluir" ficam **desabilitados para o próprio usuário** (`ehEu`) na tabela Equipe de `configuracoes/page.client.tsx`; o backend também barra auto-gestão (PR12062026004). Não dá mais pra se trancar pra fora pela tela.
3. **Bug de id/name dos vendedores (dashboard + /relatorios)** — NÃO era a query do backend; era **tipagem no front**. O `/vendas/seller-audit` sempre devolve `seller.id` + `seller.name` (com fallback). Dashboard e Relatórios já consomem `v.seller.id`/`v.seller.name` corretamente (`key={v.seller.id}`, `Av name={v.seller.name}`). Sem band-aid de `key`.
4. **Tema Friendly não persiste / perde onde estava** — RESOLVIDO nesta sessão (12/06): trocar de tema **mantém a tela**. Mapa de rota⇄view em `shell.tsx` (`friendlyViewForPath`/`corpPathForFriendlyView`/`WS_VIEW_KEY`); Corporativo→Friendly leva a tela atual; Friendly→Corporativo cai na rota equivalente; `/workspace` persiste e retoma a última `view`. A escolha de tema (`hbx:ws-theme`) já persistia.
8. **Linkar /gerencial no menu** — item **"Gerencial"** no menu do avatar (`shell.tsx`, Topbar) visível para ADMIN/master.
