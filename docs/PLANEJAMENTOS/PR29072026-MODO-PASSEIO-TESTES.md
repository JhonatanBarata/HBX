# PR29072026 — MODO PASSEIO: bateria de testes (para execução por outra IA)

Implantado em 29/07/2026. ⚠️ Estado do deploy: o **BACKEND já está EM PROD** —
o publish do dono às 13:57 (`9829568d`) levou junto (migration `passeioEquipe`
incluída). O **APK ainda é LOCAL** (app.js/css/native.js/Kotlin/manifest) e
**AGUARDA O PRÓXIMO PUBLISH**. Este arquivo é o roteiro de verificação:
executar na ordem, marcar cada `[ ]`, e devolver o arquivo preenchido com
veredito + evidência (1 linha por check).

## O que foi implantado (mapa rápido)

| Peça | Onde |
|---|---|
| Ação de crédito `passeio_tour` (débito 2, editável no /master) | `backend/src/credits/credit-action-catalog.ts` |
| Flag `passeioEquipe` (coluna + migration + DTO + config) | `backend/prisma/...20260729150000_passeio_equipe`, `logistica-config.service.ts` |
| `POST /logistica/passeio/iniciar` (gate admin×equipe, débito idempotente por tourId, 402/403 humanos) | `logistica-passeio.service.ts` + controller |
| Tela única Modo Passeio (lista→editor→tour), casca escondida, mapa próprio, linha OSRM | `EntregaShell/.../logistica/assets/app/app.js` (bloco "MODO PASSEIO") |
| Alarme NATIVO do tempo-no-lugar (AlarmManager + notificação com som de alarme) | `PasseioAlarme.kt` + ponte `passeioAlarme`/`passeioAlarmeCancelar` + manifest |
| Entrada em Ajustes + chave admin "Liberar para a equipe" | `settingsScreen` → `passeioSettingsSection` |

Regra desta entrega: **nada pode atrapalhar o que funciona hoje** — por isso o
bloco C (regressão) é obrigatório, não opcional.

## Pré-condições

- [ ] P1. `npm run publish` pra levar o APK (o backend já subiu no publish de 13:57; este leva EntregaShell). Conferir o FIM do log: `[apk] fontes MUDARAM`, containers Up, commit do publish.
- [ ] P2. 🔴 **versionCode do log ≥ 99** — o moto g15 do dono está com 98 instalado à mão; publish que gerar ≤98 NÃO oferta update (instalar por cabo se preciso).
- [ ] P3. Migration aplicada: `node scripts/vps-run.js "docker exec hbx-postgres psql -U postgres -d hbx -c '\\d \"LogisticaConfig\"'" ` contém `passeioEquipe`.
- [ ] P4. Backend de pé pós-publish (build verde ≠ boot ok): `docker ps` + logs sem crash-loop.
- [ ] P5. Testar com o login de teste/empresa de teste (`.test-login.local.md`); crédito suficiente na carteira (o iniciar debita 2 por padrão).

## Bloco A — backend/comercial

- [ ] A1. `/master` → painel de créditos: ação **"Modo Passeio (por passeio iniciado)"** listada, custo 2, modo débito, custo EDITÁVEL (o dono muda sozinho — lei "dono controla dinheiro sozinho no /master").
- [ ] A2. `GET /logistica/config` (admin) devolve `passeioEquipe: false` por default.
- [ ] A3. Funcionário (papel USER) SEM liberação: `POST /logistica/passeio/iniciar` → **403** "O Modo passeio não está liberado para a equipe. Fale com o administrador." (gate é do SERVIDOR, não da tela).
- [ ] A4. Admin inicia passeio → extrato mostra **1 débito de 2** com actionKey `passeio_tour` e metadata `tourId`.
- [ ] A5. **Idempotência**: repetir o POST com o MESMO `tourId` → 200 e **nenhum débito novo** no ledger (retry de rede não cobra 2×).
- [ ] A6. Carteira zerada → **402** `PASSEIO_INDISPONIVEL`, mensagem neutra (sem valor — LEI DO VENDEDOR), **nada debitado** no ledger.
- [ ] A7. No /master, trocar o custo (ex.: 2 → 1) → próximo iniciar debita o valor novo sem deploy.

## Bloco B — APK no aparelho (moto g15, ADB)

Receitas do hbxlog valem: toque = `input touchscreen swipe X Y X Y 120`,
long-press = `... 1100`, `MSYS_NO_PATHCONV=1`, screenshot 1080x2400 (Read mostra
900x2000 → coordenada ×1,2). Corrigir → **expor a tela corrigida** e só então
perguntar sim/não.

