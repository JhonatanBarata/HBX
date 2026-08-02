# HBX COMEX — O ANALISTA
> **Documento único de execução.** Escrito em 01/08/2026, depois da demo Ask Crios validada pelo dono
> e de uma bateria de testes REAIS na IA local. Substitui a Fase A do `PLANO-COMEX-N4.md`
> (A3, B, C, D e as leis §5/§6 daquele arquivo continuam valendo).

## Como começar a próxima sessão
```
leia docs/PLANO-COMEX-ANALISTA.md e a memória ia-local-30b-medicoes.md — vamos construir a F1
```

---

## 1. A decisão do dono que originou tudo

> *"Não quero um sistema que crie um PDF com apresentações prontas, quero um sistema que tenha uma
> IA que cruze dados."*

O dossiê da Ask Crios impressionou (o dono trabalhou na empresa e conferiu tudo) — mas ele nasceu de
um script rodado na mão. **Isso não escala: cada prospect novo custa uma sessão de engenharia.**
O Analista mata esse gargalo.

**O produto:** uma aba de chat dentro do `/comex`. O usuário digita **um CNPJ ou uma pergunta**
("quem provavelmente importa resina fenólica no Sul?", "eu pago caro no 3909.31?"). A IA investiga
ao vivo, o usuário **vê os cruzamentos acontecendo**, e a resposta vem em **cards de dados reais**
com a fonte carimbada (RFB · SECEX 2020 · Comex Stat jun/26), costurados por texto curto da IA.

Não é dashboard (o cliente ignora) nem PDF (evento morto). É **um analista de comex sênior de plantão**
— o que a Penta não tem e não copia rápido.

---

## 2. 🔬 O QUE OS TESTES DE 01/08 PROVARAM (isto define a arquitetura)

Testes rodados na máquina do dono (Ryzen 5 5500, 32GB DDR4-3200, **sem GPU utilizável**) com
`qwen3:30b-a3b-instruct-2507-q4_K_M`. Números completos em `memory/ia-local-30b-medicoes.md`.

### 2.1 O que a IA local ACERTA e o que ela ERRA
Tarefa: *CNAE 20.72-0 (resinas termofixas, Ask Crios) → que NCMs ela importa?*

| | Resultado |
|---|---|
| **Substâncias** — fenol, formaldeído, furfural, cresol, metanol, aminas | ✅ **todas certas** — ele **sabe a química do setor** |
| **Códigos NCM** | ❌ **0 de 8 corretos** — alucinou todos, com formatação confiante |
| **MDI** (o achado de US$ 536 mi que mais vendeu na demo) | ❌ **não citou** |
| Mesmo pedido com dados **PRÉ-DIGERIDOS** | ✅ **PERFEITO — zero invenção**, ~55s |

Conferido contra `comex-motor/data/raw/tabelas/NCM.csv` (13.755 linhas, latin-1, separador `;`):

| Substância | A IA disse | OFICIAL |
|---|---|---|
| Fenol | 2914.10.00 | **2907.11.00** |
| Formaldeído | 2914.20.00 | **2912.11.00** |
| Metanol | 2912.10.00 | **2905.11.00** |
| Cresóis | 2914.30.00 | **2907.12.00** |
| Furfural | 2932.99.90 | **2932.12.00** |
| MDI polimérico | *(não citou)* | **3909.31.00** · diisocianato **2929.10.10** |

### 2.2 🔒 AS 4 LEIS QUE SAÍRAM DOS TESTES

**LEI 1 — "código NCM é SEMPRE do servidor."**
Extensão de *"número é sempre do servidor"*. A IA **deduz a SUBSTÂNCIA** (é boa nisso); uma
**ferramenta busca o CÓDIGO** no `NCM.csv`. A IA **nunca** emite código de cabeça — erra 100% das
vezes com cara de certeza. ⚠️ Quantização maior (Q5/Q6) **não conserta** — é falta de conhecimento
factual, não ruído.

**LEI 2 — "a tabela não entra no prompt; o ACHADO entra."**
Joguei 300 linhas de dados brutos: viraram ~15.000 tokens e levaram **mais de 10 minutos só de
prefill**. Com os mesmos dados **pré-digeridos** (3 achados calculados), a resposta saiu perfeita em
**55s**. Dado tabular tokeniza a **~1,7 char/token** (prosa ≈ 3,5) — tabela custa o DOBRO do que a
intuição diz. **Alvo de prompt: ≤ 1.500 tokens.**

**LEI 3 — "toda investigação é streaming."**
Uma investigação real leva **~55–60s**. O proxy do Next mata resposta única em 30s
(mesma armadilha B8 do teste noturno de vendas). **SSE obrigatório, desde a F2.**

