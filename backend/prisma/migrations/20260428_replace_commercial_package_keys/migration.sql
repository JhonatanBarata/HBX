UPDATE "Company"
SET "selectedPlanKey" = CASE
  WHEN "selectedPlanKey" = 'hbx_vendas_ia' THEN 'hbx_melhor'
  WHEN "selectedPlanKey" = 'hbx_vendas' THEN 'hbx_padrao'
  WHEN "selectedPlanKey" = 'hbx_recovery' THEN NULL
  ELSE "selectedPlanKey"
END
WHERE "selectedPlanKey" IN ('hbx_vendas_ia', 'hbx_vendas', 'hbx_recovery');
