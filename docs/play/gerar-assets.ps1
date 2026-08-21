# ============================================================================
# ASSETS DA FICHA DA PLAY — gera icone-512.png e feature-1024x500.png
# ----------------------------------------------------------------------------
# Rode da raiz do repo:  powershell -File docs\play\gerar-assets.ps1
# Fonte do desenho: frontend/public/hbx-theme/assets/logo/hbx-app-icon-512.png
# (o mesmo circulo HBX do ic_launcher_foreground.xml, sobre o navy #0B1020 do
#  ic_launcher_background.xml — ficha e launcher tem que ser o MESMO icone).
# ============================================================================
Add-Type -AssemblyName System.Drawing

$raiz   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$origem = Join-Path $raiz 'frontend\public\hbx-theme\assets\logo\hbx-app-icon-512.png'
$saida  = $PSScriptRoot
$navy   = [System.Drawing.Color]::FromArgb(255, 11, 16, 32)   # #0B1020

# ---------------------------------------------------------------- ICONE 512
# A Play arredonda o icone ELA MESMA. O png do site ja vem com os cantos
# meio transparentes (alfa 64/128 medido nos vertices) — arredondar por cima
# de canto arredondado deixa a borda serrilhada. Achatamos sobre o navy: o
# quadrado fica cheio, e o corte da Play acontece em cor chapada.
$bmp = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.Clear($navy)
$src = [System.Drawing.Image]::FromFile($origem)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, 512, 512))
$g.Dispose()
$bmp.Save((Join-Path $saida 'icone-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ------------------------------------------------------- FEATURE 1024 x 500
# Especificacao: PNG/JPEG 24-bit SEM alfa, 1024x500, ate 15 MB.
# A Play corta as bordas em algumas superficies — nada importante fora da
# margem de 90 px. Sem preco, sem "novo", sem botao falso de play: tudo isso
# reprova por metadados.
$fw = 1024; $fh = 500
$fb = New-Object System.Drawing.Bitmap $fw, $fh, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$fg = [System.Drawing.Graphics]::FromImage($fb)
$fg.SmoothingMode     = 'AntiAlias'
$fg.InterpolationMode = 'HighQualityBicubic'
$fg.TextRenderingHint = 'ClearTypeGridFit'

$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point 0, 0),
    (New-Object System.Drawing.Point $fw, $fh),
    ([System.Drawing.Color]::FromArgb(255, 8, 13, 27)),
    ([System.Drawing.Color]::FromArgb(255, 16, 40, 72)))
$fg.FillRectangle($grad, 0, 0, $fw, $fh)
$grad.Dispose()

# brilho ciano atras do logo (o mesmo #00E5FF do vetor do launcher)
$halo = New-Object System.Drawing.Drawing2D.GraphicsPath
$halo.AddEllipse(40, 60, 380, 380)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $halo
$pgb.CenterColor       = [System.Drawing.Color]::FromArgb(70, 0, 229, 255)
$pgb.SurroundColors    = @([System.Drawing.Color]::FromArgb(0, 0, 229, 255))
$fg.FillPath($pgb, $halo)
$pgb.Dispose(); $halo.Dispose()

# o png do site tem fundo navy CHAPADO ate a borda: jogado cru sobre o
# gradiente ele vira um quadrado escuro colado. Recortamos com o mesmo raio
# que a Play usa no icone, para o logo parecer o app instalado.
$lx = 108; $ly = 128; $ld = 244; $r = 54
$cl = New-Object System.Drawing.Drawing2D.GraphicsPath
$cl.AddArc($lx, $ly, $r*2, $r*2, 180, 90)
$cl.AddArc($lx+$ld-$r*2, $ly, $r*2, $r*2, 270, 90)
$cl.AddArc($lx+$ld-$r*2, $ly+$ld-$r*2, $r*2, $r*2, 0, 90)
$cl.AddArc($lx, $ly+$ld-$r*2, $r*2, $r*2, 90, 90)
$cl.CloseFigure()
$fg.SetClip($cl)
$fg.DrawImage($src, (New-Object System.Drawing.Rectangle $lx, $ly, $ld, $ld))
$fg.ResetClip()
$cl.Dispose()
$src.Dispose()

$fTitulo = New-Object System.Drawing.Font('Segoe UI', 54, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fLinha  = New-Object System.Drawing.Font('Segoe UI', 27, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fItem   = New-Object System.Drawing.Font('Segoe UI', 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$branco  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 237, 241, 248))
$cinza   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 169, 182, 204))
$ciano   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 229, 255))

$fg.DrawString("HBX Log$([char]0x00ED)stica", $fTitulo, $branco, 420, 150)
$fg.FillRectangle($ciano, 424, 228, 84, 4)
$fg.DrawString('Rota, entrega e fechamento do dia', $fLinha, $cinza, 420, 252)
$fg.DrawString("Monte a rota   $([char]0x00B7)   Dirija   $([char]0x00B7)   Registre   $([char]0x00B7)   Feche o caixa", $fItem, $cinza, 420, 300)

$fg.Dispose()
$fb.Save((Join-Path $saida 'feature-1024x500.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fb.Dispose()

foreach ($n in 'icone-512.png', 'feature-1024x500.png') {
    $p = Join-Path $saida $n
    $i = [System.Drawing.Image]::FromFile($p)
    '{0} — {1}x{2} — {3:N0} KB' -f $n, $i.Width, $i.Height, ((Get-Item $p).Length / 1KB)
    $i.Dispose()
}
