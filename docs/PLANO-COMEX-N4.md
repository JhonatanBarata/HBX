# PLANO HBX COMEX — N4 em diante
> Escrito em 31/07/2026, fim do turno que entregou N1+N2+N3 e a demo Ask Crios.
> **Este arquivo é o ponto de partida da próxima sessão.**

## Como começar o próximo chat

```
trabalhe com fable.md — leia docs/PLANO-COMEX-N4.md e a memória comex-modulo-frente.md, depois me diga por onde começar
```

Ler, nesta ordem: `memory/comex-modulo-frente.md` (estado quente) ·
`memory/demo-ask-crios-comex.md` (o 1º prospect e a receita de dossiê) ·
`comex-motor/README.md` (as fontes e suas pegadinhas) · este arquivo.

---

## 1. Onde a frente está HOJE (não refazer)

**No ar, em produção, ligado** (publish `89f2725e` + deploy do dado 31/07 21h):

| Peça | Onde mora |
|---|---|
| Motor de dados (bulk → DuckDB → Parquet) | `comex-motor/` — `download.sh`, `ingest.py`, `export_parquet.py` |
| Detetive (SH4 → prováveis importadores) | `comex-motor/detective.py` + `enrich_vps.py` |
| Dossiê de empresa (CLI) | `comex-motor/demo_empresa.py` |
| API | `backend/src/comex/` — `status·busca·mercado·radar·noticias·cambio` |
| Tela | `frontend/src/app/(app)/comex/` + `hbx-theme/comex.css` + `lib/iso-flags.ts` |
| Dado em produção | `/root/HBX/comex-motor/data/parquet` (209 MB), volume `:ro` no `hbx-backend` |

Backend consome **280 MB** com o módulo ligado. Não pressiona os 20 motores do Radar.

**Números de referência do dado atual:** flow_mun 7,4 M linhas · flow_ncm 10,0 M ·
cadastro oficial 208 k linhas (2018–2020) · janela jan/2024 → jun/2026.

---

## 2. A tese comercial (o que decide a ordem das fases)

O HBX Comex **não vende dado** — dado bruto o Comex Stat dá de graça e a Penta
Transaction vende a R$ 350/mês. Guerra de preço aí está perdida antes de começar.

O que o HBX vende, e ninguém mais consegue entregar junto:

> **descoberta → identificação → contato → conversa → funil.**
> A Penta te dá um nome. O HBX te dá o CNPJ, o telefone, a mensagem escrita e a
> resposta chegando no WhatsApp.

Toda fase abaixo está ordenada por **quanto ela aproxima o cliente de assinar ou
de renovar** — não por dificuldade técnica.

---

## FASE A — O DOSSIÊ VIRA BOTÃO
*(o que transforma demo em contrato — construir primeiro)*

Hoje o dossiê da Ask Crios só existe porque **eu rodei um script na mão**. Isso não
escala: cada prospect novo depende de uma sessão minha. A fase A mata isso.

**A1. `POST /comex/dossie` — dossiê por CNPJ, na tela.**
O usuário digita um CNPJ e recebe o dossiê inteiro: ficha RFB, confirmação SECEX
(com nome anterior, quando houver), NCMs prováveis do CNAE, mercado de cada um,
spread de preço por origem, vizinhos de município. Porta o `demo_empresa.py` +
`detective.py` para dentro do `ComexService`.

- **Peça nova que falta**: `CNAE → NCM provável`. Hoje isso é intuição minha
  (resinas termofixas → fenol, MDI, furfurílico). Vira tabela de correlação
  curada em `comex-motor/data/cnae_ncm.json`, semeada com os ~50 CNAEs
  industriais mais comuns. Sem ela o dossiê automático não sai.
- **Aceite**: digitar `44246528000110` devolve, em menos de 5 s, o mesmo conteúdo
  do artefato que eu montei à mão.

**A2. Dossiê em PDF de uma página.**
O vendedor precisa mandar isso por WhatsApp antes da reunião. Impressão da tela
via CSS `@media print` — sem biblioteca nova (o container mascara dependência,
ver §5).

**A3. Botão "Prospectar" no Radar Internacional.**
O candidato vira lead no `/vendas` **consumindo a API pública**, como se fosse um
clique de usuário — o módulo Vendas não ganha uma linha. Junto vai a primeira
mensagem já redigida com o dado do dossiê:

> *"Vi que a sua região importa 88,8% do fenol-formaldeído da China a US$ 1,38/kg…"*

Essa frase é o produto inteiro em uma linha. É o que a Penta não faz.

---