**LEI 4 — "o modelo não é o gargalo; o desenho é."**
Na tarefa real de enriquecimento, `30b` = 58,0s/lead e `4b` = 49,5s/lead — **só 15% de diferença**,
e a **geração empata** (12,72 vs 12,29 tok/s). Trocar de modelo quase não muda o tempo; **pré-digerir
o prompt muda tudo.** Escolher modelo por TAREFA: **extração → 4b basta · dedução/análise → 30b**.

### 2.3 Configuração operacional medida (usar exatamente isto)
| Parâmetro | Valor | Por quê |
|---|---|---|
| `num_thread` | **6** (cores físicos) | 12 threads (SMT) custa **−20%**: 19,43 → 15,56 tok/s |
| `num_ctx` | **8192** | dobrar de 4096 custa só 2%; KV ≈ 96 KB/token |
| `keep_alive` | ligado | load frio custa **170s** no SSD SATA |
| Velocidade real | **19,4 tok/s** vazio · **12,7 tok/s** com contexto | orçar SEMPRE pelo número COM contexto |

⚠️ **RAM:** o 30b ocupa **19 GB residentes** e **não carrega com o Docker no ar** (32GB não bastam).
O dono instala mais memória nesta semana — **`4×16=64GB`, nunca `3×16`** (quebra o dual channel
simétrico, e banda de RAM é o gargalo).

### 2.4 💰 O que isso ECONOMIZA no plano
A versão anterior deste plano dizia que a dedução CNAE→NCM provavelmente exigiria **API paga da
Anthropic**. **Os testes mudam isso:** o 30b local **já acerta a química** — que era justamente a
parte que eu achava que só um modelo grande faria. O que ele erra é o *código*, e isso a **ferramenta
de busca no `NCM.csv` resolve de graça**.
> **Nova leitura: o 30b local provavelmente BASTA para a F1–F3.** A API entra só se o A/B de
> qualidade reprovar — e como decisão consciente do dono, não como premissa.
> O buraco que sobra é conhecimento setorial profundo (o MDI que ele não citou) — e quem tapa isso
> é a **tabela curada `cnae_ncm.json`**, que se constrói por uso (§5).

---

## 3. Arquitetura — 4 peças

### 3.1 Ferramentas (tools) — porta o que já existe, zero dado novo
A IA nunca toca SQL nem inventa número; ela chama ferramentas do `ComexService`:

- `ficha_empresa(cnpj)` — RFB 28M: CNAE, capital, sócios, unidades, contato
- `confirma_secex(cnpj|nome)` — cadastro Wayback 2018–2020 (traz o **nome antigo**)
- `mercado_ncm(ncm)` — KPIs, série mensal, origens com % e US$/kg, UFs, vias
- `fluxo_municipio(municipio, uf)` — o que a região importa/exporta + vizinhos do cadastro
- `detectores(alvo)` — roda a biblioteca do §3.2 e devolve achados rankeados
- `noticias(tags)` — o RSS já ingerido (N3)
- 🆕 **`busca_ncm(substancia|descricao)`** — **a peça que a LEI 1 exige**. Busca nas 13.755 linhas do
  `NCM.csv` e devolve `{codigo, descricao_oficial}`. **Sem ela o Analista mente com confiança.**
- `sugere_ncm(cnae)` — lê a tabela curada `cnae_ncm.json` (§5)

### 3.2 Biblioteca de DETECTORES — uma biblioteca, três bocas
Cada achado da demo é um padrão computável. Vira função SQL sobre o parquet, com score de força e
frase-template. **Sem IA nenhuma aqui** — é a parte grátis, infalível e que atende a LEI 2.

| Detector | Fórmula | Exemplo real |
|---|---|---|
| Origem cara | origem principal está no topo do preço entre as top-5 | China a mais cara das 5 |
| Spread interno | max/min US$/kg entre origens > 3x | ureica: US$ 5,75 DE vs 1,33 CN |
| Rota alheia | % do NCM que entra por UF ≠ UF da empresa | 80% entra pelo RS |
| Gigante escondido | NCM correlato ao CNAE com volume alto não citado | MDI US$ 536 mi |
| Virada de mão | importa caro E exporta barato o mesmo código | fenol exporta 4x |
| Sazonalidade | melhor/pior mês da série | (lente C2) |
| Origem nova | origem inexistente na janela anterior | (modo vigia) |
| Preço em movimento | Δ% do preço da origem principal | (modo vigia) |
| Vizinhança | empresas do cadastro no mesmo município/CNAE | Arkema, Lanxess, PQ |
| Nome antigo | razão social SECEX ≠ RFB atual | SI Group → ASK |
| Percentil de preço | preço do cliente vs distribuição do NCM | (lente C1) |

**As três bocas do mesmo código:** ① *Analista* (foto: roda agora) · ② *Vigia* (filme: diff mensal →
WhatsApp) · ③ *Lentes C1–C3* (tela). **Construir a biblioteca UMA vez paga as três fases.**

