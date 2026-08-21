# PASSO A PASSO — do estado de hoje até o app público na Google Play

> Escrito em 21/08/2026 contra o estado real medido no Console, no g15 e neste
> repositório. **Estado de publicação é estado vivo: confira no Console, nunca
> aqui.** O que está decidido e por quê: [ANDROID-PLAY.md](../Rules/ANDROID-PLAY.md).

## Onde o app está agora

| Fato | Estado |
|---|---|
| App criado, `br.com.hbxsystem.logistica` | ✅ (applicationId é irreversível) |
| `versionCode 1` enviado e **queimado** | ✅ — nenhum upload novo pode reusar o 1 |
| Assinatura pela Google (`26:C9:F3…`) | ✅ já ativa — a tela sem volta já passou |
| Faixa em que está | **teste interno** |
| Login com Google no binário da Play | ✅ resolvido em 21/08 (SHA-1 corrigida) |

🔴 **Teste interno NÃO conta** para o pedido de produção. O relógio dos 14 dias só
corre em **teste fechado** (*Closed testing*).

---

## FASE 1 — Um binário novo, porque o código mudou

Desde o `versionCode 1` mudaram: `PairingActivity.kt` (o log do Sign-In),
`C8-demonstracao.js` (a fresta das ruas) e `mock.css` (os 4 tokens de contraste).
Nada disso está no binário que a Play tem.

1. **Suba o `versionCode`** em `EntregaShell/app/versao-logistica.properties`:
   `versionCode=2`. Deixe `versionName=1.0.0`.
   ⚠️ Um número por upload, **sem exceção** — a Play queima o número mesmo se a
   release for descartada sem publicar.
2. Gere o bundle assinado (`:app:bundleLogisticaRelease`).
3. ⬜ **Antes de subir, prove no g15** — e para isso é preciso o passo 4.
4. **Cadastre o SEGUNDO cliente OAuth Android** (Cloud Console → Credenciais),
   mesmo pacote, SHA-1 `B4:21:95:11:95:BB:20:C3:F1:86:41:CE:39:3A:7E:AF:27:7A:9C:02`
   — a chave de **upload**. Sem ele o APK compilado aqui não faz login, e não há
   como testar nada fora da Play. Cada cliente aceita UMA impressão, por isso são
   dois: um para a chave da Google, outro para a de upload.

## FASE 2 — Página "Detalhes do app"

Textos, ícone, recurso gráfico e as 5 capturas: [LEIA-ME.md](LEIA-ME.md) e
[TEXTOS-DA-FICHA.md](TEXTOS-DA-FICHA.md). O único campo seu é o **Vídeo** (opcional
— a recomendação é deixar vazio no 1º envio).

## FASE 3 — Conteúdo do app (os formulários)

Painel → **Ver etapas**. Respostas apuradas contra o código:

| Formulário | Resposta |
|---|---|
| **Detalhes do login** (era "Acesso ao app") | *Não — é necessário fazer login*, com a instrução do botão "Conectar com Google Play" |
| **Segurança dos dados** | Coleta: nome, e-mail, telefone, endereço, localização **precisa e aproximada**, fotos, arquivos, IDs. ⚠️ Localização **NÃO** é efêmera (existe `LogisticaTrackingPoint`). Nada é *compartilhado* |
| **Classificação (IARC)** | Utilitário/produtividade · sem violência/sexo/drogas · **permite comunicação entre usuários: Sim** · **compartilha localização com outros usuários: Sim** (a empresa vê) · compras digitais: **Não** |
| **Anúncios** | Não contém anúncios |
| **Público-alvo** | 18 anos ou mais |
| **Recursos financeiros** | Nenhum — os botões só REGISTRAM como o cliente pagou |
| **Categoria** | Empresas |
| **Grátis ou pago** | Grátis (**irreversível**) |
| **Política de privacidade** | hbxsystem.com.br/politicas |

⚠️ **Serviço em primeiro plano** só aparece DEPOIS que a Google processa o bundle.
Tipo: **Localização**, e só. Provado no g15: `types=0x00000008`, canal
`rota_status`, e o serviço para sozinho ao encerrar o dia.

O **vídeo** dessa declaração (que não é o da ficha) precisa mostrar: iniciar rota →
notificação aparece → sair do app e a notificação continuar. Não precisa dirigir.
Link **público** ou não listado — link privado reprova.
⚠️ Ele grava a tela de dirigir; conferir antes se o painel de manobras aparece
(ver [refazer-prints.md](refazer-prints.md)).

## FASE 4 — Criar a faixa de TESTE FECHADO

1. **Teste e lançamento → Testes → Teste fechado** → criar faixa.
2. Subir o `.aab` do `versionCode 2`, com notas da versão.
3. **Publicar a release.** 🔴 O link de opt-in **só existe com a versão publicada
   na faixa** — em Draft ou Pending ele não aparece, e isso não é bug do Console.
4. Criar a lista de testadores. Um **Grupo do Google** (`nome@googlegroups.com`) é
   melhor que lista solta: administra-se fora da faixa.

## FASE 5 — Os 12 testadores e os 14 dias

- **12 testadores** opt-in **contínuo** por **14 dias**, avaliados no instante do
  pedido, olhando 14 dias para trás. É **janela deslizante por testador**: perder
  1 no dia 7 não zera os outros 11, e dá para incluir gente no meio.
- ⚠️ **Convide todos no MESMO dia.** O relógio é por pessoa: um retardatário que
  clica uma semana depois atrasa o pedido inteiro em uma semana.
- ⚠️ **Escreva o diário DURANTE os 14 dias**, uma linha por relato: quem, quando,
  o que disse, o que mudou. É a resposta que mais pesa no pedido — "feedback
  positivo" reprova; *"o André reclamou do alarme atrasar com a tela apagada,
  ajustamos X"* passa.
- ⚠️ Não pagar por testador. Quem vende pacote é quem espalha que o contador
  "reseta pra zero".

### O aparelho do André, no meio disto
Ele tem o `versionCode 352` do APK antigo. O Android **não atualiza para número
menor**: ele precisa **desinstalar** e instalar pela Play. Desinstalar apaga o
pareamento e o `hbx_operational.db` — **confirme por telefone que não há entrega
pendente sem sincronizar** antes de mandar desinstalar.

## FASE 6 — Pedir acesso à produção

Formulário de 3 seções (teste / app / prontidão). A pergunta que mais pesa é
**como você recrutou os testadores**. Análise em até 7 dias.

Depois de aprovado: criar a release de **Produção**, com `versionCode` novo de novo.

---

## A ordem curta

```
versionCode=2  →  bundle  →  2º cliente OAuth  →  provar no g15
   →  ficha  →  formulários  →  faixa FECHADA publicada
   →  convidar 12 no mesmo dia  →  14 dias + diário
   →  vídeo do serviço em 1º plano  →  pedir produção
```

**O que trava o caminho crítico hoje:** o `versionCode 2` (nada sobe sem ele), o
segundo cliente OAuth (sem ele não há teste fora da Play) e o vídeo do serviço em
primeiro plano.
