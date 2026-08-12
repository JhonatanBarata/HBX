/**
 * "O BANCO AINDA NÃO TEM ISSO" — a diferença entre TRANSIÇÃO e DEFEITO.
 *
 * Coluna/tabela que o CÓDIGO já conhece mas o BANCO ainda não (migration pendente).
 * P2022/P2021 são os códigos do Prisma; 42703/42P01 são os do Postgres que vazam pelo
 * raw. As duas situações continuam no log — com rótulos diferentes: uma é `warn`
 * ("esperado, some quando a migration rodar") e a outra é `error` ("alguém precisa
 * olhar agora"). Best-effort MUDO foi o que desligou 23M endereços do CNEFE por 5 dias
 * sem ninguém ver; "esperado" nunca é desculpa pra silêncio.
 *
 * Morava dentro de `logistica-rota.service.ts`. Saiu pra cá quando o segundo leitor
 * apareceu (`logistica-prospector-semana.service.ts`): régua repetida diverge calada,
 * e importar do serviço criaria ciclo (o serviço da semana é injetado no da rota).
 */
export function ehEsquemaAusente(error: unknown): boolean {
  const code = String((error as any)?.code || '');
  if (code === 'P2022' || code === 'P2021') return true;
  const meta = String((error as any)?.meta?.code || '');
  if (meta === '42703' || meta === '42P01') return true;
  return /42703|42P01|does not exist in the current database/i.test(String((error as any)?.message || ''));
}
