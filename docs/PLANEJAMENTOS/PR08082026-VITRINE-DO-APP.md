# PR08082026-VITRINE-DO-APP — o canal de distribuição interno do HBX

Origem: pedido do dono 08/08 — *"gostaria de criar propagandas no celular, pelo menos 1x por
semana, 'experimente o modo prospector' ou algo do tipo"*. Método fable.md.

> **A REFRAMAGEM.** O pedido é "uma propaganda do Prospector". O problema real é maior e
> vale mais: **o HBX tem um depósito de features publicadas que ninguém usa.** Caderneta,
> Fiscal do Tenant, Balcão da Distribuidora, COMEX, Mesa de Despacho, Funcionária Digital,
> Prospector — tudo "✅ publicado" na memória, tudo sem porta de entrada no celular.
> O gargalo não é construir. **É ADOÇÃO.** Por isso este plano não constrói "o anúncio do
> Prospector": constrói a **VITRINE** — um slot semanal que qualquer feature aluga. O
> Prospector é só o primeiro inquilino.
>
> Retorno: anúncio por feature = custo que se repete pra sempre. Vitrine = constrói uma vez,
> e todo lançamento futuro (≈1 por semana, pelo histórico) ganha distribuição de graça.

---

## 0. AS 4 LEIS (cravar antes de escrever código)

### LEI 1 — A propaganda NUNCA entra no canal da operação
O `recado` (normal/urgente/alarme, portão do "Entendi", tela cheia do alarme) é o canal do
PATRÃO para o motorista. Ele acabou de voltar do túmulo em 08/08 (`ab05513b`) e custou uma
madrugada. Botar marketing da HBX na mesma caixa mata os dois canais:
- o motorista aprende a **descartar a caixa** — e no dia do recado urgente de verdade, descarta;
- o anúncio herda um portão que não mereceu ("Entendi" é força de patrão, não de fornecedor).

**Canal do fornecedor ≠ canal do patrão. Superfície separada, sempre.** Vale também pro
`avisar()` (o cartão que nasce no sino): o sino é da operação.

### LEI 2 — "1x por semana" é TETO, não agenda
Agenda fixa dispara no meio do trânsito, no meio da discussão com o cliente, no meio da
descarga. O app sabe o contexto até o metro — usar relógio quando se tem contexto é jogar
fora o ativo. **A regra é ORÇAMENTO: 1 crédito de anúncio por semana, gasto no melhor momento
que aparecer.** Não apareceu momento bom, não gasta — e **não acumula** (semana que passou
não vira duas na seguinte; isso é como slot vira spam).

### LEI 3 — Propaganda é feita com o dado DELE, nunca com banner
É aqui que mora o dinheiro. O corredor do Prospector **já está medido em produção** (rota real
da company 41): **1.428 CNPJs ativos a ≤150 m**, ~53 por parada, **463 na cesta "sede de água"**,
consulta em 442 ms. Então o anúncio não é "Experimente o modo Prospector". É:

> **"Hoje você passou a menos de 100 metros de 47 empresas. 12 delas compram água."**

Isso não é anúncio — é um **relatório que ele pagaria pra ter**. A porta fica embaixo. A
diferença entre banner genérico e dado próprio não é 2×, é ordem de grandeza: é o mesmo motivo
do "Spotify Wrapped" funcionar e do banner de casa não funcionar.

**Corolário duro:** feature que não consegue mostrar um número do próprio cliente **não entra
na vitrine** — vai pro rodapé dos Ajustes e pronto.

### LEI 4 — Anúncio que não se mede é enfeite
`impressão → abertura → ligou`, por empresa, por anúncio, por semana. Taxa de "ligou" abaixo do
piso ⇒ **o anúncio sai**, não o canal. Sem isso a vitrine vira lixo em 3 meses.

---

## 1. O MOMENTO — onde a vitrine abre

Ranking dos momentos do dia por (atenção disponível) × (receptividade) × (risco de estrago):

