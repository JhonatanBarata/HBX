# Jornada de Agendamento WhatsApp — Uso rapido

## Como criar uma nova guia

1. Abra `Dashboard > Atendimento > Agenda`.
2. Clique em `Nova guia`.
3. Dê duplo clique na aba criada para renomear inline.
4. Abra a engrenagem da guia.
5. Em `Guias / Servicos`, preencha:
   - nome
   - botao do bot
   - slug
   - tipo de acao
   - agenda vinculada
   - status
6. Em `Regras`, ajuste:
   - dias uteis
   - dias visiveis
   - janela de busca
   - quantidade de horarios sugeridos
   - fallback futuro
   - horarios/slots
7. Em `Mensagens`, revise:
   - mensagens globais do fluxo
   - mensagem com horarios
   - fallback sem horario
   - mensagem de indisponibilidade imediata
8. Em `Simulacao`, rode o sandbox antes de salvar.
9. Clique em `Salvar agenda`.

## Como configurar cancelamento

1. Crie ou selecione uma guia.
2. Em `Guias / Servicos`, troque `Tipo de acao` para `Cancelar agendamento`.
3. Ajuste os textos de cancelamento em `Mensagens`.
4. Use `Simulacao` para validar os cenarios:
   - cliente com agendamento ativo
   - cliente sem agendamento localizado

## Como testar rapidamente

1. Renomeie uma guia com duplo clique na aba.
2. Marque/desmarque dias uteis no card lateral da direita.
3. Abra o drawer e altere mensagens do fluxo.
4. Rode a simulacao para:
   - clique na guia
   - confirmacao de agendamento
   - cancelamento
5. Salve a agenda.
6. Recarregue a pagina e confirme que os dados persistiram.

## Validacao executada

- `backend`: `npm run build`
- `frontend`: `npx eslint src/app/dashboard/inbox/_components/AgendaPanel.tsx src/app/dashboard/inbox/page.client.tsx src/app/dashboard/inbox/inbox-model.ts`
- `frontend`: `npm run build`