## FASE B — O VIGIA
*(o que faz o cliente **renovar** — sem isso a assinatura morre no 2º mês)*

Dossiê é evento único: o cliente lê, gosta e some. Recorrência exige que o
sistema **volte a falar com ele sozinho**.

**B1. Vigia de NCM.** O cliente marca os NCMs dele. Uma vez por mês, quando o
Comex Stat atualiza, o sistema compara e dispara aviso quando:
- preço médio da origem principal mexer mais que X%;
- **origem nova** aparecer (concorrente achou fornecedor mais barato);
- volume do NCM cair ou subir fora da faixa;
- o Brasil passar de importador a exportador líquido (virada de mercado).

**B2. O aviso sai no WhatsApp** pela porta única (`queueOutboundForCompany`),
respeitando trava de horário, disjuntor e teto — **nunca** um caminho novo de
envio. Ver `memory/trava-horario-disparo.md` e `WHATSAPP.md` antes de encostar.

**B3. Cron mensal do pipeline.** Comex Stat publica todo dia 3–5. Rotina:
`download.sh → ingest.py → export_parquet.py → SFTP → restart`, com aviso no
`/master` de "dado atualizado até MM/AAAA". Enquanto isso não existir, o módulo
envelhece em silêncio — e **dado velho sem alarme já mordeu esta casa**
(ver `memory/cnefe-morto-por-cast-de-cep.md`).

---

## FASE C — AS TRÊS LENTES
*(o que faz o comprador internacional dizer "isso eu não tinha")*

Estas três nascem do mesmo dado que já está no disco. Custo zero, valor alto.

**C1. "Você paga caro?" — régua de arbitragem.**
O cliente informa o que paga por quilo. O sistema responde em que percentil do
mercado ele está, quanto economizaria comprando da origem mais barata do mesmo
NCM, e quanto isso dá por contêiner. É a tela que se mostra pro comprador e ele
chama o chefe. *Achado real da demo: resina ureica sai a US$ 5,75/kg da Alemanha
e US$ 1,33 da China — no mesmo código.*

**C2. Relógio do NCM — sazonalidade.**
Média por mês do ano na série que já temos. Responde "quando comprar" e "quando
vender". Ninguém no mercado brasileiro mostra isso de graça.

**C3. Caçador de substituição de importação.**
Varredura automática atrás de NCMs onde o Brasil **importa caro e exporta o mesmo
código mais barato** (ou o contrário). Cada linha dessas é uma oportunidade de
trading — e uma lista de prospects pronta. *No dado atual: fenol (exporta 4× o que
importa), 3811.21.30 (sai a 3,38 e entra a 2,64).*

---

## FASE D — TIRAR O "PROVÁVEL" DA FRENTE
*(o salto de credibilidade — só depois que A e B estiverem de pé)*

**D1. Manifesto marítimo dos EUA.** Registro público (CBP/AMS), bulk já liberado
pelo Data Liberation Project. Traz **nome real** de embarcador e consignatário —
sem detetive, sem inferência. Toda empresa brasileira que compra dos EUA aparece
nomeada. É o dado que o ImportYeti usa para ser gratuito.

- Entra como fonte nova no `comex-motor` (mesmo pipeline), tabela `bol_usa`.
- Na tela, vira o selo **CONFIRMADO** ao lado do "provável" — e é a diferença
  entre um lead morno e um lead quente.

**D2. Casar nome estrangeiro com CNPJ** (`entity resolution`). "COCA COLA CO",
"COCA-COLA COMPANY" e "COCA COLA SA" são a mesma empresa em 500 embarques.
Limpar isso é metade do valor do produto — e nós temos a RFB para ancorar o lado
brasileiro. É trabalho chato e é exatamente por isso que vale dinheiro.

**D3. Só então avaliar comprar dado LatAm nomeado** (~US$ 79–400/país/mês,
`billofladingdata.com`, Veritrade, Datarade). **Regra dura: só depois de contrato
assinado.** Nenhum feed pago entra antes de existir receita cobrindo.

---

## FASE E — INTELIGÊNCIA (o tempero, por último)

**E1. Notícia com NCM colado.** Hoje a tag é dicionário de porto/tema. Com o
`qwen3:4b` local a manchete ganha o NCM e o país: *"greve em Santos afeta 3 dos
seus produtos"*. Cuidado com `OLLAMA_CONTEXT_LENGTH` — sem ele o Ollama devolve
500 por OOM (`memory/concierge-repertorio-voz-revisor.md`).