- [ ] B1. Ajustes (admin): seção **Passeio** com a linha "Modo passeio" + chave "Liberar para a equipe". As seções antigas continuam intactas.
- [ ] B2. Chave "Liberar para a equipe" liga/desliga, persiste ao sair e voltar da tela (grava via PATCH /logistica/config).
- [ ] B3. Tocar "Modo passeio" → **tela única**: topbar e bottom-nav SUMIRAM; ✕ volta pro Ajustes; Voltar físico na lista de roteiros → tela Rota (Lei 10).
- [ ] B4. "Novo roteiro" → modal nome → Criar → cai no editor com mapa.
- [ ] B5. **Toque no mapa** abre "Novo lugar" com nome + chips 15/30/45/60 + campo minutos; salvar → pino NUMERADO no mapa.
- [ ] B6. Com 2+ lugares: **linha pelas RUAS** entre os pinos (OSRM do backend). Modo avião → linha RETA (fallback), nunca sem linha.
- [ ] B7. "Marcar onde estou" cria lugar na posição do GPS.
- [ ] B8. ▲▼ reordena e persiste (fechar e reabrir o app mantém a ordem). As setas NÃO armam o hold.
- [ ] B9. **Segurar pressionado** numa linha (lugar ou roteiro) → vermelho progressivo → vibra → confirmação → exclui (Lei 1). O clique fantasma pós-hold NÃO abre a linha.
- [ ] B10. "Iniciar passeio ›" → debita (conferir A4) → vista tour "Indo para <lugar 1>" com distância ao vivo.
- [ ] B11. "Navegar" abre o seletor Waze/Google Maps com o destino certo.
- [ ] B12. "Cheguei" → countdown mm:ss GRANDE contando + voz "Você chegou: X. N minutos aqui."
- [ ] B13. **Auto-chegada**: com mock location (ou a pé) a <80 m do alvo → vira "Você está em" SOZINHO. Fix com accuracy >120 m NÃO dispara.
- [ ] B14. 🔴 **O teste que importa — alarme com tela APAGADA**: lugar com 2 min, "Cheguei", apagar a tela, guardar o celular, esperar. No horário (tolerância ±1 min): **notificação com SOM DE ALARME + vibração**. Tocar nela abre o app.
- [ ] B15. "+15 min" re-agenda: o alarme NÃO toca no horário velho, toca no novo.
- [ ] B16. Countdown zera com o app ABERTO → som + voz "Hora de ir para o próximo lugar: Y" + tela vira "Hora de ir".
- [ ] B17. "Próximo ›" avança (fase volta pra "Indo para"); no último lugar o botão é "Concluir passeio" → tour some, volta pra lista.
- [ ] B18. **Persistência**: matar o app no MEIO do countdown → reabrir → tour continua na fase certa e o alarme ainda toca no horário. Tempo vencido com app fechado → reabrir mostra "Hora de ir".
- [ ] B19. "Encerrar passeio" pede confirmação; roteiro e lugares CONTINUAM salvos; débito NÃO volta (igual rota).
- [ ] B20. Funcionário com chave OFF: seção Passeio NÃO aparece no Ajustes dele. Com chave ON: aparece e o fluxo inteiro funciona.
- [ ] B21. Voltar físico: editor→lista; tour→lista (tour segue vivo — reabrir pelo cartão "Em andamento"); modal aberto → fecha SÓ o modal.

## Bloco C — REGRESSÃO (a regra do dono: nada pode ter piorado)

- [ ] C1. Fluxo de entrega completo intocado: montar rota → conferência → aceitar → entregar → encerrar (empresa de teste).
- [ ] C2. **Mapa da Rota não pisca**: Rota→Clientes→Rota (garagem viva, sem "Carregando mapa…"); e Rota→Ajustes→Passeio→voltar→Rota idem — o passeio NUNCA rouba o mapa da Rota.
- [ ] C3. Swipe lateral troca as 4 abas normais como antes; DENTRO do passeio o swipe NÃO troca de tela (exclusão `.pss-screen` no shell).
- [ ] C4. Ajustes: Avisar chegada, Cadastrar Rota Offline, Consumo, Versão — tudo no lugar e funcionando.
- [ ] C5. Voz e sons da navegação de entrega intactos (mudo do painel, chegada, comprovante).
- [ ] C6. Tema claro/escuro: tela do passeio legível nos DOIS (tokens); medir contraste se algo parecer lavado (lei contraste-sempre).
- [ ] C7. Flavor vendas builda (native.js compartilhado mudou): o publish não pode quebrar o outro flavor.
- [ ] C8. Suíte local (já verde em 29/07, re-conferir pós-merge): `node --test dist/logistica/logistica-passeio.service.test.js` (7) + `test:credits` + `test:logistica-billing` (149) + config (48). Vermelho pré-existente conhecido: check-pele R1/R2 no kit.css do frontend (não é desta frente).

## Dicas de execução

