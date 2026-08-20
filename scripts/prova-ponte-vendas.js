/**
 * PROVA DA PONTE DO HBX VENDAS — a cena de aceite, medida.
 *
 * Sobe o `assets/app/` do flavor vendas num http local, injeta uma PONTE NATIVA
 * FALSA (o mesmo contrato do Kotlin: `HBXAndroid.request` + `HBXNative._resolve`)
 * com respostas de servidor plausíveis, e mede:
 *   1. o app abre e cai no FUNIL (uma cortina só);
 *   2. os cards são os leads REAIS da resposta, e "Empresa 1" (o desenho) SUMIU;
 *   3. o módulo que o servidor disse desligado SAI da barra, e a chave AUSENTE
 *      continua ligada (a régua "ausente = não sei = ligado");
 *   4. o 403 de MÓDULO diz na tela que é módulo — e não oferece "Tentar de novo";
 *   5. o Puxar não anuncia preço que o servidor não informou;
 *   6. o "Abrir no meu WhatsApp" atende UM toque, mesmo tocado três vezes;
 *   7. TODO `data-acao`/`data-campo` desenhado na casca tem dono na ponte;
 *   8. nenhum erro de console.
 *
 * 🔴 ELA REGENERA ANTES DE MEDIR (19/08). Tudo que esta prova serve é GERADO
 * (`ponte-costurar` + `casca-injetar`); abrir o disco sem regenerar mede o
 * gerado de ontem — ou o da outra sessão — e um red-first feito na FONTE sai
 * VERDE sobre código que não existe mais. A cura é do repo inteiro e mora em
 * `scripts/_regenerar.js`; aqui ela é a PRIMEIRA linha do main, antes de o
 * servidor http existir.
 *
 * 🔴 E ELA NÃO DORME (19/08). Nenhuma medida desta prova espera RELÓGIO: cada
 * uma espera a CONDIÇÃO que vai medir (a porta do boot respondida, o seam
 * escrito, a peça na tela, nada mais em voo). O motivo é o de sempre nesta
 * casa: 3 de 12 rodadas reprovavam sozinhas, sempre no 403 de módulo, e portão
 * que reprova sozinho ensina a equipe a ignorar vermelho. Quem quiser encurtar
 * uma espera aqui: a régua é a condição, nunca o milissegundo.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { regenerarGerados } = require('./_regenerar');
const { APPS } = require('./lib/apps');
const DIR = APPS.vendas.destino;

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/* 🔴 AS CHAVES DE MÓDULO DESTA TABELA SÃO AS DO BACKEND — conferidas em 19/08
   contra `backend/src/bootstrap/structural-defaults.json` (o catálogo que o
   `ensureDefaultSystemModules` semeia) e contra `listMyModules`
   (`backend/src/modules/modules.service.ts`). Duas verdades saíram dessa leitura
   e as duas mudam o que esta prova precisa exercitar:

   · `webscraping` é chave REAL e ROTA-GATEADA: `@ModuleAccess('webscraping')`
     no `webscraping.controller.ts`. Desligá-la faz o Radar sair da barra E o
     `/webscraping/*` responder 403 MODULE_ACCESS_DENIED. É O CASO DE VERDADE,
     e é o que o cliente 46 viveu em 18/08.
   · `empresas` existe no catálogo, mas só entra na resposta do `/modules/me`
     quando a empresa TEM post-it (linha em `CompanyModule`): ela não está em
     `PRIMARY_COMMERCIAL_MODULE_KEYS`, nem em `ROUTE_GUARDED_MODULE_KEYS`, nem em
     `CATEGORY_MANAGED_MODULE_KEYS`, nem na caixa de plano nenhum, nem na lista
     de chaves cravadas à mão do `knownModuleKeys`. E `/nucleo/empresas` não tem
     `@ModuleAccess` — o endereço responde de qualquer jeito.
     Até 19/08 o único caso "desligado" que esta prova exercitava era justamente
     esse `{key:'empresas', accessible:false}`: o caminho FELIZ da régua, com uma
     chave que na maioria das empresas nem chega. Agora ela vai AUSENTE de
     propósito — é assim que o servidor real responde pra empresa sem post-it —,
     e a prova mede a regra que isso aciona: ausente = não sei = LIGADO. */
const MODULOS_DO_SERVIDOR = [
  { key: 'vendas', name: 'Vendas', companyEnabled: true, userAllowed: true, accessible: true },
  { key: 'conversas', name: 'Conversas', companyEnabled: true, userAllowed: true, accessible: true },
  // O CASO REAL: a empresa não contratou o Radar. A aba tem que sumir.
  { key: 'webscraping', name: 'Radar Digital', companyEnabled: false, userAllowed: true, accessible: false },
  // `empresas` NÃO aparece — é o que o backend responde pra empresa sem post-it.
];

const LEAD_DA_CONVERSA = 'l-9002';

const SERVIDOR_FALSO = {
  'GET /vendas/board': {
    summary: { total: 4, today: 2, overdue: 1, scheduled: 1, closed: 0 },
    radarSupply: { isSeller: true, unlimited: false, activeCards: 4, capacity: 20, availableSlots: 16, full: false, paused: false },
    blocks: {
      overdue: [{
        id: 'l-9001', name: 'Distribuidora Agua Viva', phone: '5519998887766',
        city: 'Valinhos', state: 'SP', statusLabel: 'Retorno', attemptCount: 3,
        lastContactAt: new Date(Date.now() - 6 * 86400000).toISOString(), isFreshCompany: false,
      }],
      today: [{
        id: LEAD_DA_CONVERSA, name: 'Mercado Sao Jorge & Cia', phone: '1930001122',
        city: 'Hortolandia', state: 'SP', statusLabel: 'Qualificado', attemptCount: 1,
        lastContactAt: new Date(Date.now() - 86400000).toISOString(), isFreshCompany: true,
      }, {
        id: 'l-9003', name: 'Padaria do Ze', phone: '',
        city: 'Campinas', state: 'SP', statusLabel: 'Novo lead', attemptCount: 0,
        lastContactAt: null, isFreshCompany: false,
      }],
      scheduled: [{
        id: 'l-9004', name: 'Oficina Central', phone: '5519970001234',
        city: 'Vinhedo', state: 'SP', statusLabel: 'Em contato', attemptCount: 2,
        lastContactAt: new Date(Date.now() - 2 * 86400000).toISOString(), isFreshCompany: false,
      }],
      closed: [],
    },
  },
  'GET /vendas/pending-summary': { ok: true, blocked: false, pendingCount: 4, message: '4 card(s) pendentes no Vendas.' },
  'GET /vendas/report': {
    ok: true,
    period: { key: '30d', label: '30 dias' },
    metrics: { cardsChamados: 48, respostas: 19, taxaConversao: 0.2083 },
  },
  'GET /modules/me': MODULOS_DO_SERVIDOR,
  'GET /profile': {
    id: 51, name: 'Jhonatan Vendedor', email: 'vendedor@hbx.com.br', role: 'USER',
    userKind: 'seller', canViewBilling: false, isSystemMaster: false,
    company: { id: 51, name: 'HBX Bancada', contactPhone: '5519997024884' },
  },
  'GET /credits/me': { enabled: true, leadsDisponiveis: 240 },
  'GET /companies/me/whatsapp-status': { connected: true, displayNumber: '5511900001200', status: 'open' },
  // A CONVERSA de um lead — as três portas que o `carregarConversa` abre.
  [`GET /vendas/lead/${LEAD_DA_CONVERSA}/conversation/messages`]: {
    conversation: { id: 'c-1', exists: true },
    messages: [
      { id: 'm-1', direction: 'out', content: 'Bom dia! Sou da HBX.', status: 'READ', createdAt: new Date(Date.now() - 3600000).toISOString() },
    ],
  },
  [`GET /vendas/lead/${LEAD_DA_CONVERSA}/card`]: {
    lead: {
      id: LEAD_DA_CONVERSA, name: 'Mercado Sao Jorge & Cia', phone: '1930001122',
      statusLabel: 'Qualificado', primarySource: 'radar', city: 'Hortolandia', state: 'SP',
      attemptCount: 1, whatsappAvailability: { status: 'available' },
      // O que só a FICHA mostra — e o motivo de o "Abrir ficha" existir.
      cnpj: '12.345.678/0001-90', razaoSocial: 'MERCADO SAO JORGE & CIA LTDA',
      companySituation: 'ATIVA', ownerName: 'Jorge da Silva',
      // O ENDERECO e o que faz a linha do 'Onde e' virar ALVO de mapa. Sem ele a
      // ficha mostra so a cidade em texto, DE PROPOSITO: mapa aberto no centro de
      // Hortolandia nao leva o vendedor a porta de ninguem.
      address: 'Rua das Palmeiras, 120',
      phones: [{ phone: '1930001122' }, { phone: '19998887000' }],
      emails: [{ email: 'contato@saojorge.com.br' }],
      // 🔴 O HISTÓRICO COMO ELE VEM DE VERDADE (copiado de um lead de produção,
      // 19/08): o evento de enriquecimento guarda o PAYLOAD no `description`, e
      // a ficha despejava esse JSON na tela do vendedor. O título fica; o miolo
      // de máquina não.
      timeline: [
        { id: 'e-1', title: 'Contato feito pelo WhatsApp', description: 'Contato manual registrado (whatsapp_pessoal).', createdAt: new Date(Date.now() - 7200000).toISOString() },
        { id: 'e-2', title: 'Enriquecimento social do Radar', description: '{"radarLeadId":"cmqu6nmd507lisl5hjepsqp16","website":null,"enrichmentStatus":"queued"}', createdAt: new Date(Date.now() - 10800000).toISOString() },
      ],
    },
  },
  [`POST /vendas/lead/${LEAD_DA_CONVERSA}/attempt`]: { ok: true },
  // O RADAR: colheita já paga, pra medir o botão que COBRA.
  'GET /webscraping/radar/leads': {
    items: [{
      id: 'r-1', name: 'Agua Boa Distribuidora', city: 'Valinhos', state: 'SP',
      segment: 'distribuidora de agua', phone: '5519998880000', website: '',
    }],
  },
  'GET /webscraping/radar/preference-suggestions': { suggestions: [{ segment: 'distribuidora de agua' }] },
  'GET /webscraping/radar/search-runs/latest': { run: null },
  'GET /atividades/agenda': { counts: { atrasadas: 0, hoje: 0, semana: 0 }, atrasadas: [], hoje: [], semana: [] },
  'GET /nucleo/empresas': { items: [], total: 0, page: 1, totalPages: 1 },
};

