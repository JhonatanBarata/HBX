# Website magnífico — hbxsystem.com.br ⇄ /login (PLANO, 14/06/2026)

> Pedido do dono (05:28): o site público vai ser baseado na imagem cyber (robô/
> cidade, azul-elétrico, cores que ciclam) e vai **transicionar** de
> `hbxsystem.com.br` → `hbxsystem.com.br/login` como se fossem UM mundo só.
> "Planeje um site magnífico." Conversar e construir AMANHÃ.

## Norte
Site e login = **um mundo contínuo**. Quem entra no site já está dentro da mesma
cena (robô transmux + cor que cicla). Clicar "Entrar" NÃO abre outra página — a
cena permanece e o login se forma por cima. Zoom pra dentro do sistema, sem corte.

## Pilares
1. **Cena compartilhada.** Extrair o `.login-art` (robô transmux das 5 cores) num
   componente reutilizável, usado no FUNDO do site e do login. Mesma paleta/tokens.
2. **A transição (o coração).** View Transitions API — JÁ ligada no projeto
   (`transitions.css`: `@view-transition { navigation: auto }` + a marca `.logo`/
   `view-transition-name: hbx-brand` que morfa de posição). Landing → /login: o
   conteúdo de marketing esmaece, o robô CONTINUA, o card desliza (é o mesmo
   `is-leaving`/enter da login, em reverso). Fallback cross-fade onde não houver suporte.
3. **Mundo-site (visual próprio).** A landing é isenta do fiscal (`marketing.css`,
   `src/app/page.client.tsx`, `trabalhe-conosco/`) — pode ter visual mais rico, mas
   bebe dos MESMOS tokens da pele pra casar com o app.

## Estrutura da landing (rolagem cinematográfica, cada seção um "ato")
- **Hero** full-bleed: cena/robô + headline forte (não-cliché) + CTAs "Entrar" /
  "Criar conta". A cor cicla junto.
- **O Fluxo**: Radar → Vendas → WhatsApp → Retorno (4 nós que acendem ao rolar).
- **Módulos**: Radar, Vendas, Atendimento, Bot, Relatórios — cards de vidro, hover-lift.
- **Como funciona / diferenciais** (3–4 blocos).
- **Planos**: preço REAL de `/commercial-plans/public-catalog` (nunca hardcode — PAGAMENTOS.md).
- **Prova/números**: só com dado real; sem número fake (FRONTEND.md).
- **CTA final + rodapé** (termos, privacidade, trabalhe conosco).

## Técnico / cuidados
- **Performance/SEO (CRÍTICO pro público):** as 5 fotos pesam ~2MB cada. Converter
  WebP/AVIF + tamanhos responsivos + lazy. Mobile: talvez cena estática (transmux só
  desktop) — Google/celular/dados.
- **Rotas:** `/` (landing, já existe page.client.tsx) e `/login`. Brand morfa, cena
  não pisca entre as duas.
- **Acessibilidade:** respeitar `prefers-reduced-motion` (cena estática).

## Faseamento (amanhã)
- **A** — componente da cena compartilhada (site + login).
- **B** — hero + transição landing→login (o coração).
- **C** — seções (fluxo, módulos, planos reais).
- **D** — otimização de imagem + mobile + SEO.

## Dá conta? SIM.
A base já existe: View Transitions ligado, a cena/transmux, os tokens, o login com
entrada/saída. O trabalho é montar a landing e costurar a transição. Risco principal:
peso das imagens no público (resolver em D).
