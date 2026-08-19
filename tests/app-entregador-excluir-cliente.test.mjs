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
const ponteCodigo = semComentarios(ponte);

/* Só o ATRIBUTO conta, nunca o seletor. O visualizador tem um
   `closest('[data-superficie]')` no script dele: é o mecanismo do cromo, não um
   botão de tela. Exigir aspas separa os dois sem depender de contagem. */
const RE_SUPERFICIE = /data-superficie\s*=\s*["'][^"']*["']/g;

/* Recorta o objeto literal que começa em `marcador`, casando as chaves. Recorte
   por LINHA (ou por "do marcador até o próximo `});`") é o que envelhece: basta
   alguém inserir uma chave no meio pra régua reprovar código são. Devolve null
   se não achar/não fechar — o chamador confere o tamanho, porque recorte que
   estoura vira "o arquivo todo" e aí o teste passa medindo qualquer coisa. */
function recorteDeObjeto(fonte, marcador) {
  const i = fonte.indexOf(marcador);
  if (i < 0) return null;
  const abre = fonte.indexOf("{", i);
  if (abre < 0) return null;
  let nivel = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === "{") nivel++;
    else if (fonte[k] === "}" && --nivel === 0) return fonte.slice(abre, k + 1);
  }
  return null;
}

test("nenhuma tela do app usa a confirmação decorativa do mock", () => {
  /* 🔴 A RÉGUA MEDE ONDE, NÃO QUANTOS (a versão antiga cravava "exatamente 2" e
     ficou vermelha em 18/08 quando o visualizador ganhou um 3º botão legítimo,
     "▸ Chegou" — régua reprovando código que serve). A garantia real é a do
     comentário de sempre: `data-superficie` só pode existir no cabeçalho do
     VISUALIZADOR (o cromo que `casca-injetar.js` descarta — `.seg` está na lista
     CROMO dele), nunca dentro de um `T.<tela>.render()`, que é o que vira APK.
     Assim o teste segue verde pro 4º botão do cromo e fica VERMELHO no instante
     em que um `data-superficie` vaza pra uma tela — que é o defeito de 08/08. */
  const cromo = mock.match(/<div class="seg" id="avdisparo">[\s\S]*?<\/div>/);
  assert.ok(cromo, "o cabeçalho do visualizador mudou de forma — reveja a contagem acima");
  // O cromo mora ao lado do `data-avisar`: se o recorte não tiver os dois
  // vizinhos, ele pegou outro bloco e o zero lá embaixo seria zero por engano.
  assert.match(cromo[0], /data-avisar=/, "o recorte não é o cabeçalho do visualizador");

  const noCromo = cromo[0].match(RE_SUPERFICIE) || [];
  /* 🔴 PROVA DE QUE A RÉGUA ESTÁ MEDINDO. Sem isto, um dia em que o atributo
     mudasse de nome (ou o `semComentarios` engolisse o bloco) daria zero por
     CEGUEIRA, não por limpeza — e o fiscal morreria calado, verde. */
  assert.ok(noCromo.length >= 1, "nenhum `data-superficie` no cromo: a régua perdeu o objeto de medição");

  // Tira o cromo do arquivo e conta o que sobrou: tudo que resta é TELA.
  const semCromo = mock.replace(cromo[0], "");
  assert.ok(semCromo.length < mock.length, "o cromo não saiu do recorte");
  const emTela = semCromo.match(RE_SUPERFICIE) || [];
  assert.equal(emTela.length, 0, `sobrou confirmação decorativa em tela: ${emTela.join(", ")}`);
});

test("o Excluir da ficha tem ação própria e só nasce pra admin", () => {
  assert.match(mock, /\$\{f\.admin\?`<button class="act perigo"[\s\S]*?data-acao="excluir-cliente">/);
  // Slot, não string: sem admin o botão não existe no DOM (Lei "ordem visual é
  // de classe" — quem não pode não vê, em vez de ver e tomar 403).
  assert.match(mock, /data-acao="excluir-cliente">\$\{ic\('trash',17\)\}<b>Excluir<\/b><\/button>`:''\}/);
  assert.match(ponte, /'excluir-cliente': excluirCliente,/);

  /* 🔴 A RÉGUA MEDE A CORRENTE, NÃO A VIZINHANÇA DE DUAS LINHAS. A versão antiga
     exigia `admin:` COLADO em `ini:`; em 18/08 entrou um `volta:` legítimo entre
     os dois e o teste ficou vermelho sem defeito nenhum — o que envelheceu foi a
     formatação, não a garantia. A garantia é a mesma de sempre: o slot `admin`
     da ficha vem do MESMO sinal das chaves de dinheiro — quem é admin quem diz é
     o SERVIDOR (ausência do bloco comercial no /logistica/config), nunca um
     campo do item nem um `1` cravado. */
  const objetoDaFicha = recorteDeObjeto(ponte, "window.usarDados('ficha', {");
  assert.ok(objetoDaFicha, "sumiu o `window.usarDados('ficha', …)` — a ponte parou de publicar a ficha");
  // O recorte tem que ser O OBJETO: chave-de-abertura desbalanceada devolveria o
  // arquivo inteiro e o `assert.match` abaixo passaria medindo qualquer coisa.
  assert.ok(objetoDaFicha.length > 400 && objetoDaFicha.length < 8000, `recorte do objeto da ficha suspeito: ${objetoDaFicha.length} chars`);
  assert.match(objetoDaFicha, /\bnome:/, "o recorte não é o objeto da ficha");
  assert.match(objetoDaFicha, /\badmin:\s*ehAdmin\(\)/, "o `admin` da ficha deixou de derivar de ehAdmin()");

  /* E nenhum OUTRO `admin:` da ponte pode nascer de outra fonte — senão a cura
     seria só empurrar o botão morto pra o slot do vizinho. Único valor solto
     permitido é o `0` do esqueleto de carregamento: enquanto o config não
     chegou, ninguém é admin (esconder botão < oferecer exclusão que volta 403). */
  const valoresAdmin = [...ponteCodigo.matchAll(/\badmin:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.ok(valoresAdmin.length >= 1, "nenhum `admin:` na ponte — a régua perdeu o objeto de medição");
  for (const valor of valoresAdmin) {
    const doServidor = /\behAdmin\(\)/.test(valor);
    const esqueleto = valor === "0";   // tela ainda carregando: ninguém é admin
    assert.ok(doServidor || esqueleto, `admin cravado ou de fonte local na ponte: \`admin: ${valor}\``);
  }

  /* A PONTA DE LÁ DA CORRENTE: `ehAdmin` lê o `config`, e `config` só é
     preenchido com a RESPOSTA de `/logistica/config`. Sem estas duas, alguém
     podia manter a letra `ehAdmin()` e trocar a fonte por um campo do usuário —
     e o motorista voltaria a ver o Excluir pra tomar 403 traduzido como "sua
     sessão expirou". */
  assert.match(ponteCodigo, /const ehAdmin = \(\) => !!config && Object\.prototype\.hasOwnProperty\.call\(config, 'modoRotaPadrao'\)/);
  const atribuicoes = [...ponteCodigo.matchAll(/^[ \t]*config = [^;\n]+;/gm)];
  assert.ok(atribuicoes.length >= 1, "ninguém preenche `config` — ehAdmin() ficaria sempre falso");
  for (const a of atribuicoes) {
    const antes = ponteCodigo.slice(Math.max(0, a.index - 1200), a.index);
    assert.match(antes, /window\.API\.get\('\/logistica\/config'\)/, `\`${a[0].trim()}\` não vem de GET /logistica/config`);
  }
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
