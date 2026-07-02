# WORM-17 — O funil Free→pago deles (paywall que não humilha, slider que ancora)

**Telas deles (vividas na pele pelo dono):**
- **Trial**: ~10 créditos. "Respirei, acabou" — TODO clique de valor consome (exportar CNPJ = 1,
  enriquecer = 1, IA = fração). O saldo fica SEMPRE visível no canto inferior da sidebar.
- **Paywall**: modal limpo "Você ultrapassou o limite do Plano **Free**! Aguarde a renovação ou
  aumente os limites agora" + botão "Conheça os planos" + link "Fale com nossa equipe de vendas".
  Sem envergonhar, sem beco: 2 saídas (pagar ou esperar).
- **Assinatura**: slider 500→10.000 créditos com TODOS os recursos recalculando ao vivo +
  toggle Anual (33% OFF) / Semestral (11%) / Trimestral — ancora no anual. Selo "Plano Free Ativo".
- FAQ de créditos com exemplos numéricos honestos. NF-e automática. Pix libera na hora.

## Lições pro HBX (modelo é diferente — SEM taxímetro — mas a mecânica de upsell serve)
1. **Medidor visível**: o que o plano do cliente limita (leads/dia entregues, chips, automações)
   deve estar SEMPRE na sidebar com barra de consumo. Ansiedade boa: "usei 80% e é dia 20".
2. **Paywall padrão único**: um componente `LimiteAtingidoModal` (título, o que aconteceu, 2 CTAs:
   upgrade cobra diferença live — já existe! — e "falar com o dono" wa.me). Hoje cada tela
   inventa seu aviso; padronizar.
3. **Slider de plano**: nossa tela de planos com slider "quantos leads/dia?" recalculando preço e
   recursos ao vivo (âncora anual com desconto). Muito mais vendedor que tabela de 3 colunas.
4. **Momento do paywall = momento de desejo**: eles bloqueiam DEPOIS de mostrar o valor (viu a
   lista, quer exportar). No HBX: mostrar o lead BLOQUEADO com blur nos contatos quando a cota
   diária acabou ("mais 12 leads esperando — aumente seu plano") em vez de esconder.
5. **Anti-lição** (não copiar): trial que morre em 1 teste gera raiva (prova: o dono). Nosso
   trial: X leads VALIDADOS completos de brinde, sem pegadinha — e o vídeo do HOT-06 mostra isso.

## Plano
1. [frontend] componente único `LimiteAtingidoModal` no hbx-theme + varredura substituindo avisos ad-hoc.
2. [frontend] medidor de consumo na sidebar do Master (dados que o plano já tem).
3. [frontend+backend] tela de planos com slider (preços/recursos por plano vêm do backend;
   FRENTE FINANCEIRA: Opus edita direto + revisão de diff — regra da casa).
4. Blur-tease de leads acima da cota no radar do vendedor (LEI DO VENDEDOR intacta: sem valores).

## Aceite
- [ ] Modal único em todas as superfícies de limite; slider funcional; blur-tease no radar
- [ ] Deletar este .md
