# S2-CONTRATO-PONTE — Leitura de Rota (GPS nativo ↔ front)

**Autor:** subagente S2 (lado nativo Kotlin + backend). **Consumidor:** S3 (front,
`app.js`/`app.css`). Nomes de método/evento/campo abaixo são EXATOS — não inventar
variação. Qualquer mudança aqui exige atualizar este arquivo primeiro.

Base: `RotaService.kt` (foreground GPS já em produção) ganhou um **MODO novo**,
independente de `alvos`/rota do dia — a Leitura roda mesmo sem nenhuma rota gerada.
Toda a lógica nova vive em `RotaState.kt` (estado/detector de pausa),
`RotaService.kt` (loop de GPS), `NativeAppBridge.kt` (ponte JS), `LeituraTrilhaSync.kt`
(envio) e `PolylineSimplifier.kt` (Douglas-Peucker).

---

## 1. Front → Nativo (chamadas síncronas, `window.HBXAndroid.*`)

Mesma ponte `@JavascriptInterface` que já expõe `activateRoute`/`stopRoute`/
`offlineStatus` etc. — chamar direto, sem `H.api()`/HTTP.

### `HBXAndroid.iniciarLeituraTrilha(leituraId: string): void`
Inicia a gravação da trilha nativa para a sessão já criada no backend
(`POST /logistica/leitura/iniciar` → guarda o `id` retornado e passa aqui).
Fire-and-forget, sem retorno. Idempotente: chamar de novo com o MESMO
`leituraId` enquanto já está ativa não reseta a trilha.

**Pré-requisito do front:** garantir permissão de localização ANTES
(`HBXAndroid.requestLocationPermission()`, já existe, sem mudança nesta sprint).
Sem permissão, o serviço nativo se autoencerra silenciosamente (não crasha, mas
também não grava nada) — se a trilha não aparecer, é o primeiro lugar a checar.

### `HBXAndroid.pararLeituraTrilha(): void`
Para a gravação (chamar ao "Finalizar"/"Cancelar" a sessão no front, DEPOIS de já
ter chamado `/logistica/leitura/:id/finalizar` ou `/cancelar` no backend). Dispara
o flush final da trilha pendente. Só derruba o GPS/foreground de verdade se não
houver nenhuma rota do dia (`alvos`) ativa também — coexistência com o modo normal
de rota é automática, nada que o front precise verificar.

### `HBXAndroid.resolverPausaLeitura(aceitar: boolean): void`
Chamar ao fechar o popup "Você parou — salvar parada?", tanto se o motorista
salvou a parada quanto se dispensou. O valor de `aceitar` é só telemetria — o
efeito nativo (reiniciar o cooldown de 60s do detector de pausa, pra não
redisparar na hora) é o MESMO nos dois casos. **Sempre chamar isto ao fechar o
popup**, senão o detector fica "preso" achando que a pausa ainda está pendente.

### `HBXAndroid.leituraStatus(): string` (síncrono, retorna JSON)
Snapshot completo — usar pra montar/repintar o mapa (no primeiro load da tela, ou
como reforço se algum evento push for perdido). Formato:
```jsonc
{
  "ativa": true,
  "leituraId": "clxxx...",           // string | ausente se !ativa
  "pontos": [[lat, lng], [lat, lng], ...], // trilha acumulada da sessão (até 5000 pontos, simplificada além disso)
  "ultimaAmostra": {                 // ausente se ainda não gravou nenhum ponto
    "lat": -23.55, "lng": -46.63, "ts": 1753000000000, "accuracyM": 12.4, "speedMps": 3.1 // speedMps pode faltar
  },
  "pausaPendente": {                 // AUSENTE se não há popup pendente
    "lat": -23.55, "lng": -46.63, "ts": 1753000000000,
    "clienteProximo": { "id": "...", "nome": "...", "distanciaM": 42.1 } // ou null
  }
}
```
Se `APP_MODE != "logistica"`, devolve só `{"ativa": false}`.

---

## 2. Nativo → Front (eventos, `document.dispatchEvent(new CustomEvent(...))`)

Mesmo caminho que a chegada (`hbx:arrival`) já usa — `addEventListener` normal.

### `hbx:leitura-ponto`
Disparado a cada ponto NOVO gravado na trilha (já passou pelo filtro de 8m/15s —
não é 1 por fix de GPS). Só dispara com o app em **foreground** (a Activity
resumida) — é só pro desenho incremental do mapa ao vivo, sem custo de fila.
```jsonc
{ "lat": -23.55, "lng": -46.63, "ts": 1753000000000 }
```
Ao entrar na tela da Leitura, chamar `leituraStatus()` uma vez pra pintar o que já
existe, depois só escutar este evento pros pontos novos (não fazer polling).

