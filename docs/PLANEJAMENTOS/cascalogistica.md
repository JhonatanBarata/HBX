# CASCA LOGÍSTICA — uma casca só, fiel ao mock, trocável depois

> **Objetivo:** o app de logística usar **a casca do mock**, 100% no visual (letras, transições,
> abertura, espaçamento, cor), **sem mudar uma linha de funcionalidade**. E, mais pra frente,
> trocar a casca inteira do sistema (o "modo barbie girl") mexendo em **uma semente**, não em tela.
>
> Status: plano. Nada aqui foi feito ainda. As levas 1 e 2 da fiação foram **revertidas**
> (`1caebde6`) porque atacavam o alvo errado.

---

## 1. Onde foi o erro (a pergunta do dono, respondida)

**Não foi na criação do mock.** O mock está certo e é o ativo mais valioso desta frente: ele decidiu
o desenho **uma vez**, inteiro, com os 33 estados, movimento e os dois modos de luz.

**E não foi exatamente "a injeção".** Foi **o que eu escolhi extrair do mock.**

O mock tem duas coisas dentro dele:

| | o que é | vale o quê |
|---|---|---|
| **VOCABULÁRIO** | tokens, componentes (`.act`, `.stop`, `.chave`, `.kpi`, `.banner`, `.pill`…), tipografia, as 7 leis de movimento, abertura, modo claro | **é o ativo.** Serve pra tela que ainda nem existe |
| **AS 33 TELAS** | a prova de que o vocabulário fecha, com dado de exemplo | é **descartável** — é amostra, não produto |

Eu extraí **as 33 telas** e comecei a fazer o app renderizar as telas do mock. Aí veio a consequência
inevitável: a tela do mock não tem o dado nem o comportamento do app, então eu comecei a **arrastar
dado pra dentro do mock** (`DADOS_MOCK`, `usarDados`, `data-acao`) e a traduzir tela por tela no
`app.js`. **Isso é refazer dentro do celular a decisão que o mock já tinha tomado** — exatamente o
desperdício que o dono apontou.

E gerou o segundo defeito, que é o pior: tela sem tradução pronta **caía na pele velha**. Eu reportei
isso como cautela. Não é. É **duas peles no mesmo app**, que é o oposto de casca única.

> **A raiz:** confundi *fidelidade* com *trocabilidade*. Copiar a saída do mock (as telas) dá
> fidelidade uma vez e trava tudo. Copiar a entrada (o vocabulário) dá fidelidade **e** deixa a
> próxima casca barata.

---

## 2. A virada

**A casca é uma CAMADA, não um conjunto de telas.**

- O app continua dono do DOM, do dado e do comportamento — **nada de funcionalidade muda.**
- A tela do app passa a ser escrita com **as classes e os tokens do mock**.
- As 33 telas do mock viram **referência de conferência** (a régua), não código de produção.

Regra de fechamento de qualquer leva: **sobrou alguma tela com a cara antiga? Então a leva não acabou.**

---

## 3. O que MORRE e o que FICA

**FICA** (é a máquina que prova fidelidade, não é o erro):
- `pele20.css` — a folha do mock, extraída verbatim. **É a casca.**
- `scripts/pele20-gerar.js` — mantém a casca sincronizada com o mock, com portões estruturais.
- `scripts/pele20-conferir.js` — 33 telas × 2 modos, byte a byte + contraste **medido**.
- `scripts/pele20-antes-e-depois.js` — prova que um refactor **não mudou pixel**. É o instrumento
  central das fases 2 e 3 (foi revertido junto; **restaurar**).
- O modo claro desenhado pelo dono + os 6 defeitos de contraste achados medindo (`c2223427`).

**MORRE:**
- `pele20.js` como **fonte de tela**. As 33 `T.*` deixam de renderizar no app.
- `pintarPele20` / `pele20Para` / `MODAIS_PELE20` no `app.js` — o caminho paralelo que criava as
  duas peles.
- Qualquer ideia de `DADOS_MOCK`/`usarDados` (já revertida).

---

## 4. As fases

### FASE 0 — inventário do vocabulário  ⬜
Extrair do mock a lista de componentes e o que cada um exige de marcação
(`.act`/`.act.go`/`.act.perigo`, `.stop`, `.kpi`, `.chave`, `.pill`, `.tag`, `.banner`, `.sheet`,
`.portao`, `.aviso`, `.chip`, `.cli`, `.prod`, `.rowcard`, `.form-c`, `.linha-cfg`, `.grupo`…).
**Entrega:** uma página de referência viva, gerada do mock — o "catálogo da casca".
**Portão:** todo componente do catálogo aparece em pelo menos uma das 33 telas.

### FASE 1 — casca única, tela por tela  ⬜  ← *o sprint que o dono pediu*
Reescrever a **marcação das telas que o app já tem** usando o vocabulário da casca. Sem tocar em
comportamento, endpoint, flag ou fluxo.
- Ordem: Rota → Clientes → Produtos → Caderneta → Chat → Ajustes → folhas/modais → GPS.
- **Regra dura:** funcionalidade que o mock não desenhou continua existindo, **vestida** com o
  componente mais próximo do catálogo. Mock tem 6 chaves e o app tem 2 → **2 chaves com a cara do
  mock.** Nunca inventar feature, nunca esconder feature.
- **Portão de cada leva:** varrer o app atrás de classe da pele velha; zero ocorrência = leva fechada.
- **Portão visual:** print lado a lado com a tela correspondente do mock, nos 2 modos.

### FASE 2 — tokenizar (o que torna o "barbie girl" barato)  ⬜ *aguarda GO*
Medido em 06/08: **389 hex cravados (168 distintos) contra 21 tokens**, e **192 regras
`[data-luz="claro"]`** — que é o preço que a 2ª pele (modo claro) já custou à mão.
Sem esta fase, "modo barbie girl" custa o mesmo que o modo claro custou.
- Cor/raio/sombra/tipo/movimento saem de token, como manda o `CLAUDE.md`.
- Paleta derivada de **1 semente em OKLCH**, igual o HBX web já faz (`PEDIDO-DE-PELE`).
- ⚠️ Armadilha já paga: **uniformidade do OKLCH ≠ de luminância** (L 0,55 reprovou 987 de 4096 cores
  no WCAG; L 0,50 = zero).
- **Portão:** `pele20-antes-e-depois.js` — tokenizar tem que mudar **zero pixel**, e isso é provável,
  não opinável.

### FASE 3 — a segunda casca  ⬜ *aguarda GO*
Trocar a semente e nascer uma casca inteira nova. **O teste real da fase 2**: se "barbie girl" não
sair de uma semente + um punhado de tokens, a fase 2 não terminou.

---

## 5. Leis desta frente

1. **Casca única.** "Fica no caminho antigo" não é desfecho, é o defeito.
2. **Funcionalidade não muda.** Nem flag, nem chave, nem endpoint, nem fluxo.
3. **O mock é vocabulário, não catálogo de feature.** Mock desenhou algo que o app não tem? Não
   implemento — visto o que existe.
4. **Cor nova nasce token**, nunca hex solto. Vale desde já, mesmo antes da fase 2.
5. **Refactor de casca prova com medida**, não com olho: `antes-e-depois` + `conferir`.
6. **Fidelidade ≠ trocabilidade.** Foi confundir as duas que custou as levas 1 e 2.