| Momento | Atenção | Risco | Veredito |
|---|---|---|---|
| Abertura do app (6h, 52 paradas pela frente) | alta | **ALTO** — ele quer trabalhar | ❌ nunca |
| Dirigindo / tela cheia do mapa | zero | **ALTÍSSIMO** | ❌ nunca (o mapa já é território proibido — ordem do dono no arrastar de módulo) |
| Entre paradas, parado | média | médio | ⚠️ só o pino apagado, que já é o próprio Prospector |
| **Rota ENCERRADA / fechamento do dia** | **alta** | **baixo** | ✅ **O LUGAR** |
| Tela `semana` / detalhes | alta | zero | ✅ segundo lugar |
| Ajustes | alta | zero | ✅ vitrine passiva (sempre lá, nunca interrompe) |

**O fim da rota é o horário nobre deste app.** Ele acabou, está parado, tem o resultado do dia
na tela e a sensação de fechamento. É o único instante em que *"e se amanhã rendesse mais?"*
não é interrupção — é continuação. Toda a vitrine mora aí.

---

## 2. OS FORMATOS — a família criativa (nenhum inventa tecnologia)

### A — O RECIBO FANTASMA 🔴 carro-chefe
Ao encerrar a rota, embaixo do resultado real, um **segundo recibo — em papel apagado, meio
impresso**, com o token "apagado" que o Prospector já define:

```
  RECIBO DE HOJE            27 entregas · R$ 1.240,00
  ──────────────────────────────────────────────────
  NÃO EMITIDO               47 empresas a menos de 100 m
                            12 delas compram água
```

Ele lê recibo o dia inteiro — **o formato é a língua dele**. E "NÃO EMITIDO" dói do jeito certo:
não é promessa de futuro, é o que ele passou na frente hoje.
*Dado:* `ProspectoRota` do dia, **já gravado pelo F0**. Custo de dados: zero novo.

### B — O MAPA QUE ACENDE 🔴 a demo que É o produto
Toque no recibo → o mapa do dia **rebobina em 4 segundos**: a linha da rota se desenha e, ao
longo dela, os pinos apagados **acendem um a um**. Sem texto de venda. No fim, uma linha só:
*"Isto é o Prospector. Quer ligar?"*

Já existe Leaflet, os pinos, os tokens aceso/apagado, o `ProspectoRota` e a cascata de animação
da casca. **A demonstração do Prospector é o Prospector rodando em modo mudo, com os dados
dele.** É o formato mais barato e o mais convincente que existe: não é vídeo promocional, é o
produto funcionando.

### C — A LÂMPADA 🔴 canal permanente, custo ZERO de interrupção
A `AULAS`/lâmpada do cabeçalho **já está pronta** (`logistica-2.0.html` §AULA DA TELA): acende
só pra conteúdo novo, é estado do **APARELHO** (`localStorage`, não do servidor), aponta o
elemento de verdade com furo + caixa, tem "Pular", teto de 4 passos.
Falta só ela aceitar um SEGUNDO tipo de conteúdo: além de *"como usar esta tela"*, **"o que é
novo nesta tela"**. Quem toca é o usuário — **nunca interrompe ninguém**. Custo: quase nada.
Alcance: toda tela. É o canal que deveria ter nascido primeiro.

### D — A VOZ, UMA VEZ ⬜ gateado
`speak()` existe e o Prospector já tem a lei da vaga de fala. Rota encerrada, **veículo parado**,
UMA frase: *"Hoje você passou perto de quarenta e sete empresas."*
**Eu gatearia:** voz é a superfície mais invasiva que existe. Só depois de A e B medidos.

### E — O ENVELOPE DE SEXTA
Uma vez por semana, na sexta ao encerrar, o resumo da semana ganha UMA linha da HBX. Não é
pop-up: é uma linha no relatório que ele já ia ler de qualquer jeito.

---

## 3. OS PORTÕES DE PÚBLICO — onde sistema de anúncio apodrece