### `hbx:leitura-pausa`
Disparado quando o detector de pausa dispara (ver critério na seção 4). Chega
tanto em foreground (na hora) quanto — se a pausa foi detectada com o app
fechado/minimizado — **de novo, automaticamente, no próximo `onResume`** (o nativo
guarda a pausa como pendente e re-dispara sozinho; o front não precisa fazer
nada de especial pra "recuperar" uma pausa perdida, só ter o listener registrado).
```jsonc
{
  "lat": -23.55, "lng": -46.63, "ts": 1753000000000,
  "clienteProximo": { "id": "...", "nome": "João", "distanciaM": 38.2 } // ou null
}
```
- `clienteProximo != null` → mostrar nome + distância, ação principal = salvar a
  parada nesse cliente (fluxo que já existe: `customerProfileId` no
  `POST /logistica/leitura/:id/parada`).
- `clienteProximo == null` → oferecer "Cadastrar Local" (fluxo manual que já existe).
- **Fechar o popup (aceitar OU dispensar) SEMPRE chama `HBXAndroid.resolverPausaLeitura(aceitar)`**
  (seção 1) — é o que impede o mesmo evento de reaparecer.

### Notificação heads-up (app em background)
Canal `chegada` (o mesmo já usado pela chegada de entrega) — título "Pausa
detectada na Leitura", toque abre o app (MainActivity). Ao reabrir, o
`hbx:leitura-pausa` já dispara sozinho (ver acima) — a notificação é só o
"alarme", o dado pendente vem pelo evento, não pelo Intent da notificação.

### Notificação persistente do foreground (modo Leitura sem rota do dia)
Texto: **"Gravando rota · N paradas"** (título "Leitura de rota"). **`N` é um
contador NATIVO de pausas detectadas nesta sessão** (`RotaState.pausasDetectadasNaSessao()`),
**não é** o total de paradas já salvas no backend — se o motorista dispensar uma
pausa sem salvar nada, `N` sobe mesmo assim. Se o front quiser mostrar "paradas
salvas de verdade", precisa contar por conta própria (ex.: length do array
retornado por `/logistica/leitura/:id/resumo`). Quando há também uma rota do dia
ativa (`alvos` não vazio) ao mesmo tempo, a notificação mostra o texto da rota do
dia normalmente (prioridade), não o texto da Leitura.

---

## 3. Backend — endpoint novo

### `POST /logistica/leitura/:id/trilha`
Guard: `JwtAuthGuard` + `ModuleAccess('logistica')` (mesmo dos outros endpoints de
`/logistica/leitura/*` — nenhuma mudança de autenticação). `:id` = o mesmo
`sessaoId` de `/logistica/leitura/iniciar`.

**Request:**
```jsonc
{ "pontos": [ { "lat": -23.55, "lng": -46.63, "ts": "2026-07-21T21:00:00.000Z" }, ... ] }
```
- `pontos`: 1 a 2000 itens. `lat`/`lng` número, `ts` **ISO8601** (mesmo padrão de
  `capturadoEm` no resto do módulo — não epoch numérico).
- O aparelho já manda o lote **simplificado (Douglas-Peucker, ~10m de
  tolerância)** — o backend NÃO re-simplifica, só concatena.

**Response 200:**
```jsonc
{ "success": true, "totalPontos": 842 }
```
`totalPontos` = tamanho da trilha acumulada na sessão DEPOIS deste lote (útil só
pra debug/telemetria, o front não precisa usar isso pra nada).

**Semântica importante (ADITIVO, sem gate de status):**
- Cada chamada CONCATENA com o que a sessão já tinha (não é PUT/replace).
- Aceita mesmo com a sessão já **FINALIZADA ou CANCELADA** — a fila offline do
  aparelho pode entregar a cauda de pontos depois que o motorista já tocou
  "Finalizar". Só dá 404 se a sessão não existir ou for de outra empresa/usuário.
- Teto de 20.000 pontos por sessão no banco (defesa em profundidade; na prática
  nunca deve chegar perto disso dado o filtro de gravação + simplificação).
- **Este é o endpoint da TRILHA (breadcrumb).** Não confundir com
  `POST /logistica/leitura/:id/parada` (que já existia — é a PARADA com
  cliente/itens/preço, outro conceito).

---

## 4. Critérios do detector (documentado pro front NÃO reimplementar nada disso)

Toda a lógica abaixo é 100% nativa (`RotaState.kt`); o front só reage aos eventos.

