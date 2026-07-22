# S5 — Central de Sons (chip no topo + Ajustes)

**Depende de:** S1 (o gate já lê a preferência; aqui ela ganha UI, lista completa e persistência).

Som sem botão de desligar vira motivo de desinstalar o app. E não é decisão do dono do sistema:
quem dirige com rádio ligado, quem usa fone, quem trabalha de madrugada — cada um precisa do seu.

## Duas portas, uma folha

**Porta 1 — chip no topo, à ESQUERDA do GPS.**
`syncHeaderChips()` (`app.js:1615`) monta hoje `[Atualizar] [GPS] [rede]`. Passa a montar
`[Atualizar] [Som] [GPS] [rede]` — mesmo componente `hbx-chip`, mesmo tamanho de ícone (15),
`data-action="chip-som"`.

Estado visual pela mesma escada de classes já existente:

| Estado | Classe | Ícone |
|---|---|---|
| Tudo ligado | `is-ok` | alto-falante |
| Algo desligado | `is-warn` | alto-falante |
| Tudo mudo | `is-off` | alto-falante cortado |

É isso que faz o chip valer a área nobre do topo: o motorista **vê** que está mudo sem abrir nada.
Hoje ele descobre que perdeu o aviso de chegada tarde demais.

**Porta 2 — Ajustes → seção Aplicativo** (`app.js:3405`), linha `settings-row` chamada **Sons**,
junto de Tema / Sincronizar / Sair. Mesmo padrão do Tema: rótulo à esquerda, estado atual à direita.

As duas portas abrem **a mesma folha**. Zero código duplicado, zero CSS novo.

## A folha — de cima pra baixo

```
┌─ Sons ──────────────────────────────────┐
│  [ ]  Todos os sons          ← chave-mestra
│  [ ]  Voz do GPS             ← as FALAS (separado)
│  ─────────────────────────────────────  │
│  Chegada                                │
│  [ ]  Aviso de chegada          ▶       │
│  [ ]  Chegada confirmada        ▶       │
│  Entrega                                │
│  [ ]  Entrega concluída         ▶       │
│  ...  (os 16, agrupados)                │
└─────────────────────────────────────────┘
```

**1. `Todos os sons`** — chave-mestra. Desligou, cala tudo (a lista continua visível, esmaecida).
Não é preset, é teto: item ligado com a mestra desligada continua mudo.

**2. `Voz do GPS`** — item próprio, acima da linha, porque **não é som, é fala**: é o TTS da
navegação (`speak()`, S5 da PR21072026-NAVEGACAO-HBX). O motorista que quer a voz e não os "dings"
— ou o contrário — resolve aqui. **A mestra dos sons não desliga a voz**, e vice-versa: são dois
canais independentes de propósito.

⚠️ **Cuidado que decide o sprint:** existem **duas** instâncias de TTS no app —
`NativeAppBridge.speak()` (instruções da rota) e `RotaService` (`"Chegou: $nome"`, linha 317).
Este toggle precisa calar **as duas**. Calar só uma = motorista jura que desligou a voz e ela
continua falando; é bug de confiança, o pior tipo.

**3. Lista dos 16**, agrupada por momento (Chegada / Entrega / Sincronia / Rota / Sistema), com
nome em português do que ele ouve — nunca a key técnica (`delivery_complete` não diz nada a ninguém).

**4. Prévia ao tocar no nome** (o `▶`): toca o som na hora. Sem isso a tela é inútil — ninguém
desliga o que não sabe qual é. A prévia **fura a mestra e o toggle do item** (tocar é intenção
explícita), mas respeita chamada em curso e voz falando.

## Simplificação vs. a versão anterior deste sprint

O tri-estado *Ligado / Só o essencial / Mudo* **sai**. Com a lista item a item, ele virou um segundo
sistema competindo com o primeiro — e dois lugares decidindo o mesmo é como se ganha bug. A mestra
+ os 16 toggles cobrem tudo que o tri-estado cobria, com mais precisão.

⚠️ **Consequência que o dono precisa saber:** com a lista aberta, o motorista **pode** desligar o
`Aviso de chegada` e passar reto do cliente. Não vou bloquear (você pediu todos listados), mas a
linha leva o aviso `essencial` como subtítulo e é a **primeira** da lista, pra ser uma escolha
consciente e não um deslize de dedo.

## Persistência

Um **único** JSON em `SharedPreferences` (`{ mestra, voz, itens: { key: bool } }`) — não 18 chaves
soltas. Caminho: JS grava → ponte `setSoundPrefs(json)` → `SharedPreferences` → Engine lê de lá.

**Fonte da verdade = `SharedPreferences`**, o cache do JS é só pra pintar a tela: a
`ChegadaActivity` toca com o WebView fora de foco e não pode perguntar nada ao JS.

**Mudo NÃO silencia a vibração.** `H.vibrate` segue independente — é o canal que sobrevive a
caminhão barulhento e a fone tirado.

## Aceite do S5

- [ ] Chip aparece à esquerda do GPS e muda de cor conforme o estado (ok / warn / off)
- [ ] Chip e Ajustes abrem exatamente a mesma folha
- [ ] Mestra desligada: rodar entrega inteira sem um som; **vibração continua**
- [ ] `Voz do GPS` desligada: nem a instrução de rota **nem** o "Chegou: X" do `RotaService` falam
- [ ] `Voz do GPS` desligada + sons ligados: os "dings" continuam (canais independentes)
- [ ] Desligar 1 item: só ele cala, o resto segue
- [ ] Prévia toca mesmo com o item desligado; **não** toca durante chamada telefônica
- [ ] Preferências sobrevivem a fechar/reabrir **e** à atualização do APK
- [ ] Com o app em segundo plano (tela de chegada), a preferência é respeitada
- [ ] `check-pele` verde (nenhum hex/inline novo)
