# PLAN-CARD-00 — Índice do projeto noturno "card aberto" (21/06)

Dono dormindo; orquestrador executa. A unificação base (3 telas já usam `<DetalhesNegocio>`) JÁ está feita.
Esta rodada = **injetar tudo + casca nova (topo fixo + setinha) + 6 ícones sempre + coroa + 3 telas iguais de verdade**.
Filtrar/expurgar (o que aparece em qual) é trilha FUTURA — agora injeta tudo.

## Respostas do dono (travadas — não perguntar mais)
- **Efeito escrever** = máquina de escrever, JÁ FEITO, **NÃO TOCAR** (vive em `.dn-*` / `transitions.css`; timing é o que ele quis).
- **6 ícones** = SEMPRE os 6; sem dado → cinza/esmaecido e sem clique; com dado → clicável.
- **Coroa** = mostrar se o lead foi enriquecido. Flag existe no backend; **ícone NÃO existe → criar**.
- **3 telas iguais** = "de verdade" (mesmo caderno): enriquecer a PROJEÇÃO do backend; radar é só o 1º sketch (campos de funil vazios de propósito).
- **Ordem** = uma padrão agora + estrutura configurável depois (só muda a sequência e o que fica oculto sob a setinha).
- **Layout** = topo fixo: nome + 6 ícones (+ coroa). Abaixo: infos na ordem, com **setinha** pra expandir o resto (compacto por padrão).

## Ordem de execução
1. [PLAN-CARD-A-COMPONENTE.md](PLAN-CARD-A-COMPONENTE.md) — frontend: casca + injetar tudo + 6 ícones + colapso/ordem. (1º; outros dependem da API.)
2. [PLAN-CARD-B-NOTEBOOK-BACKEND.md](PLAN-CARD-B-NOTEBOOK-BACKEND.md) — backend: 3 telas leem o mesmo caderno (projeção) + mapping atendimento/leads.
3. [PLAN-CARD-C-COROA.md](PLAN-CARD-C-COROA.md) — coroa de enriquecido (criar ícone + ligar no flag).

Fecha com **RISCOS.md** (o que mudou, riscos, como reverter cada bloco). Checks por bloco: front `npm run lint && npm run build`; back `npm run prisma:validate && npm run build`.
