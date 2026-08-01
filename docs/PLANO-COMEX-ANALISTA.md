# HBX COMEX — O ANALISTA (plano da IA que cruza dados)
> Escrito em 01/08/2026, depois da demo Ask Crios validada pelo dono (ele trabalhou lá e bateu tudo).
> **Decisão do dono que originou este plano:** "não quero um sistema que crie um PDF com
> apresentações prontas, quero um sistema que tenha uma IA que cruze dados."
> Este arquivo SUBSTITUI a Fase A do `PLANO-COMEX-N4.md` (A1/A2). A3, B, C e D continuam valendo.

## 1. O que a demo provou (e o que ela ensina)

O dossiê da Ask Crios impressionou e **não viajou em momento algum**. Por quê:

| Camada | O que é | Quem fez na demo | Quem fará no produto |
|---|---|---|---|
| **Dados** | FOB, US$/kg, origens, SECEX, RFB, vizinhos | 95% HBX (parquet + RFB) | HBX — ferramentas (tools) |
| **Dedução** | "fábrica de resina termofixa compra MDI, fenol, furfurílico" | Conhecimento setorial do Claude | LLM com tool-use + tabela que cresce |
| **Achados** | "spread 4x no mesmo código", "80% entra pelo RS" | Olho do Claude | **Detectores** — SQL puro, sem IA |
| **Narrativa** | o texto que vende | Prosa do Claude | LLM com guarda-corpo |

A lição: **o HBX já sabe tudo; falta ensinar a cruzar e a contar.** E o motivo de não ter
viajado é replicável: cada número veio do banco, a IA só escreveu EM VOLTA deles.
Essa é a lei nº 1 deste plano (mesma do concierge: **número é sempre do servidor**).

## 2. O produto: aba "Analista" no /comex

Um chat dentro do módulo. O usuário digita um CNPJ **ou uma pergunta**
("quem provavelmente importa resina fenólica no Sul?", "eu pago caro no 3909.31?").
A IA investiga ao vivo — o usuário VÊ os cruzamentos acontecendo — e responde com
**cards de dados reais** (componentes da tela, com fonte carimbada: RFB · SECEX 2020 ·
Comex Stat jun/26) costurados por texto curto da IA. Pode aprofundar: "e a série da
China nos últimos 12 meses?" → novo cruzamento, novo card.

Não é dashboard (dashboard o cliente ignora) nem PDF (evento morto). É um analista
de comex sênior de plantão — o que a Penta não tem e não consegue copiar rápido.

## 3. Arquitetura — 4 peças

### 3.1 Ferramentas (tools) — porta o que já existe, zero dado novo
A IA nunca toca SQL nem inventa número; ela chama ferramentas do `ComexService`:

- `ficha_empresa(cnpj)` — RFB 28M: CNAE, capital, sócios, unidades, contato
- `confirma_secex(cnpj|nome)` — cadastro Wayback 2018–2020 (com nome antigo)
- `mercado_ncm(ncm)` — KPIs, série mensal, origens com % e US$/kg, UFs, vias
- `fluxo_municipio(municipio, uf)` — o que a região importa/exporta + vizinhos do cadastro
- `detectores(alvo)` — roda a biblioteca do §3.2 e devolve achados rankeados
- `noticias(tags)` — o RSS já ingerido (N3)
- `sugere_ncm(cnae, descricao_empresa)` — tabela curada + dedução (§3.3)

### 3.2 Biblioteca de DETECTORES — uma biblioteca, três bocas
Cada achado da demo é um padrão computável. Vira função SQL sobre o parquet, com
score de força e frase-template. **Sem IA nenhuma aqui** — é a parte grátis e infalível.

| Detector | Fórmula | Exemplo real da demo |
|---|---|---|
| Origem cara | origem principal está no topo do preço entre as top-5 | China a mais cara das 5 |
| Spread interno | max/min US$/kg entre origens > 3x | ureica: US$ 5,75 DE vs 1,33 CN |
| Rota alheia | % do NCM que entra por UF ≠ UF da empresa | 80% entra pelo RS |
| Gigante escondido | NCM correlato ao CNAE com volume nacional alto não citado | MDI US$ 536 mi |
| Virada de mão | importa caro E exporta barato o mesmo código | fenol exporta 4x |
| Sazonalidade | melhor/pior mês da série | (lente C2) |
| Origem nova | origem que não existia na janela anterior | (modo vigia) |
| Preço em movimento | Δ% do preço da origem principal | (modo vigia) |
| Vizinhança | empresas do cadastro no mesmo município/CNAE | Arkema, Lanxess, PQ |
| Nome antigo | razão social SECEX ≠ RFB atual | SI Group → ASK |
| Percentil de preço | preço do cliente vs distribuição do NCM | (lente C1 — precisa input) |

**As três bocas do mesmo código:** ① *Analista* (foto: roda agora, responde) ·
② *Vigia* (filme: roda no diff mensal → WhatsApp, Fase B) · ③ *Lentes* (tela: C1/C2/C3
viram só renderização de detector). Construir a biblioteca UMA vez paga as três fases.

