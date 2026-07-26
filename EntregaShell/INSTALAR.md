# Aplicativos Android do HBX

O Android entrega duas experiências independentes. Nenhuma delas carrega o
frontend web do HBX:

- **Salehbx.apk** (`br.com.hbxsystem`): atualiza o antigo APK e mantém o
  pareamento, ligações, WhatsApp pessoal, fila persistida no VPS e despertar FCM.
- **Loghbx.apk** (`br.com.hbxsystem.logistica`): rota, clientes, produtos,
  comprovantes, GPS durante a rota, fila offline de posições e rastreamento ao vivo.

Recarga, tema, sincronização e vínculo do aparelho são funções gerais e ficam
disponíveis nos dois aplicativos.

## Instalação

1. Instale o APK correspondente à função da pessoa.
2. No HBX web, abra **Perfil → Aplicativo móvel** e gere um código de seis dígitos.
3. Digite o código no aplicativo. Cada app/aparelho tem seu próprio vínculo.
4. No Vendas, conceda notificações para receber ações com o celular bloqueado.
5. No Logística, localização e notificações são solicitadas somente ao iniciar a
   primeira rota. O GPS para quando a rota é encerrada.

## Builds

```bash
./gradlew :app:assembleVendasRelease
./gradlew :app:assembleLogisticaRelease
```

As interfaces ficam em `app/src/vendas/assets/app` e
`app/src/logistica/assets/app`. CSS e cliente nativo compartilhados ficam em
`app/src/main/assets/app`. O publicador copia os builds assinados para
`EntregaShell/dist/Loghbx.apk` e `EntregaShell/dist/Salehbx.apk`. A bridge
limita cada APK ao próprio módulo e aos endpoints gerais exatos; a credencial
do aparelho e o JWT nunca são expostos ao JavaScript.

## Publicação

`npm run publish` e `npm run new` geram os dois APKs assinados, publicam
`Loghbx.apk` em `/download/android-logistica` e `Salehbx.apk` em
`/download/android`, por troca atômica, e validam o SHA-256 baixado pelas duas
URLs públicas antes de concluir.
