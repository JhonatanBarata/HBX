# COLD-25 — Apps / Integrações (marketplace embrionário deles)

**Tela deles:** `/appjs/app-apps` (Beta). Categorias: Agenda & reuniões, Videochamada, E-mail,
Comunicação. Único app hoje: **Calendly** — "lead agenda no Calendly → CNPJ BIZ identifica o
e-mail na base → reunião entra como atividade no negócio → vendedor vê tudo no painel" + botão
"Sugerir app". Ou seja: marketplace de UM app, mas com a PRATELEIRA montada (sinal de roadmap
e de como priorizam: agendamento primeiro).

## Leitura
A integração de agendamento é a única que importa pra PME BR no curto prazo — reunião marcada
sem ida-e-volta de mensagem. O resto (Zapier-like) é enfeite até ter volume.

## Versão HBX (barata e mais BR)
1. **Agendamento próprio simples** em vez de Calendly pago: página pública `hbx.app/agenda/
   {vendedor}` com slots (o vendedor define horários) → confirmação vira Atividade (WORM-12) +
   lembrete automático via WhatsApp do sistema 1h antes (Calendly não faz lembrete por WhatsApp
   — NÓS fazemos, é nosso território).
2. Convite .ics no e-mail (padrão, sem integração paga).
3. Se cliente já usa Calendly: webhook deles é simples — adapter de 1 dia, fazer sob demanda.

**Gatilho:** WORM-12 (Atividades) entregue + pedido de 1 cliente real. Antes disso, frio.
