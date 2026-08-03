// SENTINELA (03/08) — flag MESTRA do ECO no WhatsApp do dono.
//
// ⚠️ ESTA FLAG NÃO CONTROLA A SENTINELA. O vigia (sem sinal / parado demais /
// atraso) roda SEMPRE e alimenta o feed do cockpit — leitura pura, custo zero,
// e "vigia atrás de chavinha é vigia dormindo" (a mesma decisão do vigia de
// rota parada, 31/07).
//
// O que esta flag controla é a ÚNICA parte que gasta chip: mandar o aviso pro
// WhatsApp do dono quando ele não está com a tela aberta. Mensageria segue o
// padrão canônico de 2 chaves do módulo (igual cobrança-whats e resumo-diário):
// esta env (global) E LogisticaConfig.sentinelaWhatsAtiva (por tenant, default
// false). Qualquer uma OFF = nada sai. Cicatriz de chip banido em jun/26.
export function isSentinelaWhatsEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(
    String(process.env.HBX_SENTINELA_WHATS_ENABLED || '').trim().toLowerCase(),
  );
}
