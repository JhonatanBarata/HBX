#!/usr/bin/env node
/**
 * PROVA FUNCIONAL da busca da parada avulsa (F1, PR12082026-PESQUISA-PAINEL-AVULSA).
 *
 *     node scripts/prova-busca-avulsa.js
 *     node scripts/prova-busca-avulsa.js --sabotagem   (prova que a prova grita)
 *
 * O que ela cobra, contra o banco REAL do VPS (via scripts/vps-run.js):
 *   1. "Mracia" acha Márcia (fuzzy de cliente, tenant de teste, sem GPS);
 *   2. dois clientes do MESMO nome, o mais perto do GPS vem primeiro;
 *   3. "rua 8" devolve a via do município da posição, com pino e CEP;
 *   4. comércio por nome parcial, escopado na cidade e ranqueado por distância;
 *   5. o passo do NÚMERO (busca/porta): porta exata com CEP, pelas leis fail-closed;
 *   6. ZERO chamada externa no caminho da busca (inspeção do fonte);
 *   7. latência medida por EXPLAIN ANALYZE (quente) — teto 100 ms por grupo.
 *
 * 🔴 SEM SEGUNDA CÓPIA DE SQL: a prova carrega a MESMA peça pura que o backend
 * compila (backend/dist/logistica/logistica-busca.sql.js) e executa o texto que
 * ELA gera. Se alguém mudar a consulta no backend, a prova muda junto — e se a
 * mudança quebrar a cena, a prova grita.
 *
 * `--sabotagem`: aperta o limiar fuzzy de cliente pra 0.95 no SQL gerado e
 * espera o caso 1 REPROVAR — é o teste de que a prova não é decorativa.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const VPS_RUN = path.join(RAIZ, 'scripts', 'vps-run.js');
const DIST = path.join(RAIZ, 'backend', 'dist', 'logistica', 'logistica-busca.sql.js');
const COMPANY_ID = Number(process.env.PROVA_COMPANY_ID || 41); // bancada real: Rio Claro/SP
const SABOTAGEM = process.argv.includes('--sabotagem');

if (!fs.existsSync(DIST)) {
  console.error('dist ausente — rode antes:  cd backend && npm run build');
  process.exit(2);
}
/* 🔴 FRESCOR, não só existência (fiscal, 12/08): a prova executa o SQL do
   COMPILADO. Quem edita a peça pura e esquece o build provaria o código VELHO
   e levaria verde falso — o pior tipo de portão, o que ensina a confiar. */
{
  const SRC = path.join(RAIZ, 'backend', 'src', 'logistica', 'logistica-busca.sql.ts');
  if (fs.existsSync(SRC) && fs.statSync(SRC).mtimeMs > fs.statSync(DIST).mtimeMs) {
    console.error('dist VELHO (fonte editada depois do build) — rode:  cd backend && npm run build');
    process.exit(2);
  }
}
const B = require(DIST);

const ok = [];
const falhou = [];
const eh = (nome, cond, detalhe) => ((cond ? ok : falhou).push(nome + (cond || !detalhe ? '' : `  [${detalhe}]`)));
/** sem acento, minúsculo — o banco devolve "Márcia" e regex ASCII não vê acento. */
const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── SQL da peça pura → texto executável (params viram literais) ────────────────
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlPronto(p) {
  return p.sql.replace(/\$(\d+)/g, (m, n) => lit(p.params[Number(n) - 1]));
}

// ── executor remoto (mesmo caminho do vps-run: SSH → docker exec → psql) ──────
function vps(script) {
  return execFileSync('node', [VPS_RUN, '--stdin'], {
    input: script, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000,
  });
}
function psql(db, sql) {
  const b64 = Buffer.from(sql, 'utf8').toString('base64');
  /* 🔒 SÓ-LEITURA POR MECANISMO, não por promessa (fiscal, 12/08): isto roda
     como o usuário de ESCRITA do app, no banco de PRODUÇÃO. Uma linha nova na
     prova (ou um builder editado) gravaria em cima do dado do dono sem nada
     barrar. Com `default_transaction_read_only=on` o SERVIDOR recusa qualquer
     escrita — EXPLAIN ANALYZE de SELECT e SET de sessão seguem passando. */
  const saida = vps(`echo ${b64} | base64 -d | docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hbx-postgres psql -U hbx_user -d ${db} -At -v ON_ERROR_STOP=1 -f -`);
  return saida.split('\n').map((l) => l.trimEnd()).filter((l) => l !== '' && l !== 'SET');
}
function linhas(db, sql) {
  return psql(db, sql).map((l) => l.split('|'));
}
/** Execution Time do EXPLAIN ANALYZE, rodado 2x (a 2ª é a quente que vale). */
function msQuente(db, sql, prefixo = '') {
  const exp = `${prefixo}EXPLAIN (ANALYZE, TIMING OFF) ${sql}`;
  psql(db, exp); // aquece cache
  const out = psql(db, exp).join('\n');
  const m = /Execution Time: ([\d.]+) ms/.exec(out);
  return m ? Number(m[1]) : NaN;
}

