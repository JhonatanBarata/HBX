# WORM-16 — Entidades Contatos e Empresas no CRM (sócio vira gente ligável)

**Telas deles:** `/appjs/persons` (Contatos) e `/appjs/organizations` (Empresas).
- Contato: nome, cargo/função, e-mails, telefones (com DDI), EMPRESAS relacionadas,
  oportunidades relacionadas, leads relacionados. No lead importado do dono, o sócio
  ("Martin Hirke Bijsterveld — Sócio-Administrador") virou contato AUTOMATICAMENTE.
- Empresa: nome + CNPJ + categoria (descrição CNAE), relações, contatos, busca por nome/CNPJ.

## O que o HBX tem
Lead = empresa com blob de contatos (metadataJson/enrichmentJson). O "buraco do blob" já é
conserto Nº1 conhecido (contato não estruturado → não filtra/exporta direito).

## A jogada
Este .md e o buraco-do-blob são O MESMO conserto: normalizar contato. `LeadContact { id, leadId,
nome?, cargo?, phoneDigits?, email?, whatsappValidado?, fonte(receita_qsa|crawl|manual|ia) }`.
O QSA do HOT-01 (`CnpjPublicPartner`) alimenta `fonte=receita_qsa`; a fábrica de e-mail alimenta
`fonte=crawl`; a IA de extração (20B) alimenta `fonte=ia` (com gate anti-alucinação).

## Plano
1. [backend] migration `LeadContact` + backfill a partir dos blobs existentes (parser dos JSONs
   atuais; aditivo, não destrói blob) + escrever nos DOIS lugares durante transição.
2. Exibição: `buildRadarLeadPublic` passa a listar contacts estruturados; `detalhes-negocio.tsx`
   mostra "Pessoas" com botão wa.me por contato (HOT-05).
3. Filtro/export ganham "tem contato de DONO (qsa)" — o gap #15 (bulk export "N emails
   não-reivindicados") destrava aqui.
4. Empresas: já é o lead; só garantir busca por CNPJ/nome no Owner (índice existe pós HOT-01).
**NÃO fazer:** CRUD manual completo de contatos avulsos sem lead (deles é CRM genérico; nosso
contato nasce do lead).

## Aceite
- [ ] Sócio da Receita aparece como Pessoa no card com wa.me; export com coluna de dono
- [ ] Backfill sem perda (spot-check 20 leads antigos); deletar este .md
