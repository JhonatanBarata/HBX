# RADAR LIVE — preview visual e handoff para o Codex

## Estado

O frontend foi desenhado e validado fora do fluxo de produção. A branch não substitui a tela atual de Leads. Ela contém um patch autocontido para o Codex aplicar e conectar ao backend.

## Patch

Arquivo:

`patches/002-radar-live-search-preview.patch.gz.b64`

Aplicação:

```bash
base64 -d patches/002-radar-live-search-preview.patch.gz.b64 \
  | gunzip > /tmp/radar-live-search-preview.patch

git apply --check /tmp/radar-live-search-preview.patch
git apply /tmp/radar-live-search-preview.patch
```

O patch cria:

- `frontend/src/components/hbx/radar-live-search.tsx`
  - componente visual de produção `RadarLiveSearchView`;
  - tipos do contrato `RadarLiveSnapshot`;
  - nenhuma chamada de rede.
- `frontend/src/components/hbx/radar-live-search-preview.tsx`
  - simulador visual com empresas chegando, enriquecimento e descartes.
- `frontend/src/app/(app)/leads/process-preview/page.tsx`
  - rota isolada `/leads/process-preview`.
- `frontend/src/app/hbx-theme/radar-live-search.css`
  - CSS central baseado somente em tokens HBX.
- `docs/PLANEJAMENTOS/RADAR-LIVE/PLANO.md`
  - plano completo de produto e aceite.
- `docs/PLANEJAMENTOS/RADAR-LIVE/FRONT-HANDOFF.md`
  - ponto exato para a injeção do backend.
- uma importação de `radar-live-search.css` em `frontend/src/app/globals.css`.

## Conceito de produto

A tela apresenta duas camadas sem misturar os números:

- aproximadamente 28 milhões de empresas ativas na base nacional RFB;
- 6.881 leads já materializados no pool operacional HBX.

Durante a busca, o usuário vê:

1. leitura da base por cidade, CNAE e situação ativa;
2. deduplicação contra o pool e o histórico de entregas;
3. validação de contato e anti-contador;
4. incorporação do telefone secundário da RFB;
5. enriquecimento com site, e-mail, WhatsApp e terceiro telefone;
6. empresas aprovadas entrando na prateleira;
7. descartes com motivo legível.

## Injeção do backend

O Codex deve criar um container/hook em torno de `RadarLiveSearchView`. Sugestão de rota:

`frontend/src/app/(app)/leads/runs/[runId]/page.client.tsx`

Esse container deve reduzir o stream/polling do backend para um `RadarLiveSnapshot` e renderizar:

```tsx
<RadarLiveSearchView
  snapshot={snapshot}
  paused={visualPaused}
  onTogglePause={() => setVisualPaused((value) => !value)}
  onOpenResults={() => router.push(`/leads?runId=${runId}`)}
/>
```

Não colocar API, SSE, WebSocket ou polling dentro de `radar-live-search.tsx`.

## Regra de contatos

- Telefone principal: denormalizado no lead.
- Telefone secundário da Receita: sempre preservado como contato, mesmo sendo fixo e sem WhatsApp.
- Terceiro telefone enriquecido: mesma coleção, com origem diferente.
- A confirmação de WhatsApp controla o botão de WhatsApp; não controla a visibilidade do telefone.
- Deduplicar por dígitos normalizados e conservar a origem/rank.

## Validação já executada

- TypeScript: sem erros no componente, simulador e rota.
- Prettier: todos os arquivos formatados.
- CSS: sem hex ou `rgba()`; somente tokens centrais e `color-mix`.
- Preview estático e animação revisados em viewport desktop de 1600 × 1000.