(async () => {
  console.log(`\n=== PROVA: busca da parada avulsa (company ${COMPANY_ID}${SABOTAGEM ? ', MODO SABOTAGEM' : ''}) ===\n`);

  // Ponto de GPS da cena: a mediana dos pinos do tenant (o "centro" de onde ele trabalha).
  const [[latS, lngS]] = linhas('hbx_prod', `
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lat),
           percentile_cont(0.5) WITHIN GROUP (ORDER BY lng)
      FROM "CustomerProfile" WHERE "companyId" = ${COMPANY_ID} AND lat IS NOT NULL`);
  const gps = { lat: Number(latS), lng: Number(lngS) };
  eh('tenant de prova tem pinos (GPS da cena existe)', Number.isFinite(gps.lat) && Number.isFinite(gps.lng));

  // ── 1. FUZZY: "Mracia" acha Márcia (sem GPS — degrade honesto) ──────────────
  let sqlFuzzy = sqlPronto(B.sqlBuscaClientes({ companyId: COMPANY_ID, q: 'Mracia', lat: null, lng: null }));
  if (SABOTAGEM) sqlFuzzy = sqlFuzzy.replace(/>= 0\.25/, '>= 0.95'); // aperta o limiar: a cena TEM que morrer
  const fuzzy = linhas('hbx_prod', sqlFuzzy);
  // Cena do dono: digitou errado e a Márcia aparece NA FRENTE (top 3), não
  // enterrada — foi exatamente o defeito medido no 1º red-run (word_similarity
  // empatava meia lista em 0.2857 e o desempate alfabético cortava a Márcia).
  const achouMarcia = fuzzy.slice(0, 3).some((r) => /marcia/.test(sem(r[1])));
  eh('1. "Mracia" acha Márcia no top 3 (fuzzy, limiar 0.25)', achouMarcia,
    `top3=${fuzzy.slice(0, 3).map((r) => r[1]).join(',')}`);

  // ── 2. PROXIMIDADE E FÓRMULA VIVA ───────────────────────────────────────────
  // 2a (clientes): GPS na porta de um cliente real; ele volta com distância ~0
  // e o score de CADA linha devolvida é recomputado em JS — prova que o ranking
  // é DE FATO similaridade × proximidade × recência, não um ORDER BY qualquer.
  // (1º rascunho desta prova cobrava "mesmo primeiro nome ⇒ mais perto na
  //  frente", e reprovava CERTO: 'levi' exato tem similaridade maior que
  //  'levi + sobrenome' — nome MAIS parecido pode vencer a distância. A régua
  //  do empate de nome idêntico é a 2b, nos comércios, onde o empate existe.)
  const alvoProx = linhas('hbx_prod', `
    SELECT id, split_part("searchName", ' ', 1) AS token, lat, lng
      FROM "CustomerProfile"
     WHERE "companyId" = ${COMPANY_ID} AND "isCliente" AND lat IS NOT NULL
       AND length(split_part("searchName", ' ', 1)) >= 4
     ORDER BY id LIMIT 1`);
  if (!alvoProx.length) {
    falhou.push('2a. proximidade: tenant sem cliente com pino (dado insuficiente)');
  } else {
    const [idAlvo, token, aLat, aLng] = alvoProx[0];
    const prox = linhas('hbx_prod', sqlPronto(B.sqlBuscaClientes({
      companyId: COMPANY_ID, q: token, lat: Number(aLat), lng: Number(aLng),
    })));
    // colunas: id0 name1 endereco2 numero3 bairro4 cidade5 uf6 cep7 lat8 lng9
    //          quando10 sim11 dist_m12 score13
    const doAlvo = prox.find((r) => r[0] === idAlvo);
    eh(`2a. "${token}" com GPS na porta: o dono da porta volta com distância ~0`,
      !!doAlvo && Number(doAlvo[12]) < 30, doAlvo ? `${doAlvo[12]}m` : 'ausente');
    const agora = Date.now();
    const formulaViva = prox.every((r) => {
      const sim = Number(r[11]);
      const dist = r[12] === '' ? null : Number(r[12]);
      const quando = r[10] === '' ? null : Date.parse(r[10]);
      // Esta consulta VEIO COM GPS, então distância nula aqui só pode ser
      // "cliente sem pino" — e sem pino vale 0.55 (PROX_SEM_PINO), nunca o 1.0
      // de quem está na porta. Foi este espelho que gritou quando a régua do
      // SQL mudou, que é exatamente pra isso que a fórmula vive duplicada aqui.
      const fProx = dist === null ? 0.55 : Math.max(0.25, 1 / (1 + dist / 2000));
      const dias = quando === null ? null : (agora - quando) / 86400000;
      const fRec = dias === null ? 1 : dias <= 30 ? 1.25 : dias <= 90 ? 1.1 : 1;
      return Math.abs(sim * fProx * fRec - Number(r[13])) < 1e-4;
    });
    eh('2a. o score devolvido É similaridade × proximidade × recência', formulaViva && prox.length > 0, `linhas=${prox.length}`);
  }

  // ── 3. RUA: "rua 8" no município da posição, com pino e CEP ─────────────────
  const munRows = linhas('cnefe', sqlPronto(B.sqlMunicipioPorPosicao(gps.lat, gps.lng)));
  const codMun = munRows.length ? munRows[0][0] : null;
  eh('3a. posição → município pelo Censo', !!codMun, `cod=${codMun}`);
  let viaTopo = null;
  if (codMun) {
    const vias = linhas('cnefe', sqlPronto(B.sqlBuscaVias({ codMunicipio: codMun, q: 'rua 8', lat: gps.lat, lng: gps.lng })));
    viaTopo = vias[0] || null;
    // colunas: via, lat, lng, cep, n, spread_m, exata, sim, dist_m
    eh('3b. "rua 8" devolve a via exata em 1º, com pino',
      !!viaTopo && viaTopo[0] === 'rua 8' && viaTopo[6] === 't' && viaTopo[1] !== '' && viaTopo[2] !== '',
      viaTopo ? `1º=${viaTopo[0]}` : 'vazio');
    eh('3c. a via vem com CEP (a escolha vira cadastro com CEP)', !!viaTopo && /^\d{8}$/.test(viaTopo[3] || ''), viaTopo && viaTopo[3]);
    // "Avenida Oitenta e Quatro" digitado por extenso cai na MESMA via canônica.
    const av84 = linhas('cnefe', sqlPronto(B.sqlBuscaVias({ codMunicipio: codMun, q: 'Avenida Oitenta e Quatro', lat: null, lng: null })));
    eh('3d. "Avenida Oitenta e Quatro" ↔ "av 84" (numeral vira dígito)',
      av84.length > 0 && av84[0][0] === 'av 84', av84.length ? `1º=${av84[0][0]}` : 'vazio');
  }

  // ── 4. COMÉRCIO: nome parcial, escopado na cidade, distância presente ───────
  const cidRows = codMun ? linhas('cnefe', sqlPronto(B.sqlCidadeDoMunicipio(codMun))) : [];
  const uf = cidRows.length ? cidRows[0][0] : null;
  const cidade = cidRows.length ? cidRows[0][1] : null;
  eh('4a. município → cidade/UF pro escopo da RFB', !!cidade && !!uf, `${cidade}/${uf}`);
  const prefixoTrgm = `SET pg_trgm.word_similarity_threshold = ${B.FUZZY_COMERCIO_MIN};\n`;
  let comercios = [];
  if (cidade && uf) {
    // colunas: cnpj(0) sim(1) nome(2) endereco(3) cidade(4) uf(5) cnae(6)
    //          cnaeDescricao(7) lat(8) lng(9) nivelGeo(10) cep(11) dist_m(12) score(13)
    const com = linhas('hbx_prod', sqlPronto(B.sqlBuscaComerciosLike({ cityNorm: cidade, uf, q: 'mercado', lat: gps.lat, lng: gps.lng })));
    comercios = com;
    eh('4b. "mercado" devolve comércios da cidade (caminho rápido)', com.length > 0, `linhas=${com.length}`);
    eh('4c. todos do escopo (nenhum de outra cidade)', com.every((r) => (r[4] || '').toLowerCase().includes(cidade.split(' ')[0])),
      com.map((r) => r[4]).join(','));
    const comPino = com.filter((r) => r[12] !== '');
    eh('4d. distância presente em quem tem pino confiável', comPino.length > 0, `${comPino.length}/${com.length}`);
    eh('4e. lista ordenada por score (nome × distância)', com.every((r, i, a) => i === 0 || Number(a[i - 1][13]) >= Number(r[13]) - 1e-9), 'score decrescente');
    // 2b. A CENA DO "BAR DO ZÉ": nome EMPATADO (mesmo sim), o mais perto vem
    // primeiro — aqui o empate existe de verdade (todo "mercado X" tem sim=1).
    const simTopo = Number(com[0] ? com[0][1] : 0);
    const empatados = com.filter((r) => Math.abs(Number(r[1]) - simTopo) < 1e-6 && r[12] !== '');
    if (empatados.length < 2) {
      falhou.push('2b. empate de nome: menos de 2 comércios com sim igual e pino (dado insuficiente)');
    } else {
      eh(`2b. nome empatado (${empatados.length} com sim=${simTopo.toFixed(2)}): o mais perto vem primeiro`,
        empatados.every((r, i, a) => i === 0 || Number(a[i - 1][12]) <= Number(r[12]) + 1e-6),
        empatados.map((r) => `${Math.round(r[12])}m`).join(' → '));
    }
    // O TYPO cai no fallback fuzzy e AINDA acha (é o caminho que o serviço só
    // paga quando o LIKE vem vazio — mesmo SET do SET LOCAL da transação).
    const typo = linhas('hbx_prod', prefixoTrgm + sqlPronto(B.sqlBuscaComerciosFuzzy({ cityNorm: cidade, uf, q: 'mercdo', lat: gps.lat, lng: gps.lng })));
    eh('4f. typo "mercdo" acha mercado pelo fallback fuzzy', typo.some((r) => /merc/.test(sem(r[2]))), `linhas=${typo.length}`);
  }

  // ── 5. O PASSO DO NÚMERO (busca/porta) ──────────────────────────────────────
  if (codMun) {
    const alvo = linhas('cnefe', `
      SELECT numero FROM cnefe_porta_any
       WHERE cod_municipio = ${lit(codMun)} AND via_canon = 'rua 8'
         AND numero IS NOT NULL AND spread_m <= 250
       ORDER BY n DESC LIMIT 1`);
    if (!alvo.length) {
      falhou.push('5. porta: rua 8 sem porta agrupada ≤250m (dado insuficiente)');
    } else {
      const numero = Number(alvo[0][0]);
      const paraRow = (r) => ({
        numero: r[0] === '' ? null : Number(r[0]), lat: Number(r[1]), lng: Number(r[2]),
        cep: r[3] || null, n: Number(r[4]), spread_m: r[5] === '' ? null : Number(r[5]),
        cnefe_nivel: r[6] === '' ? null : Number(r[6]),
      });
      const exata = linhas('cnefe', sqlPronto(B.sqlPortaExata(codMun, 'rua 8', numero))).map(paraRow);
      const viz = linhas('cnefe', sqlPronto(B.sqlPortaVizinhos(codMun, 'rua 8', numero))).map(paraRow);
      const porta = B.escolherPortaDaBusca(exata, viz, numero);
      eh(`5a. rua 8, nº ${numero} → pino de PORTA`, !!porta && porta.precisao === 'porta', porta && porta.precisao);
      eh('5b. a porta traz CEP (o cadastro nasce com CEP)', !!porta && /^\d{8}$/.test(porta.cep || ''), porta && porta.cep);
      // Número inexistente na via mas na mesma altura → vizinho rotulado 'rua'.
      const numFalso = numero + 1;
      const exata2 = linhas('cnefe', sqlPronto(B.sqlPortaExata(codMun, 'rua 8', numFalso))).map(paraRow);
      const viz2 = linhas('cnefe', sqlPronto(B.sqlPortaVizinhos(codMun, 'rua 8', numFalso))).map(paraRow);
      const porta2 = B.escolherPortaDaBusca(exata2, viz2, numFalso);
      eh('5c. número vizinho degrada honesto (porta ou rua, nunca invenção)',
        !!porta2 && (porta2.precisao === 'porta' || porta2.precisao === 'rua'), porta2 && porta2.precisao);
    }
  }

  // ── 6. ZERO CHAMADA EXTERNA no caminho da busca ─────────────────────────────
  const fontes = [
    'backend/src/logistica/logistica-busca.sql.ts',
    'backend/src/logistica/logistica-busca.service.ts',
    'backend/src/logistica/logistica-busca.controller.ts',
  ].map((f) => ({ f, txt: fs.readFileSync(path.join(RAIZ, f), 'utf8') }));
  for (const { f, txt } of fontes) {
    const semRede = !/\bfetch\s*\(|axios|node-fetch|https?:\/\/|require\(['"]https?['"]\)|from ['"]https?['"]/i
      .test(txt.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')); // comentário pode citar URL; código não
    eh(`6. sem rede externa em ${path.basename(f)}`, semRede);
  }
  // (tira comentário antes: o serviço CITA o logistica-geo.service justamente
  //  pra dizer que não o importa — a prova cobra o CÓDIGO, não a prosa)
  const soCodigoServico = fontes[1].txt.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  eh('6d. o serviço NÃO importa o caminho do Nominatim (logistica-geo)',
    !/logistica-geo\.service|nucleo-geo\.util/.test(soCodigoServico));

  // ── 7. LATÊNCIA (EXPLAIN ANALYZE, quente) ───────────────────────────────────
  const msClientes = msQuente('hbx_prod', sqlPronto(B.sqlBuscaClientes({ companyId: COMPANY_ID, q: 'Mracia', lat: gps.lat, lng: gps.lng })));
  console.log(`  ⏱  clientes : ${msClientes.toFixed(1)} ms`);
  eh('7a. clientes < 100 ms', msClientes < 100, `${msClientes} ms`);
  if (codMun) {
    const msVias = msQuente('cnefe', sqlPronto(B.sqlBuscaVias({ codMunicipio: codMun, q: 'rua 8', lat: gps.lat, lng: gps.lng })));
    console.log(`  ⏱  endereços: ${msVias.toFixed(1)} ms`);
    eh('7b. endereços < 100 ms', msVias < 100, `${msVias} ms`);
    const msEscopo = msQuente('cnefe', sqlPronto(B.sqlMunicipioPorPosicao(gps.lat, gps.lng)));
    console.log(`  ⏱  escopo   : ${msEscopo.toFixed(1)} ms`);
    eh('7c. posição→município < 100 ms', msEscopo < 100, `${msEscopo} ms`);
  }
  if (cidade && uf) {
    const msCom = msQuente('hbx_prod', sqlPronto(B.sqlBuscaComerciosLike({ cityNorm: cidade, uf, q: 'mercado', lat: gps.lat, lng: gps.lng })));
    console.log(`  ⏱  comércios: ${msCom.toFixed(1)} ms (caminho rápido)`);
    eh('7d. comércios (caminho comum) < 100 ms', msCom < 100, `${msCom} ms`);
    // O fallback do typo paga word_similarity na cidade inteira — MEDIDO e
    // reportado às claras; teto de sanidade folgado (o serviço corta em 1500).
    const msTypo = msQuente('hbx_prod', sqlPronto(B.sqlBuscaComerciosFuzzy({ cityNorm: cidade, uf, q: 'mercdo', lat: gps.lat, lng: gps.lng })), prefixoTrgm);
    console.log(`  ⏱  comércios: ${msTypo.toFixed(1)} ms (fallback do typo)`);
    eh('7e. fallback do typo dentro do teto do serviço (<1200 ms)', msTypo < 1200, `${msTypo} ms`);
  }

  console.log('');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}`);
  if (SABOTAGEM) {
    // No modo sabotagem o SUCESSO é o caso 1 ter reprovado.
    const gritou = falhou.some((n) => n.startsWith('1.'));
    console.log(gritou ? '\nSABOTAGEM: a prova GRITOU como devia (caso 1 reprovou).' : '\nSABOTAGEM: a prova NÃO percebeu o limiar quebrado — ela está decorativa!');
    process.exit(gritou ? 0 : 1);
  }
  process.exit(falhou.length ? 1 : 0);
})().catch((e) => {
  console.error('ERRO DA PROVA:', e && e.message ? e.message : e);
  process.exit(1);
});
