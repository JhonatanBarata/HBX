# PLANO B — só rode se o Console RECUSAR as 1080x2160 por proporcao.
# As 1080x2160 sao 1:2 exato, o limite que o Console aceita, e preservam a tela
# inteira. Este corte tira mais 240 px para chegar a 9:16 e, medido em 21/08,
# COME o botao de acao do rodape em print-2 e print-5 — ajuste `topo` por
# imagem e confira cada saida antes de subir.
# 1080x2160 (1:2) -> 1080x1920 (9:16 exato). A tela do Console diz "16:9 ou
# 9:16"; 1:2 e mais alto que isso e pode ser recusado no upload. Corta 240 px
# repartidos entre topo e rodape, por imagem, para nao comer conteudo.
Add-Type -AssemblyName System.Drawing
$mapa = @(
  @{ f = 'print-1-rota-mapa.png';  topo = 0   },
  @{ f = 'print-2-montagem.png';   topo = 90  },
  @{ f = 'print-3-dirigir.png';    topo = 0   },
  @{ f = 'print-4-entrega.png';    topo = 90  },
  @{ f = 'print-5-fechamento.png'; topo = 90  }
)
foreach ($m in $mapa) {
  $orig = Join-Path $PSScriptRoot $m.f
  $i = [System.Drawing.Image]::FromFile($orig)
  $b = New-Object System.Drawing.Bitmap 1080, 1920, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.DrawImage($i, (New-Object System.Drawing.Rectangle 0,0,1080,1920),
                   (New-Object System.Drawing.Rectangle 0,$m.topo,1080,1920),
                   [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $i.Dispose()
  $destino = Join-Path $PSScriptRoot ('916-' + $m.f)
  $b.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  '  916-{0}  (1080x1920, topo -{1}px)' -f $m.f, $m.topo
}
