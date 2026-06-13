# PR13062026003 — Terminar front + analisar as telas da vendedora

> Plano do dia 13/06/2026 (madrugada). Objetivo: **terminar o front**, **entrar no e-mail
> da vendedora cadastrada** e **analisar TODAS as telas que ela vai trabalhar**, do ponto
> de vista real dela.

## Contexto travado (corrige mal-entendido — guardar com força)

- As 2 vendedoras são **força de vendas DO HBX**: vendem o **próprio HBX** pra novos
  clientes. **Comissão pura, SEM salário.** **NÃO são desenvolvedoras.**
- Elas **aquecem leads PRO HBX** — é **dogfood** da esteira (o HBX usando a própria
  esteira pra se vender), **não** aquecimento de leads pros clientes do HBX. (O uso da
  esteira como feature de cliente Full continua válido, mas é depois — agora é o HBX
  provando o loop em si mesmo, exatamente o que se recomendou: provar com a própria gente.)
- Canal: **telefone** (motor, sem porteiro) + **WhatsApp do chip de trabalho** (follow-up).

## WhatsApp das vendedoras — decisão

- **Chip de trabalho por vendedora**, número **da HBX** (não pessoal). Motivo de
  continuidade/retenção: quando a vendedora sai, **a HBX fica com o número e o histórico
  de conversa** — o relacionamento não vai embora com ela.
- **NÃO** usar celular pessoal dela (problema legal/privacidade + você perde o número e o
  histórico quando ela sai).
- **NÃO** compartilhar o WhatsApp do admin entre as duas: quebra a **atribuição** (a
  auditoria de vendedor não consegue dizer quem fez o quê) e concentra volume num número
  só = mais risco de ban.
- **Bootstrap (agora): Evolution/Webwhats no ritmo humano do chip** — grátis por mensagem,
  e em **volume humano** (uma pessoa mandando dezenas, não um servidor disparando milhares)
  o risco de ban é baixo e o chip é barato de repor.
- **Meta Cloud API = DEPOIS**, só quando: (a) o loop estiver **provado** que converte,
  (b) o volume for alto a ponto do ban doer mais que a taxa, (c) houver **opt-in**. Motivo:
  custo (ver análise abaixo).
- Operacional: como moram longe, mandar dinheiro pro chip (ou o chip pronto pra casa).
  Registrar o número sob a HBX onde der, pela continuidade.

## Análise de preço — por que Meta é prematuro (concessão ao dono)

Disparo frio comercial via Meta = categoria **marketing** = a mais cara + exige opt-in +
template aprovado. No Brasil, com markup de BSP, mensagem de marketing fica na faixa de
~R$0,40–1,00 cada. Conta diária, em loop **não provado**:

| WhatsApp/dia | × ~R$0,70 | mês (~22 dias úteis) |
|---|---|---|
| 50 | R$35/dia | ~R$770 |
| 100 | R$70/dia | ~R$1.540 |
| 200 | R$140/dia | ~R$3.080 |

Isso é dinheiro queimado **antes de qualquer resposta**, em algo que não fechou uma venda
sequer. Evolution do chip = **R$0/mensagem** (só o plano do chip, ~R$30–50/mês fixo). Logo,
no bootstrap, **Meta é irracional**; Evolution em volume humano ganha. (Correção do agente:
a regra "WhatsApp só follow-up, nunca 1º toque sem Meta" era pra disparo de servidor em
escala — em volume humano de chip não se aplica. Mantém o 1º toque por e-mail grátis
[CompanyMailer] e o WhatsApp do chip como toque humano; tudo de graça.)

## Tarefas (próxima sessão)

1. **Terminar o front** das telas que a vendedora usa — Vendas, Leads, Atendimento,
   Relatórios/Dashboard. Ligar botões mortos relevantes ao trabalho dela; tirar KPIs "—"
   onde houver contrato. Respeitar as 5 Leis (classe central/token, sem visual inline).
2. **Entrar no e-mail da vendedora cadastrada** e percorrer o fluxo real dela ponta a ponta.
3. **Mapear cada tela** que ela toca: o que funciona, o que está cru, o que falta pra ela
   trabalhar no dia 1. Devolver a lista pro dono decidir prioridade.

## Não-objetivos

- Não construir estágios novos da esteira agora (decisão 13/06: soltar pra vender primeiro).
- Não ligar Meta. Não mexer em cobrança/preço.
