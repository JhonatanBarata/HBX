# CONTRATO — Filtro Base Receita (28M) para o front /vendas

> Worker A (backend), 04/07. Fonte da verdade: `CnpjPublicCompany` (`backend/prisma/schema.prisma`).
> Este é o contrato que o Worker B (front) consome para montar o filtro BÁSICO (item 3) e o
> AVANÇADO (item 4) do "Buscar empresas". Nomes de campo abaixo = nomes exatos que o body/JSON
> deve mandar.

## Endpoints

Existiam dois caminhos disjuntos: o painel do Master (`:3107`, MasterGuard) e nenhum caminho para
Admin/Vendedor na tela `/vendas`. Este worker abriu o segundo, reaproveitando o MESMO service e o
MESMO shape de input/output — um único `CnpjBaseQueryInput`, dois pontos de entrada:

| Rota | Guard | Quem usa |
|---|---|---|
| `POST /webscraping/radar/cnpj-base/query` | `JwtAuthGuard` + `ModuleAccessGuard` (qualquer usuário da empresa: admin OU vendedor) | Tela `/vendas` — filtro básico + avançado (self-serve puro, item 5) |
| `POST /modules/owner/cnpj-base/query` | `JwtAuthGuard` + `MasterGuard` | Painel `:3107` (HBX Owner) |
| `POST /modules/owner/cnpj-base/materialize` | `MasterGuard` | Só dono/master — vira lead materializado (`RadarLeadPool`) |
| `GET /modules/owner/cnpj-base/cities?q=` | `MasterGuard` | Autocomplete de cidade |
| `GET /modules/owner/cnpj-base/cnaes?q=` | `MasterGuard` | Autocomplete de CNAE |
| `GET /modules/owner/cnpj-base/stats?group=` | `MasterGuard` | Contagem por opção (cache mensal) |

**Nota para o Worker B:** hoje só `POST /webscraping/radar/cnpj-base/query` está aberto pra
admin/vendedor (leitura pura, sem gravação — a base 28M é dado público/comum, sem risco de vazar
card de outra empresa). Se a tela também precisar de autocomplete de cidade/CNAE fora do painel
Master, isso NÃO foi feito neste sprint (pedir extensão — é reaproveitar `searchCities`/
`searchCnaes` do mesmo `CnpjBaseQueryService`, hoje só expostos com `MasterGuard`).

## Response shape (`query`)

```json
{
  "count": 1234,
  "sample": [ /* até 20 CnpjBaseSampleRow, ver abaixo */ ],
  "cursorNext": "12345678000199",
  "statsAmostra": { "total": 20, "comCelularProprio": 12, "provavelContador": 3 },
  "excludedJaEntregues": 0
}
```

`CnpjBaseSampleRow`: `cnpj, razaoSocial, nomeFantasia, cnae, cnaeDescription, porte, situacao,
matrizFilial, capitalSocial, naturezaJuridica, simples, mei, city, state, phone, phone2, email,
website, openedAt, firstSeenAt, phoneShareCount, emailShareCount, ownerName, ownerQualification,
selo` (`selo` = `whatsapp_validado | celular_provavel | fixo | provavel_contador | sem_contato`).

## Contrato de INPUT (`CnpjBaseQueryInput`) — todos os campos aceitos hoje

### Localização
| Campo | Tipo | Observação |
|---|---|---|
| `cities` | `string[]` | nome da cidade (compara por `normalizedCity`, case/acento-insensível) |
| `states` | `string[]` | UF (2 letras) |
| `ddd` | `string` | 2 dígitos, casa em `phoneDigits`/`phone` |

### Segmento / CNAE
| Campo | Tipo | Observação |
|---|---|---|
| `cnaes` | `string[]` | código(s) CNAE (usar `GET cnaes?q=` pra picker — hoje só Master, ver nota acima) |
| `cnaePrincipalOnly` | `boolean` | `true` = só bate no CNAE principal; default = principal OU secundário |
| `keyword` | `string` | busca livre em razão social / nome fantasia / texto normalizado |

### Características da empresa (item 4 do PLANO-UI)
| Campo | Tipo | Observação |
|---|---|---|
| `situacoes` | `string[]` | situação cadastral (ex.: `"ativa"`) |
| `porte` | `string[]` | porte RFB |
| `naturezas` | `string[]` | natureza jurídica |
| `matrizFilial` | `string \| string[]` | **NOVO: aceita array** — seleção múltipla Matriz+Filial. 1 valor = igualdade simples (compat) |
| `mei` | `boolean` | |
| `simples` | `boolean` | |
| `capitalMin` / `capitalMax` | `number` | faixa de capital social |
| `abertaDe` / `abertaAte` | `string` (ISO date) | faixa de data de abertura |
| `idadeMinAnos` / `idadeMaxAnos` | `number` (0–200) | **NOVO** — açúcar sobre `abertaDe/abertaAte`: "aberta há pelo menos N anos" / "há no máximo N anos". Não precisa calcular data no front. |

