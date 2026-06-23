# PLAN — Entrada do funil tá "bosta": redesenhar (24/06)

> Origem: teste 23/06. A LÓGICA do funil passou (cadastro → "Aguardando confirmação" →
> F5 volta pra espera (não form em branco) → login sem confirmar é barrado certo → e-mail
> chega → robô na confirmação ok). **Funcional = APROVADO.** O que o dono reprovou é a
> CARA da entrada ("achei bem bosta essa entrada"). Trabalho aqui = só visual/UX da entrada.

## A fazer
- Redesenhar a **entrada do funil** (`/?ver=planos`: escolher plano → cadastro → tela de espera).
  Dono achou pobre. Definir o norte visual com ele antes de codar.
- **Puxa pra cá a dívida de pele que sobrou do funil antigo:** F5-animação (o "Detalhes" retrai
  pra dentro do "Criar sua conta" + o form encosta no card do plano). Era pele pura, ficou pendente
  por precisar de olho no Chrome. Encaixa no redesenho.

## Travas
- NÃO mexer na lógica já aprovada (máquina de estados, resume, login-no-beco, anti-abuso). Só pele.
- 5 Leis: token/classe central, `check-pele` verde. Zero-scroll 1366×768.
