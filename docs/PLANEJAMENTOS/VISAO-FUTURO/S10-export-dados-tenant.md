# S10 — EXPORT "SEUS DADOS SÃO SEUS" (PLANO — não construído; barato, mata objeção de venda)

> Objeção nº1 da PME contra sistema novo: "e se eu quiser sair?". Export 1-clique vira argumento
> de VENDA e reduz risco LGPD (portabilidade).

## Desenho
- Endpoint `GET /export/meus-dados` (admin do tenant, JWT, rate-limit 1/hora): gera ZIP com CSVs —
  clientes (CustomerProfile), produtos, entregas, cobranças (FinanceiroCharge do tenant), leads de
  vendas. Geração assíncrona se >10k linhas (job + link temporário) — v1 pode ser síncrono com teto
  de linhas e paginação interna.
- UI: botão em Configurações → "Exportar meus dados (CSV)". Zero flag? NÃO — flag `HBX_EXPORT_ENABLED`
  default OFF por prudência de carga; ligar é trivial.
- Cuidados: só dados DA empresa (tenant scope explícito em toda query); telefone/CPF de cliente final
  vai no export (é dado do tenant — ok LGPD como operador→controlador), mas NUNCA dados do pool global
  do Radar não-puxados (não são do tenant); CSV com BOM UTF-8 (Excel BR); teto de tamanho e streaming.
- Fase 2: backup automático visível ("último backup: hoje 03:00") — selo de confiança; rotina de dump
  por tenant é assunto de infra (NUNCA junto do dump da RFB — regra publish-nunca-backup-rfb).

## Esforço estimado: 1 sprint de worker.
