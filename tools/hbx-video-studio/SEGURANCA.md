# Segurança do HBX Video Studio

O estúdio foi desenhado para captura **local e fictícia**. Os comandos oficiais `npm run video:doctor` e `npm run video:capture` executam `preflight.mjs` antes de abrir o navegador.

## Regra obrigatória

`HBX_VIDEO_BASE_URL` só pode apontar para um endereço de loopback:

- `http://127.0.0.1:3001`
- `http://localhost:3001`
- `http://[::1]:3001`

Hosts externos, inclusive `hbxsystem.com.br` e a API de produção, são recusados antes da captura. URLs com credenciais e protocolos diferentes de HTTP/HTTPS também são bloqueadas.

## Dados

As respostas de Rota, Clientes, Produtos, Financeiro e Perfil são interceptadas pelo Playwright e preenchidas com a empresa fictícia **Distribuidora Água Clara**. Não use banco, usuário, telefone, endereço ou saldo real nas tomadas Android opcionais.

## Execução correta

Use os scripts do `package.json`, não chame `capture.mjs` diretamente:

```bash
npm run video:test
npm run video:doctor
npm run video:capture -- --target commercial
npm run video:render -- --target commercial
```

O `preflight` também pode ser testado isoladamente:

```bash
node tools/hbx-video-studio/preflight.mjs --self-test
```
