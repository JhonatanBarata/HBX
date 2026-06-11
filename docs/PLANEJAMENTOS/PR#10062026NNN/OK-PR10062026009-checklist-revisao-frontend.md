# PR10062026009 — Checklist de revisão frontend

Data: 11/06/2026
Status: CONCLUÍDO — Parte 6 da contenção de entropia.
Escopo: documentação. Não altera código de produto.

---

## Uso

Aplicar em PRs que criam ou alteram tela, overlay, rota, CSS, navegação ou estado de acesso no frontend.

Enquanto o DROP paralelo estiver ativo, não usar este checklist para exigir limpeza dos campos crus que o outro agente está removendo.

---

## Checklist

### Escopo

- [ ] A mudança não toca backend.
- [ ] A mudança não toca arquivos do DROP paralelo sem autorização.
- [ ] O objetivo da tela está alinhado a Radar -> Vendas -> WhatsApp -> Retorno.
- [ ] O diff não mistura redesign com regra comercial.

### Shell

- [ ] Página operacional desktop usa shell transicional correto ou kit aprovado.
- [ ] `DashboardScaffold` usa `hideHeader` quando for página operacional.
- [ ] A primeira superfície operacional é `hbx-guide1-slot`, quando houver guia.
- [ ] Não há hero/header explicativo indevido acima do guia.
- [ ] Admin/utilitária usa `HbxPageShell`/`HbxSection` quando couber.

### CSS e tema

- [ ] Não nasceu `page.module.css` novo sem exceção registrada.
- [ ] Guia principal não foi reinventado com CSS local.
- [ ] Cores novas usam token ou têm par claro/escuro.
- [ ] Não há card branco/texto escuro hardcoded sem dark equivalente.
- [ ] Textos não sobrepõem controles em desktop/mobile.

### Overlays

- [ ] Código novo não importa `HbxPopup1/2/3/4`.
- [ ] Confirmação usa `HbxConfirmDialog` ou `ConfirmDialog` do kit.
- [ ] Erro crítico aparece perto da ação que falhou.
- [ ] Toast não é a única evidência de erro crítico.
- [ ] Ação destrutiva tem confirmação e estado `busy`.

### Rotas

- [ ] Rota nova tem canônica clara.
- [ ] Alias novo, se existir, só redireciona.
- [ ] Alias preserva query string quando necessário.
- [ ] Alias tem motivo, dono e prazo de remoção.
- [ ] Nenhuma regra de negócio foi colocada em alias.

### Acesso e cobrança

- [ ] Frontend renderiza capacidade/mensagem, não decide regra comercial.
- [ ] Vendedor/USER não vê checkout, valor, pagamento ou motivo financeiro.
- [ ] 403 genérico não vira `payment_failed`.
- [ ] Não foi criado uso novo de `paymentStatus`, `subscriptionStatus` ou `premiumAccess`.
- [ ] Checkout só abre por contrato canônico.

### Catálogo comercial

- [ ] Preço/plano/entitlement vem de API/catálogo backend.
- [ ] Não há tabela comercial paralela no frontend.
- [ ] Fallback defensivo não vira fonte de verdade.

### Texto e UX

- [ ] Texto público está em PT-BR.
- [ ] Mensagem de erro é acionável.
- [ ] Empty state orienta próxima ação sem parecer marketing.
- [ ] Mobile segue simples e guiado.
- [ ] Desktop segue denso, legível e operacional.

### Evidência

- [ ] Comandos rodados foram registrados, ou foi registrado que não houve teste a pedido do dono.
- [ ] Riscos residuais foram anotados.
- [ ] Exceções foram documentadas.

