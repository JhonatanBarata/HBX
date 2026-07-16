# Tomadas Android opcionais

Coloque aqui apenas cenas que realmente dependem do Android. A estrutura é:

```text
native/<alvo>/<id-da-cena>.mp4
```

Exemplo:

```text
native/tutorial-entregador/driver-stop.mp4
```

O `render.mjs` detecta o arquivo e o usa no lugar da cena Playwright correspondente. O vídeo bruto é ignorado pelo Git; este README permanece versionado.
