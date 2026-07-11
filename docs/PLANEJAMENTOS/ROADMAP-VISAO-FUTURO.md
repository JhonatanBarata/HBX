# ROADMAP — VISÃO FUTURO (brainstorm 11/07/2026, doc de continuidade)

> Escrito no último dia de acesso ao Claude. Feito pra ser executado SEM mim: cada ideia tem
> escopo, primeiro passo e critério de "vale a pena?". Padrão da casa: 1 ideia que virar frente
> = 1 `.md` = 1 worker. Preços de concorrente marcados ~ são ordem de grandeza (conferir no dia).
>
> **Tese central (análise fria, não elogio):** o HBX tem ~15 módulos e ~1 cliente real pagando.
> O gargalo NÃO é software — é distribuição e ativação. Módulo novo só entra se ENCURTAR venda
> ou aumentar retenção. O maior "módulo futuro" do HBX já está no repo atrás de flag.

---

## 0) Dinheiro parado no repo (ativar ANTES de construir qualquer coisa nova)

| O quê | Onde | Custo pra destravar | Por que é dinheiro |
|---|---|---|---|
| **NFS-e automática (S6) + PGDAS/DAS Serpro (S7)** | `ROADMAP-CONTABIL-NFSE-SERPRO.md` — código 100% publicado, flags OFF | Certificado e-CNPJ A1 ~R$130-250/ano + Serpro ~R$1/mês | Emissor fiscal é o módulo mais "grudento" do mercado PME BR (Conta Azul ~R$100+/mês vive disso). Você destrava por R$150 o que concorrente cobra caro. Churn de quem emite nota pelo sistema é baixíssimo. |
| **Paywall real (FE-01)** | `BACKLOG-ABERTO.md` — gate só visual, bypass via DevTools | 1 sprint de backend | Hoje quem sabe apertar F12 leva CNPJ/sócio/telefone DE GRAÇA. Sem gate real no backend, o produto pago não existe. |
| **Enforce de créditos (shadow→enforce)** | `CHECKLIST-ATIVACAO.md` §1 | Rollout de flag (seu) | Track-first foi certo pra medir; mas enquanto ENFORCE=OFF, nada bloqueia — receita é opcional pro cliente. Ligar tenant a tenant. |
| **Vídeo demo (hot/06 "O OURO") + recém-abertas (hot/07)** | `00-CNPJBIZ-INDICE.md` | Seu tempo de gravação + 1 sprint | O CNPJ Biz construiu a máquina de aquisição em cima de vídeo. "Empresa aberta ontem" é o lead mais quente que existe e você TEM a base de 28M. |
| **E-mail v1 + Copiloto + OTP** | `CHECKLIST-ATIVACAO.md` §5 — verdes no tree | Republicar + migrations + flags | Já pago, só colher. |

**Regra de bolso:** enquanto existir linha nessa tabela, módulo novo é distração — exceto os de venda direta abaixo.

---

## 1) Módulos novos — rankeados por (esforço ÷ retorno)

### 1.1 Cobrança recorrente do cliente final — "o sistema que cobra por você" ⭐ prioridade nº1
- **O que é:** assinatura/mensalidade do CLIENTE FINAL do tenant (ex.: cliente do Andre assina 4 galões/semana). Todo ciclo: gera cobrança PIX (MP já integrado), manda link/QR pelo WhatsApp (motor próprio, custo zero), não pagou → cai na régua do Recovery (já existe), pagou → baixa no Financeiro (já existe).
- **Por que o mercado paga:** Asaas/Vindi/Cora vivem de cobrança recorrente (~1-3% ou taxa por cobrança). Pra distribuidora, "receber sem cobrar ninguém no zap manualmente" é dor semanal com valor óbvio em R$.
- **O que já existe no HBX:** MP, WhatsApp, Recovery, Financeiro, fiado/limite na ficha. Falta só a peça "plano recorrente do cliente final" + scheduler.
- **Como cobra:** crédito por cobrança enviada, ou % pequeno sobre o recuperado (o modelo de comissão já existe no código).
- **Primeiro passo:** model `AssinaturaClienteFinal` (produto, frequência, valor, dia) + job que materializa cobrança → reusa pipeline Financeiro/WhatsApp. Piloto no Andre.
- **Vale a pena se:** o Andre topar migrar 20+ clientes recorrentes no 1º mês. É o case de venda pra TODA distribuidora depois.

