# ROADMAP — CONTABIL (frente PARADA de propósito)

> Consolidação dos sprints de `CONTABIL/` (11/07/2026). Docs originais deletados — **git preserva**.
> Frente parada por decisão do dono; **não auto-construir** (toca WhatsApp/dinheiro/dep. externa).

## Visão
O braço externo de automação fiscal do Contábil: S6 faz cada assinatura recebida virar NFS-e emitida sozinha pela API do Sistema Nacional; S7 troca a digitação do PGDAS-D/DAS por ARMAR→TRANSMITIR via Serpro Integra Contador (dono continua o dedo no gatilho). Parou por depender de GATES EXTERNOS do dono (certificado e-CNPJ A1 comprado + Integra Contador contratado) e de injeção de env/flag na VPS + roteiro de validação ao vivo — NÃO de código: tudo publicado em d6a6784d (03/07), atrás de flags default OFF (deploy inerte).

## Sprints

| Sprint | Estado | O que falta |
|---|---|---|
| S6 — NFS-e Nacional automática | 🟡 parcial | Código 100% pronto e publicado (migration FiscalInvoice+FiscalAutomationLog, cofre nfse-cert AES-256-GCM, nfse-national.client mTLS+DPS XMLDSIG, nfse-emitter com retry+disjuntor 3-erros, reconciliação, endpoints owner e UI de cofre/emissão); falta o GATE do dono (comprar certificado A1 + upload no cofre), setar envs na VPS e rodar o roteiro live (3 DPS em produção-restrita → 1 real conferida no portal → job automático 7 dias + testar disjuntor). |
| S7 — Autopost PGDAS-D + DAS via Serpro | 🟡 parcial | Código 100% pronto e publicado (serpro-integra.client OAuth2, serpro-cred cofre, serpro-autopost ARMAR/TRANSMITIR com conferência ±R$1 e fallback semi-auto, DEFIS assistida, endpoints e wizard 'digite TRANSMITIR' no fechar-mes); falta o GATE do dono (contratar Integra Contador na Loja Serpro + credenciais no cofre), setar envs na VPS e validar (demo Serpro → mês real com dupla checagem → conferir portal Simples Nacional). eSocial/DCTFWeb ficou fora de escopo por decisão. |

## Flags / passos VPS pendentes
- HBX_CONTABIL_VAULT_KEY — gerar e guardar FORA do repo na VPS; é a chave AES-256-GCM do cofre, sem ela nem certificado (S6) nem credencial Serpro (S7) funcionam
- HBX_CONTABIL_NFSE_ENABLED — default OFF; setar =1 na VPS só depois do cert no cofre para ligar a emissão S6
- HBX_CONTABIL_NFSE_ENV — restrita|producao (default restrita); começar em 'restrita' e só virar 'producao' após 3 DPS de teste OK
- HBX_CONTABIL_SERPRO_ENABLED — default OFF; setar =1 na VPS após credencial Serpro no cofre para ligar ARMAR/TRANSMITIR S7
- HBX_CONTABIL_SERPRO_ENV — demo|producao (default demo); validar no ambiente demo antes de virar 'producao'
- GATE externo S6: dono comprar certificado e-CNPJ A1 (~R$130-250/ano) e fazer upload do .pfx+senha no cofre (drawer do perfil fiscal)
- GATE externo S7: dono contratar Integra Contador na Loja Serpro (~R$0,96/mês de uso) e salvar consumer key/secret no cofre
- Cancelamento de NFS-e emitida errada é SEMPRE manual pelo portal nesta fase (não há rotina de cancel — por design)