**Filtro de gravação da trilha (S2.1):**
descarta amostra com `accuracy > 35m`; descarta salto que implique
velocidade > ~150 km/h (41,7 m/s) entre a última amostra aceita e a atual; só
GRAVA um ponto novo se andou **> 8m** OU passaram **> 15s** desde o último ponto
gravado (isso é o que gera o evento `hbx:leitura-ponto` — não é 1 por fix de GPS,
que chega a cada ~3s).

**Detector de pausa (S2.2):** velocidade < ~2 km/h (0,56 m/s) E deslocamento
< 15m em relação à âncora da janela, mantidos por **~50s contínuos** → dispara no
ponto médio da janela. Histerese: só reavalia de novo depois de o motorista se
afastar **> 40m** do ponto da pausa. Cooldown de **60s** depois de
`resolverPausaLeitura` (aceitar ou dispensar) antes de poder disparar de novo.

**Cliente mais próximo:** haversine contra `alvos` (as paradas da rota do dia, se
houver — a Leitura roda sem `alvos` na maioria das vezes), raio = o mesmo
`RotaState.raioM` da rota (~60m default). Sem `alvos` carregados ou nenhum dentro
do raio → `clienteProximo: null`.

---

## 5. Limites conhecidos (documentados, não são bugs a "vencer")

- **GPS urbano deriva 5–30m** — a trilha é fiel ao caminho percorrido, não é um
  mapa perfeito. Semáforo/engarrafamento longo PODE disparar uma pausa falsa —
  é esperado, o motorista dispensa (`resolverPausaLeitura(false)`).
- **Nome das ruas percorridas fica pra fase 2** (reverse geocode ponto a ponto é
  caro/lento) — nesta sprint, rua só aparece nos pontos de PARADA salva (reverse
  geocode que já existe em `/logistica/geo/reverse`), não na trilha inteira.
- **Fila de envio da trilha é em memória** (+ snapshot leve persistido) — SEM o
  fallback via JobScheduler que a rota TRACKED tem (`TrackingSync`). Se o
  processo morrer com pontos pendentes de enviar, o próximo ponto aceito (ou o
  fim da Leitura) tenta de novo; não há retry agendado com o app 100% fechado.
  Ver comentário completo em `LeituraTrilhaSync.kt`.
- **Restart de processo NÃO perde a trilha completa pro mapa** de propósito
  parcial: o que já foi CONFIRMADO pelo backend está salvo lá (consultável via
  `/logistica/leitura/:id/resumo` ou futura leitura da sessão); o buffer local
  pro DESENHO (`leituraStatus().pontos`) não é persistido em disco a cada ponto
  (custo de I/O) — um restart raro (processo morto pelo Android) faz o desenho
  do mapa recomeçar visualmente do ponto do restart em diante, mas a IDENTIDADE
  da sessão, a fila de envio pendente e o popup de pausa pendente sobrevivem.
- **`N` na notificação "Gravando rota · N paradas" é contador de PAUSAS
  DETECTADAS, não de paradas salvas** (ver seção 2) — se o front quiser mostrar
  outro número na tela, calcule por conta própria a partir do backend.
- **Douglas-Peucker é aproximação equirretangular local** (referência = latitude
  do primeiro ponto do lote) — correta o suficiente pra tolerância de 10m em
  trilhas urbanas; não é geodésico exato.

---

## 6. Arquivos tocados nesta sprint (referência)

- `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/RotaState.kt` — estado
  da Leitura + detector de pausa + persistência estendida.
- `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/RotaService.kt` —
  `processarLeitura`, `clienteMaisProximo`, `notificarPausaHeadsUp`, notificação
  do modo Leitura, coexistência com rota do dia (guard no restart e no stop
  debounced).
- `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeAppBridge.kt` —
  os 4 métodos `@JavascriptInterface` da seção 1.
- `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/MainActivity.kt` —
  registro dos listeners (onResume/onPause) + dispatch dos eventos da seção 2.
- `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/LeituraModels.kt`,
  `PolylineSimplifier.kt`, `LeituraTrilhaSync.kt` — arquivos novos.
- `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeApiClient.kt` —
  allowlist (`"trilha"` adicionado ao `setOf` já existente de `/logistica/leitura/:id/*`).
- `backend/src/logistica/logistica-leitura.service.ts` +
  `dto/logistica-leitura.dto.ts` + `logistica.controller.ts` — endpoint novo.
- `backend/prisma/schema.prisma` + migration
  `20260721210000_logistica_leitura_trilha` — coluna `trilhaJson` (aditiva).