### 1.2 Portal de pedido do cliente final (PWA "peça pelo link") ⭐ prioridade nº2
- **O que é:** cada tenant ganha `hbx.app/p/{slug}`: cardápio de produtos (Logística já tem produto), cliente final pede sem baixar app, pedido cai direto na rota do dia (Entrega já existe). O anti-iFood da distribuidora: sem taxa de 27%, o canal é DELA.
- **Por que muda o jogo:** cada tenant passa a DISTRIBUIR o HBX pros consumidores dele (link no status do zap, na etiqueta do galão). Vira efeito de rede local + o Website-Kit (hoje OFF, sem propósito) renasce com função comercial clara.
- **Como cobra:** incluído no plano (retenção) OU R$/pedido acima de X pedidos/mês. Futuro: GMV visível → upsell.
- **Primeiro passo:** 1 página pública mobile-first (a casca mobile aprovada já dá o tema), POST público com anti-spam (OTP por zap já construído!), pedido → `Entrega` status novo.
- **Vale a pena se:** 10%+ dos clientes finais do piloto usarem o link em 30 dias.

### 1.3 Painel do contador (multi-empresa) — canal de distribuição embutido
- **O que é:** visão onde 1 contador enxerga N empresas (read-only fiscal: obrigações, NFS-e emitidas, DAS armado). Convite pelo tenant.
- **Por que:** contador é O canal de venda PME no Brasil — Conta Azul construiu o negócio inteiro nisso. Cada contador parceiro carrega 30-200 CNPJs na carteira. Com S6/S7 ligados, o HBX FAZ o trabalho braçal dele → contador indica porque LUCRA tempo.
- **Como cobra:** contador não paga; ele INDICA (comissão recorrente ou créditos — engine de comissão já existe). O tenant paga.
- **Primeiro passo:** role `contador` cross-tenant read-only + tela lista de empresas. Cuidado: é exceção consciente ao modelo 1-user-1-company — desenhar o vínculo via tabela própria (`AccountantLink`), não gambiarra de role.
- **Vale a pena se:** 1 contador real topar pilotar com 5+ empresas.

### 1.4 SDR de IA — o bot que PROSPECTA (a aposta grande, 12+ meses)
- **O que é:** hoje o Radar acha o lead e o humano chama. A versão futura: bot abre a conversa (chip dedicado do tenant, aquecido), qualifica com o classificador que já roda (`qwen3:4b`), agenda/passa pro vendedor só o quente.
- **Por que:** é O produto de IA de 2026 — gringos (11x, Artisan) cobram ~US$500-2.000/mês e não atendem PME BR. Ninguém entrega isso em português por preço de PME. O HBX tem TODAS as peças: base 28M, enriquecimento, motor WA próprio (custo/msg zero), IA local (custo/inferência zero), disjuntor anti-ban já construído a sangue.
- **O risco (real):** ban de chip — a cicatriz de jun/26. REGRAS: chip do TENANT dedicado a outbound (nunca o de atendimento), aquecimento progressivo (semanas), teto diário baixo (dezenas, não centenas), horário comercial, opt-out na 1ª mensagem, disjuntor. Cobrar por LEAD QUALIFICADO entregue (crédito), nunca por mensagem — alinha incentivo com não-spam.
- **Primeiro passo:** NÃO é código — é piloto manual-assistido: Copiloto redige, humano aperta enviar, medir taxa de resposta/ban por 60 dias. Só automatizar o que sobreviver.
- **Vale a pena se:** piloto manual mostrar >8-10% de resposta sem dano de chip.

