# WORM-11 — Tela detalhe da Oportunidade (visão 360 com conversa embutida)

**Tela deles:** header com pipeline clicável (bolinhas das 5 etapas), Ganho/Perdido. Colunas:
esquerda = Detalhes (título, valor, origem, responsável, **termômetro**, tags, anotações amarelas);
centro = **abas WhatsApp / E-mail com a conversa DENTRO da oportunidade** + toggle "Inteligência
Artificial" ON/OFF por conversa; direita = Próximas atividades (+ agendar), Empresa vinculada
(email/tel c/ botões copiar/whats), Contatos (sócios!), Arquivos. Timeline de histórico embaixo
("Etapa alterada para Qualificação em 04/11 15:44"). Anotações com @menção de colega.

## O que o HBX tem
`detalhes-negocio.tsx` renderiza o lead enriquecido; conversa WhatsApp vive no módulo de
atendimento (Webwhats), separada do card de venda. IA classificador no bot.

## O que vale roubar (em ordem de $)
1. **Conversa WhatsApp embutida no card** — o vendedor não alterna de tela pra responder o lead
   da negociação. (Backend: já temos as mensagens no banco do app; é renderizar o thread da
   `companySession`+telefone do lead dentro do detalhe.)
2. **Toggle IA por conversa** — "deixa o bot tocar" vs "assumo eu". O HBX JÁ tem o classificador;
   falta o interruptor por-conversa na UI do card (hoje é por flag global?). Regra clara de handoff:
   IA para quando humano digita; volta quando marcar "devolver pra IA".
3. **Timeline de histórico** (etapa mudou, msg enviada, atividade criada) — auditoria pro dono.
4. Anotações com @menção → notifica o colega (simples: parse @ + notificação existente).
5. Sócios da empresa como CONTATOS clicáveis (nosso QSA do HOT-01 alimenta isso de graça).

## Plano
1. [worker backend] endpoint thread-do-lead (mensagens por telefone do lead na sessão da empresa,
   paginado) + endpoint toggle `aiEnabled` por conversa (respeitando o motor vivo como fonte).
2. [worker frontend] remodelar detalhe do card: 3 colunas como deles, no hbx-theme; aba WhatsApp
   renderizando o thread + composer (envia pela rotina NORMAL do app — jamais API crua).
3. Timeline: tabela de eventos do lead (já deve existir parcial — reusar; senão, event log leve).
**Cuidado Webwhats:** enviar mensagem daqui usa exatamente o caminho existente do atendimento
(mesma sessão, mesmos freios). Nada de socket novo.

## Aceite
- [ ] Ver e responder WhatsApp de dentro do card; toggle IA por conversa funcionando
- [ ] Timeline registrando mudança de etapa; deletar este .md