**E2. Busca semântica de produto.** Hoje é casamento de palavra, e por isso
"bomba de água" ainda mostra fogos de artifício (a descrição tem "bombas").
Embeddings locais das 13,7 mil descrições de NCM resolvem de vez.

**E3. Concierge Comex.** Reusar o `/concierge` que já existe: *"quero achar quem
importa resina fenólica no Sul"* → o sistema monta a busca e mostra o custo antes
de executar. Zero tela nova.

---

## 3. Preço e embalagem (decisão do dono, não minha)

O que o mercado cobra hoje: Penta ~R$ 350/mês (anual), ImportGenius US$ 125/mês,
Logcomex na casa dos milhares. Nosso custo de dado na configuração atual é **zero**.

Sugestão para o dono decidir — **não implementar sem palavra dele**:

| Faixa | O que entrega | Ideia de preço |
|---|---|---|
| Consulta | Mercado + Notícias + PTAX | isca / incluso no plano |
| Inteligência | Dossiê por CNPJ + régua de arbitragem + sazonalidade | R$ 300–500/mês |
| Prospecção | Radar + Prospectar + Vigia no WhatsApp | R$ 600–900/mês |

⬜ **Decisão pendente do dono:** o Comex é módulo **avulso** (vende sozinho, entra
gente que não usa CRM) ou **add-on** do plano existente? Isso muda o gate no
`module-access-policy.ts` e a conversa comercial inteira.

---

## 4. Ordem sugerida (e o porquê)

```
A1 → A3 → B1+B2 → C1 → B3 → C2/C3 → D1 → D2 → E
```

**A1 primeiro** porque hoje toda demo depende de mim rodando script — é o gargalo
real. **A3 logo em seguida** porque é o loop que justifica o preço. **B antes de
C** porque retenção vale mais que encantamento. **D só depois** porque é a fase
cara em esforço, e ela só compensa com cliente pagando do outro lado.

---

## 5. Armadilhas — ler antes de codar, custaram tempo

1. **`node_modules` do backend dev é volume Docker nomeado** (`app_backend_node_modules`)
   e **não acompanha o `package.json`**. Dependência nova exige
   `docker exec backend npm install <pkg>` + restart. Rebuildar a imagem **não adianta** —
   o volume mascara. (Em produção não existe esse volume; lá o `npm ci` da imagem resolve.)
2. **Chave de módulo fora da caixa de plano some do `/modules/me`.** Módulo novo
   precisa entrar EXPLÍCITO no `knownModuleKeys` (`modules.service.ts`) — mesma
   armadilha que já mordeu o `conversas`. Sintoma: item nunca aparece na sidebar.
3. **Git Bash mangleia caminho remoto**: `/root/HBX/...` vira
   `C:/Program Files/Git/root/HBX/...` no SFTP/SSH. Usar `MSYS_NO_PATHCONV=1` ou
   montar o caminho dentro do Node.
4. **CSV do MDIC é latin-1, separador `;` e malformado** (polegadas `37"` soltas no
   NCM.csv) → `strict_mode=false`. IMP tem `VL_FRETE`/`VL_SEGURO`, EXP não.
5. **URL errada no `balanca.economia.gov.br` responde HTTP 200 com página Joomla.**
   Sempre farejar o conteúdo, nunca confiar no código de status.
6. **PTAX não cota CNY.** Não completar com fonte não-oficial: dado sem contrato
   mostra "—".
7. **2026 é ano parcial** (dado até jun). Comparação anual sem anualizar mente.
8. **Emoji de bandeira não renderiza no Windows** — por isso `flag-icons` (SVG).
9. **Nunca prometer gestão de DUIMP.** Vocabulário aduaneiro sim; operação
   aduaneira é software de despachante, outro produto, outra responsabilidade legal.
10. **Sessões paralelas sobrescrevem arquivo compartilhado** (`app.module.ts`,
    `globals.css`, `structural-defaults.json`, `shell.tsx`). Reconferir a costura
    depois de qualquer publish alheio.

---

## 6. A lei que não se negocia nesta frente

A SECEX tirou do ar a lista de importadores em mar/2023 **porque cruzá-la com as
estatísticas de município reidentifica CNPJ** — ou seja, o governo confirmou por
escrito que o nosso método funciona, e escolheu preservar a estatística.

Por isso, dentro do produto:

- empresa é sempre **"provável importador/exportador"**, nunca afirmação;
- **nenhum valor ou volume é atribuído a um CNPJ**. Cifra só agregada por
  município, UF ou país;
- a origem do dado aparece na tela — é o que separa inteligência de boato.

Quem afrouxar isso troca um argumento de venda por um risco jurídico. Não vale.
