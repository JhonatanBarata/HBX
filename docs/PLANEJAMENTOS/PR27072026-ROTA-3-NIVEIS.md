# PR27072026 — GERENCIADOR DE ROTA EM 3 NÍVEIS (Basic / Advanced / Full)

> Decisão do dono (27/07): o produto de logística vira ESCADA de 3 planos vendáveis.
> Este arquivo é o plano-mestre. Regra de ouro da arquitetura (dono, 27/07):
> **"os dias são organização; o financeiro começa quando confirma na porta"** —
> organizar nunca escreve, só executar escreve.

## Os 3 níveis (visão de venda)

| | **1º BASIC** | **2º ADVANCED** | **3º FULL** |
|---|---|---|---|
| Slogan | "Caderneta eletrônica que te coloca na localização" | "O app cobra por você" | "iFood da sua distribuidora" |
| Agenda + rota + endereços | ✔ | ✔ | ✔ |
| Histórico do cliente (dia/hora exatos) | ✔ | ✔ | ✔ |
| Registrar recebimento (pix/dinheiro/anotado) | ✔ (só registro, sem financeiro real) | ✔ | ✔ |
| Aviso "tô chegando" (WhatsApp) | ✔ | ✔ | ✔ |
| Financeiro real (saldo, fiado, fechamento, limite) | ✗ | ✔ | ✔ |
| Cobrança automática educada (aviso WhatsApp) | ✗ | ✔ | ✔ |
| Estoque de carga (saiu/vendeu/voltou) | ✗ | ✔ | ✔ |
| Devedor/inativo tratado na montagem da rota | ✗ | ✔ | ✔ |
| Rastreamento ao vivo + link "acompanhe sua entrega" | ✗ | ✗ | ✔ |

Preço de referência (mercado BR do nicho água/gás: SGA ~R$100-200, Gestor Gás ~R$80-150,
rastreador veicular avulso ~R$60-90/veículo/mês SÓ o rastreio):
**Basic R$ 79-99 · Advanced R$ 179-199 · Full R$ 279-299** (decisão final = dono).
Argumento de venda Advanced em dinheiro: 1 galão ≈ R$ 12-15 → o plano se paga
recuperando ~13 fiados esquecidos/mês.

## O que JÁ EXISTE no código (não reescrever — empacotar)

- Aviso "tô chegando": `avisoChegandoEnabled/Template/DistanciaM` (AVISO-CHEGANDO 11/07).
- Limite de crédito por cliente: `limiteCredito` no cadastro (schema + service + mobile).
- Toggle do financeiro: `moduloFinanceiroAtivo` (PR18072026 W-A, operacional, 3 níveis de folha de chegada).
- Financeiro real: charge nasce SÓ no confirmarEntrega (fiado/pago-na-hora, unique por entrega).
- Cobrança educada: `logistica-cobranca-aviso.service` (aviso WhatsApp de cobrança).
- Rastreamento: modo TRACKED, sessão GPS, trilha, ETA, link público de tracking.
- Recovery de devedor: `moduloRecoveryAtivo`.
- Billing da plataforma por parada (ESSENTIAL/TRACKED) com snapshot anti-fraude.
- Filtro de inativo na montagem: `CLIENTE_VIVO` no generateDay.
- Onboarding pela rua: Leitura de Rota / Registrar Caminho (a carteira nasce entregando).

**Conclusão de engenharia: NÃO deletar backend.** ~100 arquivos só de logística com
peças caras já pagas (billing anti-fraude, offline, fuso, CNEFE, disjuntor WhatsApp).
O defeito era UMA viga da agenda (incidente "sexta que não volta", fix `88c131f5`
publicado 27/07 17:46) + falta de empacotamento comercial.

## Frentes

### F0 — MOTOR CONFIÁVEL (hoje) — pré-requisito de tudo
1. Cursor `proximaData` só avança no DESFECHO da ocorrência (entregue/pulada/descartada
   devolve), nunca na montagem. Mata a família "comeu uma semana calada".
2. Rota de dia passado se encerra sozinha (auto `operationalEndedAt` — fechamento de caixa).
3. **Extrato de eventos da agenda** (pedido explícito do dono): toda mudança — dia da
   semana, avanço, devolução, descarte, materialização — vira linha com timestamp
   exato, autor e de→para, visível na ficha do cliente. Append-only.
4. Erro do prepare fala a verdade ("as paradas de sexta estão presas na rota de DD/MM").
5. Reparo de dados: 3 planos cia 48 (21/08 → 07/08); decisão do dono sobre as 4
   entregas de 31/07 hoje em 27/07; espelho na cia 41 se ainda operar.
6. Suíte nos 3 fusos (`npm run test:agenda-fuso`) cobrindo os novos caminhos.

### F1 — OS 3 PLANOS COMO PRODUTO (1-2 dias)
1. Preset de 1 clique: escolher Basic/Advanced/Full seta o conjunto de toggles
   (nada de painel de chavinhas pro tenant). Matriz acima é o contrato.
2. Basic = financeiro real OFF (registro de recebimento continua; sem saldo/limite/fechamento).
3. Recurso bloqueado aparece acinzentado com "Disponível no Advanced" (ver-mas-não-usar
   é o motor de upgrade do mercado). Zero textão.
4. Full = liga TRACKED por padrão de rota.
5. Amarrar no sistema de módulos/planos existente (teto masterEnabled×enabled).

### F2 — ADVANCED COMPLETO (2-3 dias)
1. **Estoque de carga** (única peça estrutural nova): conferência de caminhão do dia —
   carregou X, vendeu Y (soma dos EntregaItem, já existe), voltou Z; bateu/estourou.
   NÃO é almoxarifado/WMS. 1 tela, 2 números por produto.
2. **Devedor na montagem** (usa `limiteCredito` + saldo existentes):
   - default recomendado: devedor NÃO some — vira parada de COBRANÇA (amarela, sem
     produto novo; recuperar dinheiro > esconder cliente);
   - opção por config: excluir da rota (o pedido literal do dono vira toggle).
   - inativo: já filtrado (CLIENTE_VIVO) — manter.
3. Cobrança automática empacotada (aviso existente vira feature nomeada do plano).

### F3 — FULL POLIDO (1-2 dias)
1. Link "acompanhe sua entrega" pro cliente final (tracking existente, cara de produto).
2. Painel "onde está meu caminhão" pro dono do tenant.
3. Aviso de chegada com ETA fino (usa `etaAt` existente).

## Decisões abertas (dono)
- Preço dos 3 níveis e nome público (sugestão: Rota Basic / Rota Advanced / Rota Full).
- Política default do devedor: cobrança-na-rota (recomendado) vs excluir.
- As 4 entregas de 31/07 puxadas pra 27/07: entregar hoje ou devolver pra sexta.
- Cia 41 ainda opera? (tem o mesmo dano fóssil: 3 planos de sexta em 14/08 + rota zumbi 20/07).

## Regras que este plano obedece
- Entregar LIGADO (26/07): cada frente sai funcionando, sem chavinha morta.
- Teste verde no meu fuso não vale (26/07): tudo que toca data roda nos 3 fusos.
- Prova é a TELA DO CELULAR (27/07): F1-F3 seguem a regra de teste do hbxlog.
- Publicar só com ordem do dono.
