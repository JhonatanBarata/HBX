// ============================================================
// APP DO ENTREGADOR — O EXCLUIR DA FICHA É AÇÃO, NÃO CENÁRIO.
//
// A cena que gerou este arquivo (medida no aparelho em 08/08/2026): na ficha de
// um cliente real, tocar em "Excluir" abria o diálogo
//
//     "Retirar da rota de hoje? · Mercado Estrela · volta na próxima quarta"
//
// — nome de um cliente do MOCK, verbo de outra ação (retirar da rota ≠ excluir
// cadastro), e nada era excluído. A causa: o botão era
// `data-superficie="confirmar"`, o atalho que abre a confirmação DECORATIVA da
// maquete. A `ponte.js` nem conhece esse atributo, então o toque nunca virava
// requisição.
//
// AS QUATRO GARANTIAS que este teste segura:
//   1. nenhuma TELA carrega mais confirmação decorativa (`data-superficie` só
//      pode existir na moldura do visualizador do mockup, que não vai pro APK);
//   2. o Excluir tem ação própria e só nasce pra quem o servidor aceita —
//      `DELETE /nucleo/contas/:id` é ADMIN-only, e mostrar o botão pro motorista
//      devolveria 403, que o tradutor do app vira "sua sessão expirou";
//   3. a ponte pergunta com o NOME DE QUEM ESTÁ ABERTO e chama a porta real;
//   4. cliente devendo (409 CLIENTE_COM_DEBITO) vira frase com o valor — sem
//      isso a tela mostraria o "Falha 409" cru do envelope, e pra isso o status
//      e o corpo do erro têm que ATRAVESSAR o tradutor de mensagem.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* 🔴 A RÉGUA MEDE CÓDIGO, NÃO COMENTÁRIO (custou uma reprovação na estreia
   deste arquivo). Os comentários deste repo CITAM o defeito que mataram — o da
   ficha do produto diz, com todas as letras, "data-superficie" e "Arquivar" —
   então medir o arquivo cru é medir a explicação, e o teste ficaria vermelho
   justamente por causa da documentação do conserto. Mesma família do fiscal que
   media o popup de erro em vez da tela. */
const semComentarios = (s) => s
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// A FONTE do app é o mock (o `mock.js` do APK é GERADO por casca-injetar.js).
const mock = semComentarios(read("docs/mockups/logistica2.0/logistica-2.0.html"));
const ponte = read("EntregaShell/app/src/logistica/assets/app/ponte.js");

test("nenhuma tela do app usa a confirmação decorativa do mock", () => {
  // O único `data-superficie` que pode sobrar é o par de botões do cabeçalho do
  // VISUALIZADOR (o cromo que o injetor descarta) — ele vive ao lado do
  // `data-avisar`, nunca dentro de um `T.<tela>.render()`.
  const usos = mock.match(/data-superficie="[a-z]+"/g) || [];
  assert.equal(usos.length, 2, `sobrou confirmação decorativa em tela: ${usos.join(", ")}`);
  const cromo = mock.match(/<div class="seg" id="avdisparo">[\s\S]*?<\/div>/);
  assert.ok(cromo, "o cabeçalho do visualizador mudou de forma — reveja a contagem acima");
  assert.equal((cromo[0].match(/data-superficie="[a-z]+"/g) || []).length, 2);
});

test("o Excluir da ficha tem ação própria e só nasce pra admin", () => {
  assert.match(mock, /\$\{f\.admin\?`<button class="act perigo"[\s\S]*?data-acao="excluir-cliente">/);
  // Slot, não string: sem admin o botão não existe no DOM (Lei "ordem visual é
  // de classe" — quem não pode não vê, em vez de ver e tomar 403).
  assert.match(mock, /data-acao="excluir-cliente">\$\{ic\('trash',17\)\}<b>Excluir<\/b><\/button>`:''\}/);
  assert.match(ponte, /'excluir-cliente': excluirCliente,/);
  // E o dado do slot vem do MESMO sinal das chaves de dinheiro: quem é admin
  // quem diz é o servidor (ausência do bloco comercial no /logistica/config).
  assert.match(ponte, /admin: ehAdmin\(\) \? 1 : 0,\s*\n\s*ini: iniciais/);
});

test("a confirmação cita o cliente aberto e chama a porta real", () => {
  assert.match(ponte, /const nome = String\(d\.name \|\| it\.name \|\| ''\)\.trim\(\);/);
  assert.match(ponte, /titulo: `Excluir \$\{esc\(nome\)\}\?`/);
  assert.match(ponte, /window\.API\.del\(`\/nucleo\/contas\/\$\{encodeURIComponent\(id\)\}`\)/);
  // Nenhum texto de OUTRA ação pode voltar pra este caminho.
  const trecho = ponte.slice(ponte.indexOf("async function excluirCliente"), ponte.indexOf("function erroDeExcluir"));
  assert.doesNotMatch(trecho, /Retirar da rota|Mercado Estrela/);
});

test("cliente devendo vira frase com valor, não código HTTP", () => {
  assert.match(ponte, /String\(corpo\.error \|\| ''\) === 'CLIENTE_COM_DEBITO'/);
  assert.match(ponte, /deve \$\{dinheiro\(saldo\)\}/);
  // O status e o corpo do servidor precisam sobreviver ao tradutor de mensagem:
  // era ele que apagava os dois e deixava só o "Falha 409" do envelope.
  assert.match(ponte, /erro\.status = Number\(\(e && e\.status\) \|\| 0\);/);
  assert.match(ponte, /erro\.body = \(e && e\.body\) \|\| null;/);
});

test("a ficha do produto não promete arquivar sem porta", () => {
  // Não existe endpoint de arquivar/excluir produto (o backend só tem POST e
  // PATCH de /logistica/produtos), então o botão saiu em 08/08 por ordem do
  // dono — e não volta como enfeite.
  // Recorte por marcador de CÓDIGO: o número do bloco vive num comentário, e
  // comentário já foi embora na linha de cima (senão o recorte pega o arquivo
  // todo e o teste passa a medir outra tela).
  const ficha = mock.slice(mock.indexOf("T.fichaproduto="), mock.indexOf("T.passeio="));
  assert.ok(ficha.length > 200 && ficha.length < 4000, `recorte da ficha do produto suspeito: ${ficha.length} chars`);
  assert.doesNotMatch(ficha, /Arquivar/);
  assert.doesNotMatch(ficha, /data-superficie/);
});
