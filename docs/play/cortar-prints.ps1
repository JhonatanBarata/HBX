# ============================================================================
# CORTE DAS CAPTURAS — 1080x2400 (9:20 do g15) -> 1080x2160 (1:2)
# ----------------------------------------------------------------------------
# A Play exige lado maior <= 2x o menor. O g15 e 2,22x: sem corte, o Console
# recusa. Cortamos 240 px do RODAPE — a barra de gestos do Android e a barra de
# abas do app —, nunca do topo: o logo HBX mora la e e identidade.
# O menor lado continua 1080, que e o piso para o app se QUALIFICAR A PROMOCAO.
# ============================================================================
Add-Type -AssemblyName System.Drawing
$mapa = @(
  @{ de = 'bruto-5-pos-entrega.png';       para = 'print-1-rota-mapa.png';   corte = 240 },
  @{ de = 'bruto-2-lista.png';             para = 'print-2-montagem.png';    corte = 240 },
  @{ de = 'bruto-3b-panoramica.png';       para = 'print-3-dirigir.png';     corte = 240 },
  @{ de = 'bruto-4-entrega.png';           para = 'print-4-entrega.png';     corte = 240 },
  @{ de = 'bruto-6-fechar.png';            para = 'print-5-fechamento.png';  corte = 240 }
)
foreach ($m in $mapa) {
  $orig = Join-Path $PSScriptRoot $m.de
  if (-not (Test-Path $orig)) { "FALTA: $($m.de)"; continue }
  $i = [System.Drawing.Image]::FromFile($orig)
  $h = $i.Height - $m.corte
  $b = New-Object System.Drawing.Bitmap 1080, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.DrawImage($i, (New-Object System.Drawing.Rectangle 0,0,1080,$h),
                   (New-Object System.Drawing.Rectangle 0,0,1080,$h),
                   [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $i.Dispose()
  $destino = Join-Path $PSScriptRoot $m.para
  $b.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  '{0} -> {1}  ({2}x{3}, {4:N0} KB)' -f $m.de, $m.para, 1080, $h, ((Get-Item $destino).Length/1KB)
}