### 3.3 O cérebro
`qwen3:30b-a3b` local, com a config medida do §2.3. Ele **interpreta e narra**; não calcula e não
codifica NCM. Custo marginal zero. API paga fica como plano B (§2.4).

### 3.4 Guarda-corpo — por que não vai viajar
- Todo número da resposta precisa existir num resultado de ferramenta da MESMA investigação;
  validador reprova resposta que inventar cifra (padrão já provado no concierge).
- Todo código NCM precisa ter vindo do `busca_ncm` (LEI 1).
- System prompt carrega as leis jurídicas: sempre **"PROVÁVEL importador"**, **nunca valor por CNPJ**
  (sigilo fiscal — §6 do N4), fonte carimbada em todo card, vocabulário **DUIMP**, nunca prometer
  gestão aduaneira.

---

## 4. Ordem de construção
```
F1  detectores em SQL puro          → testável SEM IA nenhuma
F2  busca_ncm + ferramentas + cérebro + guarda-corpo + SSE   → CLI/rota primeiro
F3  aba Analista no /comex (chat + cards com fonte)
F4  Prospectar de dentro do chat (= A3 do N4: lead no /vendas via API pública
    + 1ª mensagem já escrita com o achado mais forte)
F5  Vigia: os MESMOS detectores em modo diff + cron mensal (= B do N4)
```
**F1 e F2 já produzem valor sem tela:** `POST /comex/analista` responde por API, e a demo pro cliente
do dono pode rodar nisso.

⏰ **Relógio:** o Comex Stat publica **dia 3–5**. Na primeira atualização manual do dado,
**scriptar o cron junto** (F5/B3) — dado velho sem alarme já mordeu esta casa (`cnefe-morto-por-cast-de-cep`).

---

## 5. O flywheel (o que vira ativo proprietário)
1. Cada dedução CNAE→NCM confirmada é gravada em `comex-motor/data/cnae_ncm.json` → a próxima
   investigação daquela classe é **instantânea e grátis**. A tabela curada **se constrói por uso**,
   e é ela que tapa o buraco do MDI.
2. Quando o vendedor usa "Prospectar" e o lead responde ("Te chamou"), fica registrado **qual achado**
   estava na 1ª mensagem → aprendemos **quais detectores VENDEM**. Ninguém no mercado tem esse dado.

---

## 6. Encaixe no `PLANO-COMEX-N4.md`
- **A1/A2 (dossiê-botão + PDF): substituídos.** O "dossiê" é a resposta do Analista a um CNPJ;
  imprimir vira botãozinho depois, não é produto.
- **A3 → F4** · **B (Vigia) → F5**, e barateia porque reusa os detectores · **C (lentes)** viram
  modo-tela dos detectores, quase de graça · **E3 (concierge comex)** é absorvido: o Analista É o
  concierge · **D (manifesto EUA)** inalterado — quando entrar, vira ferramenta nova e o selo
  **CONFIRMADO** aparece nos cards.

---

## 7. Armadilhas (as do §5 do N4 continuam valendo; estas são novas)
1. **Prompt com tabela crua = investigação de 10 minutos.** Pré-digerir sempre (LEI 2).
2. **Resposta única morre no proxy de 30s.** SSE desde a F2 (LEI 3).
3. **`num_thread:12` parece "usar mais CPU" e custa 20%.** Fixar em 6.
4. **O 30b não sobe com o Docker no ar** enquanto a RAM for 32GB — planejar a ordem de subida, e
   **corrigir o Owner V3**, que hoje mostra `switches.ia = {on:true, warm:false, reason:null}` e
   **esconde o OOM** (viola a lei escrita na própria tela: *"se algo não roda, o motivo está escrito"*).
5. **`NCM.csv` é latin-1 com separador `;`** — ler com encoding explícito ou vira lixo acentuado.
6. Dep nova no backend → o volume `app_backend_node_modules` mascara: `docker exec backend npm install`
   + restart (rebuild de imagem não adianta).

---

## 8. ⬜ Decisões que dependem do dono
1. **A/B de qualidade 30b × 4b** nos mesmos 20–30 leads (só a VELOCIDADE foi medida, não o acerto).
   É o que decide se os 10.000 leads da fila vão de 30b ou de 4b, e se o VPS entra.
2. **Comex é módulo AVULSO ou add-on** do plano? Muda o gate em `module-access-policy.ts` e a
   conversa comercial inteira.
3. **CNPJ + NCMs do cliente real** para a primeira demo do Analista.
4. **"Espelho"** (captação): prospect manda o PRÓPRIO CNPJ pro WhatsApp do HBX e recebe 3 achados +
   convite. A reação do dono à demo ("eu trabalhei lá!") é a que todo prospect teria sobre a própria
   empresa. Precisa trava anti-abuso. **Só com go explícito.**
