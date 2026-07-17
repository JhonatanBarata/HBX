# HBX Mobile — execução de rota sem sinal

Runbook de validação, depuração e correção da implementação da branch
`agent/mobile-route-offline`.

## 1. O que esta entrega faz

A implementação **não transforma o HBX Mobile em um aplicativo standalone** e
não permite planejar rotas sem o servidor.

O fluxo é:

1. o motorista gera, planeja e inicia a rota com internet;
2. o backend congela a rota comercial e valida a cobertura de créditos;
3. o aparelho baixa uma autorização assinada, presa a:
   - empresa;
   - motorista;
   - aparelho;
   - instalação;
   - rota;
   - data operacional;
   - modo comercial;
   - revisão de cobrança;
4. somente a rota autorizada pode continuar durante uma queda de rede;
5. confirmar, cancelar e anexar comprovante passam a ser **local-first**;
6. a fila sincroniza automaticamente quando a rede permitida volta;
7. planejamento, replanejamento e cadastro continuam online-only.

A autorização de novas ações termina às **06:00 do dia seguinte**, no fuso de
São Paulo. Dados já capturados possuem uma janela técnica de recuperação de até
72 horas; isso serve apenas para sincronizar, não para criar novas ações.

## 2. Garantias que não podem ser removidas durante a depuração

Estas invariantes são contratuais:

1. uma operação local só sai da fila após `ACK` ou `DUPLICATE` do servidor;
2. timeout nunca equivale a sucesso nem a rejeição;
3. a mesma `idempotencyKey` nunca pode gerar duas entregas, duas cobranças ou
   dois avisos;
4. uma confirmação que referencia `local:<proofId>` só pode ser enviada depois
   que o comprovante receber um ID remoto;
5. o arquivo local só pode ser apagado depois do ACK do upload e apenas quando
   “manter comprovantes” estiver desligado;
6. Wi-Fi-only não pode bloquear confirmações sem comprovante; deve bloquear
   somente o upload e comandos dependentes daquele arquivo;
7. o grant deve continuar vinculado a aparelho, motorista, empresa, rota e
   `billingRevision`;
8. nenhuma operação offline pode adicionar parada, replanejar ou criar rota;
9. logout não pode apagar uma fila pendente;
10. Rota Rastreada não pode debitar novamente uma entrega que já foi reservada;
11. `FINALIZE_ROUTE` só pode liberar reservas depois de todas as paradas estarem
    em estado terminal no servidor;
12. um erro de GPS/rastreamento durante a sincronização é `RETRY`, não descarte;
13. backend é implantado antes do APK novo;
14. não adicionar bypass temporário de crédito, tenant ou autenticação para
    “fazer o teste passar”.

## 3. Escopo e limitações atuais

### Funciona sem sinal após a rota ficar verde

- ver sequência, clientes, endereços, telefones e itens;
- confirmar entrega;
- alterar quantidades;
- cancelar/pular a entrega de hoje;
- capturar foto ou assinatura;
- avançar para a próxima parada;
- sobreviver a fechamento, kill do processo e reabertura;
- manter GPS e eventos na outbox existente;
- sincronizar posteriormente.

### Continua exigindo internet

- gerar o dia;
- planejar ou replanejar;
- iniciar uma rota ainda não preparada;
- adicionar entrega ou cliente;
- alterar cadastros/configurações;
- trocar motorista;
- reabrir uma entrega;
- preparar outra rota.

### Mapa

O fallback offline exibe a **sequência geográfica das paradas**, mas não contém
mapa completo de ruas nem navegação curva a curva. MapLibre, tiles externos,
OSRM e o aplicativo Google Maps continuam dependendo do cache/rede de cada
provedor. Não declarar “navegação offline completa” nesta versão.

### Arquivos mantidos

“Manter comprovantes no aparelho” preserva o arquivo no armazenamento privado
do aplicativo (`files/hbx-proofs`). Ele não aparece automaticamente na galeria.
Desinstalar ou limpar os dados do aplicativo remove esses arquivos.

### Uma rota operacional por instalação

A implementação foi projetada para uma rota ativa por aparelho. Não iniciar uma
nova rota enquanto a anterior possuir pendências ou rejeições sem revisão.

## 4. Ordem segura de implantação

1. publicar e validar o backend;
2. manter o APK antigo funcionando contra o backend novo;
3. instalar o APK debug em aparelho de teste;
4. executar a matriz deste documento;
5. gerar release assinada somente depois;
6. liberar para grupo interno antes da distribuição geral.

Não inverter backend e APK: o APK novo precisa dos endpoints
`/mobile/logistica/offline/*`.

A mudança não exige migração Prisma nova; utiliza as tabelas já existentes de
rota, rastreamento, claims e ledger.

