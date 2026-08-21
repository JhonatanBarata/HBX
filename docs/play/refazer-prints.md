# COMO REFAZER AS CAPTURAS (roteiro medido em 21/08/2026, moto g15)

As 5 capturas saíram do **modo demonstração** — clientes fictícios ancorados no
bairro de quem abre. Nenhuma tem dado de cliente real, que é exigência tanto de
privacidade quanto de política da Play.

## O que precisa estar verdadeiro antes

| Condição | Por quê |
|---|---|
| Conta Google **sem empresa** no HBX | `talvezOferecerDemo()` só dispara com `total == 0` clientes |
| Permissão de localização **concedida** | sem âncora de GPS a demonstração desiste (`ancoraDemo()`) |
| App **reaberto DEPOIS** de conceder | a oferta roda num `setTimeout` de 4,5 s no boot; conceder depois não a traz de volta |

⚠️ Foi exatamente essa a pegadinha em 21/08: o app abriu com a permissão negada,
a demonstração desistiu em silêncio e a tela ficou "Sem paradas hoje". Reabrir
resolveu.

## O roteiro

```
adb shell am force-stop br.com.hbxsystem.logistica
adb shell monkey -p br.com.hbxsystem.logistica -c android.intent.category.LAUNCHER 1
```

Espere ~15 s: a demonstração abre sozinha com 8 paradas.

| # | Tela | Como chegar |
|---|---|---|
| 1 | Mapa da rota | a tela que a demonstração abre (melhor depois de 1 entrega, com o ✓ na parada 1) |
| 2 | Montagem / lista | botão **Lista**, rolando até os totais (24 produtos · R$ 486,00) |
| 3 | Rota em andamento | **Iniciar rota** → **Panorâmica** |
| 4 | Folha da venda | **Lista** → tocar no card da parada 1 |
| 5 | Dia encerrado | **Finalizar** → *Encerrar dia* |

Captura: `adb exec-out screencap -p > docs/play/bruto-N.png`
(no Git Bash, `export MSYS_NO_PATHCONV=1` antes).
Depois: `pwsh -File docs/play/cortar-prints.ps1` — corta 1080×2400 → 1080×2160.

## Duas coisas para não repetir

- **A lista mostrava "não consegui o custo agora"** em laranja na primeira
  captura. Erro visível na vitrine reprova sozinho — role a lista até os cards
  cobrirem a linha, ou espere o custo carregar.
- **A tela de dirigir ficava com o painel superior VAZIO na demonstração** — sem
  instrução de curva nem ETA, metade da tela preta, e o mapa sem a fita verde.
  Por isso a captura 3 é a panorâmica. ✅ **Causa achada e corrigida em 21/08**
  (ver abaixo); ⬜ falta a prova no aparelho, que só sai com um binário novo.

## O defeito da tela de dirigir — causa e conserto (21/08/2026)

**Não era o OSRM.** `window.__demoIntercepta` (`C8-demonstracao.js`) respondia por
**toda** porta com a demonstração no ar: o que ela não conhece virava `null`, e
`null` não é `undefined` — o cano (`00-nucleo.js:425`) só vai à rede com
`undefined`. `/logistica/osrm/route`, de onde saem o traçado e as manobras
(`pedirRota`, `60-prospector-nav.js:656`), caía nesse silêncio: recebia `null`,
lançava *"Rota viária não encontrada"*, e sem fita não há catraca — sem catraca,
nenhuma manobra aparece.

⚠️ **E o defeito era mudo de propósito**: o alarme *"O caminho veio sem desenho"*
só dispara no ramo "respondeu SEM geometria", nunca no ramo "não respondeu".

**O conserto** é uma fresta de leitura para `/logistica/osrm/{route,table}`, e só
para elas: são geometria pura (`logistica-osrm.controller.ts` é `@Get`), não leem
nem escrevem registro de empresa e **não debitam crédito** — quem cobra é
`/logistica/rota/iniciar`, que segue barrado. A fresta é **GET**; nenhuma escrita
alcança a rede na demonstração, que é a coisa que a trava existe para garantir.

**Medido no OSRM do VPS** (`http://172.18.0.1:5000`, self-hosted — o público
`router.project-osrm.org` responde **403**), nas coordenadas do bairro onde a
demonstração ancorou:

```
code Ok | pontos 14 | passos 4
manobras: [('depart','Avenida 15'), ('turn','Rua 13'), ('turn','Avenida 9'), ('arrive','Avenida 9')]
```

Ou seja: com a fresta aberta a cena recebe fita **e** instruções de rua com nome.

⬜ **A prova no g15 não cabia nesta sessão**: o aparelho tem o binário da Play, e
o APK local é assinado com a chave de upload — instalar por cima exige desinstalar
(perde pareamento) e o login local só volta quando o **segundo cliente OAuth**, com
a SHA-1 `B4:21:95:11:…`, existir (ver §5.1 do ANDROID-PLAY.md).
