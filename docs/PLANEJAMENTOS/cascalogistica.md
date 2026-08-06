# CASCA LOGÍSTICA — uma casca só, fiel ao mock, trocável depois

> **O que o dono quer:** o app de logística com a cara do mock, **100% no visual** — letras,
> transições, abertura, espaçamento, cor. **Sem mudar uma linha de funcionalidade.** E, um dia,
> trocar a casca inteira do sistema mexendo em **uma semente**, não em tela.
>
> **Este arquivo é o trilho.** Quem executar uma leva lê ele inteiro antes de encostar em código.

---

## 1. A regra nº 1 (leia duas vezes)

> ### ⛔ AS 33 TELAS DO MOCK NÃO VIRAM CÓDIGO. NUNCA.
>
> Elas são **régua de conferência**. Já foram copiadas pra dentro do app uma vez e custaram caro.
> Se você abrir o mock, ver `T.rota`, `T.clientes`… e pensar *"é só renderizar isso no app"* —
> **é exatamente o erro que este plano existe pra impedir.** Pare e releia a seção 2.

O que se usa do mock é a **folha** (`pele20.css`) e o **vocabulário de classe** dela.

---

## 2. Onde foi o erro (pra não repetir)

O mock está certo. O erro foi **o que se extraiu dele**.

O mock tem duas coisas dentro:

| | o que é | vale o quê |
|---|---|---|
| **VOCABULÁRIO** | tokens, componentes (`.act`, `.stop`, `.chave`, `.kpi`, `.banner`, `.pill`…), tipografia, as 7 leis de movimento, abertura, modo claro | **é o ativo.** Serve pra tela que ainda nem existe |
| **AS 33 TELAS** | a prova de que o vocabulário fecha, com **dado de exemplo** | **descartável.** É amostra, não produto |

Extraíram-se **as telas**. Aí veio a consequência inevitável: a tela do mock não tem o dado nem o
comportamento do app. Resultado, medido:

1. **Quebrou o comportamento.** A Rota do motorista passou a mostrar *"João da Silva"* e
   *"R$ 184,00"* — o dado de exemplo do mock — por cima do dia real. **Casca não pode custar o dado.**
2. **Criou duas peles.** Tela sem tradução pronta caía na marcação velha. Metade do app com uma
   cara, metade com outra — o oposto de casca única.
3. E pra tapar o (1), começou-se a arrastar **dado pra dentro do mock** (`DADOS_MOCK`, `usarDados`)
   e a traduzir tela por tela — **refazendo dentro do celular a decisão que o mock já tinha tomado.**

**A raiz: confundiu-se FIDELIDADE com TROCABILIDADE.** Copiar a *saída* do mock (as telas) dá
fidelidade uma vez e trava tudo. Copiar a *entrada* (o vocabulário) dá fidelidade **e** deixa a
próxima casca barata — que é o objetivo final.

Revertido em `1caebde6`; o caminho paralelo (`pintarPele20`) foi arrancado do `app.js`.

---

## 3. A arquitetura

**A casca é uma CAMADA, não um conjunto de telas.**

- O app continua dono do DOM, do dado e do comportamento. **Nada de funcionalidade muda.**
- `pele20.css` é a folha de estilo do app (já entra no `index.html`, depois do `app.css`).
- A **marcação** das telas do app é reescrita pra usar as classes do mock, leva a leva.
- Um caminho de render só: o do app.

---

## 4. As leis

1. **Casca única.** "Essa tela fica no caminho antigo" **não é desfecho, é o defeito.**
2. **Funcionalidade não muda.** Nem flag, nem chave, nem endpoint, nem fluxo, nem texto.
3. **O mock é vocabulário, não catálogo de feature.** Mock desenhou algo que o app não tem?
   **Não implementa.** Mostra o que o app tem, vestido com o componente mais próximo.
   *Mock tem 6 chaves e o app tem 2 → **2 chaves com a cara do mock.*** Nunca inventar, nunca esconder.
