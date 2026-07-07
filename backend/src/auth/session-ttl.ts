// Janela ÚNICA da sessão (decisão do dono 07/07/2026 — padrão SaaS/Mercado Livre):
// 30 dias DESLIZANTES de inatividade derrubam o login; uso ativo renova a janela a
// cada request (slide no jwt.strategy). O corte de segurança real continua sendo a
// revogação server-side POR REQUEST (logout, novo login, isActive=false) — um token
// roubado morre junto com a AuthSession, então alongar a janela não amplia superfície.
// O JWT usa a MESMA janela como teto ABSOLUTO desde o último login: usuário
// sempre-ativo refaz login no máximo 1x por janela.
const DEFAULT_SESSION_IDLE_DAYS = 30;

const parsedDays = Number(String(process.env.AUTH_SESSION_IDLE_TTL_DAYS || '').trim());

export const SESSION_IDLE_TTL_DAYS =
  Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_SESSION_IDLE_DAYS;

export const SESSION_IDLE_TTL_MS = SESSION_IDLE_TTL_DAYS * 24 * 60 * 60 * 1000;
