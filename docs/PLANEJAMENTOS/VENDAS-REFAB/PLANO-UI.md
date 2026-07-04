# Refab UI /vendas "Buscar empresas" (itens 2-9 do dono, 04/07) — modelo site famoso / CNPJ Biz

> Segue a ÁRVORE e o design system (5 Leis, `docs/Rules/FRONTEND.md`). Workers implementam LOCAL, não publicam.
> "não quero erros imbecis de filtro" — nada de campo que a base não entrega.

## Layout alvo da tela (photo do dono)
- **Coluna DIREITA = 1 painel só:** (a) **radar DECORATIVO** — mosaico de cores, SEM estados/regra por trás (item 8: acabaram "Em pausa/Pronto pra buscar"); (b) **filtros ATIVOS** (chips do que está filtrado); (c) **filtro BÁSICO** (item 3); (d) botão **"Filtro avançado"** (item 3b). Clicou num lead da lista → **abre o lead** (detalhe). Item 7: o filtro fica ANCORADO, não sai do lugar / não empurra layout.
- **Coluna ESQUERDA = resultados.** Botão/aba **"Disponíveis"** = o que o FILTRO da pessoa resultou (item 6): contagem + lista.

## Item 3 — Filtro BÁSICO (criativo, estilo site famoso)
Caixa de busca onde a pessoa digita o que quer (ex.: "restaurantes em São Paulo com WhatsApp") + os essenciais em destaque: Estado/UF, Cidade, Segmento/CNAE, TEM SITE, TEM WHATSAPP. Criativo mas dentro do design system.

## Item 4 — Filtro AVANÇADO (popup lindo, design system, SÓ colunas REAIS do RFB)
Fonte da verdade = `CnpjPublicCompany` (backend/prisma/schema.prisma). Colunas POPULADAS = oferecer:
- **CNAE principal + secundário** (catálogo `CnpjPublicCnae`) + descrição.
- **Situação cadastral** (`situacao`).
- **Porte** (`porte`).
- **Matriz/Filial** (`matrizFilial`).
- **Natureza jurídica** (`naturezaJuridica`).
- **Capital social** min/max (`capitalSocial`).
- **Data de abertura** faixa/idade da empresa (`openedAt`).
- **Simples** (bool) · **MEI** (bool).
- **Cidade/UF** (`city`/`state`).
- **Contato:** tem telefone (`phone`/`phone2`) · tem email (`email`) · tem site (`website`) · WhatsApp provável.
- **Sócio/dono** (`ownerName`, `ownerQualification`).
- **Qualidade anti-contador:** número/email pouco compartilhado (`phoneShareCount`/`emailShareCount`).
- **NÃO OFERECER (sem dado): `regimeTributario`** (NULL, fase 2 da RFB). Não inventar coluna.

## Item 5 — remover automação que alimenta o Vendas sozinho
Tirar: standing-order auto-import (`shouldAutoImportRadarRunToVendas`/`getRadarSellerStandingOrder`) + o pump de auto-distribuição (`executeRadarAutoDistributionRule`, ~2min) + botão **"@ Automático"** na tela. Manter o PUXAR manual (`Puxar`/`Puxar selecionados`).

## Item 8 — radar sem estados = mosaico decorativo
Sem máquina de estado. Reusar as cores dos estados só como paleta de um mosaico bonito. Zero lógica atrás.

## Item 9 — remover legados
Código morto das telas/estados antigos, "Canais Exigidos" residual, "Modo foco" residual, componentes órfãos.

## Execução (sequencial, não publica)
- **Worker A (backend):** item 5 (remover auto-feed) + garantir o CONTRATO de filtro aceitando TODAS as colunas reais acima na busca da base (extender `cnpj-base-query`/mapper `radar-base-availability.util.ts` conforme faltar) + item 9 backend. Cuidado DI/Nest (lição P0 `deploy-build-verde-nao-e-boot-ok`): não adicionar provider cross-module sem wiring. Documenta o contrato pro front.
- **Worker B (front):** itens 2,3,3b,4(UI),6,7,8 + item 9 front, sobre o contrato do A. 5 Leis + `check-pele.mjs`.
- **Chip do dono (`task_dee407d9`):** ligar a fusão RFB×Web (lane RFB rejeita 100% hoje) — paralelo, o dono termina.
