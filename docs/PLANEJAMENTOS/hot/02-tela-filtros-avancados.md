# HOT-02 — Tela "Lista de Empresas com Filtros Avançados" (o construtor de listas)

**Tela deles:** `/app/pesquisa-avancada`. Blocos: Características da empresa (CNAE multi c/ busca
por texto, incluir como atividade principal e/ou secundária; Natureza Jurídica multi c/ contagem
por opção ex. "Empresário (Individual) (44.889.600)"; Situação (Ativa default); Tipo Matriz/Filial;
Porte MEI/ME/EPP/Sem Enquadramento; **Regime Tributário**; **Capital social mín/máx**; palavra na
razão/fantasia) + Localização (cidade/estado/país autocomplete, bairro, CEP, **DDD**) + Datas
(abertura: slider Todos→5 anos→3→1→6m→1m→semana→**Hoje**, ou data exata) + Opções de contato
(HOT-03) → botão "Aplicar filtro" → contador "Há 4.717 empresas" + salvar/compartilhar pesquisa.
Cada bloco tem um ícone YouTube com tutorial de 30s (ver HOT-06).

## O que o HBX tem
Radar busca por `segment+city` (texto livre → motores). NÃO existe UI de filtro cadastral.
A árvore do Owner (:3107) já tem o conceito de fonte "Receita" (leitor da `CnpjPublicCompany`).

## Gap real
Sem HOT-01 essa tela é vitrine vazia. Com HOT-01, é a tela que transforma a base em produto:
o dono monta lista fria segmentada SEM gastar motor/scraping — e o scraping vira a camada
de ENRIQUECIMENTO em cima do recorte, não a descoberta.

## Plano (2 workers: backend + frontend-Owner)
### Backend (`backend/src/webscraping/radar/`)
1. Endpoint Owner `POST /owner/cnpj-base/query` — input: `{cnaes[], cnaePrincipalOnly, naturezas[],
   situacoes[], porte[], mei, simples, matrizFilial, capitalMin, capitalMax, regime, keyword,
   cities[], states[], ddd, bairro, cepPrefix, abertaDe, abertaAte, contato: {...HOT-03},
   excluirJaEntregues: bool, limit, cursor }` → `{ count, sample[20], cursorNext }`.
   SQL direto na `CnpjPublicCompany` (query builder com WHERE dinâmico; SEMPRE `state/city` primeiro).
2. `POST /owner/cnpj-base/materialize` — vira `RadarLead`s de uma campanha/segmento escolhido
   (respeita dedup existente por empresa) OU exporta planilha (reusar exporter existente).
   Contadores no run p/ observabilidade (`foundCount` etc.).
3. Contagem por opção nos filtros (estilo deles: "Empresário (44.889.600)"): `GROUP BY` cacheado
   1x/mês pós-import (tabela `CnpjBaseStats` ou JSON em disco) — não contar live.

### Frontend (HBX Owner :3107 — `hbx-owner/local-agent/web/`)
4. Nova aba "Base Receita" na árvore: form dos blocos acima (accordion como o deles), botão único
   "Contar" → mostra `count` + amostra de 20 + botões "Virar leads no Radar" / "Exportar planilha".
   Seguir padrão visual existente do Owner (tree.css) — nada de framework novo.
5. Autocomplete cidade: endpoint leve `GET /owner/cnpj-base/cities?q=` (distinct normalizedCity+state).
6. CNAE picker: busca por texto no par código+descrição (tabela Cnaes do dump, importada no HOT-01).

## Criatividade (além deles)
- **Filtros que ELES NÃO TÊM** (nosso dado vivo): `temWhatsAppValidado`, `temSite`, `SEM site`
  (= lead perfeito p/ website-kit!), `temInstagram`, `notaIA >= X`, "sem presença digital".
  Esses filtros são o motivo de alguém pagar HBX e não CNPJ Biz — deixar em destaque na UI.
- **Presets de 1 clique** por dor: "Abriu este mês na minha cidade", "Tem WhatsApp mas não tem site",
  "MEI virando ME (crescendo)", "Capital > 100k sem site (dinheiro + carência digital)".
- Contador com custo estimado de enriquecimento ao lado ("4.717 empresas · ~2h de fábrica").

## Aceite
- [ ] Query por CNAE+cidade+porte responde <1s com count correto
- [ ] Materializar 100 leads cria RadarLeads dedupados visíveis no fluxo normal
- [ ] Tela no Owner funcional com os presets; typecheck verde; deletar este .md
