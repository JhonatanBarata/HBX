# WORM-14 — Assistente IA: wizard de 3 passos + flow builder + "Teste sua IA"

**Tela deles (dos prints do vídeo):** menu "Assistente IA" (badge HOT).
- **Wizard 3 etapas**: (1) Nome do assistente (ex. "Leonardo") + estilo de comunicação
  Formal/Normal/**Descontraído** + exemplo de frase no estilo; (2) Perfil Vendas × Suporte +
  "Produtos ou Serviços" + nome da empresa + modo de operação; (3) template de fluxo:
  **Ágil** (1ª msg + 1 condição) / **Flexível** (+2) / **Avançado** (+3) / Criar do zero.
- **Flow builder** (canvas): nós "Mensagem para o cliente" com variáveis `[[nome da empresa]]`,
  `[[Seu nome]]` → "Aguardando resposta" → nó de decisão com "Comportamento esperado" + EXEMPLOS
  editáveis de resposta que casam ("Sim, quem é?", "fala sim", "bom dia, com quem quer falar?") →
  ramos → mensagem final/desligar. Seções laterais: Dados (Perfil/Config), Conhecimento
  (**Treinamento** / Fluxo), Canais (WhatsApp), **Testes**.
- **"Teste sua IA"**: chat sandbox interno numerado (Teste nº 17343) mostrando o custo por teste
  (0,01 crédito). Testa ANTES de ligar no chip.
- Monetização deles: créditos IA (GPT-4 Turbo 1 crédito ≈ 1.000 palavras!). Caro.

## O que o HBX tem
Bot REBUILD no working tree + classificador `qwen2.5:7b` local (flag `HBX_LLM_CLASSIFIER_ENABLED`),
Webwhats estável. Ou seja: O MOTOR NOSSO JÁ EXISTE E É GRÁTIS. Falta a EXPERIÊNCIA de criar/testar
sem programar.

## O que roubar (em ordem)
1. **Sandbox "Teste sua IA"** — chat interno contra o bot ANTES de ligar no chip real. Pra nós é
   duplamente estratégico: além de UX, é o freio anti-ban (testa sem tocar WhatsApp — alinhado com
   a regra "número descartável", só que melhor: sem número nenhum).
2. **Wizard 3 passos** — nome+tom / negócio / template. O output é o prompt-sistema + fluxo inicial
   do bot da empresa. IA com NOME (o cliente apresenta "a Júlia" pros clientes dele — retenção).
3. **Exemplos editáveis por condição** — no nosso mundo viram few-shots do classificador (já é
   como o 7B trabalha). UI de "frases que significam SIM" é ouro pra leigo calibrar o bot.
4. Templates Ágil/Flexível/Avançado = 3 fluxos seed por perfil (Vendas/Suporte).

## O que NÃO copiar
Canvas node-editor completo no v1 (semanas de frontend). Nosso v1: fluxo em LISTA vertical
(passo 1, condição, passo 2...) — mesmo poder, 10x menos código. Canvas é v2 se sobrar vida.

## Plano
1. [backend] `AssistenteConfig { companyId, nome, tom, perfil, produtos, fluxoJson }` → compilador
   fluxoJson→prompt do classificador/respostas (reusar pipeline do bot REBUILD).
2. [backend] endpoint sandbox: `POST /bot/sandbox` — conversa fake (sem Webwhats!) rodando o
   mesmo pipeline do bot; grava transcript de teste.
3. [frontend Master] wizard 3 telas (padrão hbx-theme) + tela de fluxo em lista + chat de teste.
4. Seeds: 2 perfis × 3 templates.
**Pitch de venda contra eles:** "IA deles cobra crédito por palavra (GPT-4). A do HBX roda em
casa, ilimitada, e você testa à vontade sem pagar nada." — vídeo Roteiro do HOT-06 futuro.

## Aceite
- [ ] Criar assistente pelo wizard, testar no sandbox, publicar no chip com flag
- [ ] Zero mensagens reais disparadas durante teste; deletar este .md
