// ================================================================
// PR10072026 W4 — detecção "só-logística" (helper compartilhado da frente).
// Contrato (CONTRATOS.md): soLogistica = logistica accessible && NENHUM de
// {vendas, atendimento, webscraping, website, bot} accessible — tudo via
// GET /modules/me (cacheado por quem chama: shell no mobile central,
// entrega-mods no app /entrega).
//
// Tipagem ESTRUTURAL de propósito: aceita tanto o MyModulesState do shell
// quanto o EntregaModsState do /entrega sem importar nenhum dos dois (zero
// acoplamento/ciclo). `loaded=false` → false (fail-closed: enquanto não sabe,
// ninguém é tratado como só-logística).
// ================================================================

export type ModAccessState = {
  loaded: boolean;
  byKey: Record<string, { accessible?: boolean } | undefined>;
};

// Módulos que, acessíveis, tiram o usuário do modo só-logística.
const MODULOS_FORA_DA_LOGISTICA = ["vendas", "atendimento", "webscraping", "website", "bot"] as const;

export function soLogistica(mods: ModAccessState): boolean {
  if (!mods.loaded) return false;
  const acessivel = (k: string) => mods.byKey[k]?.accessible === true;
  if (!acessivel("logistica")) return false;
  return MODULOS_FORA_DA_LOGISTICA.every((k) => !acessivel(k));
}
