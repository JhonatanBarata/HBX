# Template Tarefa Codex

## Objetivo

## Regras obrigatórias

- Ler 00-ARQUITETURA-SUPREMA.md antes.
- Ler 01-CHECKPOINT-ATUAL.md antes.
- Não usar slug hbx em runtime.
- Não criar regra especial para HBX.
- Não criar fallback permissivo.
- Não marcar backendEnforced=true sem enforcement real.
- Não misturar escopo sem autorização.

## Arquivos prováveis

## Testes obrigatórios

## Grep obrigatório

rg -n -F -e "isHbxOperationSellerUser" -e "hbxSellerScope" -e "hbx_master" -e "master_operacional" -e "master_operational" -e "HBX_MASTER" -e "COMPANY_ADMIN" -e "vendedor HBX" -e "HBX Master" -e "Master Radar" backend/src frontend/src

## Resumo final obrigatório

- Arquivos alterados
- Regras aplicadas
- Testes executados
- Grep final
- Pendências reais
- Checkpoint atualizado
