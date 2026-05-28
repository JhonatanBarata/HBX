$ErrorActionPreference = "Stop"

$path = "frontend/src/app/page.module.css"

if (-not (Test-Path $path)) {
  throw "Arquivo nao encontrado: $path"
}

$content = Get-Content -Raw -Encoding UTF8 $path

if ($content -match "hbx-premium-layer-03-end") {
  Write-Host "Camada 03 ja existe. Nada a fazer."
  exit 0
}

if ($content -notmatch "hbx-premium-layer-02-end") {
  throw "Marcador hbx-premium-layer-02-end nao encontrado. Aplique o patch 03 antes."
}

$block = @'

/* HBX homepage premium layer 03: keyframes and motion safety */
@keyframes hbxTopbarDrop {
  from {
    opacity: 0;
    transform: translateY(-14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes hbxHeroRise {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes hbxCardRise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes hbxHeroZoom {
  from {
    transform: scale(1.035) translate3d(0, 0, 0);
  }
  to {
    transform: scale(1.075) translate3d(-10px, -8px, 0);
  }
}

@keyframes hbxOrbitGlow {
  from {
    transform: rotate(0deg) scale(1);
  }
  to {
    transform: rotate(360deg) scale(1.05);
  }
}

@keyframes hbxAuroraFloat {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-26px, 18px, 0) scale(1.12);
  }
}

@keyframes hbxBrandPulse {
  0%,
  100% {
    box-shadow: 0 18px 42px rgba(55, 213, 255, 0.16);
  }
  50% {
    box-shadow: 0 22px 58px rgba(55, 213, 255, 0.32), 0 0 0 1px rgba(55, 213, 255, 0.12);
  }
}

@keyframes hbxSoftGlow {
  0%,
  100% {
    border-color: rgba(55, 213, 255, 0.24);
  }
  50% {
    border-color: rgba(51, 227, 154, 0.34);
  }
}

@keyframes hbxShine {
  0% {
    transform: translateX(-130%);
  }
  42%,
  100% {
    transform: translateX(130%);
  }
}

@keyframes hbxDotPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.68;
  }
  50% {
    transform: scale(1.38);
    opacity: 1;
  }
}

@keyframes hbxSpinSlow {
  to {
    transform: rotate(360deg);
  }
}

.footerLinks a {
  transition: color 180ms var(--home-ease), transform 180ms var(--home-ease);
}

.footerLinks a:hover {
  color: #ffffff;
  transform: translateY(-1px);
}

@media (max-width: 720px) {
  .ghostAction {
    width: 100%;
  }

  .planCardFeatured {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home *,
  .home *::before,
  .home *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}

/* hbx-premium-layer-03-end */
'@

$newContent = $content.TrimEnd() + "`r`n" + $block + "`r`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $newContent, $utf8NoBom)

$after = Get-Content -Raw -Encoding UTF8 $path
$bad = @("Ã", "Â", "â", "×", "—", "“", "”", "‘", "’")
foreach ($item in $bad) {
  if ($after.Contains($item)) {
    throw "Marcador de encoding problemático encontrado: $item"
  }
}

Write-Host "OK: camada 03 adicionada em $path"
