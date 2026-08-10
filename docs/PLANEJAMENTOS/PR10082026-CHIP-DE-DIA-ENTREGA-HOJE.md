# PR 10/08/2026 — O CHIP DE DIA ESCOLHE GENTE, NÃO DATA

**Pedido do dono (10/08):** *"se eu clicar no 'qua' e hoje for segunda, ele monta e inicia a
rota normalmente, não é para abrir esse aviso"* · *"se for uma segunda e eu quiser entregar
clientes de domingo, qual problema?"*

## A cena (critério de aceite)
Segunda-feira, Montagem aberta. Toco em **Qua** → a lista de quarta aparece. Toco em
**Montar/Iniciar** → aqueles clientes viram **a rota de HOJE**, ordenada do meu GPS, e caio na
navegação. **Nenhum** portão "Rota de Qua montada — ela abre sozinha quando o dia chegar".
Mesma cena com **Dom** na segunda.

## Por que "voltou" — não voltou: NUNCA saiu (3 camadas)

1. **O aviso é sobra de 09/08.** Entrou em `c690e4bc` ("a torneira", 09/08 03:36) por ordem do
   próprio dono NAQUELE mundo: escolher dia **gravava na hora, calado** (era pré-"entrar não
   grava nada"), e 50 clientes de segunda viraram entregas de domingo. A cura da época foi
   "montar outro dia = preparar O DIA DELE" + o aviso. Nenhum commit jamais removeu isso.
   Hoje de madrugada o contrato novo (`fe10cbb3` entrar-não-grava · `41f5f034` avulsa/recorte ·
   `3e876313` F4 abre-sem-dia) passou por TODA a Montagem — **menos por esse ramo**.
2. **O rodapé alterna dois trilhos, por estado.** Dia não-pronta → botão "Montar rota" →
   `montarRota()` → ramo `admin-route/prepare` → **o aviso**. Dia pronta → botão "Iniciar rota"
   → `iniciarRota()` → **sem aviso, mas IGNORA o chip**: materializa/planeja/inicia a agenda
   **DE HOJE** com a tela mostrando a lista de quarta — divergência calada, pior que o aviso.
   Por isso pareceu corrigido num teste e "voltou" no outro: depende de o dia estar `pronta`.
3. **O servidor também trava o caminho.** A torneira força *"1 origem ⇒ a rota nasce no dia da
   origem"* (`logistica-admin-route.service.ts:203-204`). Mesmo que o app pedisse "clientes de
   quarta HOJE" via prepare, o servidor criaria a rota NA QUARTA. Apagar só o aviso não
   resolve — o caminho inteiro troca de trilho.

## "Entregar clientes de domingo na segunda — qual problema?" (resposta com dado)

**Nenhum bloqueio estrutural hoje.** Os 3 perigos que pariram a regra de 09/08 morreram:
- gravação silenciosa na seleção → morta (só o DEDO grava, `fe10cbb3`);
- órfão eterno de dia não processado → morto (LEI DO DESAPARECER, F1+F2 publicadas 10/08);
- duplicar quem já tem parada aberta hoje → o guard `paradaAbertaDaConta` pula.

Sobram **2 efeitos reais** (informação, não freio):
- **Adiantar não desconta a agenda.** A âncora da recorrência é o plano (`ClienteProduto`),
  não a entrega feita: entregar quarta na segunda NÃO tira o cliente da quarta — na quarta o
  cron o cria de novo. Pro caso domingo→segunda (dia que já passou) é exatamente o desejado.
- **Quinzenal olha a PRÓXIMA ocorrência.** A prévia do chip usa `dataDoDia(n)` (próxima
  ocorrência do dia). Cliente quinzenal em semana de folga pode divergir do "domingo que
  passou". Verificar na F2 se a 41 tem quinzenal; se for toda semanal, efeito zero.

## O plano

### F1 — Chip de outro dia entra no trilho da AVULSA, no dedo (`ponte.js`, zero servidor)
Em `iniciarRota()` **e** `montarRota()`: `outroDia = montarDia > 0 && montarDia !== diaDaSemana()`.
Quando `outroDia`:
- Converter a **PRÉVIA → RASCUNHO** com a bagagem inteira — a MESMA conversão do
  `usarHistorico` (id, `localId`, nome, `enderecoLinha`, bairro, pino pela régua única,
  `resolveSozinho`), pulando `paradaAbertaDaConta` e duplicata por `chaveDaPorta`.
- Seguir o caminho JÁ PROVADO da avulsa (60/60): `materializarRascunho()` → recorte
  `deliveryIds = idsDaPrevia()` → `planejar`/`custo-preview`/`iniciar` com o recorte.
  Agenda de hoje (do cron) intocada; agenda de quarta intocada.
- **O ramo `admin-route/prepare` do celular MORRE no mesmo commit** (lei da chave morta):
  varrer `diaPreparado`, `rotuloPreparado`, o portão "abre sozinha", e o comentário-mapa
  (~linha 1565). `dataDoDia` FICA (a prévia usa).
- No `montarRota` com `outroDia`: a tela vira a rota de hoje (`pronta:1`, botão vira
  "Iniciar rota") — sem aviso nenhum.

### F2 — Prova que grita (`scripts/prova-fluxo-rota.js`, vacina ANTES do fix)
Cena nova: segunda + chip Qua + Iniciar ⇒
(a) entregas criadas HOJE só dos clientes de quarta; (b) recorte presente no planejar e no
iniciar; (c) agenda de hoje intocada; (d) NENHUM portão "abre sozinha"; (e) `montarRota` com
chip de outro dia ⇒ dia de hoje `pronta`, zero chamada a `admin-route/prepare`.
Conferir de passagem: empresa 41 tem plano `QUINZENAL`? (1 query; se sim, decidir com o dono
se o chip olha a ocorrência passada ou futura — se não, seguir).

### F3 — Servidor: NADA
A torneira fica intacta. O desktop (mesa de despacho / route-builder) continua sendo a porta de
"agendar dia futuro de verdade" — a capacidade não sai do produto, sai só do celular.

## Execução — trânsito
🔴 **SERIALIZAR**: há outra sessão escrevendo no `ponte.js` agora (frente dos 3 espaços +
memória de escolha, diff não commitado de 03:53). Este plano só entra depois do commit dela —
1 módulo = 1 mão. Depois: publicar + prova na tela do celular (regra HBXAPK).