### 1.5 Score de fiado (o dado que prende o cliente)
- **O que é:** a Logística já tem fiado/limite/extrato e o Recovery tem histórico de dívida. Cruzar em um score interno 0-100 por cliente final: pontualidade, atraso médio, calote. Na ficha: "esse cliente merece fiado?".
- **Por que:** custo ~zero (o dado nasce dentro), e o HISTÓRICO vira o ativo que impede o tenant de sair do HBX (levar o sistema embora = perder a memória de quem paga). Retenção pura.
- **Primeiro passo:** função de score no backend + selo na ficha do cliente. 1-2 sprints.
- **Fase 2 (só com demanda):** consulta a bureau externo (Serasa/SPC API) revendida como crédito.

### 1.6 Resumo diário do dono no WhatsApp ("bom dia, seu negócio")
- **O que é:** toda manhã o bot manda pro dono do tenant: vendi X ontem, Y entregas hoje, Z clientes devendo, W leads novos no radar. Dados que os módulos JÁ têm; o chip já é dele.
- **Por que:** feature barata com efeito viciante — o dono passa a SENTIR o sistema todo dia sem abrir tela. Churn cai. (Envio pela rotina do app, teto 1/dia, flag por tenant — zero risco de loop.)
- **Primeiro passo:** 1 cron + 1 template. Provavelmente a melhor relação esforço/retenção da lista inteira.

### 1.7 Transcrição de áudio (Whisper local) — atendimento
- **O que é:** áudio de WhatsApp → texto na conversa (cliente PME AMA mandar áudio). Whisper small/medium roda no Ryzen do VPS/local em CPU. Já mapeado como "próximo não-feito" na memória IA-local.
- **Por que:** destrava o bot/classificador pra mensagens de voz (hoje passam batidas) e o atendente lê em vez de ouvir 2min. Diferencial visível em demo.
- **Como cobra:** crédito por minuto transcrito (governor de custo já existe).
- **Primeiro passo:** `whisper.cpp`/faster-whisper num worker com fila + teto de duração. IMAGEM continua fora (sem GPU — regra conhecida).

### 1.8 Templates de negócio no OOBE (time-to-value)
- **O que é:** escolher "distribuidora de água" no OOBE (que já é por categoria) e nascer com: produtos padrão (galão 20L…), mensagens prontas, cadência exemplo, rota demo. O "e agora?" pós-cadastro é onde trial morre.
- **Primeiro passo:** seeds por categoria. 1 sprint. Medir ativação D1 antes/depois.

### 1.9 Export "seus dados são seus" + backup visível
- **O que é:** exportar clientes/vendas/financeiro em planilha 1-clique; e backup automático do tenant com selo visível ("último backup: hoje 03:00").
- **Por que:** mata a objeção nº1 de PME contra sistema novo (medo de ficar refém) e vira argumento de VENDA, não custo. Lembrete: backup de prod hoje é opt-in (`HBX_PUBLISH_BACKUP`) e a RFB fica FORA do dump (regra 11/07) — o que precisa de rotina é o dado do TENANT.

---

## 2) Crescimento — canais, na ordem que o mercado PME BR fecha