1. **Só quem PODE ligar.** Prospector é só admin (decisão nº6 do PR07082026). Anunciar feature
   que o motorista não tem poder de ligar = raiva pura. Motorista sem `prospectorEquipe` **não vê**.
2. 🔴 **Só quem TEM cobertura.** `CnpjGeo` é **SP-only** hoje. Anunciar Prospector pra empresa da
   Bahia é promessa que não se cumpre — e confiança se quebra na primeira vez. **Corredor com
   zero pino ⇒ zero anúncio.** A própria consulta responde isso de graça.
3. **Só quem NÃO tem a feature ligada.** O bug clássico.
4. **Nunca com a casa em desordem.** Crédito estourado ou fatura vencida vendo "experimente o
   novo módulo" é insulto. Empresa em dívida sai da vitrine.
5. **Nunca com rota viva.** Vitrine só abre com o dia fechado.

## 4. O FREIO DE FADIGA (copiado do que o dono já aprovou no Prospector)

Mesma lei do `cooldownAte`/dispensas — padronizar é IGUALAR, não decorar:
- **1 por semana**, teto, sem acumular.
- Dispensou 2× ⇒ aquele anúncio cala **60 dias**.
- Abriu e não ligou ⇒ cala **30 dias** e volta com **ângulo DIFERENTE** (nunca o mesmo texto).
- Ligou ⇒ **morre pra sempre**.
- 🔴 **Teto absoluto: 4 anúncios por trimestre por empresa, somando TODAS as features.** É o
  freio que impede a vitrine de virar lixo quando houver 8 features na fila.

---

## 5. FASES

### V0 — A moldura (backend)
- Tabela `VitrineAnuncio` (catálogo, versionado: `chave`, `titulo`, `corpo`, `cta`, `feature`,
  `ativo`, `desde`) + `VitrineEntrega` (`companyId`, `userId`, `deviceId`, `anuncioChave`,
  `impressoEm`, `abertoEm`, `dispensas`, `cooldownAte`, `convertidoEm`).
- Serviço `vitrine.service.ts`: `escolher(companyId, ator)` aplica os 5 portões (§3) + o freio
  (§4) e devolve **no máximo 1** anúncio — ou nada.
- **Carona no poll que já existe**: `POST /logistica/recados/pendentes` já carrega 4 coisas
  (recados, `tela`, `espelho`, `erros`). A vitrine é o **5º campo**, em envelope próprio —
  **nunca dentro de `recados`** (LEI 1). ⚠️ Ao mexer nesse poll, conferir os 5.
- Falha da vitrine = **app segue sem anúncio** + `logger.error` (lição CNEFE: best-effort que
  engole erro precisa de ALARME).
- **Portão V0:** teste multi-tenant; empresa sem cobertura devolve vazio; empresa com feature
  ligada devolve vazio; teto de trimestre respeitado.

### V1 — A lâmpada aceita novidade (o mais barato, entrega primeiro)
- `AULAS` ganha origem dupla: passos locais **+** passos vindos do servidor marcados como
  "novo". Lâmpada acende, e a marca de visto continua sendo do **APARELHO**.
- **Portão V1:** print da lâmpada acesa numa tela com novidade e apagada depois de vista; prova
  negativa (empresa fora do público ⇒ lâmpada não acende).

> 🔴 **ARMADILHA DE FRONTEIRA — irmã do `recado-e-do-usuario-nao-do-aparelho` (08/08).**
> A lâmpada é estado do **APARELHO** (`localStorage`); a vitrine é orçamento da **EMPRESA**.
> Misturar os dois repete o bug do recado, ao contrário:
> - **VISTO é por aparelho, e isso está CERTO.** Anúncio não é recado — cada pessoa precisa
>   ver. Empresa com 3 celulares: os 3 acendem a lâmpada. Se eu filtrasse por usuário como o
>   recado faz, o 1º que abrisse engoliria o anúncio dos outros dois.
> - 🔴 **ORÇAMENTO e CONTAGEM são por EMPRESA, nunca por aparelho.** Senão a empresa de 5
>   caminhões queima 5 impressões na semana e o freio acha que gastou 1 — o teto de 4 por
>   trimestre viraria 20, e o funil de conversão mentiria por 5×.
> **Regra:** `impressoEm` grava `deviceId` (pra saber quem viu), mas o **freio lê por
> `companyId`**. Cobrir com teste de 2 aparelhos na mesma empresa.

