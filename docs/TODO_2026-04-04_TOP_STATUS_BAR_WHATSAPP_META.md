# PRIORIDADE — 2026-04-04 — Barra superior de status operacional

## Contexto

No uso real, especialmente no celular, nao ficou claro onde enxergar rapidamente o estado operacional do sistema.

Falta uma leitura visual forte, imediata e clicavel mostrando se os pontos criticos estao vivos ou quebrados.

## Objetivo

Criar uma barra superior de status operacional, visivel e muito clara, com leitura instantanea.

## Itens que devem aparecer no topo

### 1) Token ativo

Mostrar se o token operacional necessario para envio/uso atual esta ativo.

### 2) Meta ativo

Mostrar se a integracao oficial da Meta esta ativa / conectada / pronta para uso.

### 3) WebWhats ativo

Mostrar se o trilho temporario / webwhats / QR / conexao alternativa esta ativo.

## Comportamento visual desejado

- ficar no topo, em area muito visivel;
- leitura simples e imediata;
- verde quando estiver ok;
- com efeito visual de vida / pulso / energia / "go go go" quando estiver operacional;
- estados ruins precisam ficar muito claros;
- no celular isso precisa continuar forte e legivel.

## Comportamento funcional desejado

Cada item do topo precisa aceitar clique.

Ao clicar, o sistema deve:

- verificar o estado real no momento;
- abrir o ponto certo para resolver o problema;
- não apenas mostrar aviso solto;
- direcionar o operador para a correção operacional real.

## Exemplo de intenção por clique

### Token ativo

Ao clicar:

- mostrar de onde o token esta vindo;
- se o token esta invalido, ausente ou expirado;
- abrir o ponto certo de configuracao/correcao.

### Meta ativo

Ao clicar:

- mostrar se a conexao oficial esta realmente pronta;
- mostrar status atual;
- levar para a tela/guia correta de integracao Meta;
- ajudar a entender se esta conectado, pendente ou quebrado.

### WebWhats ativo

Ao clicar:

- mostrar se QR / pairing / trilho temporario esta realmente disponivel;
- abrir o caminho de conexao;
- exibir o que estiver faltando para funcionar.

## Revisar o comportamento atual

Verificar como a barra/topo ja esta se comportando hoje, porque existe lembranca de que:

- alguns avisos ja aparecem no topo;
- ao clicar pode estar levando para mensagens pendentes;
- existem mensagens do sistema;
- o comportamento atual parece confuso e nao focado em diagnostico operacional.

## Revisar amanha

- o que ja existe no topo hoje;
- se o clique atual leva para mensagens pendentes;
- se o clique atual so mostra aviso, mas nao resolve;
- como integrar esses cliques com o diagnostico e a acao real;
- como fazer isso funcionar bem no celular.

## Resultado esperado

Ao final:

- operador bate o olho e entende se esta tudo vivo;
- verde pulsando quando estiver operacional;
- clique leva para resolver;
- menos duvida e menos caca manual por status escondido;
- topo realmente util para operacao diaria.
