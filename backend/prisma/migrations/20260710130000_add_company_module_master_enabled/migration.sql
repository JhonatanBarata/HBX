-- PR10072026 W1 — teto do master × uso do admin (docs/PLANEJAMENTOS/PR10072026/W1-BACKEND-MODULOS.md).
-- CompanyModule ganha a 2ª camada: `masterEnabled` = TETO (só o /master escreve);
-- `enabled` vira a camada da EMPRESA (OOBE/admin escrevem).
-- Efetivo do override = masterEnabled && enabled; ausência de linha continua
-- seguindo SystemModule.defaultEnabled.
--
-- Backfill: NOT NULL DEFAULT true preenche TODAS as linhas existentes com true
-- (master re-trava pelo painel se quiser) — nenhum acesso muda no deploy.

ALTER TABLE "CompanyModule" ADD COLUMN "masterEnabled" BOOLEAN NOT NULL DEFAULT true;
