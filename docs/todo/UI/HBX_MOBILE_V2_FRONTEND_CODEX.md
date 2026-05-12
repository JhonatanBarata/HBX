# HBX Mobile V2 Frontend Premium — comando para Codex

Objetivo: criar um Mobile V2 premium para o HBX, inspirado na imagem de referencia dos 4 celulares: Login, Radar Digital, Processando Leads e Vendas/Agenda.

A regra principal: o HBX ja funciona. Nao refatorar o sistema inteiro. Substituir o render mobile ruim por uma experiencia nova, premium e ligada aos dados reais.

## Comando para colar no Codex

```txt
Voce esta no repo JhonatanBarata/HBX.

Contexto:
O HBX ja esta funcional. O problema e o frontend mobile: esta feio, sem vida e nao impressiona. Eu preciso vender esse sistema, entao o mobile precisa parecer produto premium de verdade, parecido com a imagem de referencia dos quatro celulares: Login, Radar Digital, Processando Leads e Vendas/Agenda.

Mudanca de estrategia:
PARE de tentar remendar o mobile antigo.
Crie uma experiencia MOBILE V2 isolada.

Regra central:
Substitua completamente o JSX/CSS do modo mobile.
Preserve apenas dados reais, tipos, funcoes, handlers e endpoints existentes.

Nao apagar:
- backend
- desktop
- autenticacao
- automacao
- QR
- WhatsApp
- planos/permissoes
- negativos/opt-out/duplicidade/ownership

Nao criar:
- mock fake
- endpoint paralelo
- regra nova de negocio
- nova API sem necessidade

Pode descartar:
- layout mobile antigo
- cards mobile antigos
- hero mobile antigo
- estilos mobile antigos que estiverem prendendo a evolucao

Arquitetura desejada:
Quando estiver em viewport mobile ou mode=mobile, renderizar componentes Mobile V2 novos.
Quando estiver desktop, continuar renderizando o desktop atual.

Frase-chave:
Jogue fora o JSX mobile antigo. Mantenha a logica real.
```

## Etapa 1 — Vendas/Agenda Mobile V2

```txt
Implemente primeiro SOMENTE Vendas/Agenda Mobile V2.

Nao mexer em Radar nesta etapa.
Nao mexer em Login nesta etapa.
Nao mexer em backend nesta etapa, exceto se for absolutamente necessario para salvar observacao e depois de provar que nao existe endpoint atual.

Arquivos principais:
- frontend/src/app/vendas/automacao/page.client.tsx
- frontend/src/app/vendas/automacao/page.module.css

Criar componente novo:
MobileVendasProspecaoV2

Ele deve usar dados reais ja existentes:
- mobileBoard
- mobileBoard.summary
- mobileBoard.blocks.overdue
- mobileBoard.blocks.today
- mobileBoard.blocks.scheduled
- mobileBoard.blocks.closed
- MobileLeadItem
- MobileBoardResponse
- MobileDialPrefs
- funcoes atuais de WhatsApp
- funcoes atuais de ligacao
- funcoes atuais de reagendar/encerrar, se existirem
- apiFetch
- notice/setNotice

Nao criar leads fake.
Nao popular nada manualmente.
Nao trocar endpoint funcional.
```

### UI desejada para Vendas Mobile V2

```txt
A tela Vendas mobile deve parecer o quarto celular da imagem de referencia.

Visual:
- fundo claro premium
- cards brancos ou quase brancos
- sombras suaves
- bordas arredondadas
- azul/ciano para acao principal
- vermelho/rosa somente para atrasados
- verde para sucesso/WhatsApp confirmado/proximos
- nada de formulario cru
- nada de desktop espremido

Header:
- titulo: Vendas
- subtitulo: Agenda de prospeccao
- botao pequeno para configuracao de ligacao/DDD/CSP

KPIs do topo:
- Atrasados = mobileBoard.summary.overdue || 0
- Hoje = mobileBoard.summary.today || 0
- Proximos = mobileBoard.summary.scheduled || 0

DDD/CSP NAO pode aparecer como KPI principal.
Mover DDD/CSP para configuracao secundaria: bottom sheet, drawer, botao pequeno ou area recolhivel.
Nao apagar a funcionalidade.
```

### Proximo card recomendado

```txt
Criar bloco visivel: Proximo card recomendado.

Usar leads reais de mobileBoard.blocks.
Prioridade:
1. overdue primeiro
2. today depois
3. scheduled depois
4. menor returnAt primeiro
5. WhatsApp available antes de unknown
6. menor attemptCount primeiro

Mostrar:
- nome do lead
- cidade/UF
- retorno/urgencia
- proxima acao
- botao Executar
```

### Cards de lead no mobile

```txt
Redesenhar os cards mobile do zero.
Cada card deve responder: quem e, onde esta, qual etapa, quando agir e o que fazer agora.

Cada card deve mostrar:
- nome
- cidade/UF
- status/statusLabel
- WhatsApp availability: confirmado, sem WhatsApp ou nao confirmado
- proxima acao
- retorno/data/hora
- tentativas, se existir
- ultimo contato, se existir
- observacao curta, se existir

Acoes no card:
- WhatsApp
- Ligar
- Observacao
- Reagendar, se ja existir handler real
- Encerrar, se ja existir handler real

Nao remover acoes atuais.
Nao quebrar href de WhatsApp.
Nao quebrar tel: de ligacao.
```

## Etapa 2 — Bottom Sheet Agenda de Cards

