# 10 — WEBSITE-KIT: SOMENTE RESÍDUOS

## O que já foi feito

Rota do cliente, configuração no Master, entrada na navegação, modelos Prisma, limpeza de tokens, regra do domínio e mint central já existem. Não reconstruir.

## O que falta validar ou concluir

- [ ] 1. Auditar `website-runtime.ts`: remover DDL/runtime e SQL cru que já possuem modelos Prisma.
- [ ] 2. Confirmar secrets dedicados e comportamento fail-hard somente em produção.
- [ ] 3. Validar CORS dos sites vivos antes de qualquer alteração.
- [ ] 4. Testar login admin dos sites vivos após cada mudança de token/CORS.
- [ ] 5. Planejar retirada de `backend/website-kit` do repo do app.
- [ ] 6. Criar repo externo somente com autorização explícita; nunca mover silenciosamente.
- [ ] 7. Remover fotos reais e caminhos absolutos do histórico em janela coordenada.
- [ ] 8. Ativar mint central apenas em site piloto; manter rollback da Function existente.
- [ ] 9. Só criar fábrica `new-site` quando houver mais de um site novo por mês.

## Guardrails

- Dois sites reais dependem deste fluxo.
- Launch token nasce somente no clique e é uso único.
- Nenhum asset de cliente novo entra no Git.
- Force-push de histórico é operação própria e exige autorização.

