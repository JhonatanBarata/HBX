# UniTV — Samsung Tizen Web App (.wgt)

Porte do app Android **UniTV 4.19.1** (`com.global.unitviptv`) para **Samsung Tizen**
(alvo: **BU8000 / Tizen 6.5**), com **AVPlay**, controle remoto e empacotamento **.wgt**.

O mapeamento completo do APK (Activities, telas, APIs, autenticação, URLs de mídia,
navegação, player) está em [`docs/ANALISE-APK.md`](docs/ANALISE-APK.md).

---

## 1. O que já está pronto

- **Shell + engine de foco (D-pad)** e roteador SPA espelhando as Activities.
- **AVPlay** encapsulado (`js/player/avplay.js`) com fallback `<video>` para testar no navegador.
- Telas funcionais: **Welcome/Splash, Login (conta+senha e código EGx-), Home (Ao vivo/Filmes/Séries/Esportes), Catálogo, Detalhes (temporadas/episódios), Player VOD (áudio/legenda/qualidade/proporção), Live (canais+EPG), Match, Minha Conta, Ajustes**.
- **Modo MOCK** ligado por padrão → dá para navegar tudo e ver o AVPlay tocando um HLS público **sem servidor**.

## 2. Ligar na sua conta (o passo que falta)

Sua conta (usuário/senha que você comprou) **funciona normalmente** — falta só apontar o app
para o **servidor certo**. Esse endereço está criptografado (AES) dentro do APK e é resolvido
em runtime, então capturamos uma vez:

### Capturar a URL da API com proxy (recomendado)
1. Instale **mitmproxy** (`pip install mitmproxy`) ou **Charles**.
2. Rode o app **Android** (celular/emulador) com o proxy do PC configurado e o certificado do mitmproxy instalado.
3. Faça **login** no app e observe as chamadas. Anote:
   - o host base (ex.: `https://api.algumacoisa.com`);
   - o endpoint de login e o formato do body/headers;
   - o campo do **token** na resposta;
   - os endpoints de `channels`, `epg`, `vod/list`, `vod/detail`, `play` e a **URL .m3u8** que volta.
4. Preencha [`js/config.js`](js/config.js):
   - `BASE_URL` = host capturado;
   - `MOCK: false`;
   - ajuste os paths em `ENDPOINTS` e, se necessário, os campos em `js/api/auth.js` (token/user).

Pronto: o login com a sua conta passa a funcionar no Tizen.

> `PORTAL_KEY` já vem preenchido (extraído do APK). Se o backend exigir em outro header/nome, ajuste em `js/core/http.js`.

## 3. Testar no navegador (rápido, sem TV)

Abra `index.html` num servidor local (o `file://` também funciona para a maior parte):

```bash
npx serve .
```

Navegação no teclado: **setas** = D-pad, **Enter** = OK, **Backspace/Esc** = Voltar.
Em MOCK, o player usa um HLS de teste; navegadores sem HLS nativo mostram a UI mas podem não
decodificar o vídeo — isso é esperado. Na TV o AVPlay decodifica por hardware.

## 4. Empacotar o .wgt e instalar na TV

Requer **Tizen Studio** (com “TV Extensions”) e um **certificado Samsung** (Author + Distributor).

### Via linha de comando (Tizen CLI)
```bash
# 1) criar/validar perfil de assinatura uma vez no Tizen Studio (Certificate Manager)

# 2) empacotar
tizen build-web -- .
tizen package -t wgt -s <NOME_DO_PERFIL> -- .buildResult
```
Isso gera `UniTV.wgt`. (Há um atalho em `build-wgt.sh` / `build-wgt.bat`.)

### Instalar no BU8000
1. Ligue o **Developer Mode** da TV (app *Apps* → digite `12345` no controle → Developer mode ON → informe o IP do PC).
2. Conecte via SDB:
   ```bash
   sdb connect <IP_DA_TV>:26101
   tizen install -n UniTV.wgt -t <TV_TARGET>
   ```
   (ou use o Device Manager do Tizen Studio → Install).

> O `application id`/`package` em `config.xml` (`UniTV0001.UniTV`) é um placeholder; o
> Tizen Studio ajusta/assina ao empacotar. Troque o prefixo se o seu certificado exigir.

## 5. Controle remoto (mapeamento)

| Tecla | Ação |
|---|---|
| Setas + OK | Navegar / selecionar |
| RETURN/BACK | Voltar (fecha menu/lista antes de sair) |
| Vermelho | Home: aba Ao vivo · Live: abre/fecha lista de canais |
| Verde/Amarelo/Azul | Home: Filmes/Séries/Esportes |
| Play/Pause, ◀◀ ▶▶ | Player: pausar, ±10s |
| ↓ no player | Abre menu (áudio/legenda/qualidade/proporção) |
| Ch+ / Ch- | Live: trocar canal · INFO: infobar/EPG |

Códigos e registro em `js/core/keys.js`.

## 6. Estrutura

```
config.xml              Manifesto do widget (privilégios, perfil TV, FHD)
index.html              Shell (carrega webapis.js + módulos)
icon.png                Ícone (placeholder — troque pela arte do UniTV)
css/app.css             UI de TV (1920x1080, foco)
js/config.js            ⚙ BASE_URL, PORTAL_KEY, ENDPOINTS, MOCK  ← edite aqui
js/core/                store, keys, focus, http, router, ui
js/player/avplay.js     Wrapper do AVPlay (+ fallback <video>)
js/api/                 auth, live, vod, match, user
js/screens/             welcome, login, home, vod-category, vod-details,
                        vod-player, live, match, user, settings
js/app.js               Bootstrap (teclas + arranque)
docs/ANALISE-APK.md     Mapeamento completo do APK original
```

## 7. Notas de player (BU8000 / Tizen 6.5)

- AVPlay usa o **decoder de hardware** do painel: H.264 e **H.265/HEVC** até 4K são ok.
- **AV1**: o app original tem fontes AV1; o BU8000 (2020) pode **não** ter decode AV1 por HW —
  prefira variantes HEVC/H.264 nessas fontes.
- Legenda externa (SRT): `Player.setExternalSubtitle(path)`; faixas embutidas via `getTracks()`/`selectText()`.
- Proporção: `Player.setRatio('auto'|'original'|'fit')`.