## 5. Validação do backend

Na raiz do repositório:

```bash
cd backend
npm ci
npm run prisma:validate
npm run build
npm run test:logistica-offline
npm run test:logistica-billing
npm run lint:tenant-scope
```

Também rode os testes diretamente caso seja necessário separar build de teste:

```bash
node --test dist/logistica/logistica-offline-grant.test.js
node --test \
  dist/logistica/logistica-route-billing.service.test.js \
  dist/logistica/logistica-tracked-billing.service.test.js \
  dist/logistica/logistica-tracking-bonus.service.test.js
```

### Pré-requisitos do ambiente

- `JWT_SECRET` precisa estar definido; ele assina as autorizações de rota;
- módulo Logística habilitado para a empresa;
- usuário ativo e vinculado à empresa;
- aparelho pareado;
- para Rota Rastreada, tracking global e `trackingAtivo` do tenant habilitados;
- banco e ledger de créditos disponíveis.

Não foi criada uma flag nova. O comportamento só é usado por APK que chama os
endpoints novos e por uma rota `ACTIVE`.

## 6. Validação Android

```bash
cd EntregaShell
./gradlew clean
./gradlew testLogisticaDebugUnitTest
./gradlew lintLogisticaDebug
./gradlew assembleLogisticaDebug
```

APK esperado:

```text
EntregaShell/app/build/outputs/apk/logistica/debug/app-logistica-debug.apk
```

Instalação:

```bash
adb install -r app/build/outputs/apk/logistica/debug/app-logistica-debug.apk
```

Para release, configure o keystore antes:

```bash
./gradlew bundleLogisticaRelease
```

Não desabilitar R8 para “resolver” erro sem identificar a classe/regra afetada.
As funções `@JavascriptInterface` precisam preservar seus nomes; o restante deve
continuar ofuscado.

## 7. Teste básico — Rota Essencial

1. use empresa com saldo suficiente;
2. crie uma rota Essencial com 7 entregas;
3. inicie a rota com internet;
4. aguarde o banner:

```text
Rota pronta para queda de sinal
```

5. confira no servidor que foram cobrados 2 blocos de 5;
6. ative modo avião;
7. confirme uma entrega;
8. cancele/pule outra;
9. force-stop:

```bash
adb shell am force-stop br.com.hbxsystem.logistica
```

10. abra pelo ícone, ainda sem rede;
11. confirme que a rota abre diretamente e conserva os dois desfechos;
12. reinicie o telefone e abra novamente;
13. restaure a internet;
14. toque em **Sincronizar agora** ou aguarde o JobScheduler;
15. verifique que a fila chega a zero;
16. confira no backend os estados e o horário real de captura.

Resultado obrigatório: nenhuma cobrança Essencial adicional no retry.

## 8. Teste de comprovante apenas no Wi-Fi

1. abra **Ajustes → Rota sem sinal**;
2. ligue **Enviar fotos apenas no Wi-Fi**;
3. desligue **Manter comprovantes no aparelho**;
4. deixe somente dados móveis ativos;
5. em uma entrega com foto obrigatória, capture a foto;
6. confirme a entrega;
7. confira que:
   - a entrega avança localmente;
   - há uma foto pendente;
   - há uma operação pendente;
   - nenhum upload ocorre no 3G/4G/5G;
8. mate e reabra o aplicativo;
9. conecte a uma rede Wi-Fi;
10. confirme a ordem:
    - upload do arquivo;
    - ID remoto do comprovante;
    - confirmação da entrega;
    - ACK da operação;
11. depois do ACK, valide que o arquivo foi removido:

```bash
adb shell run-as br.com.hbxsystem.logistica ls -la files/hbx-proofs
```

Repita com **Manter comprovantes no aparelho** ligado. Nesse caso, o arquivo deve
permanecer após o ACK.

### Teste de corrupção/rejeição

Altere temporariamente o arquivo ou force o backend a rejeitar o MIME/hash.
Resultado esperado:

- comprovante em `REJECTED`;
- confirmação dependente também em `REJECTED`;
- banner vermelho;
- nada é removido silenciosamente.

## 9. Teste — Rota Rastreada e créditos

Use, por exemplo, 5 paradas:

1. anote o saldo antes;
2. inicie a Rota Rastreada;
3. aguarde a proteção verde;
4. o preparo deve reservar 10 créditos, 2 por parada;
5. confira 5 claims `DEBITED`;
6. fique offline;
7. confirme 3 entregas;
8. cancele 2;
9. reconecte;
10. o GPS precisa sincronizar antes ou junto das confirmações;
11. as 3 confirmações devem transformar suas claims em `COMPLETED` sem novo
    débito;
