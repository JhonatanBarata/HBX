# Aplicativos Android do HBX

O Android agora entrega duas experiências independentes. Nenhuma delas carrega
o frontend web do HBX:

- **HBX Vendas** (`br.com.hbxsystem`): atualiza o antigo APK e mantém o
  pareamento, ligações, WhatsApp pessoal, fila persistida no VPS e despertar FCM.
- **HBX Logística** (`br.com.hbxsystem.logistica`): rota, clientes, produtos,
  comprovantes, GPS durante a rota, fila offline de posições e rastreamento ao vivo.

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
`app/src/main/assets/app`. A bridge limita Vendas a `/vendas` e Logística a
`/logistica`, `/cadastros` e `/products`; a credencial do aparelho e o JWT nunca
são expostos ao JavaScript.
