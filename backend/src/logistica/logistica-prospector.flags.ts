// PROSPECTOR CNPJ (PR07082026-PROSPECTOR-CNPJ F0, 07/08) — flag MESTRA da
// prospecção por corredor de rota (empresas apagadas no mapa do APK que acendem
// e falam, viram lead no /vendas e podem disparar WhatsApp pelo trilho do
// disparo frio). Molde EXATO de isCobrancaWhatsEnabled (logistica-cobranca.flags.ts).
//
// Default OFF: com a flag desligada o deploy é 100% inerte — nenhum prospecto
// embarca na folha, nenhum pino aparece, nenhum disparo nasce, e o GET
// /logistica/config devolve prospectorDisponivel=false (a UI esconde o toggle).
// Gate em 2 chaves (padrão canônico do módulo): esta env (global) E
// LogisticaConfig.prospectorAtivo (por tenant, default false) precisam estar ON —
// qualquer uma OFF = nada acontece. O disparo automático tem uma TERCEIRA chave,
// exclusiva do Master (prospectorAutomacaoAtiva), porque é cobrado como automação.
export function isProspectorEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_PROSPECTOR_ENABLED || '').trim().toLowerCase());
}