12. `FINALIZE_ROUTE` deve transformar as 2 claims não usadas em `REFUNDED`;
13. o saldo líquido final deve refletir somente 6 créditos consumidos;
14. repetir o lote deve devolver `DUPLICATE`/ACK e não alterar o saldo.

### Saldo insuficiente

1. use saldo menor que o necessário para todas as paradas;
2. inicie/prepared a Rota Rastreada;
3. o banner não pode ficar verde;
4. novas ações offline devem ser bloqueadas;
5. qualquer débito parcial precisa ser estornado;
6. após adicionar saldo, atualize a rota e prepare novamente.

## 10. Testes de concorrência e falha de resposta

### Resposta perdida depois do commit

Use proxy, breakpoint temporário ou `tc/netem` para interromper a resposta depois
que o servidor confirmar a entrega.

Resultado obrigatório:

- comando continua localmente até receber resposta;
- retry usa a mesma `idempotencyKey`;
- servidor responde replay/duplicado;
- WhatsApp, cobrança e crédito não repetem.

### GPS ainda não chegou

Faça a confirmação sincronizar antes dos pontos de rastreamento.

Resultado obrigatório:

- comando recebe `RETRY`;
- não vira `REJECTED`;
- claim reservada não é estornada;
- depois do GPS, o mesmo comando conclui.

### Rota alterada no servidor

Depois de preparar, altere a revisão ou mova uma entrega.

Resultado obrigatório:

- grant antigo não autoriza a revisão nova;
- operação vira conflito/revisão visível;
- cliente nunca faz merge silencioso.

### Aparelho revogado

1. fique offline com ação pendente;
2. revogue o aparelho pelo HBX web;
3. reconecte;
4. o servidor deve recusar a credencial;
5. a evidência local não pode ser apagada automaticamente.

## 11. Teste de expiração

A ação é permitida somente até 06:00 do dia seguinte à `routeDate`.

Para teste rápido, use unidade ou altere temporariamente a função de relógio em
build debug. Não mude a regra de produção.

Após a expiração:

- nenhuma nova confirmação/cancelamento;
- pendências capturadas antes continuam elegíveis para sincronização por até 72h;
- replanejamento continua online-only;
- grant expirado não pode ser renovado para uma rota terminal.

## 12. Diagnóstico do banco local

Feche o aplicativo para o SQLite fazer checkpoint:

```bash
adb shell am force-stop br.com.hbxsystem.logistica
adb exec-out run-as br.com.hbxsystem.logistica \
  cat databases/hbx_operational.db > /tmp/hbx_operational.db
```

Inspecione:

```bash
sqlite3 /tmp/hbx_operational.db ".tables"
sqlite3 /tmp/hbx_operational.db \
  "select route_id, route_date, route_status, grant_expires_at_ms, grant_error from route_snapshot;"
sqlite3 /tmp/hbx_operational.db \
  "select id, command_id, operation_type, delivery_id, state, attempts, last_error from operation_outbox order by id;"
sqlite3 /tmp/hbx_operational.db \
  "select id, proof_type, delivery_id, byte_size, state, attempts, remote_id, last_error from proof_outbox order by created_at_ms;"
```

Também é possível usar **Android Studio → App Inspection → Database Inspector**.

## 13. Diagnóstico no PostgreSQL

Substitua os IDs:

```sql
SELECT id, "companyId", "entregadorId", "routeDate", mode, status,
       "billingRevision", "startedAt", "completedAt"
FROM "LogisticaRoute"
WHERE id = '<routeId>';

SELECT s."snapshotOrder", s."deliveryId", e.status, e."deliveredAt",
       e."idempotencyKey"
FROM "LogisticaRouteStop" s
JOIN "Entrega" e ON e.id = s."deliveryId"
WHERE s."routeId" = '<routeId>'
ORDER BY s."snapshotOrder";

SELECT id, "deliveryId", status, "billingAttempt", "debitUsageKey",
       "paidCreditsConsumed", "debitedAt", "leaseUntil", "refundedAt",
       "lastError"
FROM "LogisticaTrackedCreditClaim"
WHERE "routeId" = '<routeId>'
ORDER BY "createdAt";

SELECT id, kind, amount, "usageKey", "grantType", "parentEntryId", "createdAt"
FROM "CreditLedgerEntry"
WHERE "usageKey" LIKE 'logistica:tracked:%'
ORDER BY "createdAt";

SELECT id, "entregaId", tipo, status, "clientKey", "byteSize",
       "createdAt", "confirmadoAt"
FROM "EntregaComprovante"
WHERE "entregaId" IN (
  SELECT "deliveryId" FROM "LogisticaRouteStop" WHERE "routeId" = '<routeId>'
)
ORDER BY "createdAt";
```

A chave rastreada segue o formato:

