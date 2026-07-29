# PR29072026 — MODO PASSEIO: bateria de testes + HANDOFF (Codex finaliza)

Atualizado 29/07 ~15:35 depois do teste ao vivo no g15. O dono reprovou o
VISUAL do balão do pino ("ficou horrível") e mandou parar — **o Codex assume
daqui**. Este arquivo é o estado real: o que está no ar, o que foi provado na
tela, o que está feio/quebrado, e a bateria pra fechar.

## Estado do código (29/07 fim de tarde)

| Peça | Estado |
|---|---|
| Backend passeio (débito `passeio_tour` 2 idempotente por tourId, gate admin×`passeioEquipe`, `GET /logistica/geo/busca` proxy Nominatim) | **EM PROD** (publishes `9829568d` 13:57 e `9780849a` 15:17) |
| OSRM self-host (`hbx-osrm`, Sudeste, `172.18.0.1:5000`, `OSRM_BASE_URL` no backend/.env) | **EM PROD**, smoke ok de dentro do hbx-backend |
| CORRIGIR-O-LIXO S1-S3 (pele da Rota: busca + mapa + pino por toque + balão + cartão do tour + alarme nativo `PasseioAlarme.kt`) | no master (varrido pro ar pelo publish `9780849a`); **APK publicado contém isso SEM os escudos abaixo** |
| Escudos anti-clique-fantasma (confirmações do passeio + clique do mapa) | commit **`845e5fa9`** LOCAL — precisa ir no próximo publish |
| g15 | **versionCode 100 instalado por cabo** (build local = master + escudos). Publish que gerar ≤100 não oferta update |
| v1 reprovada (lista de roteiros → modais de nome) | MORTA — zero referência no código (varrido; plano em `PR29072026-CORRIGIR-O-LIXO.md`) |

## ✅ Já PROVADO na tela do g15 (29/07, screenshots na sessão)

- Ajustes → seção **Passeio** (linha "Modo passeio" + chave "Liberar para a equipe").
- Tocar "Modo passeio" → **pele da Rota**: hero fica, nav some, busca + mapa
  grande + "Iniciar passeio ›" + **ícone verde à direita no hero** (modo trabalho).
- **Toque no mapa = pino numerado na hora** (sem formulário) + CTA acende +
  "Limpar (N)".
- Modo **persiste** (sobreviveu a reinstalação do APK; tour ativo religa a pele
  no boot e re-agenda o alarme).
- Balão do pino abre com nome + chips 15/30/45/60m + Remover — **FUNCIONA mas o
  dono REPROVOU o visual** (ver pendência nº1).
- Cartão do tour ("INDO PARA … · km · Navegar · Cheguei · ✕") apareceu vivo com
  o tour residual da v1.

## 🔴 PENDÊNCIAS PRO CODEX (em ordem)

1. **Balão do pino ficou horrível (veredito do dono).** O input de nome
   auto-foca e o TECLADO SOBE inteiro em cima do mapa. Redesenhar: chips
   primeiro, nome SEM autofocus (teclado só se o usuário tocar no campo),
   moldura no padrão `hbx-balao` do app. Lei 8: zero texto extra.
2. **Toque no mapa às vezes vira zoom e engole o pino** (double-tap do
   maplibre com o clique duplicado do WebView). Sugestão: `doubleClickZoom:
   false` no construtor do mapa do passeio (`mountPasseioMap`).
3. **Mistério em aberto: o modo caiu pro trabalho SOZINHO 1×** entre dois
   toques (~60s, zero input; a tela virou Rota de trabalho e um toque abriu o
   Gerenciador). Não reproduzido depois. Vigiar; se voltar, suspeitar de
   reload do WebView × cache `passeio-modo` e instrumentar.
4. **Clique fantasma**: escudos em `845e5fa9` (confirmações com `abertaEm`
   <450ms não aceitam; mapa ignora clique com confirmação aberta). Re-testar
   Encerrar/Limpar com eles instalados (o incidente: confirmação aceita
   invisível + pino nascendo sozinho).
5. **Não testados no aparelho ainda**: busca (campo → resultados → vira pino;
   backend + fallback Nominatim direto), linha OSRM entre 2+ pinos, fluxo
   completo do tour na pele nova (Cheguei → countdown → +15 → alarme de tela
   apagada → Próximo → Concluir), funcionário com/sem chave.
6. ⚠️ **Iniciar passeio DEBITA 2 CRÉDITOS REAIS** (o aparelho loga na empresa
   real do dono). Testar débito com consciência; débito não estorna.
7. S4 do plano (roteiros salvos discretos) — só depois do dono aprovar S1-S3.

## Pré-condições da bateria

- [ ] P1. `npm run publish` levando `845e5fa9` (+ o que o Codex fizer). Fim do log: `[apk] fontes MUDARAM`, containers Up.
- [ ] P2. 🔴 versionCode do publish **≥101** (g15 está com 100 por cabo) — senão instalar por cabo.
- [ ] P3. Backend de pé (docker ps + logs — build verde ≠ boot ok).
- [ ] P4. Crédito na carteira da empresa de teste.

## Bloco A — backend/comercial