/* 🔴 O 403 DE MÓDULO, LITERAL — é o corpo que o `ModuleAccessGuard` levanta
   (`backend/src/modules/module-access.guard.ts`). Nada de inventar formato: a
   régua da ponte casa pelo `code`, e um corpo aproximado aqui deixaria a prova
   verde medindo uma classificação que a produção nunca faz. */
const CORPO_403_MODULO = {
  code: 'MODULE_ACCESS_DENIED',
  message: 'Módulo indisponível para este usuário ou empresa.',
  modules: ['vendas'],
  retryable: false,
};

/* Ações que a casca desenha e que NÃO são da ponte — cada uma com o porquê, e
   cada uma conferida contra o `D0-acoes.js`, que as trata por nome. Lista curta
   e explícita: sem ela a varredura de botões mortos daria falso vermelho e
   viraria a guarda que se aprende a ignorar.

   🔴 CADA ISENÇÃO CARREGA A PRÓPRIA PROVA (`confere`). Isenção escrita em
   português é promessa; a `confere` é o que impede a promessa de apodrecer: no
   dia em que alguém tirar a guarda por nome da ponte (ou o `if` da casca que
   segura o desenho), a isenção fica VERMELHA e obriga a reler o caso, em vez de
   continuar dando passe livre a um botão que virou morto de verdade. */
const ACOES_SEM_DONO_NA_PONTE = {
  'chave-tema': {
    porque: 'do MOCK: ele chama `trocarLuz`, que a ponte embrulhou (00-nucleo §1). '
      + 'Dono na ponte viraria a luz DUAS vezes no mesmo toque — o `D0` a exclui por nome.',
    confere: { onde: 'ponte', regex: /chave === 'chave-tema'/ },
  },
  'chave-sons': {
    porque: 'a casca só desenha esta chave quando `DADOS.ajustes.sons != null`, e a ponte '
      + 'deste flavor mantém `sons: null` de propósito (o Kotlin do vendas engole '
      + '`setSoundPrefs`). Dar dono a ela seria ligar um botão que este app não tem — '
      + 'a §4 mede as duas pontas: a chave não é desenhada E o seam continua `null`.',
    confere: { onde: 'mock', regex: /a\.sons==null\?''\:chave\(/ },
  },
};

/* 🔴 AS MARCAS QUE A VARREDURA NÃO CONSEGUE LER — DECLARADAS, NUNCA ENGOLIDAS.
   O `data-acao` de um botão nem sempre é um literal na casca: às vezes é uma
   expressão montada na hora da pintura. O leitor abaixo resolve as que dá pra
   resolver (o ternário da Agenda, o argumento que desce por três helpers), e o
   que sobra ENTRA AQUI COM NOME E MOTIVO. A alternativa — deixar a saída dizer
   "45 OK" com uma marca que ela não sabe ler — é exatamente como botão morto
   passa por duas revisões: a lista parece completa. Marca ilegível fora desta
   tabela REPROVA. */
const MARCAS_ILEGIVEIS = [
  {
    expressao: "'tutor-'+id",
    porque: 'o destino é `tutor-<id do capítulo>`, montado a partir do catálogo do tutorial. '
      + 'O dono NÃO é a ponte: o próprio mock abre o capítulo, e a ponte tem guarda por '
      + 'PREFIXO pra não gritar "ação sem dono" a cada toque no catálogo.',
    confere: { onde: 'ponte', regex: /chave\.indexOf\('tutor-'\) === 0/ },
  },
  /* 🔴 OS DOIS BOTÕES DE PORTÃO: A CASCA É O CANO, O DESTINO MORA NA PONTE.
     `portao({acoes:[[rótulo, classe, escape, acao]]})` — quem escreve o `acao`
     é quem ABRE o portão, e neste app quem abre é a própria ponte. Então a
     varredura não desiste: ela vai LER A PONTE e cobrar dono das chaves que
     saírem de lá (hoje sai `agenda-ir-funil`, do portão da Agenda). Sem isto um
     portão podia oferecer um botão que ninguém registrou — botão morto dentro
     de um portão, que é o pior lugar pra ter um: a pessoa está decidindo. */
  {
    expressao: 'acaoPropria',
    porque: 'é o 4º campo de uma ação de PORTÃO — o destino vem do dado que a PONTE monta. '
      + 'A varredura resolve lendo o ponte.js e cobra dono de cada chave que achar lá.',
    destinosNaPonte: /\[\s*'[^']*'\s*,\s*'[^']*'\s*,\s*(?:true|false|1|0)\s*,\s*'([^']+)'/g,
  },
  {
    expressao: 'p.acaoPrincipal',
    porque: 'mesmo caso, pelo campo `acaoPrincipal` do portão: o destino é escrito pela ponte, '
      + 'e é no ponte.js que a varredura vai buscá-lo.',
    destinosNaPonte: /acaoPrincipal\s*:\s*'([^']+)'/g,
  },
];

function respostaFalsa(method, caminho) {
  const semQuery = String(caminho).split('?')[0];
  const chave = `${method} ${semQuery}`;
  if (Object.prototype.hasOwnProperty.call(SERVIDOR_FALSO, chave)) {
    return { status: 200, body: JSON.stringify(SERVIDOR_FALSO[chave]) };
  }
  return { status: 404, body: JSON.stringify({ message: 'rota nao mapeada na prova', caminho: semQuery }) };
}

/* ==========================================================================
   A VARREDURA DOS BOTÕES MORTOS — estática, sobre os arquivos GERADOS.

   🔴 POR QUE ELA NÃO É UM CLIQUE. Botão morto só aparece no navegador se a
   prova ABRIR a tela dele, e três das telas deste app não têm rota (o catálogo
   de portões, a tela de estreia, a conversa sem chip). Foi assim que
   `abrir-ficha-lead` e as três portas de cadastro passaram por duas rodadas de
   revisão: ninguém abriu a tela. Aqui a régua é o ARQUIVO — todo `data-acao`
   escrito na casca precisa de uma entrada no mapa da ponte, tenha a tela rota
   ou não.
   ========================================================================== */

/* --- o leitor de marcas: um SCANNER, não uma regex ------------------------
   🔴 POR QUE NÃO DÁ PRA SER UMA REGEX. O valor de um `data-acao` pode conter
   aspas dentro dele (`data-acao="${r[0]==='remarcar'?'a':'b'}"`), e uma regex
   `[^"']*` para na PRIMEIRA aspa de dentro — foi assim que o ternário da Agenda
   saía na lista como a marca sem sentido `${r[0]===` e a chave
   `atividade-remarcar` NUNCA foi conferida por ninguém (nem aqui, nem na
   revisão que leu esta saída). Aqui o valor é lido caractere a caractere,
   contando a profundidade do `${…}` e pulando as strings de dentro inteiras. */
const LITERAL_PURO = /^'([^'\\]*)'$|^"([^"\\]*)"$|^`([^`$\\]*)`$/;
const IDENTIFICADOR = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** devolve o índice da aspa que FECHA a string aberta em `i` (trata `${}` de template). */
function pularString(txt, i, aspa) {
  for (let j = i + 1; j < txt.length; j += 1) {
    const c = txt[j];
    if (c === '\\') { j += 1; continue; }
    if (c === aspa) return j;
    if (aspa === '`' && c === '$' && txt[j + 1] === '{') {
      let prof = 1;
      j += 2;
      for (; j < txt.length && prof > 0; j += 1) {
        const d = txt[j];
        if (d === '\\') { j += 1; continue; }
        if (d === '{') prof += 1;
        else if (d === '}') prof -= 1;
        else if (d === "'" || d === '"' || d === '`') j = pularString(txt, j, d);
      }
      j -= 1;
    }
  }
  return txt.length;
}

/** toda marca `data-acao=`/`data-campo=` escrita na casca, com o valor INTEIRO. */
function lerMarcas(fonte) {
  const marcas = [];
  const re = /data-(acao|campo)=/g;
  let m;
  while ((m = re.exec(fonte))) {
    /* `[data-acao="x"]` é SELETOR (o tour aponta pra botões que já existem em
       outro lugar), não botão desenhado. Contá-lo faria a varredura cobrar dono
       de uma marca que ninguém pinta. */
    if (fonte[m.index - 1] === '[') continue;
    let i = m.index + m[0].length;
    const aspa = fonte[i];
    if (aspa !== '"' && aspa !== "'") continue;
    i += 1;
    const inicio = i;
    let prof = 0;
    for (; i < fonte.length; i += 1) {
      const c = fonte[i];
      if (c === '\\') { i += 1; continue; }
      if (prof === 0 && c === aspa) break;
      if (c === '$' && fonte[i + 1] === '{') { prof += 1; i += 1; continue; }
      if (prof > 0) {
        if (c === '{') prof += 1;
        else if (c === '}') prof -= 1;
        else if (c === "'" || c === '"' || c === '`') i = pularString(fonte, i, c);
      }
    }
    marcas.push({ tipo: m[1], bruto: fonte.slice(inicio, i), pos: m.index });
  }
  return marcas;
}

/** quebra uma expressão nos `?` e `:` de profundidade ZERO (o ternário). */
function fatiarTernario(expr) {
  const partes = [];
  const seps = [];
  let prof = 0;
  let ini = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const c = expr[i];
    if (c === '\\') { i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { i = pularString(expr, i, c); continue; }
    if (c === '(' || c === '[' || c === '{') prof += 1;
    else if (c === ')' || c === ']' || c === '}') prof -= 1;
    else if (prof === 0 && (c === '?' || c === ':')) {
      // `??` e `?.` não abrem ternário nenhum.
      if (c === '?' && (expr[i + 1] === '?' || expr[i + 1] === '.')) { i += 1; continue; }
      if (c === '?' && expr[i - 1] === '?') continue;
      partes.push(expr.slice(ini, i));
      seps.push(c);
      ini = i + 1;
    }
  }
  partes.push(expr.slice(ini));
  return { partes, seps };
}

