# W — Upload do tutorial (e todo upload grande) estoura no proxy do Next em 10MB → 500

## Dor (provada em prod, 20/07)
`POST /hbx/api/tutorial-media/and-instalar/upload` devolve **500** ao subir vídeo.
O stack NÃO está no backend — está no log do container `hbx-frontend`:
```
Request body exceeded 10MB for /hbx/api/tutorial-media/and-instalar/upload.
Only the first 10MB will be available unless configured... (middlewareClientMaxBodySize)
Failed to proxy .../tutorial-media/and-instalar/upload  Error: socket hang up
```
O caminho `/hbx/api/:path*` é um **rewrite do Next** (`frontend/next.config.ts`,
bloco `rewrites()`). O Next 16 limita o corpo do request **proxiado** a **10MB** por
padrão (`experimental.proxyClientMaxBodySize`). O backend aceita 80MB
(`TUTORIAL_MAX_BYTES = 80*1024*1024`) e o nginx do host já está `client_max_body_size 80m`
nos DOIS server blocks (hbxsystem e api). Ou seja: **o único elo curto da cadeia é o
proxy do Next**. Vídeo > 10MB → o Next trunca o corpo → `socket hang up` → 500 no navegador.

## Correção (uma chave só)
Alinhar o proxy do Next ao resto da cadeia (nginx 80m + multer 80MB): subir o limite do
corpo proxiado para **80mb**. Isso destrava o upload do tutorial e QUALQUER upload grande
que passe por `/hbx/api` (é global pro rewrite).

Chave confirmada nos tipos do Next 16.1.4 instalado:
- `middlewareClientMaxBodySize` está **@deprecated** → NÃO usar.
- `proxyClientMaxBodySize` é a chave certa ("Body size limit for request bodies with proxy
  configured. Defaults to 10MB."), e vive dentro de **`experimental`** (confirmado no
  `config-schema.js`, cercada de `middlewarePrefetch`/`cssChunking`/`isrFlushToDisk`).

## Arquivo permitido (SÓ este)
`frontend/next.config.ts`

Adicionar o bloco `experimental` (o config hoje não tem nenhum). Manter todo o resto igual.
Valor `"80mb"` (bytes-lib = 80*1024*1024, idêntico ao nginx `80m` e ao `TUTORIAL_MAX_BYTES`).
Comentário PT-BR curto no estilo do arquivo explicando o porquê (cadeia nginx 80m / multer 80MB).

```ts
const nextConfig: NextConfig = {
  // Upload grande (vídeo do tutorial etc.) passa pelo rewrite /hbx/api → o Next 16
  // limita o corpo PROXIADO a 10MB por padrão. nginx (80m nos 2 server blocks) e o
  // multer do backend (TUTORIAL_MAX_BYTES = 80MB) já aceitam 80 — alinhamos o proxy.
  experimental: {
    proxyClientMaxBodySize: "80mb",
  },
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  turbopack: { ... },   // resto INTOCADO
  ...
};
```

## Regras do repo
- Trabalhar direto na master; NÃO commitar (o orquestrador publica). NÃO criar branch.
- Só `frontend/next.config.ts`. Comentário PT-BR.

## Check obrigatório (rodar e colar a saída real)
```
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Confirmar que o TS aceita `experimental.proxyClientMaxBodySize: "80mb"` (tipo `SizeLimit`).
Reportar: diff aplicado + saída do typecheck.
