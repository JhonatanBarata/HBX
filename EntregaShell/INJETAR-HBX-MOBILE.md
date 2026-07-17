# Gerar e instalar o HBX Mobile

Esta versão do APK depende dos endpoints do backend adicionados neste mesmo conjunto de alterações. Portanto, a ordem obrigatória é:

1. publicar o backend;
2. confirmar que a API nova está disponível;
3. gerar o APK;
4. sincronizar qualquer operação offline pendente no aparelho;
5. instalar a atualização por cima do aplicativo existente.

## 1. Atualizar o código local

No PowerShell, a partir da pasta do repositório:

```powershell
git fetch origin
git checkout master
git pull --ff-only origin master
```

Antes de o PR ser incorporado ao `master`, use o branch de validação:

```powershell
git fetch origin
git checkout agent/logistica-recorrencia-financeiro
git pull --ff-only origin agent/logistica-recorrencia-financeiro
```

## 2. Publicar o backend primeiro

O APK novo usa estes endpoints:

```text
GET  /logistica/mobile/route
POST /logistica/mobile/materialize
```

Faça o deploy pelo fluxo normal do HBX e confirme que o backend iniciou sem erro de compilação ou migração. Esta alteração não adiciona migração de banco.

Teste autenticado recomendado:

```text
GET /hbx/api/logistica/mobile/route?date=AAAA-MM-DD
```

A resposta deve conter `items`, `moduloFinanceiroAtivo` e, quando configurado, `pix`. O motorista recebe somente forma e método de pagamento; preço, saldo e limite continuam protegidos.

## 3. Requisitos Android

- Java/JDK 17;
- Android SDK com API 35;
- `adb` disponível no PATH para instalação por USB;
- mesma chave usada para assinar a versão atualmente instalada.

A assinatura fica fora do Git. Crie `EntregaShell/keystore.properties`:

```properties
storeFile=C:/CAMINHO/SEGURO/hbx-mobile-release.jks
storePassword=SUA_SENHA
keyAlias=SEU_ALIAS
keyPassword=SUA_SENHA_DA_CHAVE
```

Também é possível usar as variáveis:

```text
HBX_ANDROID_STORE_FILE
HBX_ANDROID_STORE_PASSWORD
HBX_ANDROID_KEY_ALIAS
HBX_ANDROID_KEY_PASSWORD
```

Nunca envie o `.jks` nem o `keystore.properties` ao GitHub.

## 4. Gerar APK de teste

```powershell
cd EntregaShell
.\gradlew.bat clean assembleLogisticaDebug
```

Arquivo esperado:

```text
EntregaShell\app\build\outputs\apk\logistica\debug\app-logistica-debug.apk
```

Quando `keystore.properties` está configurado, o debug usa a mesma chave local de release e pode atualizar o aplicativo instalado.

## 5. Gerar APK de release

```powershell
cd EntregaShell
.\gradlew.bat clean assembleLogisticaRelease
```

Arquivo esperado:

```text
EntregaShell\app\build\outputs\apk\logistica\release\app-logistica-release.apk
```

O flavor Logística desta alteração é:

```text
applicationId: br.com.hbxsystem.logistica
versionCode: 5
versionName: 1.2.1
```

Para Play Store, mantenha a mesma chave da publicação anterior e envie um pacote com `versionCode` superior ao já publicado. Para gerar AAB:

```powershell
.\gradlew.bat clean bundleLogisticaRelease
```

Arquivo esperado:

```text
EntregaShell\app\build\outputs\bundle\logisticaRelease\app-logistica-release.aab
```

## 6. Antes de atualizar o celular

Abra o HBX Mobile com internet e confira em Ajustes/Sincronização que não há:

- entregas pendentes de sincronização;
- fotos pendentes;
- assinaturas pendentes;
- comandos rejeitados que ainda precisam ser corrigidos.

Uma instalação com `adb install -r` preserva os dados locais quando a assinatura é a mesma. Desinstalar o aplicativo apaga o banco SQLite, a rota salva e a fila offline.

## 7. Instalar por USB

Ative Depuração USB, conecte o aparelho e confira:

```powershell
adb devices
```

Instale por cima da versão existente:

```powershell
adb install -r .\app\build\outputs\apk\logistica\debug\app-logistica-debug.apk
```

Ou release:

```powershell
adb install -r .\app\build\outputs\apk\logistica\release\app-logistica-release.apk
```

Confirme a versão:

```powershell
adb shell dumpsys package br.com.hbxsystem.logistica | findstr version
```

Deve aparecer `versionCode=5` e `versionName=1.2.1`.

### Erro de assinatura incompatível

Se aparecer `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, o APK foi assinado com outra chave.

Não desinstale imediatamente. Primeiro volte à versão assinada corretamente ou garanta que todas as operações offline foram sincronizadas. Somente depois, quando a perda dos dados locais for aceitável:

```powershell
adb uninstall br.com.hbxsystem.logistica
adb install .\app\build\outputs\apk\logistica\debug\app-logistica-debug.apk
```

## 8. Homologação obrigatória

Use um cliente de teste e valide:

1. recorrência semanal de sexta cria uma ocorrência nova, sem alterar o histórico entregue;
2. uma ocorrência de segunda pode ser preparada na rota operacional de hoje;
3. pedido avulso e recorrência do mesmo cliente/local viram uma única parada com todos os itens;
4. cliente `aberto` exige escolher Pix, Dinheiro ou Fiado;
5. Pix e Dinheiro criam cobrança já quitada quando os efeitos financeiros estão habilitados;
6. Fiado cria cobrança pendente;
7. confirmação sem internet entra na fila local com o método de recebimento e sincroniza uma única vez;
8. repetir a sincronização não duplica entrega, cobrança nem débito de créditos;
9. motorista não recebe preço, saldo, limite de fiado ou configuração comercial sensível;
10. cliente mensal continua aguardando fechamento sem pedir método ao motorista.

## 9. Rollback

O backend novo é aditivo. Para voltar somente o APK, reinstale uma versão anterior assinada com a mesma chave e `versionCode` superior, ou gere um novo hotfix revertendo `mobile-contract.js`. Android não permite instalar normalmente um `versionCode` inferior por cima do atual.