### 3.3 O cérebro — quem deduz e quem narra
- **Dedução** (CNAE→NCM provável, tipo "cold-box precisa de MDI"): exige conhecimento
  setorial de modelo grande. Ordem de teste (lei: testar do mais leve primeiro):
  bench `qwen3:4b` local em 10 CNAEs conhecidos contra as minhas deduções; se não
  achar o MDI da vida, sobe pra **API da Anthropic** (`claude-opus-5`, tool-use).
  O VPS (4 cores/15GB, 20 motores) NÃO comporta modelo local maior — API não rouba RAM.
- **Narrativa**: mesmo modelo, mesma chamada — a narração sai da própria investigação.
- **Custo estimado por investigação completa** (~15 chamadas de ferramenta, com prompt
  caching): **R$ 0,50–2,00**. Cliente na faixa Prospecção (R$ 600–900/mês) com 100
  investigações/mês custa R$ 60–200 → margem >70% no pior caso.
- **Teto obrigatório** (lei do MOTOR: budget SEMPRE): teto mensal de investigações por
  tenant + custo estimado visível pro dono no /master. Sem chave/teto configurado,
  a aba mostra "indisponível" — nunca 500.

### 3.4 Guarda-corpo — por que não vai viajar
- Todo número na resposta precisa existir num resultado de ferramenta da MESMA
  investigação; validador reprova a resposta que inventar cifra (padrão já provado
  no concierge — `concierge-repertorio-voz-revisor`).
- System prompt carrega as leis: sempre "PROVÁVEL importador", nunca valor por CNPJ
  (sigilo fiscal — §6 do plano N4), fonte carimbada em todo card, vocabulário DUIMP,
  nunca prometer gestão aduaneira.

## 4. O flywheel (o que vira ativo proprietário)
1. Cada dedução CNAE→NCM confirmada é gravada em `comex-motor/data/cnae_ncm.json`
   → próxima investigação do mesmo CNAE-classe é instantânea e grátis. A tabela que
   a Fase A pedia **se constrói sozinha, com curadoria por uso**.
2. Quando o vendedor usa "Prospectar" e o lead responde ("Te chamou"), fica registrado
   QUAL achado estava na 1ª mensagem → aprendemos quais detectores VENDEM.
   Ninguém no mercado tem esse dado.

## 5. Encaixe no plano N4 (o que muda)
- **A1/A2 (dossiê-botão + PDF): substituídos.** O "dossiê" passa a ser a resposta do
  Analista a um CNPJ; exportar/imprimir vira botãozinho depois, não é produto.
- **A3 (Prospectar): mantém**, agora disparado de dentro do chat — lead no /vendas via
  API pública + 1ª mensagem com o achado mais forte.
- **B (Vigia): mantém e barateia** — reusa os detectores em modo diff. B2 (WhatsApp)
  continua pela porta única com trava de horário. B3 (cron mensal) segue urgente:
  **o dado de julho sai dia 3–5** — na 1ª atualização, scriptar o pipeline.
- **C (lentes): viram modo-tela dos detectores** — quase de graça.
- **E3 (concierge comex): absorvido** — o Analista É o concierge do módulo.
- **D (manifesto EUA): inalterado** — quando entrar, vira ferramenta nova do Analista
  e o selo CONFIRMADO aparece nos cards.

## 6. Ordem de construção
```
F1 detectores (SQL puro, testável sem IA)
F2 ferramentas + cérebro + guarda-corpo (bench qwen → API) — CLI primeiro, tela depois
F3 aba Analista no /comex (chat + cards com fonte)
F4 Prospectar de dentro do chat (A3)
F5 Vigia = detectores em modo diff + cron mensal (B)
```
F1 e F2 já produzem valor sem tela: `POST /comex/analista` responde por API e a demo
pro cliente do dono pode rodar nisso.

## 7. Armadilhas específicas (além das do N4 §5)
1. Dep nova no backend (`@anthropic-ai/sdk`) → volume `app_backend_node_modules`
   mascara: `docker exec backend npm install` + restart; em prod o `npm ci` resolve.
2. Chave da Anthropic é secret novo no VPS → `env_file` alterado = **RECREATE** do
   container, não só restart (lei da INFRA).
3. Streaming: investigação leva 30–90s; a resposta tem que aparecer progressiva
   (SSE), senão o proxy de 30s mata (armadilha B8 do teste noturno de vendas).
4. Ollama/qwen no bench: sem `OLLAMA_CONTEXT_LENGTH` = HTTP 500 por OOM.

## 8. ⬜ Decisões do dono
1. **Cérebro pago?** Se o bench do qwen reprovar (provável pra dedução): autorizar
   chave da API Anthropic no VPS com teto mensal (custo ~R$1/investigação). Sem isso,
   o Analista fica só com detectores + tabela curada (funciona, mas sem o "MDI").
2. **Espelho** (ideia de captação, criatividade solta): prospect manda o PRÓPRIO CNPJ
   pro WhatsApp do HBX → recebe 3 achados + convite. A reação do dono à demo ("eu
   trabalhei lá!") é a reação que todo prospect teria sobre a própria empresa.
   Precisa trava anti-abuso. Só com go explícito.
3. As duas pendências antigas seguem: **avulso vs add-on** (preço/gate) e o
   **CNPJ+NCMs do cliente real** pra 1ª demo do Analista.
