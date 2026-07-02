# WORM-12 — Tela Atividades (agenda do vendedor)

**Tela deles:** `/appjs/activities`. Lista: Realizada (check), Assunto (📞 Ligação / Reunião /
Visita / Vídeo), Relação (lead/oportunidade), Vencimento, Duração ("dia inteiro"), Responsável.
Filtros por usuário/tipo/período. No detalhe da oportunidade: "Próximas atividades" + integração
Calendly (reunião marcada entra sozinha como atividade — ver cold/25).

## O que o HBX tem
Card com próximos passos implícitos; não existe agenda consolidada "o que eu faço hoje".

## Por que importa
Vendedor de pequeno negócio não usa CRM porque CRM dá trabalho. A tela "MINHAS TAREFAS DE HOJE"
é o que faz ele voltar todo dia. É retenção pura.

## Plano
1. [backend] entidade `Atividade { id, leadId, tipo(ligacao|reuniao|visita|mensagem), titulo,
   vencimento, duracao?, responsavelId, realizadaEm?, criadaPor(user|automacao|ia) }` + CRUD.
2. [frontend] tela "Hoje" do vendedor: atrasadas (vermelho), hoje, semana. Check realiza + pede
   resultado em 1 tap ("atendeu? sim/não/remarcar") — alimenta o termômetro (WORM-10).
3. Automações criam atividade (WORM-13): "lead respondeu → atividade 'ligar em 2 dias'".
4. **Criatividade além deles:** "Meu dia em 30s" — resumo IA local de manhã: "3 leads esfriando,
   2 ligações vencidas, 1 lead novo quente de {segmento}". 7B faz isso de graça.

## Aceite
- [ ] Criar/concluir atividade do card e da tela Hoje; automação criando atividade
- [ ] Deletar este .md
