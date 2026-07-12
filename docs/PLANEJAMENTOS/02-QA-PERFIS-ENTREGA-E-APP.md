# 02 — QA DOS PERFIS, ENTREGA E APP

## Objetivo

Exercitar de ponta a ponta o que a rodada local implementou. Não corrigir durante o levantamento; registrar o bug e corrigir em uma conversa separada.

## Microetapas

- [ ] 1. Criar quatro usuários de teste no mesmo tenant: Admin, Vendedor, Entregador e Ambos.
- [ ] 2. Validar login e destino inicial de cada perfil.
- [ ] 3. Validar menu, URL digitada e resposta 403 para workspaces não permitidos.
- [ ] 4. Atribuir, reatribuir e desatribuir entrega; impedir outra empresa e entrega concluída.
- [ ] 5. Confirmar que entregador lista e abre somente entregas atribuídas a ele.
- [ ] 6. Testar comprovante sem exigência, só foto, só assinatura, só código e combinações.
- [ ] 7. Repetir upload com a mesma chave e confirmar idempotência.
- [ ] 8. Testar perda de rede, fila offline, reconexão e ausência de confirmação duplicada.
- [ ] 9. Testar Indicação com flag OFF e ON; primeira recarga premia uma vez e autoindicação não premia.
- [ ] 10. Testar Portal de Pedido com flag/toggle OFF, token inválido, honeypot, preço adulterado e teto diário.
- [ ] 11. Validar mobile e desktop, light e dark.
- [ ] 12. No aparelho Android: câmera, assinatura, GPS, Waze/Maps, notificação, takeover de chegada, compartilhar comprovante e reiniciar sessão.

## Evidências mínimas

- Captura de tela dos quatro perfis.
- Log ou resposta dos 403 esperados.
- Uma entrega completa com cada tipo de comprovante.
- Uma tentativa cross-tenant bloqueada.
- Um ciclo offline sem duplicidade.
- Console do navegador sem erro React/hydration.

## Pronto quando

Todos os fluxos passam em navegador real e aparelho físico, ou cada falha restante possui reprodução curta e plano próprio.

