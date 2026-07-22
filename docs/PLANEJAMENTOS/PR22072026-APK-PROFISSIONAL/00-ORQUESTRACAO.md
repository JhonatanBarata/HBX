# PR22072026 — APK com cara de profissional

**Pedido do dono (22/07):** "tudo que arruma piora. Tela pisca às vezes, ao criar rota o ícone
sobe e desce, tem bug de som tocando 2x. Quero um app com aparência de profissional."

**Escolha A (registrada):** tudo nasce do catálogo de ícones. O GPT injetou uma camada de cor e
movimento por cima — ela é boa em execução, mas contradiz o A em dois pontos e traz um bug de tema.

## Diagnóstico — a causa é UMA
Efeito visual/sonoro amarrado ao **re-render**, não ao **gesto**. O app redesenha a tela a cada
tique de GPS / mudança de estado; a cada redesenho o efeito recomeça. Daí saem os três sintomas
(piscada, ícone pulsando, som repetido). A lei que fecha tudo: **efeito é opt-in, dispara 1x no
gesto, nunca no render.**

## Divisão (2 workers, arquivos DISJUNTOS — sem colisão)
| Worker | Sprints | Arquivos que pode tocar |
|---|---|---|
| **A** | S1 contrato do ícone · S2 movimento domado · S4 som duplicado · S5 disco do catálogo | `EntregaShell/app/src/main/assets/app/app.css`, `EntregaShell/app/src/logistica/assets/app/app.js` |
| **B** | S3 fim da piscada | `EntregaShell/app/src/main/assets/app/native.js`, `EntregaShell/app/src/logistica/assets/app/mobile-contract.js` |

**Regra dura:** worker NÃO encosta em arquivo do outro. Se precisar, escreve no RESULTADO e o
orquestrador aplica depois. Sem branch nova — tudo direto no `master`, commit local.
**S6 (teste no aparelho) NÃO é dos workers — o dono testa.** Nada de publish.

## Aceite
- Nenhum ícone decide a própria cor (nem no glifo, nem por posição no DOM).
- `--info` existe nos dois temas.
- Ícone em repouso é estático; movimento só quando o componente pede.
- 1 gesto = 1 som.
- Tela do app não é reconstruída inteira quando só um texto mudou.
- Zero hex novo; tudo em token.
