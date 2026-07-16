# Plano de conclusão local — Codex

Este arquivo começa exatamente onde o trabalho remoto precisa parar. A arquitetura, os dados demo, o roteiro, a captura Playwright, a montagem FFmpeg e os tutoriais já estão implementados.

## Objetivo

Produzir e revisar os arquivos finais do HBX Entregas sem tocar em produção e sem expor clientes reais.

## Branch

Trabalhar na branch:

```text
agent/hbx-video-studio
```

Não fazer deploy e não mesclar antes da aprovação visual do dono.

## Restrições absolutas

1. Não usar banco, token, tenant ou cliente de produção.
2. Não modificar `EntregaShell/app/src/logistica/assets/app/opening.html` para o vídeo; o estúdio já injeta uma variante local.
3. Não alterar preços, créditos, billing, módulos ou regras comerciais.
4. Não versionar `.work/`, `output/`, áudio, MP4, screenshots ou tomadas ADB.
5. Não publicar em rede social, Google Play ou site sem ordem explícita.
6. Se uma tela real falhar, corrigir a ferramenta de captura ou o mock; não mascarar defeito do produto com imagem falsa.

## Etapa 1 — preparar o ambiente

Na raiz do repositório, confirme que não há alterações locais e atualize a branch sobre o `master` mais recente antes de capturar:

```powershell
git status -sb
git branch --show-current
git fetch origin
git rebase origin/master
npm install
Push-Location frontend
npm install
Pop-Location
npx playwright install chromium
npm run video:test
```

Se houver conflito no rebase, preserve as mudanças atuais de `master` e reaplique somente os arquivos do estúdio e da documentação deste PR. Não continue para a captura enquanto `npm run video:test` não passar.

Esperado: `HBX Video Studio: contratos, dados demo e servidor validados.`

## Etapa 2 — iniciar o frontend

Abrir um terminal dedicado:

```powershell
npm run front:dev
```

Confirmar que o frontend responde em `http://127.0.0.1:3001`. Em outra porta, definir:

```powershell
$env:HBX_VIDEO_BASE_URL = 'http://127.0.0.1:PORTA'
```

## Etapa 3 — diagnóstico

Em outro terminal:

```powershell
npm run video:doctor
```

Corrigir apenas requisitos locais apontados pelo diagnóstico. FFmpeg e Chromium são obrigatórios; ADB é opcional neste momento.

## Etapa 4 — captura de controle

Primeiro, gerar somente o comercial com navegador visível:

```powershell
npm run video:capture -- --target commercial --headed
```

Verificar durante a execução:

- abertura original seguida do encerramento “HBX Entregas”;
- nenhuma tela de login;
- nenhuma chamada a produção;
- empresa “Distribuidora Água Clara”;
- clientes, produtos, prévia de geração, rota e confirmação visíveis;
- anéis de toque posicionados sobre os controles;
- ausência de overflow, pop-up cortado ou texto sobre botão importante.

Se uma cena falhar, consultar:

```text
tools/hbx-video-studio/.work/commercial/errors/
```

Corrigir seletor, mock ou duração e repetir. Não editar o produto apenas para esconder o erro da captura.

## Etapa 5 — capturar os três materiais

Quando o comercial estiver estável:

```powershell
npm run video:capture
```

Esperado:

```text
tools/hbx-video-studio/.work/commercial/manifest.json
tools/hbx-video-studio/.work/tutorial-admin/manifest.json
tools/hbx-video-studio/.work/tutorial-entregador/manifest.json
```

## Etapa 6 — primeira montagem

```powershell
npm run video:render
```

Abrir e assistir integralmente:

```text
tools/hbx-video-studio/output/commercial-vertical.mp4
tools/hbx-video-studio/output/tutorial-admin-vertical.mp4
tools/hbx-video-studio/output/tutorial-entregador-vertical.mp4
```

Depois conferir as versões horizontais e os posters.

## Etapa 7 — tomadas Android realmente necessárias

Só substituir uma cena quando a função dependa do sistema Android. Prioridade possível:

1. abrir o Google Maps por Intent;
2. voltar do Maps para o HBX;
3. permissão de localização;
4. notificação ou GPS em segundo plano.

Preparar um tenant demo local, ativar Não Perturbe e conectar um único aparelho autorizado. Rodar:

```powershell
powershell -ExecutionPolicy Bypass -File tools/hbx-video-studio/native-capture.ps1 `
  -Target tutorial-entregador `
  -Scene driver-stop `
  -Seconds 20 `
  -OpenFolder
```

O nome `driver-stop` substitui exatamente essa cena no próximo render. Para outra cena, usar o ID que aparece no respectivo `manifest.json`.

Revisar o bruto antes de renderizar. Excluir e repetir se aparecer notificação, dado verdadeiro, barra pessoal, endereço real ou toque errado.

## Etapa 8 — locução

Os textos estão em:

```text
tools/hbx-video-studio/output/commercial-narracao.md
tools/hbx-video-studio/output/tutorial-admin-narracao.md
tools/hbx-video-studio/output/tutorial-entregador-narracao.md
```

As marcações de tempo estão nos `.srt` correspondentes.

Produzir três faixas de voz aprovadas, começando no tempo zero:

```text
tools/hbx-video-studio/audio/commercial.wav
tools/hbx-video-studio/audio/tutorial-admin.wav
tools/hbx-video-studio/audio/tutorial-entregador.wav
```

Critérios da voz:

- português brasileiro natural;
- tom seguro e direto, sem voz caricata de propaganda;
- velocidade confortável;
- pronúncia “agá bê xis” apenas se necessário; preferir dizer “HBX Entregas” naturalmente;
- silêncio curto entre cenas;
- sem música protegida ou voz sem licença comercial.

Depois:

```powershell
npm run video:render
```

O render normaliza a voz e a corta no tempo total. Se uma frase entrar em outra cena, ajustar o arquivo de voz ou a duração em `content.mjs`, recapturar somente quando a duração visual mudar e renderizar novamente.

## Etapa 9 — revisão de qualidade

Assistir com som e também mudo. Validar:

- promessa compreensível nos primeiros cinco segundos;
- textos legíveis numa tela pequena;
- nenhuma espera longa ou carregamento visível;
- nenhum dado real;
- voz sincronizada com o que aparece;
- “HBX Entregas” usado de forma consistente;
- CTA final visível por tempo suficiente;
- volume sem distorção;
- legenda sem erro ortográfico;
- versão horizontal sem cortar o celular;
- poster sem transição pela metade.

Rodar também:

```powershell
npm run video:test
npm run gate
```

Se `npm run gate` falhar por problema anterior e alheio à branch, registrar o erro completo; não alterar outra área do sistema para deixar o vídeo verde.

## Etapa 10 — entrega para aprovação

Apresentar ao dono, sem publicar:

- `commercial-vertical.mp4`;
- `commercial-horizontal.mp4`;
- os dois tutoriais verticais;
- os posters;
- o roteiro e as legendas.

Informar claramente quais cenas vieram do código e quais foram substituídas por Android nativo.

Somente depois da aprovação:

1. remover brutos ruins e arquivos temporários;
2. confirmar `git status -sb` sem mídia gerada;
3. manter no commit apenas código, roteiro e documentação;
4. atualizar o PR com os checks executados;
5. aguardar ordem explícita para merge ou publicação.

## Critério de conclusão

O trabalho está concluído quando os três vídeos abrem sem erro, têm voz e legendas sincronizadas, não expõem dados reais, passam pela revisão visual do dono e a branch continua sem mídia gerada versionada.
