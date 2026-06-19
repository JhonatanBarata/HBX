# Testes manuais obrigatórios antes de subir qualquer branch

- Atendimento → Conexão WhatsApp → Conectar/gerar QR: o QR deve PERSISTIR durante o poll (4s) e ser escaneável; após escanear, pill vira Conectado.
- Pill de Atendimento com modal FECHADO (poll 20s): com WhatsApp desconectado, a pill fica "Desconectado" parada — sem chamar o motor, sem piscar "Iniciando" ou "Reconectando" de forma fantasma.
- Modal aberto → clicar "Conectar / gerar QR" → QR aparece → aguardar 2 ciclos de poll (8s) → QR PERSISTE (não some); escanear com o celular → pill vira "Conectado" sem recarregar a página.

## WhatsApp — confiança pós-connect (teste de campo VPS 19/06)
- Conectar um número NOVO → a lista de conversas/contatos deve aparecer **sozinha** em poucos segundos, SEM hard refresh (hoje exige refresh — bug #3, falta SSE/re-sync no bootstrap do connect).
- Fotos de perfil dos contatos devem aparecer após o connect sem refresh; sem foto = avatar de inicial (fallback), nunca quebrado (bug #2 — foto só busca no sync e o motor esquenta depois).
- Envio: se um chip recebe mas NÃO envia (OUTBOUND vira FAILED) e outro chip envia normal → é estrangulamento/ban do chip (motor), NÃO trava nossa. Critério: o `lastError` do FAILED vem do webhook de entrega, não de regra interna.

## Atendimento — reação + foto on-demand (19/06)
- Reagir a uma mensagem (clicar no emoji rápido) **não dá 404**; a reação registra e aparece. Mensagem sem chave válida → erro claro (BadRequest "sem chave válida pra reagir"), nunca 404. (Raiz: a reação resolvia por ID sintético do motor; agora resolve pelo ID do banco igual ao retry.)
- Abrir um chat cujo contato veio sem foto (ex.: "Abner primo") → a foto carrega **sozinha**, in-place, **sem recarregar a página e sem piscar** a tela. Clicar na foto do cabeçalho força nova busca. Motor sem foto = iniciais (fallback), nunca quebrado. (Endpoint `POST /inbox/conversations/:id/avatar/refresh → { avatarUrl }`; front faz patch só daquela conversa, sem `loadConvs()`.)
- A LISTA de conversas deve **ir reordenando conforme a última mensagem** (a conversa com msg nova sobe pro topo e o preview/hora atualizam) sem travar em mensagens antigas — mesmo em produção atrás do proxy onde o SSE pode morrer calado. Critério: receber/enviar uma msg → em até ~10s a conversa sobe e o preview muda, sem hard refresh. Enviar do próprio atendente atualiza na hora. (Fix: poll de fallback de `loadConvs` 10s + `loadConvs` após enviar; backend já ordena por `MAX(timestamp)`.)

## Mobile (refatoração 19/06)
- `npx playwright test --project=mobile-chromium mobile-no-overflow` PASSA: nenhuma rota principal tem corte horizontal em 397px (`/login`, `/dashboard`, `/leads`, `/vendas`, `/atendimento`, `/bot`, `/relatorios`, `/configuracoes`).
- Desktop INTOCADO: `npm run build` verde e nenhuma regra de layout fora de `@media` (mobile.css não pode mudar 1px do desktop).
- Em celular real: barra de abas (Início/Radar/Vendas/Chat/Mais) navega; folha "Mais" abre/fecha; login com robô em faixa no topo; Atendimento com compositor fixo (testar com teclado aberto); Vendas desliza entre colunas; Bot mostra leitura + "edite no PC" (sem canvas no dedo).

## Onboarding / Self-Checkout — continuidade do funil (Slice 3, 19/06)
- **Resume não perde o lugar:** no funil (`/?ver=planos`), escolher um plano → preencher cadastro → enviar → tela "Aguardando confirmação" → **recarregar a página (F5)** → tem que voltar NA tela de espera (não no form zerado). Critério: o `?resume=1` + a dica em sessionStorage reidratam o passo via `POST /auth/onboarding/resume`.
- **Login não é beco:** logar com e-mail NÃO confirmado + **senha certa** → vira "continue seu cadastro" (reenviar + "Continuar cadastro"); clicar "Continuar cadastro" → cai no funil no passo exato (`/?ver=planos&resume=1`). Com **senha errada** → mensagem genérica, sem revelar plano nem dar token (anti-enumeração).
- **Re-cadastro do mesmo e-mail** (ainda não confirmado, senha certa) → NÃO dá "e-mail já cadastrado" seco: renova o link e volta pra tela de espera.
- **Confirmar pelo WhatsApp (F6, dev/mock):** na tela de espera → "Confirmar pelo WhatsApp" → digitar telefone → "Enviar código" → o **código de 6 dígitos aparece na própria tela** (preview de ambiente de teste) → digitar → "Confirmar código" → confirma a identidade (entra ou cai em aguardando pagamento). Em produção o código NÃO aparece (envio real é gated `LIVE_WHATSAPP_CONFIRM_TODO` até ligar o chip do Master na VPS).
- **Anti-abuso de trial no checkout:** duas empresas diferentes usando o MESMO CPF/telefone no checkout de um plano com trial → a 2ª recebe erro (`TRIAL_PHONE/TAX_DOCUMENT_ALREADY_USED`). Mesma empresa refazendo o checkout → passa (idempotente).
- **Cartão só depois de confirmar:** signup não devolve mais `checkout_token`; o CheckoutPanel só abre com sessão plena (e-mail/identidade confirmada). Pré-confirmação = sempre a tela de espera.
