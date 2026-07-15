# Regras absolutas do produto HBX

Estas regras foram aprovadas pelo dono em 14/07/2026 e prevalecem sobre documentação ou código legado conflitante.

## Método de trabalho

1. Antes de alterar código, diagnosticar, planejar, apontar riscos e confirmar decisões que não estejam cobertas por estas regras.
2. Na dúvida material, não executar silenciosamente.
3. Usar subagentes extras para auditoria e validação quando houver mudança ampla, destrutiva ou comercialmente sensível.
4. Nunca concordar por reflexo: a recomendação deve ser sustentada por dados, funcionamento real do produto e retorno comercial.

## Radar, contatos e cobrança

1. Um cliente novo pode localizar e visualizar somente a existência do lead. Até o débito confirmado de 1 crédito, nenhum dado real que identifique a empresa ou uma pessoa pode sair no payload público ou no DOM: nome/razão social, CNPJ, endereço, localização do card, contatos, pessoas, URLs e blobs internos ficam omitidos; a interface usa placeholders visualmente embaçados. O contexto agregado da busca (filtros, cidade pesquisada, segmento e contadores) pode aparecer sem ser atribuído a um lead individual.
2. O enriquecimento adicional acontece na ação de puxar o lead: após o débito, o contato é revelado e o sistema continua acumulando tudo que conseguir localizar pelas fontes permitidas.
3. Não existe diferença de capacidade por plano/tier. Todos recebem o mesmo produto por lead. Permanecem apenas estado comercial da empresa, kill-switch de módulo, RBAC do cargo e saldo de crédito.
4. Provedores pagos de busca/enriquecimento permitidos: Google e Brave. Enriquecedores pagos legados fora dessas duas fontes devem ser removidos sem fallback ou compatibilidade. Fontes locais, internas ou gratuitas continuam permitidas sob o governor.
5. Todo lead operacional passa pelas duas fontes canônicas: base RFB e motor HBX. A origem de descoberta continua rastreável; a consulta/enriquecimento por ambas não deve falsificar a origem.
6. A experiência visual de processamento deve existir em dois momentos: pesquisa/localização e débito+puxada/transferência para Vendas.
7. “Disponíveis” e “Total no Brasil” representam a mesma união deduplicada do universo RFB com leads exclusivos do motor. A chave preferencial é CNPJ normalizado; um lead novo só soma 1 se ainda não existir na união.
8. Contatos da RFB: telefone cadastral 1, telefone cadastral 2 e um e-mail. Telefone 3 e e-mails 2/3 só podem ser apresentados como enriquecimento. Fax é preservado separadamente e não aparece como telefone 3.
9. Todos os contatos válidos são preservados; a interface e exportação podem projetar até três telefones e três e-mails. Telefone sem WhatsApp continua visível após a compra.
10. O backend mascara ou omite todos os valores identificáveis antes da compra, inclusive arrays, eventos, snapshots, evidências e estruturas novas. O frontend nunca é a fronteira de segurança.
11. A Night Factory é exclusivamente local e manual: executa somente dentro do HBX Owner ligado em `127.0.0.1:3107`, nunca no backend/VPS, nunca no boot e nunca por cron. O VPS pode receber resultados, mas não pode originar o crawl. Desligar o Owner ou o PC encerra a execução.

## Interface e temas

1. Toda tela nova usa o mesmo contrato visual, componentes centrais e tokens do HBX.
2. Light e dark são obrigatórios em todos os temas instalados.
3. Contraste legível por olho humano é requisito absoluto para texto, ícone, botão, borda, campo, placeholder, badge, estado desabilitado, loading e erro.
4. Uma tela pode inovar em composição e motion, mas nunca pode destoar da cor/tema ativo nem criar uma superfície preta no tema claro ou clara ilegível no tema escuro.

## Entrega

1. Mudança destrutiva remove o legado no mesmo passo e recebe testes direcionados.
2. Preservar auth, tenant scope, histórico negativo, opt-out, ledger de crédito e refund atômico.
3. Publicar somente após lint, build, testes relevantes, verificação visual desktop/mobile em light/dark e checklist de produção.
