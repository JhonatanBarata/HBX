# PR21072026 — NAVEGAÇÃO HBX (fim do troca-troca de tela)

## Objetivo
O motorista fica DENTRO do HBX o dia inteiro. Hoje: iniciar rota / contagem de próxima
parada jogam pro Waze/Maps (`abrirNavegacao()` em app.js:3658/3693/3766/4003) e o
motorista fica indo-e-voltando de app. Depois desta frente: o mapa da tela Rota é a
navegação (segue o GPS, mostra a rota em 3 cores, painel compacto em cima do mapa,
voz OSRM+TTS). Waze/Maps vira um ícone opcional ("GPS avançado") à esquerda do play.

Custo: R$ 0 por parada (OSRM + TTS nativo do Android). S4 tira o servidor demo do
caminho crítico (risco de bloqueio) e prepara self-host futuro via env.

## Decisões do dono (21/07, chat)
1. Painel de próxima parada EM CIMA do mapa, ocupando pouco espaço, 2 linhas:
   `Próxima parada · Mercado São João — 2 de 8`
   `Rua X, 123 · aproximadamente 2,1 km`
2. "Abrir GPS avançado" (Waze/Maps) vira ÍCONE à esquerda do disco play "›".
3. À esquerda desse novo ícone ficam os ícones de excluir (route-cancel-icon já
   existentes: cancelar planejamento / encerrar / limpar dia). Ordem final da linha:
   `[excluir…] [GPS avançado] [DISCO PLAY]`.

## Sprints (ordem de execução, SEQUENCIAL — todas tocam app.js)
- S1 `S1-PAINEL-E-CONTROLES.md` — painel compacto sobre o mapa + reordenação dos controles.
- S2 `S2-FIM-DO-TROCA-TROCA.md` — iniciar rota NÃO abre mais app externo; mapa segue o GPS
  ao vivo na rota ativa (reuso da infra da Leitura); countdown vira foco no mapa.
- S3 `S3-PERNAS-3-CORES.md` — rota em pernas: percorrido azul, perna atual esmeralda,
  restante apagado; avanço de perna ao confirmar entrega; recálculo com disjuntor.
- S4 `S4-OSRM-BACKEND.md` — OSRM via backend (proxy + cache + rate-limit por empresa),
  fallback pro público; `OSRM_BASE_URL` por env (self-host futuro = trocar env).
- S5 `S5-VOZ-TTS.md` — steps do OSRM + banner de instrução + voz TTS nativa pt-BR.

## Invariantes (valem pra TODAS as sprints)
- CONSTITUIÇÃO do APK (memória `androidapk`): 10 Leis. Em especial: tokens de app.css
  (Lei 2; verde esmeralda `--cta` = ação/perna atual; limão `--brand` = identidade),
  copy mínima (Lei 8), transição em tudo (Lei 9), handleBack (Lei 10), ícones só via
  `icon()` (catálogo ~app.js:190).
- Camadas de mapa (MapLibre paint) aceitam hex direto — padrão já existente
  (hbx-route-line #78c900, trilha #0865df). NÃO é violação da Lei 2.
- Mapa é TRANSPLANTADO (`el.__hbxMap`) — nunca recriar; atualizar via source.setData.
  Painel/controles são HTML normal do render; atualização viva por querySelector patch
  (padrão gpsStatus/nextStop).
- Modo LEITURA publicado ontem NÃO pode regredir: qualquer generalização da infra de
  follow/trilha mantém o comportamento da Leitura idêntico.
- Kotlin: comentário de bloco ANINHADO compila errado (`/*` dentro de KDoc) — escrever
  `tracking/…` sem asterisco.
- Autoridade: backend manda na ORDEM das paradas e nas entregas; OSRM só desenha o
  caminho. Nenhuma regra de negócio muda nesta frente.

## Regras de execução (orquestrador ↔ workers)
- Trabalhar DIRETO na branch atual (master). PROIBIDO criar branch/worktree.
- Worker NÃO commita, NÃO builda APK, NÃO publica. Validação: `node --check` no app.js
  (e `cd backend && npx tsc --noEmit` quando tocar backend).
- Orquestrador revisa o diff e commita ao fim de cada sprint. Publish é do dono.