- [ ] A1. /master lista "Modo Passeio (por passeio iniciado)" (débito 2, editável; trocar custo vale no próximo iniciar sem deploy).
- [ ] A2. `GET /logistica/config` devolve `passeioEquipe` (default false).
- [ ] A3. Funcionário sem chave: `POST /logistica/passeio/iniciar` → 403 humano (gate é do servidor).
- [ ] A4. Iniciar (admin) → 1 débito de 2 no extrato com `tourId` na metadata.
- [ ] A5. Repetir o POST com o MESMO tourId → nenhum débito novo (idempotência).
- [ ] A6. Carteira zerada → 402 `PASSEIO_INDISPONIVEL`, ledger limpo.
- [ ] A7. `GET /logistica/geo/busca?q=catedral` → `{items:[…]}` (flag `HBX_GEO_SERVER_ENABLED` ON; OFF → items vazio e o app cai no Nominatim direto).
- [ ] A8. `hbx-osrm` Up; rota calculada pelo app aparece no `docker logs hbx-osrm` (ninguém mais fala com o demo público).

## Bloco B — APK no g15 (a CENA do CORRIGIR-O-LIXO)

Receitas do hbxapk valem (toque = `input touchscreen swipe X Y X Y 120`;
long-press = 1100; screenshot 1080x2400, Read 900x2000 → ×1,2).

- [x] B1. Ajustes: seção Passeio (linha + chave equipe). *(provado 29/07)*
- [x] B2. "Modo passeio" → pele: hero + busca + mapa + CTA + ícone à direita; nav some. *(provado)*
- [x] B3. Toque no mapa = pino na hora, sem formulário; CTA acende; "Limpar (N)". *(provado; ver pendências 2)*
- [x] B4. Modo persiste (reabrir app / reinstalar). *(provado)*
- [ ] B5. Balão do pino REDESENHADO: sem teclado automático; chips trocam o tempo; Remover remove; nome opcional salva ao digitar.
- [ ] B6. Segurar o pino (Lei 1) → vermelho progressivo → remove.
- [ ] B7. Busca: digitar + Enter → lista curta → tocar → vira pino nomeado + câmera vai até ele.
- [ ] B8. 2+ pinos → linha pelas RUAS (OSRM nosso); modo avião → linha reta.
- [ ] B9. "Iniciar passeio ›" debita (A4) → cartão "Indo para" com distância ao vivo.
- [ ] B10. "Navegar" abre Waze/Maps com o destino.
- [ ] B11. "Cheguei" (e auto-chegada <80 m com accuracy ≤120) → countdown no cartão + voz.
- [ ] B12. 🔴 Alarme com TELA APAGADA: 2 min, apagar tela → notificação com SOM DE ALARME no horário; tocar abre o app.
- [ ] B13. "+15" re-agenda; countdown zerado com app aberto → som + voz + "Hora de ir".
- [ ] B14. "Próximo ›" avança; último = "Concluir" → cartão some, pinos CONTINUAM no mapa.
- [ ] B15. ✕ do cartão → confirmação "Encerrar passeio?" APARECE (escudo `845e5fa9`) e só encerra no botão.
- [ ] B16. "Limpar (N)" → confirmação aparece e limpa só ao confirmar.
- [ ] B17. Ícone à direita → volta pro trabalho NA HORA; reabrir modo → tudo como estava. Voltar físico = mesma coisa (tour segue vivo).
- [ ] B18. Matar o app no meio do countdown → reabrir → cai na pele, no cartão certo; alarme ainda toca.
- [ ] B19. Funcionário: chave OFF → sem seção Passeio (e servidor nega); ON → fluxo inteiro.

## Bloco C — REGRESSÃO (nada pode ter piorado)

- [ ] C1. Fluxo de entrega completo intocado (montar → conferir → aceitar → entregar → encerrar).
- [ ] C2. Mapa da Rota não pisca: Rota→abas→Rota e Rota→passeio→trabalho (garagem viva; o passeio nunca rouba o mapa da Rota).
- [ ] C3. Swipe troca as 4 abas como antes; dentro da pele NÃO troca.
- [ ] C4. Ajustes antigos intactos; sons/voz da navegação de entrega intactos.
- [ ] C5. Confirmações ANTIGAS do app (excluir cliente, encerrar rota…) continuam aceitando normal (o escudo só cobre as que têm `abertaEm`).
- [ ] C6. Tema claro/escuro legível na pele (tokens).
- [ ] C7. Flavor vendas builda (native.js mudou: botão pss-modo-sair no frame).
- [ ] C8. Suíte: `logistica-passeio.service.test.js` (7) + `test:credits` + config (48) + billing (149) — todos verdes em 29/07; re-conferir pós-merge. Vermelho pré-existente conhecido: check-pele R1/R2 no kit.css do frontend.

## Referências

- Plano/cena: `docs/PLANEJAMENTOS/PR29072026-CORRIGIR-O-LIXO.md`.
- Código: bloco "MODO PASSEIO — CORRIGIR-O-LIXO" no fim de
  `EntregaShell/app/src/logistica/assets/app/app.js`; `PasseioAlarme.kt`;
  `passeioSettingsSection`; botão do hero em `native.js` (frame);
  backend em `logistica-passeio.service.ts` + `logistica-geo.service.ts`.
- Fica pra depois COM moradia: F3 descoberta de lugares (OSM+RFB/CNAE),
  F4 offline PMTiles, F0 snap-to-route da entrega, plano Valhalla (perfil a
  pé/isócronas) — seções no CORRIGIR-O-LIXO e neste arquivo.
