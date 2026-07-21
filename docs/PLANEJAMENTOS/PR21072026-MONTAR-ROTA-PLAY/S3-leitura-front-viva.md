# S3 — Leitura de Rota: a TELA (posição ao vivo, trilha, popup de pausa)

**Leva 2.** Só começa depois de S1 (front) e S2 (nativo) terminarem — S1 é o dono do
`app.js` na leva 1, e esta sprint depende do contrato escrito em `S2-CONTRATO-PONTE.md`.

**Dono deste arquivo:** 1 subagente. Pode editar:
`EntregaShell/app/src/logistica/assets/app/app.js` e
`EntregaShell/app/src/main/assets/app/app.css`. Mais nada.

## Regras de convivência
- **NÃO rodar teste, build, npm, gradle, ADB.** **NÃO rodar git.** Edit cirúrgico.
- Ler `androidapk.md` (10 Leis) e `S2-CONTRATO-PONTE.md` (nomes exatos de evento/campo)
  ANTES de escrever.

## S3.1 — Tela da Leitura em andamento
Entrada pelo botão "Iniciar Leitura de Rota" do menu Play (criado em S1). A sessão
`LEITURA` deixa de ser faixa em cima da tela Rota e ganha **tela própria**, como o Manual:
- **Mapa ao vivo** com a posição atual e a **trilha desenhada** conforme anda. O mapa é
  TRANSPLANTADO no re-render (`el.__hbxMap`, regra que já quebrou antes) — não remonte.
- Cabeçalho enxuto: tempo em rota + nº de paradas registradas.
- Ações: "Cadastrar Local" (captura manual, já existe) e "Finalizar" (fluxo de nome/rota
  salva que já existe). Cancelar = confirmação `.app-confirm` (Lei 3), copy do modo leitura.

## S3.2 — Popup de pausa
Ao receber o evento `pausa` da ponte (S2):
- Cartão **central** (Lei 3): "Você parou — salvar parada?"
- Se veio `clienteProximo`: mostrar nome + distância, botão principal = salvar a parada
  nesse cliente. Se não veio: oferecer o "Cadastrar Local" (reverse geocode já existe).
- Dispensar não pode redisparar no mesmo ponto (a histerese é do nativo — o front só
  informa "dispensada").
- Evento pendente que chegou com o app fechado: ao abrir, mostrar o popup na hora.
- **`handleBack`** (Lei 10): popup aberto → dispensa; tela da leitura → confirma antes de sair.

## S3.3 — Limites na tela (copy mínima, Lei 8)
Uma linha discreta, sem textão e sem jargão, avisando que o traçado segue o GPS e pode não
bater 100% com o mapa. Nada além disso.

## Definição de pronto
Código coerente com o contrato da ponte, sem hex novo, sem `style=` estático, toda tela e
popup novos dentro do `handleBack`. **Não testar, não buildar, não commitar** — relatar.
