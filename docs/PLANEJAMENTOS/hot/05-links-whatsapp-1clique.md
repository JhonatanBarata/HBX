# HOT-05 — Link WhatsApp em 1 clique, em TODO lugar (trivial — fazer primeiro)

**O que eles fazem:** toda planilha exportada traz `link_whatsapp_cnpjbiz` (abre o chat DELES com
o lead) e `link_test_whatsapp` = `https://api.whatsapp.com/send?phone=55DDDNÚMERO`. Todo telefone
na UI tem botãozinho WhatsApp/copiar do lado.

## O que o HBX tem
Telefones validados com WhatsApp-gate (MUITO melhor que o deles — o nosso a gente SABE que é
WhatsApp). Mas o clique-pra-conversar não está em toda superfície.

## Plano (worker frontend + 1 função util)
1. Util única `buildWaLink(phoneDigits)` → `https://wa.me/55{digits}` (helper compartilhado;
   front no hbx-theme/utils, back no shared do radar p/ exports).
2. Colocar o botão/ícone em TODA superfície que mostra telefone:
   card do lead (Vendas/Atendimento), detalhes-negocio, lista do Radar no Owner, planilhas
   exportadas (coluna `link_whatsapp`), Raio-X (HOT-04).
3. Com texto pré-preenchido: `?text=` com template curto por segmento (ex.: "Olá {nome}! Vi que
   vocês são de {segmento} em {cidade}...") — templates num JSON central, editável depois.
4. Regra: se o lead tem `whatsappValidado`, botão verde; senão, cinza com tooltip "não validado".
   (Distinção que o CNPJ Biz NÃO tem — eles mandam o usuário testar na mão.)

## Cuidado
Link wa.me abre o WhatsApp do VENDEDOR (ação humana, 1-a-1) — zero risco de ban, não passa pelo
motor. NÃO confundir com disparo automatizado (esse é o Webwhats, com as regras duras de sempre).

## Aceite
- [ ] Botão em todas as superfícies listadas; export com coluna nova
- [ ] check-pele verde (nada de cor solta); deletar este .md
