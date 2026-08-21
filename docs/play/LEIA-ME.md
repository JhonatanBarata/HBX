# A PÁGINA "DETALHES DO APP", CAMPO A CAMPO

> Console → **Aumentar número de usuários → Presença na loja → Página "Detalhes do app"**
> (ou Painel → *Ver etapas* → **Configurar a página "Detalhes do app"** — é a mesma tela;
> a Play chamava isto de *Ficha da loja*).
> Montado em 21/08/2026 lendo este repositório. Os textos ficam em
> [TEXTOS-DA-FICHA.md](TEXTOS-DA-FICHA.md); as imagens são os `.png` desta pasta.

🔴 **A tabela "O que já está pronto" da *Cola do Console* (20/08) listava
`icone-512.png`, `feature-1024x500.png`, os 4 prints e o `TEXTOS-DA-FICHA.md` como
prontos — e NENHUM desses arquivos existia.** Eram nomes de arquivo planejados,
escritos como se fossem entregues. Agora existem, nesta pasta, menos os prints
(que só saem do aparelho). Estado de arquivo se confere com `ls`, nunca de memória.

---

## Ordem de preenchimento da tela

| # | Campo | O que fazer | Estado |
|---|---|---|---|
| 1 | Selecionar um idioma para editar | **Português (Brasil) — padrão.** Não adicionar outro. | — |
| 2 | Importar traduções com IA | **Não usar.** Ver §6 do TEXTOS-DA-FICHA | — |
| 3 | Nome do app | `HBX Logística` (13/30) | ✅ pronto |
| 4 | Breve descrição | bloco §2 do TEXTOS-DA-FICHA (75/80) | ✅ pronto |
| 5 | Descrição completa | bloco §3 do TEXTOS-DA-FICHA (3.031/4.000) | ✅ pronto |
| 6 | Ícone do aplicativo | `docs/play/icone-512.png` | ✅ pronto |
| 7 | Recurso gráfico | `docs/play/feature-1024x500.png` | ✅ pronto |
| 8 | Vídeo | **deixar VAZIO** — ver abaixo | — |
| 9 | Capturas de tela do telefone | `print-1` … `print-5`, 1080×2160 | ✅ pronto |
| 10 | Tablet / Chromebook / Android XR | **deixar VAZIO** — ver abaixo | — |

O botão **Salvar** só libera com 1, 3, 4, 5, 6, 7 e 9 preenchidos. Os campos 8 e 10
são opcionais e ficam vazios de propósito.

---

## 3 · Nome do app — por que não vira "HBX Logística: rota e entrega"

Cabe (29/30) e ajudaria na busca, mas o rótulo do launcher é `HBX Logística`
(`build.gradle.kts:262`) e a política de metadados olha para nome de ficha que não
bate com o nome instalado. Um app B2B que chega ao usuário por link de convite não
vive de busca na loja — o ganho é perto de zero e o risco não é.

## 6 · Ícone — o que foi gerado e por quê

`icone-512.png` é PNG 32 bits com alfa, 512×512, 45 KB (teto: 1 MB). É o mesmo
desenho do launcher (`ic_launcher_foreground.xml` sobre o navy `#0B1020` do
`ic_launcher_background.xml`), partindo de
`frontend/public/hbx-theme/assets/logo/hbx-app-icon-512.png`.

⚠️ **O ícone adaptativo do app NÃO serve** para este campo — a Play quer um PNG
achatado. E o PNG do site vem com os cantos meio transparentes (alfa 64 e 128,
medido nos vértices): a Play arredonda o ícone ela mesma, e arredondar por cima de
canto já arredondado serrilha a borda. Por isso `gerar-assets.ps1` acha
sobre o navy e entrega o quadrado cheio.

Para regerar qualquer uma das duas imagens:

```bash
pwsh -ExecutionPolicy Bypass -File docs/play/gerar-assets.ps1
```

⚠️ Rodar com `pwsh` (7), **nunca** com `powershell` (5.1): o 5.1 lê o `.ps1` como
ANSI e o acento de "Logística" sai como `Ã­` dentro da imagem.

## 7 · Recurso gráfico — 1024×500, e o que a Play corta

PNG 24 bits sem alfa, 95 KB (teto: 15 MB). Aparece quando o app é destacado e no
topo da ficha em algumas superfícies — **as bordas podem ser cortadas**, então nada
importante fora da margem de 90 px. Não tem preço, não tem "novo", não tem botão de
play desenhado (imitar controle da própria loja reprova por metadados) e não repete
o nome com palavra-chave empilhada.

## 8 · Vídeo — deixar vazio, e não confundir com o outro vídeo

O campo aceita só URL do YouTube, com o vídeo **público ou não listado, sem anúncios
e sem restrição de idade**. Vídeo fraco na ficha derruba conversão mais do que a
ausência dele, e não há um pronto.

🔴 **Este campo NÃO é onde vai o vídeo do serviço em primeiro plano.** Aquele é
outro formulário (Conteúdo do app → *Serviço em primeiro plano*), mostra
iniciar rota → notificação → sair do app, e só nasce depois que a Google processa o
bundle. Colar o vídeo técnico aqui põe uma gravação de `screenrecord` na vitrine.

## 9 · Capturas — 5 prontas, tiradas do g15 em 21/08/2026

Mínimo 2, mas **com 4 ou mais de pelo menos 1080 px no menor lado o app se
qualifica à promoção** na loja — por isso são 5. O g15 entrega 1080×2400 (2,22× o
menor lado, acima do teto de 2×), então `cortar-prints.ps1` corta 240 px do
**rodapé** — barra de gestos do Android e barra de abas do app — deixando
**1080×2160**, exatamente 1:2, com o menor lado ainda em 1080.

Suba nesta ordem — **a primeira é a que aparece na busca**:

1. **Clientes do dia** — mostra que o app já chega com base, não com tela vazia
2. **Montagem da rota** — a sequência de paradas com o mapa
3. **Modo dirigir** — a tela que vende o app: curva, ETA, os quatro verbos
4. **Folha da venda** — itens, forma de pagamento, vasilhame
5. **Dia encerrado** — quanto entrou, o que ficou pra amanhã

Todas saíram do **modo demonstração**: os "Cliente 1…8" são fictícios, ancorados no
bairro de quem abriu. Zero dado de cliente real — captura pública com nome,
telefone ou endereço de cliente é vazamento, e a Play trata como violação.
Para refazer, o roteiro exato está em [refazer-prints.md](refazer-prints.md).

## 10 · Tablet, Chromebook e XR — vazio, e o motivo é técnico

O app trava as 10 activities em `portrait` e só continua assim em tela ≥ 600 dp
porque declara `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` — que é **dívida com
prazo: expira quando o app mirar a API 37** (§6 do ANDROID-PLAY.md). Ou seja: em
tablet ele roda, mas roda como telefone esticado.

→ Não subir captura de tablet, e considerar **excluir tablets e Chromebooks da
distribuição** (Console → *Configurações avançadas → Gerenciamento de dispositivos*).
Um app de motorista não é usado em tablet, e ficar listado lá sem layout adaptativo
só rende aviso de qualidade em tela grande na própria ficha.
