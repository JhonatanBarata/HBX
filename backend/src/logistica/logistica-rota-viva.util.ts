/**
 * "A rota ainda está de pé?" — régua ÚNICA de quem pode mexer numa parada já
 * congelada (`LogisticaRouteStop`).
 *
 * Incidente 27/07 ("a sexta que não volta"): as duas rotinas que trazem parada
 * pro dia (materializeForRoute) e que a devolvem (descartarMontagem) tratavam
 * QUALQUER parada congelada como intocável. Só que o congelamento sobrevive à
 * rota: uma rota de ontem que ninguém encerrou deixava 10 clientes da sexta
 * presos no dia 26 — invisíveis pra montagem de hoje (o `scheduledAt` velho não
 * entra no range do dia) e fora do descarte, então a ocorrência daquela sexta
 * nunca voltava e o `generateDay` ainda empurrava a `proximaData` pra semana
 * seguinte. O cliente sumia da rota "pra sempre" sem erro nenhum na tela.
 *
 * O que precisa ser protegido é a rota VIVA — roubar parada de rota em
 * andamento é que quebra o motorista na rua. Morta a rota (encerrada
 * operacionalmente, terminada comercialmente ou simplesmente de um dia que já
 * passou), a parada dela volta a ser agendável.
 */

/** Status comerciais em que a rota NÃO tem mais paradas pra defender. */
const ROTA_TERMINAL_STATUS = ['COMPLETED', 'FAILED', 'REFUNDING'] as const;

/**
 * Fragmento de `where` do Prisma para "entrega livre pra ser trazida pro dia":
 * sem parada congelada OU com parada de uma rota que já morreu.
 *
 * `hojeISO` é a data operacional em `YYYY-MM-DD` — o mesmo formato (e ordem
 * lexicográfica) do `LogisticaRoute.routeDate`, que é VarChar(10).
 */
export function stopLivreWhere(hojeISO: string) {
  return {
    OR: [
      { logisticaRouteStop: { is: null } },
      {
        logisticaRouteStop: {
          is: {
            route: {
              OR: [
                { operationalEndedAt: { not: null } },
                { status: { in: [...ROTA_TERMINAL_STATUS] } },
                { routeDate: { lt: hojeISO } },
              ],
            },
          },
        },
      },
    ],
  };
}

/**
 * Mesma régua para uma linha JÁ CARREGADA (o descarte lê as entregas antes de
 * decidir, então filtra em memória). `stop` null = livre.
 */
export function stopDeRotaMorta(
  stop: { route?: { status?: string | null; operationalEndedAt?: Date | null; routeDate?: string | null } | null } | null | undefined,
  hojeISO: string,
): boolean {
  if (!stop) return true;
  const route = stop.route;
  if (!route) return true;
  if (route.operationalEndedAt) return true;
  if (route.status && (ROTA_TERMINAL_STATUS as readonly string[]).includes(route.status)) return true;
  if (route.routeDate && String(route.routeDate) < hojeISO) return true;
  return false;
}