### V2 — O Recibo Fantasma (formato A) no fechamento da rota
- Peça nova na tela de encerramento, com o token "apagado". Contagem vem do `ProspectoRota`
  do dia (F0 já grava). **Sem prospecto no dia, o recibo não nasce** — não existe versão
  genérica desta peça.
- **Portão V2:** rota real no g15 encerrada com o recibo mostrando os números do dia; prova
  negativa com `prospectorAtivo` já ligado (não aparece).

### V3 — O Mapa que Acende (formato B)
- Rebobinagem de 4 s no mapa do dia com os pinos acendendo. Reusa Leaflet, tokens e a cascata.
- **Portão V3:** vídeo no g15; prova de que a rebobinagem **não** roda com rota viva.

### V4 — Medida e desligamento
- Painel no /master: por anúncio — impressão, abertura, conversão, dispensas. Botão de matar
  anúncio. **Piso de conversão** configurável; abaixo dele o anúncio se aposenta sozinho.
- **Portão V4:** funil de uma semana real, com número.

### V5 — A voz ⬜ SÓ COM GO DO DONO, depois de V2/V3 medidos

---

## 6. DECISÕES

### ✅ CRAVADAS pelo dono (chat 08/08 — não reabrir sem ele)
1. ✅ **VITRINE GENÉRICA.** Não é "o anúncio do Prospector": é o slot que qualquer feature
   aluga. O freio de fadiga é ÚNICO e compartilhado entre todas as features — é ele que
   impede duas features empurrando no mesmo dia (e o teto de 4/trimestre da §4 vale somando
   TODAS, nunca por feature).
2. ✅ **A LÂMPADA PRIMEIRO** (V1 antes do V2). Motivo: já existe pronta, não interrompe
   ninguém, entrega com pouco código e serve de **termômetro medido** antes de gastar no
   Recibo Fantasma. Se ninguém toca a lâmpada, o problema é a oferta e não a superfície —
   e isso se descobre barato.

### ⬜ EM ABERTO (dono)
3. ⬜ Fim de rota (recomendado) ou também na abertura do app?
4. ⬜ Motorista sem poder de ligar: **não vê nada** (recomendado) ou vê um "peça pro seu chefe"?
5. ⬜ Piso de conversão pra aposentar anúncio sozinho.
6. ⬜ Nome que aparece pro cliente ("Novidades HBX"? "Da HBX pra você"? nada?).
7. ⬜ GO da voz (V5).

## 7. ORDEM
V0 → **V1 (lâmpada)** → V2 (recibo) → V3 (mapa) → V4 (medida). V5 só com GO. Cada fase fecha
com o portão provado no g15 antes da próxima. Commits locais na master (sem branch); publish
só quando o dono mandar.

🔴 **TERRITÓRIO — a V1 mexe em `docs/mockups/logistica2.0/logistica-2.0.html`**, que é UM
arquivo com todas as telas. Dois agentes escrevendo nele assam um estado pela metade na
injeção (`casca-injetar`). **V0 (backend) pode andar em paralelo com qualquer coisa; V1 espera
o HTML estar livre.** Portões da casca depois de mexer: `casca-injetar` → `casca-conferir`
(31 telas / 62 comparações, 100% idênticas) → `casca-antes-e-depois`.

## 8. Relacionados
`docs/PLANEJAMENTOS/PR07082026-PROSPECTOR-CNPJ.md` (F0 no ar, local) ·
memória `escada-do-recado-morreu-na-fusao` (o poll que carrega 4 coisas) ·
`onde-mora-o-codigo-do-logistica2` (a fonte é o HTML do mockup) ·
`hbxapk.md` · `padronizar-e-igualar-nao-decorar`