4. **Cor nova nasce token**, nunca hex solto — vale desde já, antes mesmo da fase 3.
5. **Fidelidade se prova MEDINDO**, nunca no olho.
6. **Não reusar `T.*`.** Ver seção 1.

---

## 5. Ferramentas (já existem, já verdes)

| comando | o que prova |
|---|---|
| `node scripts/pele20-gerar.js` | extrai `pele20.css` do mock. Portões estruturais; **derruba se alguém recriar `pele20.js`** |
| `node scripts/pele20-conferir.js` | **66/66 pixel a pixel**: a folha extraída pinta igual à folha do mock (33 telas × 2 modos) |
| `node scripts/pele20-antes-e-depois.js` | um refactor **não mudou pixel** — separa reflow/gancho (invisível) de mudança de conteúdo |

> Armadilhas já pagas por esses portões, não repita: comparar com o `.notch` ligado (ele é do celular
> desenhado, sai de propósito); comparar com animação rodando (mede o instante do frame, não a folha);
> comparar sem cravar o palco (o `#app` do mock vive dentro do `.phone`, que tem `zoom`).

---

## 6. As fases

### FASE 1 — casca única, tela por tela  ⬜ ← *é o sprint de agora*

Reescrever a **marcação das telas que o app já tem** com o vocabulário da casca.

**Ordem:** Rota → Clientes → Produtos → Caderneta → Chat → Ajustes → folhas/modais → GPS.

**Uma leva = uma tela.** Cada leva:
1. Ler a tela do app (`routeScreen`, `clientsScreen`, …) e a tela equivalente do mock **só como referência visual**.
2. Reescrever a marcação da tela do app usando as classes da casca.
3. **Não tocar** em nenhuma função de comportamento, nenhum `data-action`, nenhum fluxo.
4. Portões pra fechar:
   - **zero** classe da pele velha na tela (varrer o HTML gerado);
   - print do app × print do mock, **nos 2 modos**, lado a lado;
   - o app continua fazendo tudo que fazia — clique, offline, mapa, confirmação.

### FASE 2 — o resto do vocabulário  ⬜
Ícones, sons e microinterações que o mock desenhou e o app ainda desenha diferente. Só depois que
todas as telas estiverem vestidas.

### FASE 3 — tokenizar (o que torna a 2ª casca barata)  ⬜ *aguarda GO*
Medido em 06/08: **389 hex cravados (168 distintos) contra 21 tokens**, e **192 regras
`[data-luz="claro"]`** — o preço que a 2ª pele (modo claro) já custou à mão.
**Sem esta fase, trocar a casca custa o mesmo que o modo claro custou.**
- Cor/raio/sombra/tipo/movimento saem de token, como manda o `CLAUDE.md`.
- Paleta derivada de **1 semente em OKLCH**, igual o HBX web já faz (`PEDIDO-DE-PELE`).
- ⚠️ **uniformidade do OKLCH ≠ de luminância** (L 0,55 reprovou 987 de 4096 cores no WCAG; L 0,50 = zero).
- **Portão:** `pele20-antes-e-depois.js` — tokenizar muda **zero pixel**, e isso é provável.

### FASE 4 — a segunda casca  ⬜ *aguarda GO*
Trocar a semente e nascer uma casca inteira nova. **É o teste real da fase 3:** se não sair de uma
semente + um punhado de tokens, a fase 3 não terminou.

---

## 7. Estado (06/08/2026)

- ✅ `pele20.css` extraída e **provada fiel ao mock, 66/66 no pixel**.
- ✅ Caminho paralelo arrancado: o app voltou a render único, comportamento intacto (a refatoração
  do GPS da manhã, `685592a2`, nunca foi tocada — a casca só somou arquivos).
- ✅ `pele20.js` **apagado** da produção; o gerador derruba se voltar.
- ⬜ Fase 1 não começou. Nenhuma tela do app foi vestida ainda.
