# HOT-04 — Tela "Enriquecimento de Dados" → nosso "Raio-X de CNPJ" (em lote)

**Tela deles:** `/app/enrichment`. Cola até 10.000 CNPJs (1/linha, com/sem máscara) → processa em
segundo plano → e-mail ao concluir → planilha no Histórico. 1 crédito por CNPJ processado (cobra
até os não-encontrados). Saída (teste real do dono 01/07): situação, razão, fantasia, e-mail,
abertura, capital social, porte, endereço, telefones+tipo, **link wa.me pronto**, sócios, CNAEs,
regime tributário, Simples/MEI.

## O que o HBX tem
Todo o pipe de enriquecimento REAL (crawl site, e-mail factory, WhatsApp-gate, BrasilAPI/QSA,
IA extração) — mas orientado a campanha do Radar, não a "lote avulso colado pelo dono/cliente".

## Gap real
Falta a UX de LOTE: colar lista → receber planilha. É a feature mais "vendável por fora" que
existe (agência/contador/vendedor já tem a carteira de CNPJs e quer os dados).

## Plano (worker backend + tela Owner)
1. Endpoint Owner `POST /owner/cnpj-xray` — body: `{ cnpjs: string[] (máx 10k), layers: ['cadastral','vivo','ia'] }`.
   Valida DV mod-11, dedup, descarta inválidos (relatório do que caiu).
2. **Camada 1 — cadastral (instantânea, grátis)**: lookup local `CnpjPublicCompany`+`CnpjPublicPartner`
   (HOT-01). Miss local → BrasilAPI (throttle existente) → cacheia (o `cacheIntoLocal` consertado).
3. **Camada 2 — vivo (fila da fábrica)**: p/ cada CNPJ com site/telefone: crawl local (email/tel/
   sociais/sinais de venda) + WhatsApp-gate no telefone. Reusar exatamente os serviços do 03-enrichment;
   é um lote enfileirado como tarefa normal (respeita elasticidade/tetos — NADA de fila paralela nova).
4. **Camada 3 — IA (opcional)**: nota ICP + resumo de 1 linha por lead (gpt-oss-20b local batch/7B).
5. Saída: XLSX (colunas deles + NOSSAS: whatsappValidado, site, instagram, notaIA, seloContato)
   + histórico de jobs na tela. Processo em background + notificação no Owner ao concluir.
6. Tela Owner "Raio-X": textarea (1/linha), contador de linhas, escolha de camadas com custo/tempo
   estimado por camada, botão Iniciar, tabela de jobs (status, baixar).

## Criatividade (além deles — aqui a gente HUMILHA o deles)
- Deles = espelho da Receita. Nosso = Receita + **"essa empresa existe de verdade?"**:
  site no ar? WhatsApp responde? Instagram ativo? → **Selo VIVO/MORTO por lead**.
- Modo "carteira do cliente": o vendedor cola a carteira dele e recebe "quais dos SEUS clientes
  estão sem site / com WhatsApp inválido" = gancho de upsell do website-kit.
- Futuro (worm): expor como feature paga no Master p/ plano alto (LEI DO VENDEDOR: sem valores).

## Aceite
- [ ] Lote de 100 CNPJs: camada 1 <10s toda local; camadas 2-3 enfileiram sem furar tetos
- [ ] XLSX com colunas nossas + histórico funcionando; typecheck verde; deletar este .md