/** os argumentos de uma chamada, do `(` até o `)` que o fecha. */
function argumentosDe(fonte, aberto) {
  const args = [];
  let prof = 0;
  let ini = aberto + 1;
  for (let i = aberto; i < fonte.length; i += 1) {
    const c = fonte[i];
    if (c === '\\') { i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { i = pularString(fonte, i, c); continue; }
    if (c === '(' || c === '[' || c === '{') prof += 1;
    else if (c === ')' || c === ']' || c === '}') {
      prof -= 1;
      if (prof === 0) { args.push(fonte.slice(ini, i)); return { args }; }
    } else if (c === ',' && prof === 1) { args.push(fonte.slice(ini, i)); ini = i + 1; }
  }
  return null;
}

const DEFINICOES = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>|function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
/** a função mais próxima ANTES de `pos` que tem `ident` na lista de parâmetros. */
function donoDoParametro(fonte, ident, pos) {
  DEFINICOES.lastIndex = 0;
  let achado = null;
  let m;
  while ((m = DEFINICOES.exec(fonte))) {
    if (m.index >= pos) break;
    const crus = String(m[2] != null ? m[2] : m[4]).split(',').map((s) => s.trim()).filter(Boolean);
    const idx = crus.indexOf(ident);
    if (idx < 0) continue;
    achado = { nome: m[1] || m[3], idx, aridade: crus.length };
  }
  return achado;
}

function chamadasDe(fonte, nome) {
  const re = new RegExp(`\\b${nome.replace(/[$]/g, '\\$')}\\s*\\(`, 'g');
  const saida = [];
  let m;
  while ((m = re.exec(fonte))) {
    const r = argumentosDe(fonte, m.index + m[0].length - 1);
    if (r) saida.push({ args: r.args, pos: m.index });
  }
  return saida;
}

/* 🔴 O RESOLVEDOR — ele persegue o destino do `data-acao` até o literal.
   Três formas, e todas as três existem nesta casca:
     · literal puro                → o destino é ele;
     · ternário                    → os destinos são os RAMOS (a pergunta, não);
     · nome de parâmetro de helper → o destino é o argumento de cada chamada,
       e ele desce quantos degraus for preciso (`semFonte` ← `mioloDe` ← `miolo`
       são TRÊS, e é onde moram os treze "Tentar de novo" do app).
   O que não cair em nenhuma das três volta como CEGO, com o texto da expressão —
   quem decide o que fazer com um cego é a tabela `MARCAS_ILEGIVEIS`, nunca o
   silêncio. */
function resolverExpressao(fonte, expr, pos, visto, nivel) {
  const destinos = new Set();
  const cegos = [];
  const t = String(expr).trim();
  if (!t) return { destinos, cegos: ['(vazio)'] };
  if (nivel > 6) return { destinos, cegos: [`${t} (cadeia funda demais)`] };

  const lit = LITERAL_PURO.exec(t);
  if (lit) { destinos.add(lit[1] != null ? lit[1] : (lit[2] != null ? lit[2] : lit[3])); return { destinos, cegos }; }

  const { partes, seps } = fatiarTernario(t);
  if (partes.length > 1) {
    partes.forEach((p, i) => {
      if (seps[i] === '?') return;                    // essa fatia é a PERGUNTA
      const r = resolverExpressao(fonte, p, pos, visto, nivel + 1);
      r.destinos.forEach((d) => destinos.add(d));
      r.cegos.forEach((c) => cegos.push(c));
    });
    return { destinos, cegos };
  }

  if (IDENTIFICADOR.test(t)) {
    const dono = donoDoParametro(fonte, t, pos);
    if (!dono) return { destinos, cegos: [t] };
    const marca = `${dono.nome}#${dono.idx}`;
    if (visto.has(marca)) return { destinos, cegos };
    visto.add(marca);
    /* Aridade: só entram chamadas que TÊM esse argumento e não passam do fim da
       assinatura. É o que separa dois helpers com o mesmo nome em escopos
       diferentes — nos Ajustes `linha` tem 5 parâmetros, no Tutorial tem 4. */
    const sitios = chamadasDe(fonte, dono.nome)
      .filter((c) => c.args.length > dono.idx && c.args.length <= dono.aridade);
    if (!sitios.length) return { destinos, cegos: [`${t} → ${dono.nome}() sem chamada legível`] };
    sitios.forEach((s) => {
      const r = resolverExpressao(fonte, s.args[dono.idx], s.pos, visto, nivel + 1);
      r.destinos.forEach((d) => destinos.add(d));
      r.cegos.forEach((c) => cegos.push(c));
    });
    return { destinos, cegos };
  }
  return { destinos, cegos: [t] };
}

/* A prova de cada isenção: ou o trecho existe onde a isenção diz que existe, ou
   ele NÃO existe (quando a isenção se apoia numa ausência). Isenção sem prova
   nenhuma não vale: ela é a porta por onde botão morto entra de terno. */
function isencaoDePe(c, fonteDe) {
  if (!c) return { ok: false, nota: 'isenção sem prova — escreva a `confere`' };
  const alvo = fonteDe[c.onde];
  if (!alvo) return { ok: false, nota: `isenção aponta pra fonte inexistente: ${c.onde}` };
  if (c.ausente) {
    return alvo.search(c.ausente) < 0
      ? { ok: true, nota: `nada de \`${c.ausente.source}\` no ${c.onde}.js` }
      : { ok: false, nota: `a isenção EXPIROU: \`${c.ausente.source}\` apareceu no ${c.onde}.js` };
  }
  return c.regex.test(alvo)
    ? { ok: true, nota: `conferida no ${c.onde}.js` }
    : { ok: false, nota: `a isenção EXPIROU: \`${c.regex.source}\` sumiu do ${c.onde}.js` };
}

function varrerBotoesSemDono() {
  const mock = fs.readFileSync(path.join(DIR, 'mock.js'), 'utf8');
  const ponte = fs.readFileSync(path.join(DIR, 'ponte.js'), 'utf8');
  const fonteDe = { mock, ponte };

  const chaves = new Map();          // "tipo|chave" → de onde ela veio
  const montadas = [];               // as marcas escritas como expressão
  for (const marca of lerMarcas(mock)) {
    const linha = mock.slice(0, marca.pos).split('\n').length;
    if (marca.bruto.indexOf('${') < 0) {
      if (marca.bruto) chaves.set(`${marca.tipo}|${marca.bruto}`, 'literal');
      continue;
    }
    const expr = marca.bruto.replace(/^\$\{/, '').replace(/\}$/, '');
    const r = resolverExpressao(mock, expr, marca.pos, new Set(), 0);
    r.destinos.forEach((d) => chaves.set(`${marca.tipo}|${d}`, `montada (mock.js:${linha})`));
    montadas.push({ linha, tipo: marca.tipo, expr, destinos: [...r.destinos], cegos: [...new Set(r.cegos)] });
  }

  /* 🔴 O QUE A VARREDURA NÃO SOUBE LER — resolvido pela outra ponta, ou
     DECLARADO ALTO. Nada de cego passar calado: ou a tabela `MARCAS_ILEGIVEIS`
     ensina onde o destino mora (e ele volta pra fila de quem precisa de dono),
     ou o cego é uma marca NÃO DECLARADA e reprova. */
  const cegas = [];
  const orfasDeCego = [];
  montadas.forEach((m) => {
    m.cegos.forEach((c) => {
      const trecho = c.trim();
      const declarada = MARCAS_ILEGIVEIS.find((d) => d.expressao === trecho);
      if (!declarada) {
        cegas.push({ linha: m.linha, trecho, estado: '🔴 NÃO DECLARADA', porque: '' });
        orfasDeCego.push(`marca ilegível NÃO DECLARADA em mock.js:${m.linha} → ${trecho}`);
        return;
      }
      if (declarada.destinosNaPonte) {
        const achados = [];
        declarada.destinosNaPonte.lastIndex = 0;
        let g;
        while ((g = declarada.destinosNaPonte.exec(ponte))) achados.push(g[1]);
        achados.forEach((k) => chaves.set(`acao|${k}`, `montada pela PONTE (portão · mock.js:${m.linha})`));
        cegas.push({
          linha: m.linha,
          trecho,
          estado: achados.length
            ? `RESOLVIDA NA PONTE → ${JSON.stringify([...new Set(achados)])}`
            : 'RESOLVIDA NA PONTE → (nenhum portão usa este campo hoje)',
          porque: declarada.porque,
        });
        return;
      }
      const prova = isencaoDePe(declarada.confere, fonteDe);
      cegas.push({ linha: m.linha, trecho, estado: prova.ok ? `DECLARADA (${prova.nota})` : `🔴 ${prova.nota}`, porque: declarada.porque });
      if (!prova.ok) orfasDeCego.push(`marca ilegível em mock.js:${m.linha} → ${trecho} (${prova.nota})`);
    });
  });

  /* Dono = uma chave do mapa de ações/campos da ponte GERADA. Casa com a forma
     citada (`'abrir-lead':`) e com a nua (`pacote:`), que são as duas que os
     `registrarAcoes` usam hoje. */
  const temDono = (k) => {
    const esc = k.replace(/[^a-zA-Z0-9_]/g, (c) => `\\${c}`);
    return new RegExp(`(^|[{,\\s])['"]?${esc}['"]?\\s*:`, 'm').test(ponte);
  };
  const linhas = [];
  const orfas = [...orfasDeCego];
  [...chaves.keys()].sort().forEach((id) => {
    const corte = id.indexOf('|');
    const tipo = id.slice(0, corte);
    const k = id.slice(corte + 1);
    const onde = chaves.get(id) === 'literal' ? '' : `   ← ${chaves.get(id)}`;
    if (temDono(k)) return void linhas.push(`  OK      data-${tipo}="${k}"${onde}`);
    const isenta = tipo === 'acao' ? ACOES_SEM_DONO_NA_PONTE[k] : null;
    if (isenta) {
      const prova = isencaoDePe(isenta.confere, fonteDe);
      if (prova.ok) return void linhas.push(`  ISENTA  data-acao="${k}" (${prova.nota}) — ${isenta.porque}`);
      linhas.push(`  MORTO   data-acao="${k}" — ${prova.nota}`);
      orfas.push(`data-acao="${k}" (isenção sem prova de pé)`);
      return;
    }
    linhas.push(`  MORTO   data-${tipo}="${k}"${onde}`);
    orfas.push(`data-${tipo}="${k}"`);
  });

  return { linhas, orfas, montadas, cegas, total: chaves.size };
}

(async () => {
  /* 🔴 O GERADO PRIMEIRO, ANTES DE O SERVIDOR EXISTIR (LOTE 1.4 da esteira).
     Esta prova serve `assets/app/**`, que é SAÍDA de `ponte-costurar` +
     `casca-injetar`. Sem esta linha ela mede o gerado que estiver no disco — o
     de ontem, ou o da outra sessão — e um red-first feito na FONTE
     (`ponte-src/`, o mock) sai VERDE sobre código que não existe mais. O
     `--sem-regerar` continua servindo pra DEPURAR a prova, e carimba o placar
     como inválido + sai com código 9 pra não conseguir se passar por portão.
     Ver `scripts/_regenerar.js`. */
  regenerarGerados({ rotulo: 'prova-ponte-vendas' });

  const servidor = http.createServer((req, res) => {
    const nome = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
    const alvo = path.join(DIR, nome);
    if (!alvo.startsWith(DIR) || !fs.existsSync(alvo)) { res.writeHead(404); return res.end('nao achei'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
    res.end(fs.readFileSync(alvo));
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;

  const navegador = await chromium.launch();

  const falhas = [];
  const conferir = (ok, oque) => { if (!ok) falhas.push(oque); };

  /** Abre o app com uma tabela de respostas e uma lista de rotas que devem
   *  responder 403 de MÓDULO. Devolve a página já pousada no Funil. */
  async function abrirApp({ recusar = [], status = 403, corpo = CORPO_403_MODULO } = {}) {
    const pagina = await navegador.newPage({ viewport: { width: 412, height: 940 } });
    const erros = [];
    const avisos = [];
    const chamadas = [];
    const manifestos = [];
    pagina.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
      if (m.type() === 'warning') avisos.push(m.text());
    });
    pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    /* 🔴 O CORDÃO DE ATUALIZAÇÃO SE MEDE NO PEDIDO, NÃO NO ERRO DE CONSOLE.
       O manifesto mora fora (`https://www.hbxsystem.com.br`) e daqui ele SEMPRE
       falha — CORS na bancada, e a origem certa só existe dentro da WebView.
       Medir a mensagem de erro amarrava o portão à INTERNET da máquina: numa
       resolução de DNS mais lenta o erro chegava depois da leitura e a prova
       ficava verde sem ter medido nada (visto nesta mesma sessão, duas rodadas
       seguidas com resultados diferentes). O fato que interessa é anterior a
       qualquer resposta: QUAL manifesto o app foi buscar. */
    pagina.on('request', (r) => { const u = r.url(); if (u.indexOf('version-') >= 0) manifestos.push(u); });
    await pagina.exposeFunction('__registrarChamada', (linha) => { chamadas.push(linha); });
    await pagina.addInitScript(({ tabela, nega, statusDaRecusa, corpoDaRecusa }) => {
      /* 🔴 O LIVRO DE BORDO DA PONTE FALSA — é ele que aposentou o `waitForTimeout`.
         `emVoo` conta pedido que saiu e ainda não voltou; `respondidas` guarda o
         que já voltou. Com os dois, a prova espera A CONDIÇÃO ("as portas do boot
         responderam e não sobrou nada em voo") em vez de dormir e torcer. E
         `segurar`/`presas` deixam a prova PARAR uma resposta de propósito: é
         assim que se mede uma guarda de reentrância sem corrida — o verbo fica
         de verdade em voo enquanto os outros dois toques acontecem. */
      window.__voo = { emVoo: 0, respondidas: [], segurar: [], presas: [] };
      window.__liberarPresas = () => {
        const soltar = window.__voo.presas.splice(0);
        soltar.forEach((fn) => fn());
        return soltar.length;
      };
      window.HBXAndroid = {
        request(id, method, caminho, corpoDoPedido) {
          window.__registrarChamada(`${method} ${caminho}`);
          const semQuery = String(caminho).split('?')[0];
          const chave = `${method} ${semQuery}`;
          let envelope;
          if (nega.some((prefixo) => semQuery.indexOf(prefixo) === 0)) {
            envelope = { id, status: statusDaRecusa, body: JSON.stringify(corpoDaRecusa) };
          } else if (Object.prototype.hasOwnProperty.call(tabela, chave)) {
            envelope = { id, status: 200, body: JSON.stringify(tabela[chave]) };
          } else {
            envelope = { id, status: 404, body: JSON.stringify({ message: 'rota nao mapeada na prova' }) };
          }
          window.__voo.emVoo += 1;
          const entregar = () => {
            window.__voo.emVoo -= 1;
            window.__voo.respondidas.push(chave);
            window.HBXNative._resolve(JSON.stringify(envelope));
          };
          if (window.__voo.segurar.some((p) => chave.indexOf(p) >= 0)) {
            window.__voo.presas.push(entregar);
            return;
          }
          setTimeout(entregar, 20);
        },
        openWhatsapp(fone, texto) { window.__registrarChamada(`INTENT whatsapp ${fone}`); },
        /* 🔴 OS TRÊS CANAIS QUE A FICHA DO LEAD TROUXE (19/08). Sem eles no
           dublê, tocar em "Ligar" ou "E-mail" na prova cairia no `catch` da
           ponte e a medida diria "sem destino" com o app perfeito. O que
           registram é o ARGUMENTO, porque é ele que a prova mede: número
           CRU no discador (o formatado abre o teclado com parênteses) e
           e-mail inteiro no mailto. */
        openCall(fone) { window.__registrarChamada(`INTENT call ${fone}`); },
        openEmail(para, assunto, corpo) { window.__registrarChamada(`INTENT email ${para}`); },
        openMaps(lat, lng, endereco) { window.__registrarChamada(`INTENT maps ${endereco}`); },
        appInfo() {
          return JSON.stringify({
            mode: 'vendas', versionName: 'beta1', versionCode: 9, platform: 'android',
            sessionScope: 'aa11bb22cc33', offlineRouteSupported: false,
            webBaseUrl: 'https://www.hbxsystem.com.br',
          });
        },
      };
    }, { tabela: SERVIDOR_FALSO, nega: recusar, statusDaRecusa: status, corpoDaRecusa: corpo });

    await pagina.goto(`http://127.0.0.1:${porta}/index.html`);
    await esperarPouso(pagina);
    return { pagina, erros, avisos, chamadas, manifestos };
  }

  /* ==========================================================================
     AS ESPERAS — todas por CONDIÇÃO, nenhuma por relógio.

     🔴 O QUE ISTO CONSERTA (19/08). O pouso era `waitForFunction(barra existe)`
     + `waitForTimeout(600)`: dormir um tempo fixo e APOSTAR que a carga tinha
     terminado. Em 3 de 12 rodadas a aposta perdia e a prova reprovava sozinha,
     sempre no mesmo lugar — o 403 de módulo com `quedaMotivo` vazio, a tela
     ainda dizendo "Não consegui carregar" e o aviso saindo DUPLICADO (os dois
     blocos do Funil desenham o "Tentar de novo" enquanto o motivo não chegou).
     Nada disso era defeito do app: era a prova medindo antes da hora.

     🔴 E POR QUE UM TETO GENEROSO NÃO É "SÓ UM TIMEOUT MAIOR": o teto só existe
     pra prova morrer com recado em vez de pendurar. Quem manda no tempo real é a
     condição — numa máquina lenta ela espera o quanto precisar, e numa rápida
     não paga um milissegundo a mais.
     ========================================================================== */
  const TETO = 25000;

  /** as três portas que TODA abertura abre — inclusive a que vai levar 403. */
  const PORTAS_DO_BOOT = ['GET /modules/me', 'GET /vendas/board', 'GET /vendas/report'];

  /** o app POUSOU: as portas do boot responderam, nada mais está em voo, o seam
   *  do Funil saiu do esqueleto e a camada VIVA é a que tem a barra (é ela que
   *  a prova mede — medir uma camada que ainda não é a de cima lê a tela errada). */
  async function esperarPouso(pag) {
    await pag.waitForFunction((portas) => {
      const v = window.__voo;
      if (!v || v.emVoo > 0) return false;
      if (!portas.every((p) => v.respondidas.indexOf(p) >= 0)) return false;
      /* 🔴 `DADOS` É UM `const` DE SCRIPT, NÃO UMA PROPRIEDADE DE `window` —
         `window.DADOS` vem `undefined` e a espera nunca fecharia. O nome nu
         resolve pelo escopo léxico global, que é onde o mock o declarou. */
      const d = typeof DADOS === 'undefined' ? null : DADOS;
      if (!d || !d.vendas || !d.ajustes) return false;
      if (d.vendas.carregando || d.vendas.placarCarregando) return false;
      const camadas = document.querySelectorAll('#app .tela');
      const viva = camadas[camadas.length - 1];
      return !!(viva && viva.querySelector('.nav button.on'));
    }, PORTAS_DO_BOOT, { timeout: TETO });
  }

  /** o módulo `alvo` está NA FRENTE, já respondido (nada em voo) e fora do esqueleto. */
  async function esperarModulo(pag, alvo) {
    await pag.waitForFunction((k) => {
      const v = window.__voo;
      if (!v || v.emVoo > 0) return false;
      const camadas = document.querySelectorAll('#app .tela');
      const viva = camadas[camadas.length - 1];
      const b = viva && viva.querySelector('.nav button.on');
      if (!b || b.dataset.nav !== k) return false;
      const d = typeof DADOS === 'undefined' ? null : DADOS[k];
      if (d && (d.carregando || d.placarCarregando)) return false;
      return true;
    }, alvo, { timeout: TETO });
  }

  /** a peça está desenhada na camada viva e não sobrou pedido em voo. */
  async function esperarPeca(pag, seletor) {
    await pag.waitForFunction((s) => {
      const v = window.__voo;
      if (!v || v.emVoo > 0) return false;
      const camadas = document.querySelectorAll('#app .tela');
      const viva = camadas[camadas.length - 1];
      return !!(viva && viva.querySelector(s));
    }, seletor, { timeout: TETO });
  }

  /** o SEAM (a memória que a casca lê pra desenhar) recebeu o valor esperado.
   *  É a régua certa pro que passa por respiro de digitação: o campo escreve no
   *  seam depois de 180 ms parados, e é o seam que manda na pintura. */
  async function esperarSeam(pag, secao, campo, valor) {
    await pag.waitForFunction(({ s, c, v }) => {
      const d = typeof DADOS === 'undefined' ? null : DADOS[s];
      if (!d) return false;
      return String(d[c] == null ? '' : d[c]) === v;
    }, { s: secao, c: campo, v: String(valor) }, { timeout: TETO });
  }

  const camadaViva = `(() => {
    const c = document.querySelectorAll('#app .tela');
    return c[c.length - 1];
  })()`;

  const { pagina, erros, avisos, chamadas, manifestos } = await abrirApp();

  const medida = await pagina.evaluate(() => {
    const camadas = document.querySelectorAll('#app .tela');
    const viva = camadas[camadas.length - 1];
    const txt = (s) => Array.from(viva.querySelectorAll(s)).map((e) => e.textContent.trim());
    return {
      telaAtual: (viva.querySelector('.nav button.on') || {}).dataset ? viva.querySelector('.nav button.on').dataset.nav : '',
      botoesDaBarra: txt('.nav button span'),
      nomesDosCards: txt('.cli strong'),
      chips: txt('.chips .chip'),
      selos: txt('.cli .tag'),
      toques: txt('.cli .rgt small'),
      rodape: txt('.sum .c'),
      placar: txt('.kpi'),
      subtitulo: (viva.querySelector('.screen-head p') || {}).textContent || '',
      corpoInteiro: viva.textContent,
    };
  });

  conferir(medida.telaAtual === 'vendas', `o app tinha que abrir no FUNIL, abriu em "${medida.telaAtual}"`);
  conferir(medida.nomesDosCards.some((n) => n.includes('Mercado Sao Jorge')),
    `o funil tinha que mostrar o lead REAL; achei ${JSON.stringify(medida.nomesDosCards)}`);
  conferir(!medida.corpoInteiro.includes('Empresa 1'), 'a DEMONSTRAÇÃO ("Empresa 1") continua na tela');
  conferir(!medida.corpoInteiro.includes('90000-000'), 'telefone de demonstração continua na tela');
  /* 🔴 AS DUAS METADES DA RÉGUA DE MÓDULO, NA MESMA MEDIDA:
     · `webscraping: accessible:false` (chave real, rota-gateada) TIRA o Radar;
     · `empresas` AUSENTE (o que o servidor manda pra empresa sem post-it) NÃO
       tira nada — ausente é "não sei", e não-sei nunca esconde botão. Sem esta
       segunda linha um deploy pela metade (catálogo antigo, migration pendente)
       apagaria módulos inteiros da barra de todo mundo, calado. */
  conferir(!medida.botoesDaBarra.includes('Radar'),
    `o módulo desligado pelo servidor tinha que sumir da barra; achei ${JSON.stringify(medida.botoesDaBarra)}`);
  conferir(medida.botoesDaBarra.includes('Empresas'),
    `a chave AUSENTE no /modules/me tinha que continuar LIGADA; achei ${JSON.stringify(medida.botoesDaBarra)}`);
  conferir(medida.botoesDaBarra.includes('Vendas') && medida.botoesDaBarra.includes('Ajustes'),
    'a barra perdeu botão que não podia perder');

  console.log('\n===== 1. O FUNIL COM DADO REAL =====');
  console.log('tela ...........', medida.telaAtual);
  console.log('subtítulo ......', JSON.stringify(medida.subtitulo));
  console.log('chips ..........', JSON.stringify(medida.chips));
  console.log('cards ..........', JSON.stringify(medida.nomesDosCards));
  console.log('selos ..........', JSON.stringify(medida.selos));
  console.log('toques .........', JSON.stringify(medida.toques));
  console.log('placar .........', JSON.stringify(medida.placar));
  console.log('rodapé .........', JSON.stringify(medida.rodape));
  console.log('barra ..........', JSON.stringify(medida.botoesDaBarra));
  console.log('módulos do servidor:', JSON.stringify(MODULOS_DO_SERVIDOR.map((m) => `${m.key}=${m.accessible}`)),
    '· "empresas" nem veio (empresa sem post-it)');

  // ---- 2. a busca local corta a lista sem tocar na rede --------------------
  const antesDaBusca = chamadas.length;
  await pagina.fill('[data-campo="busca-lead"]', 'sao jorge');
  // O campo tem RESPIRO de 180 ms (`busca-lead.espera`): quem diz que a digitação
  // virou filtro é o seam, não o cronômetro — e é o seam que repinta a lista.
  await esperarSeam(pagina, 'vendas', 'busca', 'sao jorge');
  const busca = await pagina.evaluate(() => {
    const c = document.querySelectorAll('#app .tela');
    const v = c[c.length - 1];
    return {
      chip: (v.querySelector('.chips .chip.on') || {}).textContent || '',
      cards: Array.from(v.querySelectorAll('.cli strong')).map((e) => e.textContent.trim()),
    };
  });
  /* 🔴 O BOOT E O POUSO DA ABERTURA SÃO O MESMO EVENTO, separados pela cena de
     entrada. O contador é lido AQUI, ANTES de qualquer navegação da prova: sem o
     `TELA_DE_POUSO` do `10-portao-fontes.js`, todo boot pagava DUAS varreduras de
     240 leads e duas pinturas no quadro mais caro do app. Depois desta linha,
     voltar ao Funil recarrega mesmo — e é pra recarregar. */
  const boardNoBoot = chamadas.filter((c) => c.startsWith('GET /vendas/board')).length;
  console.log('\n/vendas/board no BOOT:', boardNoBoot, '(esperado: 1)');
  conferir(boardNoBoot === 1, `o funil foi lido ${boardNoBoot}x no boot — o TELA_DE_POUSO não segurou`);

  console.log('\n===== 2. BUSCA LOCAL (sem rede) =====');
  console.log('digitei ........ "sao jorge"');
  console.log('cards ..........', JSON.stringify(busca.cards));
  console.log('chip ...........', JSON.stringify(busca.chip.trim()));
  console.log('idas ao servidor durante a busca:', chamadas.length - antesDaBusca);
  conferir(chamadas.length === antesDaBusca, 'a busca foi ao SERVIDOR — ela tem que ser local');
  conferir(busca.cards.length === 1 && busca.cards[0].includes('Sao Jorge'),
    `a busca tinha que sobrar 1 card; sobrou ${JSON.stringify(busca.cards)}`);
  conferir(/2/.test(busca.chip), `o chip tinha que continuar contando o FUNIL (2), veio "${busca.chip.trim()}"`);
  await pagina.fill('[data-campo="busca-lead"]', '');
  await esperarSeam(pagina, 'vendas', 'busca', '');

  // ---- 3. os outros módulos abrem honestos --------------------------------
  const modulos = {};
  for (const alvo of ['radar', 'agenda', 'conversas', 'ajustes']) {
    const existe = await pagina.evaluate((k) => !!document.querySelector(`#app .tela .nav button[data-nav="${k}"]`), alvo);
    if (!existe) { modulos[alvo] = '(fora da barra)'; continue; }
    await pagina.click(`#app .tela .nav button[data-nav="${alvo}"]`);
    await esperarModulo(pagina, alvo);
    modulos[alvo] = await pagina.evaluate(() => {
      const c = document.querySelectorAll('#app .tela');
      const v = c[c.length - 1];
      const t = v.textContent;
      return {
        temDemonstracao: /Empresa \d|Cidade \d|Pessoa \d|90000-000/.test(t),
        temEsqueleto: !!v.querySelector('.esq'),
        temAvisoDeFonte: /Não consegui carregar/.test(t),
        primeiraLinha: (v.querySelector('h2') || {}).textContent || '',
      };
    });
  }
  console.log('\n===== 3. OS OUTROS MÓDULOS =====');
  Object.entries(modulos).forEach(([k, v]) => console.log(`${k.padEnd(11)}`, JSON.stringify(v)));
  Object.entries(modulos).forEach(([k, v]) => {
    if (typeof v === 'object') conferir(!v.temDemonstracao, `o módulo "${k}" ainda mostra DEMONSTRAÇÃO`);
  });
  conferir(modulos.radar === '(fora da barra)',
    'o Radar continuou na barra com `webscraping` desligado pelo servidor');

  // ---- 4. o Ajustes com dado real, e a LEI DO VENDEDOR --------------------
  await pagina.click('#app .tela .nav button[data-nav="ajustes"]');
  /* O índice de Ajustes abre QUATRO portas de uma vez (perfil, créditos,
     whatsapp, módulos, num `allSettled`): esperar "nada em voo" é esperar as
     quatro — inclusive a que responder por último, que é o que o seam mede. */
  await esperarModulo(pagina, 'ajustes');
  const ajustes = await pagina.evaluate(() => {
    const c = document.querySelectorAll('#app .tela');
    const v = c[c.length - 1];
    return {
      linhas: Array.from(v.querySelectorAll('.linha-cfg')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      temChaveDeSom: /Sons e avisos/.test(v.textContent),
      temLinhaDeCreditos: /Créditos/.test(v.textContent),
      // O SEAM, direto: é ele que prova a TRADUÇÃO da ponte, mesmo quando a
      // casca decide não desenhar a linha (é o caso do vendedor, abaixo).
      seam: {
        creditosLinha: DADOS.ajustes.creditosLinha,
        admin: DADOS.ajustes.admin,
        cobranca: DADOS.creditos.cobranca,
        saldo: DADOS.creditos.saldo,
        pacotes: DADOS.creditos.pacotes.length,
        modulosLinha: DADOS.ajustes.modulosLinha,
        sons: DADOS.ajustes.sons,
      },
    };
  });
  console.log('\n===== 4. AJUSTES =====');
  ajustes.linhas.forEach((l) => console.log('  ·', l));
  console.log('seam ...........', JSON.stringify(ajustes.seam));
  console.log('chave de som desenhada?', ajustes.temChaveDeSom, '(esperado: false — o Kotlin do vendas engole setSoundPrefs)');
  console.log('linha de Créditos?     ', ajustes.temLinhaDeCreditos, '(esperado: false — este perfil é VENDEDOR, não audiência de cobrança)');
  conferir(ajustes.linhas.some((l) => l.includes('Jhonatan Vendedor')), 'o perfil real não chegou no índice');
  /* 🔴 A LEI DO VENDEDOR, medida nas duas pontas. O `/credits/me` respondeu a
     face NEUTRA (`leadsDisponiveis`, sem `balance`): a ponte tem que traduzir
     "240 leads" (nunca "240 créditos"), manter `cobranca` em 0 — o interruptor
     do dinheiro — e não inventar pacote nenhum. E a casca, com `admin:0`, não
     desenha a linha de Créditos no índice: o saldo do vendedor aparece onde ele
     gasta (o Radar), não numa porta de cobrança que não é dele. */
  conferir(ajustes.seam.creditosLinha === '240 leads',
    `a linha de créditos tinha que falar a língua do VENDEDOR; veio "${ajustes.seam.creditosLinha}"`);
  conferir(ajustes.seam.cobranca === 0 && ajustes.seam.pacotes === 0,
    `o interruptor do dinheiro tinha que ficar DESLIGADO pro vendedor; veio ${JSON.stringify(ajustes.seam)}`);
  conferir(!ajustes.temLinhaDeCreditos, 'a porta de cobrança apareceu para um VENDEDOR');
  /* 5 módulos na régua da barra (vendas · radar · agenda · conversas ·
     empresas) e o servidor desligou UM (`webscraping`, que é o Radar) — logo,
     4 de 5. A `agenda` conta como ligada porque ela é gateada pelo módulo
     `vendas` no próprio controller do backend, não por chave própria; e
     `empresas`, ausente na resposta, conta como ligada pela régua do "não sei". */
  conferir(ajustes.seam.modulosLinha === '4 de 5',
    `a contagem de módulos não bate com o servidor: "${ajustes.seam.modulosLinha}"`);
  conferir(!ajustes.temChaveDeSom && ajustes.seam.sons === null,
    'a chave de som foi desenhada — ela é um botão morto neste flavor');

  // ---- 4b. o VOLTAR DO ANDROID ------------------------------------------
  /* 🔴 A LISTA DE CAMADAS É A DO MOCK DE **VENDAS** (erro 60 · portão 59 ·
     confirmação 58 · aviso 55 · aula 52) — copiar a do app do motorista traria
     `.chegou-wrap`/`.chat-wrap`, que não existem em tela nenhuma daqui, e poria
     a AULA no topo, quando neste mock ela mora ABAIXO do aviso. */
  const voltar = await pagina.evaluate(async () => {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    /* 🔴 ATÉ A CONDIÇÃO, COM TETO — o mesmo remédio das esperas de fora, aqui
       dentro da página. Dormir 500 ms depois de um `handleBack()` é a mesma
       aposta que fazia esta prova reprovar sozinha; quem sabe que o degrau subiu
       é a TELA, não o relógio. Se a condição nunca acontecer, o teto devolve o
       controle e quem reprova é a asserção lá embaixo — com o estado real na mão. */
    const ate = async (cond, teto = 4000) => {
      const fim = Date.now() + teto;
      while (Date.now() < fim) {
        try { if (cond()) return true; } catch (_) { /* tela no meio de um repinte */ }
        await espera(25);
      }
      return false;
    };
    const tela = () => {
      const c = document.querySelectorAll('#app .tela');
      const b = c[c.length - 1].querySelector('.nav button.on');
      return b ? b.dataset.nav : '(sem barra)';
    };
    const passos = [];
    /* A BARRA continua acesa em "Ajustes" nas duas telas (o Perfil é uma tela de
       DENTRO do módulo), então quem prova o degrau não é ela: é a VOLTA do
       cabeçalho. O Perfil tem `[data-voltar]`; o índice de Ajustes não. */
    const temVolta = () => {
      const c = document.querySelectorAll('#app .tela');
      return !!c[c.length - 1].querySelector('.hdr [data-voltar]');
    };
    // 1. de dentro de uma tela de Ajustes, o Voltar sobe um degrau.
    window.ir('perfil');
    await ate(() => temVolta());
    const antes = `${tela()} · volta no topo: ${temVolta()}`;
    const tratou1 = window.HBXApp.handleBack();
    await ate(() => !temVolta());
    passos.push({ de: 'perfil', tratou: tratou1, antes, aindaTemVolta: temVolta() });
    // 2. no Funil (a casa), o Voltar SAI do app — é o contrato com o Kotlin.
    for (let i = 0; i < 8 && tela() !== 'vendas'; i += 1) {
      const onde = tela();
      window.HBXApp.handleBack();
      await ate(() => tela() !== onde);
    }
    passos.push({ de: 'vendas', tratou: window.HBXApp.handleBack(), foiPara: tela() });
    // 3. com um portão aberto, o Voltar aperta o ESCAPE dele — não sai do app.
    window.portao({
      tom: 'info', ico: 'alert', titulo: 'Portão de prova',
      sub: 'tem escape', acoes: [['Agora não', ''], ['Seguir', 'principal']], classe: 'duas',
    });
    await ate(() => !!document.querySelector('.portao-wrap'));
    const tratou3 = window.HBXApp.handleBack();
    await ate(() => !document.querySelector('.portao-wrap:not(.fechando)'));
    passos.push({ de: 'portão com escape', tratou: tratou3, portaoAindaNaTela: !!document.querySelector('.portao-wrap:not(.fechando)') });
    // 4. portão SEM escape (o obrigatório) ENGOLE o Voltar e continua de pé.
    window.portao({ tom: 'trava', ico: 'lock', titulo: 'Trava', sub: 'sem escape', acoes: [['Seguir', 'principal', false]] });
    await ate(() => !!document.querySelector('.portao-wrap'));
    const tratou4 = window.HBXApp.handleBack();
    /* 🔴 ESTA ESPERA É POR TEMPO DE PROPÓSITO, e é a única do arquivo: aqui se
       prova que NADA acontece. Não existe condição pra esperar quando o certo é
       a tela ficar exatamente como está — o que se dá é um tempo folgado pro
       fechamento aparecer, e ele não pode aparecer. */
    await espera(400);
    passos.push({ de: 'portão SEM escape', tratou: tratou4, portaoAindaNaTela: !!document.querySelector('.portao-wrap') });
    document.querySelectorAll('.portao-wrap').forEach((n) => n.remove());
    return passos;
  });
  console.log('\n===== 4b. VOLTAR DO ANDROID =====');
  voltar.forEach((p) => console.log('  ', JSON.stringify(p)));
  conferir(voltar[0].tratou === true && voltar[0].aindaTemVolta === false,
    `o Voltar de dentro do Perfil tinha que subir um degrau; medi ${JSON.stringify(voltar[0])}`);
  conferir(voltar[1].tratou === false,
    'no Funil o Voltar tinha que devolver false — é o que faz o Android FECHAR o app');
  conferir(voltar[2].tratou === true && voltar[2].portaoAindaNaTela === false,
    'o Voltar tinha que fechar o portão que TEM escape');
  conferir(voltar[3].tratou === true && voltar[3].portaoAindaNaTela === true,
    'o portão SEM escape tinha que ENGOLIR o Voltar e continuar de pé');

  // ---- 4c. O TOQUE NO CARTÃO ABRE A FICHA, E OS CANAIS SAEM DO APP -------
  /* 🔴 A RÉGUA MUDOU EM 19/08, POR ORDEM DO DONO: *"eu quero ver detalhes do
     lead que puxei ao clicar nele, eu clico nele abre conversas, como assim?"*
     O cartão do funil abria a CONVERSA e o app não tinha tela nenhuma do LEAD.
     Agora `abrir-lead` abre a FICHA — e é ela que precisa provar as duas coisas
     que o dono cobrou na mesma frase: que os detalhes aparecem, e que cada
     canal SAI DO APP (WhatsApp, discador, e-mail, mapa) em vez de virar texto
     pra copiar na mão. */
  await pagina.click('#app .tela .nav button[data-nav="vendas"]');
  await esperarModulo(pagina, 'vendas');
  await pagina.click(`#app .tela [data-acao="abrir-lead"][data-lead="${LEAD_DA_CONVERSA}"]`);
  // A ficha pede o `/card`: a fila de canais só existe depois que ele volta.
  await esperarPeca(pagina, '[data-acao="lead-zap"]');
  const naFicha = await pagina.evaluate(() => {
    const camadas = document.querySelectorAll('#app .tela');
    const tela = camadas[camadas.length - 1];
    const texto = tela.textContent.replace(/\s+/g, ' ').trim();
    const canal = (a) => !!tela.querySelector(`[data-acao="${a}"]`);
    return {
      seam: typeof DADOS === 'undefined' ? null : String(DADOS.leadficha && DADOS.leadficha.nome || ''),
      canais: { conversa: canal('lead-conversar'), zap: canal('lead-zap'), liga: canal('lead-ligar'), email: canal('lead-email') },
      linhasDeToque: tela.querySelectorAll('.linha-toque').length,
      temCnpj: /12\.345\.678/.test(texto),
      temOutroFone: /\(19\) 99888-7000/.test(texto),
      temEmail: /contato@saojorge\.com\.br/.test(texto),
      temDono: /Jorge da Silva/.test(texto),
      // O histórico: o TÍTULO do evento é o que a pessoa lê; o payload do
      // enriquecimento é vocabulário de banco e não pode chegar à tela.
      temHistoria: /Enriquecimento social do Radar/.test(texto),
      vazouJson: /radarLeadId|enrichmentStatus|\{"/.test(texto),
    };
  });
  console.log('\n===== 4c. O CARTÃO ABRE A FICHA DO LEAD =====');
  console.log('a ficha ..........', JSON.stringify(naFicha));
  conferir(naFicha.seam === 'Mercado Sao Jorge &amp; Cia',
    `o toque no cartão tinha que abrir a ficha DESTE lead; o seam diz "${naFicha.seam}"`);
  conferir(naFicha.canais.conversa && naFicha.canais.zap && naFicha.canais.liga && naFicha.canais.email,
    `os quatro canais tinham que estar na tela; medi ${JSON.stringify(naFicha.canais)}`);
  conferir(naFicha.temCnpj && naFicha.temOutroFone && naFicha.temEmail && naFicha.temDono,
    'a ficha tinha que mostrar o que só ela sabe: CNPJ, o outro telefone, o e-mail e o dono');
  conferir(naFicha.linhasDeToque >= 3,
    `cada contato tinha que ser um ALVO, não texto; achei ${naFicha.linhasDeToque} linha(s) de toque`);
  conferir(naFicha.temHistoria, 'o histórico do lead tinha que aparecer na ficha');
  conferir(!naFicha.vazouJson,
    'o payload do enriquecimento VAZOU pra tela — JSON cru na cara do vendedor (medido no g15 em 19/08)');

  /* 🔴 CADA CANAL COM O SEU DESTINO, e o número vai CRU. Este é o defeito que
     a foto do dono mostrava: a ficha antiga escrevia "(11) 99900-2928" e
     acabava ali. Aqui o toque tem que virar intent do aparelho. */
  const antesDosCanais = chamadas.length;
  for (const verbo of ['lead-zap', 'lead-ligar', 'lead-email', 'lead-mapa']) {
    await pagina.evaluate((a) => {
      const camadas = document.querySelectorAll('#app .tela');
      const b = camadas[camadas.length - 1].querySelector(`[data-acao="${a}"]`);
      if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, verbo);
  }
  const canais = chamadas.slice(antesDosCanais).filter((c) => c.startsWith('INTENT'));
  console.log('o que saiu do app:', JSON.stringify(canais));
  conferir(canais.some((c) => c === 'INTENT whatsapp 1930001122'),
    `o WhatsApp tinha que receber o número CRU; saiu ${JSON.stringify(canais)}`);
  conferir(canais.some((c) => c === 'INTENT call 1930001122'),
    `o discador tinha que receber o número CRU; saiu ${JSON.stringify(canais)}`);
  conferir(canais.some((c) => c === 'INTENT email contato@saojorge.com.br'),
    `o e-mail do aparelho tinha que abrir no endereço do lead; saiu ${JSON.stringify(canais)}`);
  conferir(canais.some((c) => c.startsWith('INTENT maps') && /Hortolandia/.test(c)),
    `o mapa tinha que abrir no endereço do lead; saiu ${JSON.stringify(canais)}`);

  // ---- 4d. DA FICHA PRA CONVERSA, E O UM TOQUE DO WHATSAPP ---------------
  /* 🔴 O VERBO QUE NÃO TINHA GUARDA. Medido em 19/08: três toques = três
     intents do WhatsApp e três POSTs de `attempt`, e a tela não mudava um pixel
     entre eles. Três carimbos de contato no mesmo lead é a conta que decide se
     a vendedora manda de novo pro mesmo contato frio — a máquina de ban. */
  await pagina.click('#app .tela [data-acao="lead-conversar"]');
  // A conversa abre TRÊS portas (mensagens, ficha, whatsapp-status): a peça que
  // interessa só existe depois que elas voltam.
  await esperarPeca(pagina, '[data-acao="canal-conversa"][data-canal="celular"]');
  // A pílula abre em "Meu WhatsApp" só quando o chip está fora; aqui o chip
  // está no ar, então é o DEDO que escolhe o celular.
  await pagina.click('#app .tela [data-acao="canal-conversa"][data-canal="celular"]');
  await esperarSeam(pagina, 'conversas', 'canal', 'celular');

  const antesDoZap = chamadas.length;
  const alvoZap = '#app .tela [data-acao="abrir-whats-pessoal"]';
  /* 🔴 A CORRIDA QUE FAZIA ESTA MEDIDA MENTIR (19/08). A guarda deste verbo sai
     por RESPOSTA do servidor (`.then` do `attempt`) — nunca por relógio, e está
     certo assim. Só que a ponte falsa respondia em 20 ms: entre o 1º toque e os
     outros dois, a prova lia o estado do botão, o `attempt` voltava, a guarda
     abria, e os toques 2 e 3 caíam num botão JÁ LIVRE. Resultado: 2 intents e 2
     attempts, prova vermelha, app inocente.
     A cura é medir o que a cena diz que mede: os três toques têm que acontecer
     com o verbo EM VOO. Então a prova SEGURA a resposta do `attempt` na mão e só
     solta depois — o que sobra de "espera" aqui é a condição, não o cronômetro. */
  await pagina.evaluate(() => { window.__voo.segurar.push('/attempt'); });
  await pagina.click(alvoZap);
  const durante = await pagina.evaluate((s) => {
    const camadas = document.querySelectorAll('#app .tela');
    const b = camadas[camadas.length - 1].querySelector(s);
    return b ? { texto: b.textContent.trim(), travado: b.disabled === true, ocupado: b.classList.contains('ocupado') } : null;
  }, alvoZap.replace('#app .tela ', ''));
  /* Os dois toques que a pessoa dá enquanto o app não trocou de tela, e eles
     medem guardas DIFERENTES de propósito:
       · o 2º é o DEDO no vidro (clique de verdade) — quem o barra é o `disabled`
         que a casca desenhou no mesmo quadro do 1º toque;
       · o 3º é um evento SINTÉTICO, que atravessa o `disabled` e chega ao
         ouvinte da ponte — quem o barra é o `if (ocupadoCel) return`, o cinto
         atrás do suspensório. Sem este terceiro toque a prova só mediria o
         atributo do botão, e a guarda de verdade ficaria sem régua. */
  const toque2 = await pagina.locator(alvoZap).last().click({ force: true, timeout: 4000 })
    .then(() => 'clique de verdade entregue').catch((e) => `clique recusado: ${String(e.message).split('\n')[0]}`);
  const toque3 = await pagina.evaluate((s) => {
    const camadas = document.querySelectorAll('#app .tela');
    const b = camadas[camadas.length - 1].querySelector(s);
    if (!b) return '(botão sumiu)';
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return 'evento sintético entregue ao ouvinte da ponte';
  }, alvoZap.replace('#app .tela ', ''));
  const presas = await pagina.evaluate(() => window.__voo.presas.length);
  // Solta o servidor e espera a guarda cair pela porta certa: a RESPOSTA.
  await pagina.evaluate(() => {
    window.__voo.segurar.length = 0;
    return window.__liberarPresas();
  });
  await pagina.waitForFunction(() => {
    const v = window.__voo;
    const d = typeof DADOS === 'undefined' ? null : DADOS.conversas;
    return !!v && v.emVoo === 0 && !!d && !d.enviando;
  }, null, { timeout: TETO });
  const depoisDoZap = chamadas.slice(antesDoZap);
  const intents = depoisDoZap.filter((c) => c.startsWith('INTENT whatsapp')).length;
  const attempts = depoisDoZap.filter((c) => c.indexOf('/attempt') >= 0).length;
  console.log('\n===== 4d. "ABRIR NO MEU WHATSAPP" — 3 TOQUES =====');
  console.log('durante o 1º toque:', JSON.stringify(durante));
  console.log('2º toque .........:', toque2);
  console.log('3º toque .........:', toque3);
  console.log('respostas seguradas na mão durante os 3 toques:', presas, '(esperado 1: o `attempt` do 1º)');
  console.log('o que saiu .......:', JSON.stringify(depoisDoZap));
  console.log(`intents: ${intents} (esperado 1) · attempts: ${attempts} (esperado 1)`);
  conferir(presas === 1,
    `os 3 toques tinham que acontecer com o verbo EM VOO; o servidor falso ficou com ${presas} resposta(s) na mão`);
  conferir(intents === 1, `3 toques abriram o WhatsApp ${intents}x — a guarda de reentrância não pegou`);
  conferir(attempts === 1, `3 toques carimbaram ${attempts} tentativas no mesmo lead`);
  conferir(!!durante && durante.travado && /Abrindo/.test(durante.texto),
    `o botão tinha que MOSTRAR que pegou o toque; medi ${JSON.stringify(durante)}`);

  /* 🔴 O "ABRIR FICHA" DA CONVERSA ERA UM PORTÃO DE LEITURA — e era o defeito
     da foto: quatro telefones e dois e-mails escritos como TEXTO, sem um botão
     pra ligar. Agora ele abre a mesma TELA do cartão, e a medida é essa: a
     ficha em pé, com os canais no lugar. */
  const ficha = await pagina.evaluate(async () => {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const viva = () => { const c = document.querySelectorAll('#app .tela'); return c[c.length - 1]; };
    const b = viva().querySelector('[data-acao="abrir-ficha-lead"]');
    if (!b) return { achou: false };
    b.click();
    const fim = Date.now() + 4000;
    while (Date.now() < fim && !viva().querySelector('[data-acao="lead-ligar"]')) await espera(25);
    const tela = viva();
    const texto = tela.textContent.replace(/\s+/g, ' ').trim();
    return {
      achou: true,
      abriu: !!tela.querySelector('[data-acao="lead-ligar"]'),
      portaoVelho: !!document.querySelector('.portao-wrap'),
      texto,
    };
  });
  console.log('\n===== 4e. "ABRIR FICHA" DA CONVERSA ABRE A TELA =====');
  console.log('ficha ..........', JSON.stringify({ achou: ficha.achou, abriu: ficha.abriu, portaoVelho: ficha.portaoVelho }));
  conferir(ficha.achou, 'a casca não desenhou o "Abrir ficha" na conversa');
  conferir(ficha.abriu, 'o "Abrir ficha" tinha que abrir a TELA da ficha, com os canais');
  conferir(!ficha.portaoVelho, 'o portão de leitura tinha que estar morto — quem manda agora é a tela');
  conferir(/12\.345\.678/.test(ficha.texto) && /\(19\) 99888-7000/.test(ficha.texto),
    `a ficha tinha que mostrar o que só ela sabe (CNPJ e o outro telefone); veio "${ficha.texto}"`);

  // ---- 4e. O RADAR NÃO ESCREVE PREÇO QUE O SERVIDOR NÃO DISSE -------------
  /* 🔴 O Radar está FORA da barra nesta cena (o servidor desligou `webscraping`),
     então a medida do preço é feita direto no seam + no desenho da tela: é o
     `custoPuxar` vazio que tem que deixar o botão MUDO. Antes de 19/08 a casca
     tinha `d.custoPuxar||'1 créd.'` cravado, e o aparelho anunciava um preço que
     nenhuma resposta de servidor sustentava. */
  const preco = await pagina.evaluate(() => {
    const medir = (custoPuxar) => {
      usarDados('radar', {
        carregando: false, semFonte: false, custoPuxar, saldo: '240',
        lista: [{ id: 'r-1', ini: 'AB', nome: 'Agua Boa Distribuidora', onde: 'Valinhos · SP', zap: 1 }],
      });
      // Pelo DOM, nunca por regex no HTML: "Puxar" aparece três vezes na tela
      // (o subtítulo, o aviso e o botão) e casar a primeira mede a errada.
      const caixa = document.createElement('div');
      caixa.innerHTML = T.radar.render();
      const b = caixa.querySelector('[data-acao="puxar-lead"]');
      const aviso = Array.from(caixa.querySelectorAll('.banner.alerta'))
        .map((n) => n.textContent.replace(/\s+/g, ' ').trim())
        .find((t) => t.indexOf('Puxar cobra') >= 0) || '';
      return {
        botao: b ? b.textContent.replace(/\s+/g, ' ').trim() : '(sem botão)',
        temCusto: !!(b && b.dataset.custo),
        aviso,
        kpiDePreco: !!Array.from(caixa.querySelectorAll('.kpi')).find((n) => /por empresa puxada/.test(n.textContent)),
      };
    };
    const semPreco = medir('');
    // E a outra metade: quando o servidor UM DIA informar, o número aparece nos
    // três lugares. O slot continua vivo — o que saiu foi o palpite.
    const comPreco = medir('2 créd.');
    usarDados('radar', { custoPuxar: '' });
    return { semPreco, comPreco };
  });
  console.log('\n===== 4f. O PREÇO DO BOTÃO QUE COBRA =====');
  console.log('sem preço do servidor (é o caso de HOJE):');
  console.log('  botão ....', JSON.stringify(preco.semPreco.botao), '· data-custo:', preco.semPreco.temCusto);
  console.log('  aviso ....', JSON.stringify(preco.semPreco.aviso));
  console.log('  KPI de preço desenhado?', preco.semPreco.kpiDePreco, '(esperado false)');
  console.log('com preço do servidor (o dia em que houver porta):');
  console.log('  botão ....', JSON.stringify(preco.comPreco.botao));
  console.log('  aviso ....', JSON.stringify(preco.comPreco.aviso));
  conferir(preco.semPreco.botao === 'Puxar',
    `sem preço do servidor o botão tinha que dizer só o verbo; veio "${preco.semPreco.botao}"`);
  conferir(!preco.semPreco.temCusto && !preco.semPreco.kpiDePreco,
    'a tela do Radar ainda carrega um preço que o servidor não informou');
  conferir(preco.semPreco.aviso.indexOf('crédito') >= 0 && !/\d/.test(preco.semPreco.aviso),
    `o aviso tinha que dizer que cobra SEM número; veio "${preco.semPreco.aviso}"`);
  conferir(preco.comPreco.botao === 'Puxar · 2 créd.' && preco.comPreco.aviso.indexOf('2 créd.') >= 0,
    `com preço do servidor os três lugares têm que escrevê-lo; medi ${JSON.stringify(preco.comPreco)}`);

  console.log('\n===== 5. O QUE O APP PEDIU AO SERVIDOR =====');
  chamadas.forEach((c) => console.log('  →', c));

  // ---- 6. O 403 DE MÓDULO NA TELA DE POUSO -------------------------------
  /* 🔴 A CENA DE 18/08, REPRODUZIDA. O cliente 46 pareou o aparelho, o módulo
     Vendas estava desligado desde o cadastro e ele levou 39 respostas 403
     MODULE_ACCESS_DENIED em 65 segundos — porque a tela dizia "Não consegui
     carregar · Sem resposta do servidor agora" e oferecia "Tentar de novo", que
     ali é o botão que bate na mesma porta trancada. Esta é a tela em que o app
     POUSA: é a primeira coisa que um cliente novo vê. */
  const cena403 = await abrirApp({ recusar: ['/vendas'] });
  const trancada = await cena403.pagina.evaluate(() => {
    const c = document.querySelectorAll('#app .tela');
    const v = c[c.length - 1];
    return {
      texto: v.textContent.replace(/\s+/g, ' ').trim(),
      quedaMotivo: DADOS.vendas.quedaMotivo,
      temTentarDeNovo: !!v.querySelector('[data-acao="recarregar-funil"], [data-acao="recarregar-placar"]'),
      verbos: Array.from(v.querySelectorAll('.vazio button')).map((b) => b.textContent.trim()),
    };
  });
  console.log('\n===== 6. O 403 DE MÓDULO NA TELA DE POUSO =====');
  console.log('quedaMotivo no seam:', JSON.stringify(trancada.quedaMotivo), '(esperado "modulo")');
  console.log('verbos oferecidos .:', JSON.stringify(trancada.verbos));
  console.log('diz "não consegui carregar"?', /Não consegui carregar/.test(trancada.texto), '(esperado false)');
  console.log('diz que é MÓDULO? ..........', /não liberou|não liberado/i.test(trancada.texto), '(esperado true)');
  conferir(trancada.quedaMotivo === 'modulo',
    `o 403 de módulo tinha que virar quedaMotivo:"modulo"; veio ${JSON.stringify(trancada.quedaMotivo)}`);
  conferir(/administrador/i.test(trancada.texto),
    'a tela não mandou a pessoa falar com o administrador — é a frase que a tira do loop');
  conferir(!/Não consegui carregar/.test(trancada.texto),
    'a tela ainda diz "Não consegui carregar" para um 403 de MÓDULO — cenas opostas, mesma tela');
  conferir(!trancada.temTentarDeNovo,
    'a tela ofereceu "Tentar de novo" para uma porta TRANCADA — é o botão que gerou os 39 toques de 18/08');
  /* 🔴 UMA VEZ, NÃO DUAS. O Funil tem DOIS blocos com bandeiras próprias (o
     placar e a lista) e os dois caem no mesmo 403 — o cartão de módulo saía
     duplicado na mesma rolagem, e frase repetida vira paisagem. */
  conferir(trancada.verbos.length === 1,
    `o aviso de porta trancada apareceu ${trancada.verbos.length}x na mesma tela: ${JSON.stringify(trancada.verbos)}`);
  await cena403.pagina.close();

  /* 🔴 A TERCEIRA CARA, MEDIDA — senão ela é código que ninguém nunca viu.
     Um 401 é o crachá vencido: "Tentar de novo" devolve o mesmo 401 pra sempre,
     e o único caminho que resolve neste app é o parear de novo (o `sair`, que já
     tem confirmação própria). Sem esta cena a régua de sessão seria um ramo
     escrito e nunca renderizado — o tipo de código que apodrece calado. */
  const cena401 = await abrirApp({
    recusar: ['/vendas'],
    status: 401,
    corpo: { message: 'Sessao expirada.' },
  });
  const vencida = await cena401.pagina.evaluate(() => {
    const c = document.querySelectorAll('#app .tela');
    const v = c[c.length - 1];
    return {
      quedaMotivo: DADOS.vendas.quedaMotivo,
      texto: v.textContent.replace(/\s+/g, ' ').trim(),
      verbos: Array.from(v.querySelectorAll('.vazio button')).map((b) => ({
        rotulo: b.textContent.trim(), acao: b.dataset.acao || '', ir: b.dataset.ir || '',
      })),
    };
  });
  console.log('\n===== 6b. O 401 DE SESSÃO NA MESMA TELA =====');
  console.log('quedaMotivo no seam:', JSON.stringify(vencida.quedaMotivo), '(esperado "sessao")');
  console.log('verbo oferecido ...:', JSON.stringify(vencida.verbos));
  conferir(vencida.quedaMotivo === 'sessao',
    `o 401 tinha que virar quedaMotivo:"sessao"; veio ${JSON.stringify(vencida.quedaMotivo)}`);
  conferir(/sessão expirou/i.test(vencida.texto),
    'a tela não disse que a sessão expirou');
  conferir(vencida.verbos.length === 1 && vencida.verbos[0].acao === 'sair',
    `o 401 tinha que oferecer o caminho de sessão que já existe (\`sair\`); veio ${JSON.stringify(vencida.verbos)}`);
  await cena401.pagina.close();

  // ---- 7. A VARREDURA DOS BOTÕES MORTOS ----------------------------------
  const varredura = varrerBotoesSemDono();
  console.log('\n===== 7. TODO BOTÃO DESENHADO TEM DONO? =====');
  console.log(`(${varredura.total} chaves extraídas do mock.js GERADO, conferidas no ponte.js GERADO)`);
  varredura.linhas.forEach((l) => console.log(l));
  console.log('\n  marcas montadas em tempo de pintura — o que a varredura conseguiu LER:');
  varredura.montadas.forEach((m) => {
    console.log(`     mock.js:${m.linha}  data-${m.tipo}="\${${m.expr}}"`);
    console.log(`        → ${m.destinos.length ? JSON.stringify(m.destinos) : '(nenhum destino literal)'}`);
  });
  /* 🔴 A CONTAGEM DO QUE ELA NÃO SOUBE LER VEM SEPARADA E POR EXTENSO. Uma
     varredura que imprime "45 OK" e cala sobre a marca que não conseguiu ler é
     como botão morto atravessa duas revisões: a lista PARECE completa. */
  console.log(`\n  marcas que o leitor de expressões não resolveu sozinho: ${varredura.cegas.length}`);
  varredura.cegas.forEach((c) => {
    console.log(`     mock.js:${c.linha}  ${c.trecho}  →  ${c.estado}`);
    if (c.porque) console.log(`        ${c.porque}`);
  });
  conferir(varredura.orfas.length === 0,
    `botão desenhado SEM DONO na ponte (ou marca ilegível não declarada): ${JSON.stringify(varredura.orfas)}`);

  console.log('\n===== 8. CONSOLE =====');
  /* 🔴 O ERRO DO MANIFESTO É DA BANCADA, NÃO DO APP — e fica SEPARADO em vez de
     escondido. No aparelho a origem é `https://appassets.androidplatform.net` e
     o painel devolve o `Access-Control-Allow-Origin` da WebView; aqui a origem é
     `http://127.0.0.1:<porta>` e o navegador barra o cross-origin antes de sair.
     O que ele prova, de positivo: a ponte procura o manifesto DESTE app
     (`version-vendas.json`), e não o do motorista. */
  const daBancada = erros.filter((e) => e.includes('version-vendas.json') || e.includes('ERR_FAILED'));
  const deVerdade = erros.filter((e) => !daBancada.includes(e));
  console.log('erros do app ...', deVerdade.length ? JSON.stringify(deVerdade, null, 2) : '0');
  console.log('erros da bancada (CORS do manifesto, esperado):', daBancada.length);
  console.log('avisos .........', avisos.length ? JSON.stringify(avisos, null, 2) : '0');
  console.log('manifesto procurado:', JSON.stringify(manifestos));
  conferir(deVerdade.length === 0, `console com ${deVerdade.length} erro(s) do app`);
  /* 🔴 "AÇÃO SEM DONO" NÃO É UM AVISO QUALQUER — é o grito do `D0` para um botão
     morto que o dedo encostou. Ele reprova aqui do mesmo jeito que a varredura
     estática reprova: um pega o que foi tocado, o outro pega o que foi desenhado. */
  conferir(!avisos.some((a) => a.includes('ação sem dono')),
    `o console gritou "ação sem dono": ${JSON.stringify(avisos.filter((a) => a.includes('ação sem dono')))}`);
  conferir(manifestos.some((u) => u.includes('version-vendas.json')),
    `a ponte não procurou o manifesto DESTE app (version-vendas.json); pediu ${JSON.stringify(manifestos)}`);
  conferir(!manifestos.some((u) => u.includes('version-logistica.json')),
    'a ponte do VENDAS está procurando o manifesto do MOTORISTA');

  console.log('\n===== RESULTADO =====');
  if (falhas.length) {
    falhas.forEach((f) => console.log('  ❌', f));
    console.log(`\nREPROVADO: ${falhas.length} falha(s).`);
  } else {
    console.log('  ✅ TODAS AS MEDIDAS PASSARAM');
  }

  await navegador.close();
  servidor.close();
  process.exit(falhas.length ? 1 : 0);
})();
