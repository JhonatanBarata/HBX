# W1 — P0.2: signup neutro (mata plano na porta de entrada)
Backend: remover selectedPlanKey do fluxo PÚBLICO (e-mail e Google): sem default hbx_lite/hbx_padrao,
sem gravação na Company, sem syncPlanModulesTx no signup (post-its de módulo morrem — módulo vem do
default/kill-switch do master). Google e e-mail devem criar empresa ESTRUTURALMENTE IGUAL.
Quota p/ plano null: perfil único de conta crédito (fallback = valores do padrão atual; count-based já é telemetria desde R5).
Aposentar POST /financeiro/subscription/create (padrão S7, 410) se grep confirmar zero chamadores no front atual.
DTO público: ignorar selectedPlanKey silenciosamente (compat clients velhos). Master-provisioning intocado.
