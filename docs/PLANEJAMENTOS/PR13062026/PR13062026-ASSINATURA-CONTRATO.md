# Assinatura eletrônica do contrato do vendedor

Ordem do dono (13/06): trocar o **anexo PDF** do onboarding por um **link de
assinatura**. Empresa assina UMA vez (guardada no HBX) → vendedor assina por
link tokenizado → PDF assinado salvo no backend + cópia opcional por e-mail.
Resolve de quebra o anexo bloqueado pelo Outlook.

## Dica jurídica (não esquecer)
O DESENHO é a parte bonita; o que dá validade (Lei 14.063/2020 + MP 2.200-2) é a
**trilha de consentimento**: nome + CPF + texto/versão do contrato aceito +
data/hora + IP. Desenho + bloco de consentimento, sempre os dois.

## Peças — TODAS CONSTRUÍDAS (local, não publicado) — build+11 testes+lint verdes
1. **[FEITO] Assinatura da empresa (a SUA).** Admin desenha (canvas `SignaturePad`)
   e salva em Novo acesso → "Editar modelo" → "Sua assinatura no contrato".
   Storage PNG por empresa (`storage/seller-onboarding-company-signatures/`).
   Endpoints `GET/POST/DELETE /gerencial/hbx-partners/onboarding/company-signature`.
2. **[FEITO] Página de assinar (pública, token).** Em `hbx-vendedor/onboarding`:
   contrato (scroll) + assinatura HBX aposta + `SignaturePad` do vendedor + CPF +
   "li e aceito" + "receber cópia". GET público estendido devolve contrato+sig+signed.
3. **[FEITO] Backend da assinatura.** `POST .../public/sign` (token, sem login,
   throttle) → valida CPF/aceite/PNG → `buildContractPdfBuffer` agora embute as 2
   assinaturas + bloco de consentimento (nome/CPF/data/IP/SHA-256, Lei 14.063) →
   salva como `signed_contract` → cópia por e-mail se marcado.
4. **[FEITO] E-mail + botão.** `sendOnboardingEmail` NÃO anexa mais o contrato
   (generated/signed) — vai pelo link (mata o bloqueio do Outlook; teste ajustado
   3→2 anexos). Botão renomeado "Gerar contrato PDF" → "Gerar contrato LINK" nas 2
   modais. (Obs: o botão ainda GERA o PDF base; o link de assinar é o do onboarding.)

## Limites
- Backend = trilha planejada (BACKEND.md); migrations idempotentes no container.
- Frontend = 5 leis do design system (sem visual inline; canvas via classe/utility).
- NÃO mexer em auth/secrets. Deploy/publish = o DONO roda.
- Assinatura inline do e-mail (cartão de visitas) é OUTRA coisa — não confundir.