```txt
Criar bottom sheet real chamada Agenda de Cards.

Abrir ao clicar nos KPIs:
- Atrasados
- Hoje
- Proximos

Nao usar modal central.
Nao criar nova pagina.
Nao criar nova rota.
A bottom sheet deve subir de baixo e ocupar 80% a 90% da altura mobile.

Conteudo:
- handle visual no topo
- titulo: Agenda de Cards
- resumo: X ativos · Y atrasados
- abas/chips: Agora, Atrasados, Hoje, Proximos, Fechados

Dados:
Usar somente leads reais de mobileBoard.blocks: overdue, today, scheduled e closed.

Cada item deve mostrar:
- nome
- localidade
- retorno/urgencia
- proxima acao
- status
- WhatsApp
- botoes: WhatsApp, Ligar, Observacao
```

## Etapa 3 — Bottom Sheet Observacao

```txt
Criar bottom sheet de Observacao para mobile.

Nao criar campo novo.
Usar o mesmo campo que o desktop ja usa. Preferencia: shortNote.

Antes de implementar save:
1. procurar no frontend onde o desktop salva shortNote
2. identificar endpoint real
3. reutilizar esse endpoint

UI:
- titulo: Observacao
- subtitulo: nome do lead + cidade/UF
- textarea
- placeholder: Digite uma observacao sobre este lead...
- botoes: Cancelar e Salvar

Comportamento:
- abrir ao clicar em Observacao no card ou na agenda
- carregar texto atual de lead.shortNote
- salvar no backend real
- mostrar loading no botao enquanto salva
- bloquear fechamento enquanto salva
- apos salvar, atualizar mobileBoard localmente sem reload completo
- feedback: Observacao salva.
- erro: Nao foi possivel salvar a observacao.
```

## Etapa 4 — Radar Digital Mobile V2

```txt
Executar somente depois de Vendas/Agenda Mobile V2 estar funcional.

Objetivo:
O Radar mobile deve parecer o segundo e terceiro celulares da imagem. Ele deve funcionar como assistente de pedido de leads.

Preservar:
- filtros reais
- estados reais
- busca real
- importacao real
- regras de negativos, opt-out, bloqueios, duplicidade e ownership

Tela setup:
- Header: Radar Digital
- Headline: Conte para o Radar quais leads voce precisa
- Subtexto: Defina seu publico-alvo e deixe o HBX trabalhar para voce.
- Campos reais: Segmento, Cidade, Estado, Quantidade e Tipo de alvo se ja existirem
- Caixa informativa: O HBX vai buscar empresas que combinam com o que voce precisa e enviar automaticamente para o Vendas.
- CTA: Buscar leads

Tela processing:
- Headline: Trabalhando em seus leads.
- Subtexto: Voce vera tudo automaticamente no Vendas.
- ring de progresso visual
- etapas: Segmento validado, Localizacao validada, Buscando leads, Enviando para Vendas
- CTA: Abrir Vendas
- CTA leva para /vendas/automacao?tab=prospeccao&mode=mobile

Nao criar progresso falso de negocio. Se nao houver percentual real, usar progresso visual indeterminado ou estados de etapa.
```

## Etapa 5 — Login Mobile V2

```txt
Executar somente depois de Vendas e Radar estarem encaminhados.

Preservar:
- autenticacao real
- validacao
- loading
- erros
- redirecionamento
- desktop

Visual:
Parecido com o primeiro celular da imagem.

Layout:
- fundo dark tech premium
- gradientes sutis
- linhas/circuitos discretos
- HBX grande, mas sem exagerar
- headline: Automacao que conecta. Inteligencia que vende.
- segunda linha em azul/ciano
- subtexto: Entre na sua conta para continuar.
- formulario em painel/card translucido
- inputs escuros/translucidos, nao brancos crus
- botao Entrar com gradiente azul/ciano
- link Esqueci minha senha
- ocultar widget/bolinha de suporte no login mobile, se aparecer

Nao mudar logica de login.
Nao recriar auth.
```

## Regras de UI/UX

```txt
Mobile nao e desktop espremido.
Mobile e execucao rapida.

Principio:
Radar abastece.
Vendas executa.
Agenda diz qual card atacar agora.
Observacao registra contexto.

Usar:
- cards grandes e claros
- botoes com area de toque confortavel
- bottom sheets no lugar de modais centrais
- hierarquia visual forte
- poucos textos
- estados claros
- feedback apos acao
- visual premium, mas leve para Android comum

Evitar:
- tabela no mobile
- modal central
- excesso de informacao
- texto pequeno demais
- formulario cru
- fundo branco morto
- animacao pesada
- refatoracao global sem necessidade
```

## Criterio de aceite final

```txt
Vendas mobile:
- /vendas/automacao?tab=prospeccao&mode=mobile renderiza Mobile V2.
- Desktop continua igual.
- Topo tem Atrasados, Hoje e Proximos.
- DDD/CSP nao aparece como KPI principal.
- KPIs usam dados reais.
- Clicar nos KPIs abre Agenda de Cards.
- Agenda lista cards reais.
- Observacao abre bottom sheet.
- Observacao salva no backend real.
- Card atualiza sem reload.

Radar mobile:
- Radar parece assistente de pedido de leads.
- Campos usam estados/componentes reais.
- Busca/importacao usa fluxo real.
- Processando parece premium.
- CTA abre Vendas mobile.

Login mobile:
- Login parece premium dark tech.
- Auth continua funcionando.
- Desktop sem regressao.

Validacao:
- testar 375px, 390px e 430px
- rodar lint/typecheck/build relevantes
- listar arquivos alterados
- explicar endpoints reutilizados
```
