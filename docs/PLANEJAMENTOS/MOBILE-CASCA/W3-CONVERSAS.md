# W3 — CONVERSAS mobile (mockup aprovado 2)

> Ler PLANO.md + docs/Rules/FRONTEND.md + W1-RESULTADO.md. Componentes da casca nova. Desktop de
> `/atendimento` INTOCADO. Envio/dados: EXATAMENTE os caminhos existentes (dispatch via
> messaging.service já plugado no front; quoted/áudio/anexo reusam o que o desktop usa). Zero backend.

## Lista (registrada pra `/atendimento`)
- Topo: "Conversas" + **pontinho de status do chip** (verde=open; vermelho + faixa fina de estado
  quando cai — mesmo padrão da faixa de busca) + ícone busca.
- Chips finos 11px: **Todas · Não lidas · {n} · Bot · {n}** (filtro 1 toque).
- Linhas 64px: avatar 36, nome 13px/500, prévia 11px truncada (prefixos: "Você:", ícone robô p/
  bot, "Áudio · 0:37", "Foto"), hora à direita (accent quando não lida) + bolha contador.
  **≥8 conversas visíveis.**

## Chat (takeover — LEI)
- Abrir conversa = **tela cheia com transição IR**; tab bar SAI, input entra. Voltar = seta, VOLTAR.
- Header 48px: seta + avatar 32 + nome/telefone + menu ⋮ (aqui dentro: atribuir atendente, ficha,
  encerrar — resumo; o resto é desktop).
- Balões: recebido neutro / enviado token accent da pele; quoted real; áudio com play; hora + checks.
- Input fixo embaixo: + (anexo), campo pill 36px, mic/enviar.
- Estados: carregando, vazio ("Nenhuma conversa ainda"), erro.

## Leis
Nada abre/fecha sem transição. Casca inalterada (o takeover é comportamento DA casca — usar a API
do W1, não inventar). Anti-placona. check-pele verde. **NÃO tocar em conexão/reconexão de chip.**

## Checks
Viewport 375×812: lista densa, chat abre/fecha com transição, enviar texto funciona no fluxo
existente. Desktop intocado. lint+tsc+build. Commit `feat(mobile-casca): W3 conversas`.
Gravar `W3-RESULTADO.md`, apagar este arquivo.
