# PLANEJAMENTO ATUAL — SOMENTE O QUE FALTA

Revisão feita em 12/07/2026 a partir do código, histórico Git, planos antigos e working tree.

## Regra de execução para plano Plus

- Executar uma única microetapa por conversa.
- Antes de editar, reler o arquivo atual e o plano da frente.
- Não iniciar outra frente enquanto a atual estiver com código sujo, teste vermelho ou decisão pendente.
- Cada microetapa deve caber em revisão curta: poucos arquivos, um objetivo e um conjunto pequeno de checks.
- Build verde não autoriza publicação.
- Publicar, ativar flag, migrar produção ou tocar WhatsApp real são etapas separadas.
- Ao concluir uma microetapa, marcar o checkbox e registrar a evidência no próprio plano.
- Ao concluir um plano inteiro, removê-lo deste índice e da pasta.

## Estado confirmado na revisão

- Backend atual: build verde.
- Testes direcionados da rodada local: 87 aprovados.
- Frontend atual: build de produção verde.
- Frontend atual: lint reprovado apenas no `check-pele`, com 517 estilos inline para teto 514.
- Android atual: `testDebugUnitTest assembleDebug` verde, mas não existem testes unitários no módulo.
- A árvore local mistura mudanças de 11/07 e 12/07 e ainda não deve ser publicada.

## Ordem obrigatória

| Ordem | Plano | Situação |
|---|---|---|
| 1 | [01-FECHAR-TRABALHO-LOCAL.md](01-FECHAR-TRABALHO-LOCAL.md) | Começar aqui |
| 2 | [02-QA-PERFIS-ENTREGA-E-APP.md](02-QA-PERFIS-ENTREGA-E-APP.md) | Depois do lint e revisão |
| 3 | [03-PUBLICAR-E-ATIVAR-SEM-SUSTO.md](03-PUBLICAR-E-ATIVAR-SEM-SUSTO.md) | Somente com árvore consolidada |
| 4 | [04-FINANCEIRO-COBRANCA-E-PAINEL.md](04-FINANCEIRO-COBRANCA-E-PAINEL.md) | Próxima frente de receita |
| 5 | [05-MERCADO-PAGO-SELF-SERVICE.md](05-MERCADO-PAGO-SELF-SERVICE.md) | Depois do painel |
| 6 | [06-REPASSE-PELO-HBX.md](06-REPASSE-PELO-HBX.md) | Depois do self-service |
| 7 | [07-SEGURANCA-FINANCEIRA-E-TENANT.md](07-SEGURANCA-FINANCEIRA-E-TENANT.md) | Em fatias P0/P1 |
| 8 | [08-WEBWHATS-DURABILIDADE-E-ANTI-BAN.md](08-WEBWHATS-DURABILIDADE-E-ANTI-BAN.md) | Uma fatia por vez |
| 9 | [09-INGESTAO-EXTERNA-MULTICANAL.md](09-INGESTAO-EXTERNA-MULTICANAL.md) | Depois da estabilidade do WhatsApp |
| 10 | [10-WEBSITE-KIT-RESIDUAL.md](10-WEBSITE-KIT-RESIDUAL.md) | Somente resíduos reais |
| 11 | [11-LEADS-CREDITOS-E-AUTOMACOES-RESIDUAL.md](11-LEADS-CREDITOS-E-AUTOMACOES-RESIDUAL.md) | Melhorias menores |
| 12 | [12-PLAY-STORE-E-ANDROID.md](12-PLAY-STORE-E-ANDROID.md) | Com aparelho e Console |
| 13 | [13-QA-GERAL-E-OBSERVABILIDADE.md](13-QA-GERAL-E-OBSERVABILIDADE.md) | Contínuo, sem mutirão cego |
| 99 | [99-FUTURO-SOMENTE-COM-GATILHO.md](99-FUTURO-SOMENTE-COM-GATILHO.md) | Não executar agora |

## Fora do novo planejamento

Não replanejar como trabalho novo: Master refab principal, carteira de créditos Fase 1/2, Mobile Casca, Logística base, Multi-local, Vendas cockpit, Automações F1/F3, Website-Kit porta inicial e Visão Futuro S1-S4. Essas frentes já existem no código ou foram publicadas; só aparecem aqui quando há resíduo concreto.

