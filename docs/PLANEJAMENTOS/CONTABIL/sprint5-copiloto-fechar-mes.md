# CONTABIL S5 — Copiloto "Fechar o mês" (o produto completo, ainda sem API paga)

**Objetivo:** o wizard que transforma o checklist do manual do dono em fluxo de 10 minutos.
O app prepara TUDO (números prontos, na ordem certa, com deep-link de cada sistema do governo);
o dono só digita e confirma. É o "ele mesmo posta" na versão semi-auto — que já elimina 90% do
trabalho e 100% do medo de esquecer. S6/S7 só trocam "dono digita" por "dono aprova".

## Entregas

### 1. Wizard "Fechar o mês" (botão herói da janela Contabil)
Stepper com etapas — cada uma mostra o dado, pede confirmação e grava:

1. **Receita** — "Recebemos R$ X de assinaturas em {mês} (fonte MP). Confere?"
   [Confirmar] / [Ajustar com motivo]. → grava e recalcula cadeia.
2. **Pró-labore** — "Para manter o Fator R em 28%, o pró-labore deste mês é R$ Y."
   [Usar recomendado] / [Outro valor] (mostra na hora o impacto: anexo, DAS, INSS, IRRF).
3. **eSocial + DCTFWeb** (se pró-labore > 0) — cartão com os valores prontos
   (S-1200: valor bruto; DCTFWeb: INSS 11% = R$ Z) + botão "Abrir eSocial" (deep-link
   login.esocial.gov.br) e "Abrir e-CAC" → dono transmite lá e volta → [Marcar transmitido]
   com campo nº do recibo (grava em resultJson).
4. **PGDAS-D** — cartão-espelho da tela do governo, na MESMA ordem que o PGDAS-D pede:
   receita do mês · folha 12m · anexo esperado · alíquota efetiva · DAS esperado R$ W.
   Botão "Abrir PGDAS-D" → dono declara → [Marcar transmitido + DAS gerado].
   **Validador de divergência:** campo "qual DAS o governo calculou?" — se diferente do nosso
   ±R$ 1, alerta vermelho "PARE: divergência — revisar antes de pagar" (pega erro de digitação
   OU bug nosso; é o disjuntor do copiloto).
5. **Pagamentos** — DAS e DARF: [Marcar pago] → lança as SAÍDAS no Livro Caixa (S4).
6. **Resumo do fechamento** — "Mês {X} fechado: receita R$ A · tributos R$ B (C% da receita) ·
   lucro isento disponível R$ D. Fator R: 0,29 🟢." → grava `fechadoEm`, obrigações → CONFERIDO.

### 2. Upload de comprovantes
- Anexar PDF/print por obrigação (recibo PGDAS-D, comprovante DAS) — storage no padrão de
  arquivos já usado na casa; listado no card da obrigação. É a pasta-do-contador digital.

### 3. Relatório mensal narrativo (o "pensa comigo" por escrito)
- Ao fechar, gerar texto determinístico (template, sem IA): o resumo acima + comparativo com mês
  anterior + avisos ("RBT12 se aproxima da 2ª faixa", "seu Fator R folgou — dá pra baixar
  pró-labore em R$ X sem sair do III");
- Enviado no zap do dono via MasterAlertService + guardado no histórico da janela.
- (Opcional, flag OFF) reescrita amigável via Ollama local `qwen2.5:7b` — SÓ o texto; números
  SEMPRE do motor (Lei nº2).

### 4. Modo Fase 0 (empresa ainda sem faturar)
- Wizard detecta receita 0 e pró-labore 0 → encurta para: "PGDAS-D sem apuração — abrir e
  transmitir zerado" + [Marcar transmitido]. 2 minutos, como no manual.

## Aceite
- Fechar um mês de teste de ponta a ponta (dados fake em dev): todas as transições de estado,
  Livro Caixa recebendo as saídas, relatório no zap (1 disparo de teste), comprovante anexado.
- Divergência simulada (DAS governo ≠ nosso) trava o passo 4 com alerta.
- Fase 0 simulada funciona.
- tsc + testes verdes.

## Guardrails
- O wizard NUNCA diz "transmitido" sozinho — só o dono marca (com recibo). Estado é do dono;
  o app é o trilho.
- Deep-links abrem em nova aba; nada de iframe de site do governo.