1. **Vertical primeiro, horizontal nunca (por enquanto).** ⚠️ DECISÃO DO DONO 11/07: **NÃO empacotar como app/produto separado** — o vertical é o próprio HBX perguntando no primeiro acesso e entregando experiência PERFEITAMENTE igual a um sistema avulso quando a empresa é só-logística (ver `VISAO-FUTURO/S1-modo-distribuidora.md`). Landing/copy de nicho continua válida só como MARKETING apontando pro mesmo app. Preço fechado (~R$97-197/mês equivalente em créditos — SGA e afins cobram ~R$100-250 e não têm WhatsApp+IA). O Andre é o case. Meta honesta pra 1 pessoa: 10 distribuidoras em 90 dias via indicação dele + grupos do setor; 100 clientes × R$150 ≈ R$15k MRR em 12 meses é agressivo-mas-possível SE o funil for vertical. Depois replicar a casca: gás, pet com entrega, hortifruti, marmita — 1 landing nova por nicho, mesma engine.
2. **Indicação com créditos (cold/23) — subir pra HOT.** Indicou → os dois ganham créditos. Custo marginal ~zero, e crédito courtesy já existe tecnicamente (campanha 50). É o canal mais barato que existe.
3. **Contador (via módulo 1.3)** — canal que escala sem anúncio.
4. **Vídeo (hot/06)** — a fórmula já está mapeada no recon do CNPJ Biz. 1 vídeo/semana mostrando dor→clique→resultado.
5. **SEO programático (cold/20)** — a máquina de 28M páginas. Manter COLD até ter funil que converta (senão é tráfego pra peneira furada). Quando ligar: páginas por cidade+CNAE ("Distribuidoras de água em Rio Claro"), dado público RFB. ⚠️ LGPD: MEI tem nome de pessoa física — telefone/e-mail NUNCA em página pública, só na área logada (o `cleanRfbLegalName` já limpa o CNPJ do nome).
6. **API de dados (cold/21)** — linha de receita B2B2B futura (Casa dos Dados cobra ~R$100-500/mês). Só depois de paywall real + rate-limit maduros.

---

## 3) O que NÃO fazer (anti-backlog — tão importante quanto o resto)

- **ERP completo (estoque profundo, compras, produção):** briga de atrito contra Bling/Tiny/Omie consolidados. Estoque SIMPLES (saldo por produto pra rota) ok; além disso, não.
- **App nativo além do que já existe:** o Play já está encaminhado (RELEASE-20X); iOS/loja segunda = fricção sem retorno agora. PWA resolve o cliente final (1.2).
- **Meta API oficial como default:** custo por conversa mata a margem — é o diferencial INVERTIDO. Oferecer como opção premium a quem pedir selo (cold/24), nunca migrar a base.
- **Enterprise/empresa grande:** ciclo de venda de meses mata operação solo. O produto é PME com dono no WhatsApp.
- **Multi-idioma/exterior:** a vantagem (RFB, PIX, WhatsApp BR, Serpro) é 100% Brasil. Sair do BR = jogar fora o fosso competitivo.
- **Módulo novo enquanto a tabela do §0 tiver linha viva.**

---

## 4) Sequência sugerida (se eu fosse você)

**90 dias — "ligar e vender":**
1. §0 inteiro: republicar tree, certificado A1 → S6/S7 ON, paywall real, enforce de créditos por tenant, vídeo 1, recém-abertas.
2. 1.6 (resumo diário) + 1.8 (templates OOBE) — baratos, retenção.
3. 1.1 (recorrência) piloto no Andre → virar case com número em R$ ("recuperou R$X sem cobrar ninguém no zap").
4. Indicação com créditos no ar.
5. Landing "HBX Água & Gás" + 10 distribuidoras via case do Andre.

**6-12 meses — "efeito de rede e canais":**
6. 1.2 (portal de pedido) — cada tenant distribui o HBX.
7. 1.3 (painel do contador) + programa de comissão de parceiro.
8. 1.7 (Whisper) e 1.5 (score de fiado).
9. SEO programático + API de dados quando o funil estiver convertendo.

**12+ meses — "a aposta":**
10. 1.4 (SDR IA) — começando manual-assistido, com toda a engenharia de freio.

---

## 5) Nota de continuidade (usar este doc sem o Claude de hoje)

- Padrão da casa continua valendo: escolheu uma ideia → criar `docs/PLANEJAMENTOS/{FRENTE}/` com 1 `.md` por sprint, 1 worker por `.md`, deletar ao concluir.
- Cada seção acima já tem "primeiro passo" — é o texto que vira o 1º `.md` da frente.
- Antes de qualquer frente nova, reler `CHECKLIST-ATIVACAO.md` (o que só falta ligar) e `BACKLOG-ABERTO.md` (o que as auditorias deixaram) — regra do §0.
- Guardrails que NÃO envelhecem: WhatsApp = disjuntor sempre, 1 número = 1 conexão, teste em chip descartável; flag de enforcement quem liga é o dono; VPS = MP LIVE.
