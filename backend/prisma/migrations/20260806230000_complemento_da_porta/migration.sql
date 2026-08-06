-- COMPLEMENTO DA PORTA (06/08, ordem do dono) — "os clientes podem ter o mesmo CEP
-- (morar no mesmo condomínio, por exemplo), o que difere um do outro é o NÚMERO. E se
-- repetir, tem que dar o erro e perguntar se é apartamento."
--
-- O buraco medido: não existia onde guardar apartamento/bloco. Sem esse campo, dois
-- vizinhos do MESMO prédio são indistinguíveis no cadastro — e a régua de endereço
-- repetido não tem como saber que são unidades diferentes, então acusa condomínio
-- inteiro como defeito (medido na company 41: 47 clientes acusados de "mesmo ponto",
-- 31 deles só porque o PINO é grosseiro, não porque o endereço se repete).
--
-- Aditivo puro nas DUAS pontas do endereço (a conta e o local de entrega do
-- multilocal): coluna nula, sem default, sem backfill. Cadastro antigo fica NULL, que
-- é a verdade ("não informado") — e "não informado" nunca prova unidade diferente.

ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "complemento" TEXT;
ALTER TABLE "LocalEntrega" ADD COLUMN IF NOT EXISTS "complemento" TEXT;
