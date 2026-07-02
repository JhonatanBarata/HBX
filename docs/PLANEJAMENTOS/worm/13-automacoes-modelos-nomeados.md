# WORM-13 — Automações: modelos com PERSONA + editor gatilho→ação + Rotinas

**Tela deles:** `/appjs/automation/modelo`. A sacada NÃO é o motor — é a EMBALAGEM:
- **Modelos em destaque com persona**: "Confiável de Vendas (**Conservador**)" = 25 créditos por
  filtro, 2 e-mails + 1 WhatsApp; "Estratégico (**Moderado**)" = 37 créditos, 2+1; "Determinado
  (**Agressivo**)" = 50 créditos, 4 e-mails + 1 WhatsApp. O cliente não monta fluxo: ESCOLHE UMA
  PERSONALIDADE de cadência. Genial pra leigo.
- **Editor de automação** (canvas): gatilhos (Lead criado/atualizado/convertido, **E-mail lido**,
  Tag adicionada, Oportunidade criada/atualizada...) → ações (Converter lead em oportunidade
  p/ etapa X, Vincular tags, **Criar atividade** tipo Chamada venc. 2 dias, Enviar e-mail por
  modelo, mensagem WhatsApp). Ex. visto: "Email Lido (Perfil Conservador)" — email lido → converte
  → tag → atividade → próximo e-mail.
- **Rotinas**: agendamento recorrente (início, repete a cada N semanas, dias S-T-Q-Q-S-S-D,
  termina nunca/data) — ex. "Carga Automática (Perfil Conservador)" puxa N empresas do filtro
  salvo pra dentro do funil toda segunda. Toggle "visível apenas ao responsável".
- Histórico de execução com "última execução concluída com sucesso às...".

## O que o HBX tem
Bot IA no WhatsApp (classificador + respostas), campanhas autônomas do Radar, distribuição
por vendedor com pump. NÃO tem: cadência multicanal configurável, gatilho e-mail lido, rotinas
visíveis pro usuário.

## ⚠️ Regras duras (Webwhats — chips custaram caro)
Disparo automatizado de WhatsApp passa 100% pela rotina existente do motor com freios (disjuntor,
1 número=1 conexão, teto). Cadência "Agressiva" NUNCA significa mais pressão no chip — significa
mais TOQUES (e-mail/atividade), com WhatsApp espaçado. Volume de WhatsApp por chip/dia é teto
técnico fixo, não configurável pelo cliente.

## Plano (fatiado em 3 entregas)
### 13a — Cadência com persona (a embalagem primeiro)
1. [backend] `Cadencia { id, nome, persona, passos: [{dia, canal(whats|email|atividade), templateId}] }`
   + runner diário (job simples: pra cada lead inscrito, executa o passo do dia respeitando tetos).
   3 seeds: Conservador (d0 whats, d3 email, d7 atividade-ligar), Moderado (d0, d2, d5, d9),
   Agressivo (d0 whats, d1 email, d3 email, d5 whats, d8 atividade).
2. [frontend] tela "Automações": 3 cards de persona (igual deles, nomes nossos) + botão "aplicar
   ao filtro/lista X". Detalhe mostra os passos em linha do tempo. SEM canvas no v1.
### 13b — Gatilhos reativos
3. Gatilho "lead respondeu WhatsApp" (já detectamos msg inbound) → ações: mover etapa, tag,
   criar atividade, notificar vendedor. Gatilho "e-mail lido": pixel de abertura no e-mail da
   fábrica (1x1 + rota de tracking) — é o que deles impressiona e custa 1 tarde.
### 13c — Rotinas
4. "Toda segunda, puxar 50 leads do filtro salvo Y pro vendedor Z" — agendador em cima do
   HOT-02/WORM-15. UI de recorrência copiada da deles (semanas + dias).

## Criatividade (além deles)
- **Cadência escrita por IA**: o dono descreve o negócio em 1 frase → 7B/20B gera os textos dos
  passos da persona escolhida (eles cobram créditos de IA por isso; nós é grátis, local).
- Relatório por cadência: taxa de resposta por passo (qual mensagem converte) — WORM-18.

## Aceite
- [ ] Persona aplicada a uma lista move leads pelos passos nos dias certos SEM furar teto de chip
- [ ] Gatilho inbound movendo etapa; 1 rotina semanal rodando; deletar este .md
