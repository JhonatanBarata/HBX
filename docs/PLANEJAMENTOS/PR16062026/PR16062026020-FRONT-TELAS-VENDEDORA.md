# PR16062026020 — FRONT: terminar e mapear as telas da vendedora

> Migrado de `PR14062026003`. A régua por cargo já está no ar (vendedora nasce com Vendas+Radar,
> sem cobrança, sem área do dono). Boa parte do front dela já foi ligada (ver memória
> `atendimento-fidelidade-whatsapp`: Atendimento ligado ao inbox rico + botões mortos ligados).

## Contexto travado (não reinterpretar)
As 2 vendedoras = **força de vendas DO HBX** (comissão pura, sem salário, NÃO são devs). Vendem o
próprio HBX. Canal: telefone (motor) + **WhatsApp do chip de trabalho, número da HBX** (não
pessoal — quando ela sai, a HBX fica com número e histórico). Evolution/Webwhats em volume humano
(grátis por mensagem); **Meta = depois** (caro, só com loop provado + opt-in).

## ⛔ FALTA (auditar + terminar)
1. **Percorrer** Vendas/Leads/Atendimento/Relatórios na pele real da vendedora (entrar no e-mail
   dela cadastrado, fluxo ponta a ponta).
2. **Ligar botões mortos** relevantes ao trabalho dela; tirar KPIs "—" onde houver contrato.
3. **Mapear cada tela** (funciona / cru / falta pra rodar) e devolver a lista pro dono priorizar.

## Não-objetivos
- Não construir estágios novos da esteira agora. Não ligar Meta. Não mexer em cobrança/preço.
- 5 Leis (classe central/token, sem visual inline).

## Status
Muito já ligado; falta a varredura final + o mapa pro dono.