```text
logistica:tracked:<companyId>:<sessionId>:<deliveryId>:v<attempt>
```

## 14. Tráfego de dados

A tela mostra o total aproximado recebido + enviado pelo UID do aplicativo desde
o primeiro snapshot da rota.

Valide também em **Configurações do Android → Uso de dados → HBX Mobile**.

Cenários a medir separadamente:

1. Essencial sem fotos;
2. Rastreada por 8 horas sem fotos;
3. 20 fotos comprimidas;
4. Wi-Fi-only, confirmando que bytes de fotos não saem na rede móvel;
5. mapa aberto/fechado.

`TrafficStats` pode reiniciar após reboot do sistema; trate o número da interface
como telemetria operacional aproximada, não faturamento.

## 15. Critérios de aceite

- [ ] backend compila;
- [ ] testes novos e billing existente passam;
- [ ] APK Logística debug compila e instala sobre a versão atual;
- [ ] banner só fica verde depois do grant;
- [ ] confirmação offline sobrevive a kill/reabertura;
- [ ] comprovante Wi-Fi-only não usa dados móveis;
- [ ] comando dependente espera o ID remoto;
- [ ] retry não duplica efeito;
- [ ] Rota Essencial não cobra novamente;
- [ ] Rota Rastreada reserva antes e consome somente entregas concluídas;
- [ ] reservas não usadas são liberadas pelo `FINALIZE_ROUTE`;
- [ ] END de tracking não encerra com parada aberta;
- [ ] logout não apaga pendência;
- [ ] grant de outro aparelho/rota/revisão é rejeitado;
- [ ] release R8 abre, autentica, carrega WebView e mantém a bridge;
- [ ] mapa sem rede apresenta a sequência, sem prometer ruas/turn-by-turn;
- [ ] consumo real é registrado em pelo menos três rotas de teste.

## 16. Prompt pronto para colar no Codex

```text
Você está no repositório HBX, branch agent/mobile-route-offline.

Objetivo: compilar, testar e depurar a implementação de execução offline
AUTORIZADA POR ROTA do HBX Mobile. Não redesenhe a solução e não remova gates
para fazer testes passarem.

Leia primeiro:
docs/PLANEJAMENTOS/HBX-MOBILE-OFFLINE-ROTA-TESTE.md

Execute, nesta ordem:

1) Backend
cd backend
npm ci
npm run prisma:validate
npm run build
npm run test:logistica-offline
npm run test:logistica-billing
npm run lint:tenant-scope

2) Android
cd ../EntregaShell
./gradlew testLogisticaDebugUnitTest
./gradlew lintLogisticaDebug
./gradlew assembleLogisticaDebug

3) JavaScript empacotado
node --check app/src/main/assets/app/native.js
node --check app/src/logistica/assets/app/app.js
node --check app/src/logistica/assets/app/offline-controls.js

Ao encontrar erro:
- registre a causa raiz antes de editar;
- faça o menor patch correto;
- preserve multi-tenancy e autenticação MobileDevice;
- nunca remova uma operação local sem ACK/DUPLICATE;
- nunca transforme timeout em sucesso;
- preserve idempotencyKey;
- comprovante local:<id> deve bloquear a confirmação até obter ID remoto;
- Wi-Fi-only afeta upload, não a operação local;
- arquivo só é apagado após ACK quando retainAfterUpload=false;
- grant deve continuar preso a deviceId/userId/companyId/routeId/routeDate/
  routeMode/billingRevision;
- nenhuma API offline pode planejar, criar rota ou adicionar parada;
- Rota Rastreada deve reutilizar a claim DEBITED reservada; não faça segundo
  wallet.debit na confirmação;
- FINALIZE_ROUTE só libera claim de entrega não concluída depois de todas as
  paradas estarem terminais;
- erro de GPS/posição deve continuar RETRY;
- não desative R8 definitivamente; crie keep rule mínima se necessário;
- não crie migration sem provar que o schema existente é insuficiente;
- não altere unrelated files.

Depois dos testes estáticos, use um aparelho/emulador e execute a matriz do
runbook, especialmente:
- modo avião + confirmar + kill + reabrir;
- foto no 4G com Wi-Fi-only;
- reconexão no Wi-Fi;
- resposta perdida após commit;
- tracked: reserva, consumo, estorno do não usado;
- aparelho revogado;
- release minificada.

Na resposta final, informe:
1. causa raiz de cada falha;
2. arquivos alterados;
3. comandos executados e resultado;
4. evidências do teste em aparelho;
5. saldos/claims antes e depois;
6. consumo de dados medido;
7. riscos residuais reais.

Não declare pronto se apenas compilou. Não apague fila, comprovante ou claim para
“destravar” o teste.
```