### Sócio/dono (item 4 — NOVO, não existia)
| Campo | Tipo | Observação |
|---|---|---|
| `donoConhecido` | `boolean` | só empresas com `ownerName` preenchido |
| `ownerNameKeyword` | `string` | busca por nome do sócio (contains, case-insensitive) |
| `ownerQualifications` | `string[]` | filtra pelo cargo do sócio (ex.: `"49-Socio-Administrador"`) |

### Contato / anti-contador (objeto `contato`)
| Campo | Tipo | Observação |
|---|---|---|
| `contato.comEmail` | `boolean` | tem email |
| `contato.comTelefone` | `boolean` | tem telefone (qualquer) |
| `contato.comCelular` | `boolean` | tem telefone (o "celular provável" fino é o `selo` na amostra, não corta contagem) |
| `contato.maxPhoneShare` | `number` (default 3) | anti-contador: só telefone compartilhado por ≤N CNPJs |
| `contato.maxEmailShare` | `number` (default 3) | idem, email |
| `contato.blocklistEmail` | `boolean` | exclui e-mails com token de contador (`contab/fiscal/escritorio/assessoria/adv`, configurável via env) |

### Paginação / dedup
| Campo | Tipo | Observação |
|---|---|---|
| `excluirJaEntregues` | `boolean` | cruza por `phoneDigits` contra `RadarLeadPool` — não repete card já entregue |
| `limit` | `number` (1–20) | tamanho da amostra |
| `cursor` | `string \| null` | último `cnpj` da página anterior (paginação por keyset) |

### NÃO OFERECER (sem lastro em coluna populada — decisão já tomada 02/07, não reabrir)
- **`regime`** — aceito no input, **sempre ignorado no WHERE**. `regimeTributario` é fase 2 da
  RFB (Lucro Real/Presumido é dataset separado, coluna sempre `NULL` na carga atual).
- **"Tem site" como filtro de CORTE** — `website` NUNCA é populado por `import-cnpj-dataset.js`
  na base fria (o dump RFB não traz site — é output de enriquecimento do Motor 2/web,
  `RadarLeadPool`). Um filtro "tem site" aqui devolveria vitrine vazia fingindo precisão que a
  base fria não tem. Se a UI quiser esse corte, é sobre leads JÁ enriquecidos (outra tela/rota),
  nunca inflando a Base Receita.
- **Bairro/CEP** — `address` é string concatenada sem coluna estruturada (LIKE raramente bate).
- **`temInstagram` / `notaIAMin` / `semPresencaDigital` / `temWhatsAppValidado` como corte** —
  idem "tem site": são OUTPUT do enriquecimento, não filtro da base fria. O `selo` de qualidade
  (`whatsapp_validado` etc.) aparece na amostra como INFORMATIVO, mas não corta o `count`.

## O que mudou neste sprint (extensões ao contrato pré-existente)
1. **Endpoint novo** `POST /webscraping/radar/cnpj-base/query` — abre o filtro avançado pra
   admin/vendedor (antes só existia pro Master via `/modules/owner/cnpj-base/query`).
2. **`matrizFilial`** agora aceita array (seleção múltipla), mantendo compat com string única.
3. **`ownerName`/`ownerQualification`** entraram no `select`/amostra de saída — sempre existiram
   na tabela (QSA denormalizado do dump RFB), só não eram devolvidos nem filtráveis.
4. **`donoConhecido` / `ownerNameKeyword` / `ownerQualifications`** — filtro novo por sócio/dono.
5. **`idadeMinAnos` / `idadeMaxAnos`** — filtro novo de faixa etária da empresa (sobre `openedAt`).

## Onde vive o código
- Contrato + WHERE dinâmico: `backend/src/webscraping/radar/providers/cnpj-public/cnpj-base-query.service.ts`
- DTO de validação (usado pelos dois endpoints): `backend/src/webscraping/radar/providers/cnpj-public/cnpj-base.controller.ts` (`CnpjBaseQueryDto`, agora exportado)
- Endpoint novo (vendas/admin/vendedor): `backend/src/webscraping/webscraping.controller.ts` (`radarCnpjBaseQuery`) → `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts` (`queryCnpjBaseForUser`)
- Testes: `cnpj-base-query.service.test.ts` (25 casos), `webscraping.service.test.ts` (4 casos novos de `queryCnpjBaseForUser`)
