# Passo 13 - Contratos de Harvest e Import

## Objetivo

Criar o contrato unico que Local Lab e VPS vao compartilhar. Antes de criar API, painel ou importador, os tipos precisam dizer exatamente o que e um lead, um e-mail, um batch e uma importacao.

## Principio

Mesmo contrato, executores diferentes:

- VPS gera/importa dados oficiais.
- Local Lab descobre dados experimentais.
- A VPS nao precisa saber como o dado foi descoberto.
- A VPS so precisa saber se o dado tem formato, evidencia, origem e confianca suficientes.

## Pasta sugerida

Usar uma pasta pequena e isolada:

```text
backend/src/webscraping/lead-harvest/
  lead-harvest.types.ts
  lead-harvest.validators.ts
  lead-harvest-normalizer.service.ts
  lead-harvest.module.ts
```

Se o foco inicial for so e-mail, pode chamar `email-harvest`, mas `lead-harvest` e melhor porque a conversa pede importar e-mails e cards completos depois.

## Tipos minimos

`LeadHarvestCandidate`:

```ts
type LeadHarvestCandidate = {
  externalId: string;
  batchId?: string;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  emailStatus?: 'public_found' | 'found_on_site' | 'probable' | 'missing' | 'invalid';
  emailConfidence?: number;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  sourceUrl: string;
  sourceProvider: string;
  sourceMode: 'production' | 'local_lab' | 'imported_lab';
  sourceRisk?: 'official' | 'experimental';
  evidence?: Record<string, any>;
  raw?: Record<string, any>;
};
```

`EmailHarvestCandidate`:

```ts
type EmailHarvestCandidate = {
  externalId: string;
  batchId?: string;
  email: string;
  domain?: string | null;
  companyName?: string | null;
  website?: string | null;
  sourceUrl: string;
  confidence: number;
  status: 'public_found' | 'probable' | 'invalid' | 'blocked_domain';
  provider: string;
  sourceMode: 'production' | 'local_lab' | 'imported_lab';
  evidence?: Record<string, any>;
};
```

`HarvestImportBatch`:

```ts
type HarvestImportBatch = {
  batchId: string;
  sourceMode: 'production' | 'local_lab' | 'imported_lab';
  sourceName: string;
  createdAt: string;
  requestedBy?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  targetEmails?: number | null;
  providers: string[];
  leads: LeadHarvestCandidate[];
  emails: EmailHarvestCandidate[];
  stats?: Record<string, number>;
};
```

`HarvestImportResult`:

```ts
type HarvestImportResult = {
  batchId: string;
  accepted: number;
  rejected: number;
  duplicates: number;
  negatives: number;
  optOuts: number;
  importedLeadIds: string[];
  rejectedItems: Array<{
    externalId: string;
    reason: string;
  }>;
};
```

## Normalizacao obrigatoria

Antes de salvar ou importar:

- normalizar dominio;
- normalizar telefone;
- normalizar WhatsApp;
- validar e-mail;
- bloquear dominios ruins;
- remover e-mails genericos invalidos de rede social/diretorio;
- exigir `sourceUrl` para qualquer e-mail aceito;
- exigir `name` para qualquer card aceito;
- marcar `sourceMode=imported_lab` ao salvar na VPS algo que veio do Local Lab.

## Evidencia minima

Um e-mail aceito precisa ter pelo menos:

- `email`;
- `sourceUrl`;
- `provider`;
- `status`;
- `confidence`;
- evidencia de onde saiu: `mailto`, texto da pagina, schema, rodape, pagina contato, dominio, padrao provavel ou import manual.

## Arquivos provaveis para usar depois

- `backend/src/webscraping/radar-lead-enrichment.ts`
- `backend/src/webscraping/vendas-lead-enrichment.ts`
- `backend/src/webscraping/lead-quality-v2.ts`
- `backend/src/webscraping/radar/01-search/*`
- `backend/prisma/schema.prisma`

## Criterios de aceite

- Tipos exportados sem depender de controller.
- Normalizador testado com e-mail valido, invalido, bloqueado e provavel.
- Contrato suporta e-mail isolado e card completo.
- Contrato carrega `sourceMode`, `sourceProvider`, `sourceRisk` e `evidence`.
- Nenhum campo sensivel de credencial entra no contrato.

## Validacoes

- `cd backend && npm run build`
- teste unitario novo para validator/normalizer

## Prompt Codex para aplicar

```text
Implemente o Passo 13 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/13-contratos-harvest-import.md`.
Crie apenas contratos, normalizadores e testes pequenos. Nao crie endpoint ainda.
Preserve o fluxo HBX Radar -> Vendas -> WhatsApp -> Retorno, respeite negativos/opt-out e nao exponha segredo.
```

