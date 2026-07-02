# HOT-03 — "Opções de contato" + anti-contador (o filtro que separa lista útil de lixo)

**Tela deles:** bloco final da Pesquisa Avançada.
- **Apenas empresas que tenham** (radio): Com ou sem contato / E-mail / Celular / Celular e E-mail /
  Telefone Comercial / Tel ou Celular / Tel ou Celular e E-mail / Tel ou Celular ou E-mail.
- **Opções avançadas** (check): Remover empresas com o MESMO número telefônico (dica deles: "diminui
  chance de contato de contabilidade"); Remover com o mesmo e-mail; Remover e-mail contendo "contab";
  Desconsiderar empresas que já exportei.

## Por que é ouro
O maior defeito de lista da Receita: o telefone/e-mail declarado é DO CONTADOR (1 escritório
= 200 empresas com o mesmo contato). Eles resolvem com 4 checkboxes. Nós resolvemos MELHOR
porque temos WhatsApp-gate e crawl — mas precisamos das checkboxes também (são baratas).

## Plano (entra no endpoint do HOT-02, worker backend)
1. Filtros de presença: `phoneDigits IS NOT NULL`, `email IS NOT NULL`, celular = `phoneDigits`
   com regra-do-9 (`length=11 && [2]=='9'`) — a validação já existe no domínio (fábrica de e-mail).
2. **Anti-contador por frequência** (pré-computado 1x pós-import, colunas novas):
   `phoneShareCount int` e `emailShareCount int` em `CnpjPublicCompany` = quantos CNPJs compartilham
   aquele phone/email (UPDATE via GROUP BY na staging). Filtro: `phoneShareCount <= N` (default 3).
   Melhor que o deles: eles removem "mesmo número"; nós graduamos (2 filiais ok, 40 = contador).
3. E-mail de contador: blocklist de substrings `contab, fiscal, escritorio, assessoria, adv` (config
   env/JSON, editável no Owner) + o próprio `emailShareCount`.
4. "Desconsiderar já exportadas/entregues": join com `RadarLead`/tabela de entregas existente
   (dedup por `cnpj` e por `phoneDigits`).
5. UI (tela HOT-02): radios + checks iguais aos deles + slider "máx. empresas por telefone".

## Criatividade (além deles)
- **Selo de qualidade do contato** no resultado: 🟢 WhatsApp validado (nosso gate) / 🟡 celular
  provável / 🟠 fixo / 🔴 provável contador (share alto ou blocklist). Eles não têm NADA disso.
- Estatística no topo da lista: "das 4.717, 2.103 têm celular próprio, 512 são contato de contador".
  Vende a inteligência do HBX na cara do usuário.

## Aceite
- [ ] shareCounts populados pós-import; filtro corta escritório com 40 CNPJs no mesmo fone
- [ ] Selo de qualidade aparecendo na amostra da tela HOT-02
- [ ] Typecheck verde; deletar este .md