- Mock location p/ B13: app de mock location + `adb shell appops set br.com.hbxsystem.entrega... android:mock_location allow`; alternativa aceita: validar só o botão "Cheguei" e marcar B13 como "não coberto".
- Release às vezes não abre CDP — diagnóstico visual: `adb shell screenrecord` + ffmpeg tile (contact sheet), receita do hbxlog.
- Não mexer no aparelho na janela da rota real do dono (~4-5h da manhã).

## Fica pra depois — COM MORADIA (lei "fica pra depois sem moradia = nunca")

1. **F3 — Achar lugares de passeio perto de mim** (a stack sem Google): importar POIs do OSM (tourism/amenity/historic) pro Postgres + cruzar RFB 28M por CNAE (restaurante 5611, hotel 5510) com pino via CNEFE + descrições pelo qwen em batch (fábrica de enriquecimento com budget). Moradia: próxima frente do passeio; abre com as ⬜ deste arquivo.
2. **F4 — Offline total** (tiles PMTiles da região baixados no claim + servir range-request do disco pelo Kotlin). Hoje o offline cobre: GPS (satélite não usa internet), tour persistido, alarme nativo, linha reta; só o BASEMAP e o recálculo pedem rede.
3. **F0 restante — precisão na navegação de ENTREGA** (snap-to-route na polyline, filtro de fix ruim generalizado, dead-reckoning visual): não entrou DE PROPÓSITO — mexe no fluxo de entrega que funciona hoje; frente própria.
4. **Cota/limite de passeios por funcionário** (hoje: liberou = equipe inteira pode; cada passeio debita — o freio é o custo). Se o dono quiser teto diário, é coluna nova + check no iniciar.
5. **Reboot com tour ativo**: o alarme re-agenda quando o app ABRE (passeioBoot). Boot-receiver dedicado (RECEIVE_BOOT_COMPLETED já declarado) fica aqui como pendência se o caso real aparecer.

## ✅ OSRM SELF-HOST — INSTALADO EM PROD 29/07 ~17:50 (Falha 2 MORTA)

O roteamento não depende mais do servidor de demonstração público. Instalado ao
vivo no VPS:

- **Container `hbx-osrm`** (`osrm/osrm-backend`, algoritmo MLD, `--max-table-size 120`),
  porta **só no gateway docker** (`-p 172.18.0.1:5000:5000` — mesmo padrão do
  webwhats; nada exposto pra internet).
- **Dados:** extrato **Sudeste** (Geofabrik, pbf 813MB) em `/root/osrm/` (~6,8GB
  com os artefatos). Build: `build.sh` (extract→partition→customize), 13 min,
  pico de RAM 3,2GB. Brasil inteiro NÃO cabe no VPS de 15GB — Sudeste cobre a
  operação; fora dele a cadeia de fallback segura (proxy → OSRM público → reta).
- **Backend:** `OSRM_BASE_URL=http://172.18.0.1:5000` em `/root/HBX/backend/.env`
  (backup `.env.bak-osrm-20260729`; o publish só faz upsert de chaves próprias —
  a variável SOBREVIVE a deploys). Backend recriado com
  `docker compose --env-file .env -f docker-compose.hostinger.yml up -d backend`,
  boot limpo, env conferido DENTRO do container.
- **Smoke feito:** rota Rio Claro→São Carlos = 60km/49min pelo host E de dentro
  do hbx-backend; `/table` com duration+distance ok.
- **Atualizar o mapa (receita):** baixar pbf novo em `/root/osrm`, rodar
  `./build.sh`, `docker restart hbx-osrm`.

Checks extras pra bateria:

- [ ] A8. `docker ps` → `hbx-osrm Up`; `curl http://172.18.0.1:5000/route/v1/driving/-47.5614,-22.4064;-47.8909,-22.0175?overview=false` devolve `"code":"Ok"`.
- [ ] A9. Rota calculada no app (montar rota real) aparece no `docker logs hbx-osrm` (prova que o tráfego vai no NOSSO e não no demo).
- [ ] C9. Rota FORA do Sudeste (ex.: 2 pontos em Curitiba) ainda funciona no app — cai no fallback público/reta sem quebrar a tela.

## PLANEJAMENTO (não implantar) — o que o Valhalla ainda entregaria a mais

Com o OSRM nosso no ar, sobram pro Valhalla (quando a frente abrir):

- **Perfil A PÉ e bicicleta** — tour de centro histórico é caminhando; nosso OSRM está com perfil `car` (dá pra subir um segundo OSRM `foot` com os MESMOS dados — meio-termo antes de Valhalla).
- **Otimização de ordem nativa** (rota ótima multi-parada) — hoje é 2-opt caseiro no app via `/osrm/table`.
- **Map-matching** (snap da trilha/bolinha na rua) e **isócronas** ("o que alcanço em 30 min a pé" — casa com o F3 de descoberta).
- Gatilho de decisão: passeio a pé virar caso real de cliente.
