/**
 * Serializa mutações terminais da mesma rota dentro de uma transação PostgreSQL.
 *
 * A chave usa dois inteiros (`companyId`, hash de `routeId`) para manter tenants
 * isolados. `pg_advisory_xact_lock` é liberada automaticamente no commit/rollback;
 * por isso esta função só pode ser chamada com o client da transação interativa.
 */
export async function lockLogisticaRouteTransaction(
  tx: any,
  companyIdInput: number,
  routeIdInput: string,
): Promise<void> {
  const companyId = Number(companyIdInput);
  const routeId = String(routeIdInput || '').trim();
  if (!Number.isInteger(companyId) || companyId <= 0 || !routeId) {
    throw new Error('Chave de trava da rota inválida.');
  }
  if (typeof tx?.$queryRawUnsafe !== 'function') {
    throw new Error('A trava da rota exige uma transação PostgreSQL ativa.');
  }
  await tx.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock($1::integer, hashtext($2)::integer)',
    companyId,
    routeId,
  );
}
