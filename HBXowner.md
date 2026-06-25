# HBX Owner — a regra do motor (regra final do dono)

> O HBX Owner é o sistema de radar/motores. Detalhe técnico vive em [docs/Rules/MOTOR.md](docs/Rules/MOTOR.md).
> Aqui mora só a REGRA. Curta de propósito.

## A regra
- **Motores ligam e desligam pelo DONO.** Ativo = roda. Desativo = para. Sem horário, sem janela dia/noite, sem teto fixo escondido.
- **A Elasticidade (governor) é o ÚNICO freio.** Ela escala os motores conforme a carga pra deixar **sempre ligado** sem ninguém sofrer: sobe quando tem fila, recua por pressão de RAM.
- **Quem busca são os motores LIGADOS.** Mais motores ligados = mais busca em paralelo. Toda barreira extra se **deleta na fonte** — não se tapa sintoma.

## Gerenciador (evita busca burra)
- Recebe os **padrões do que os vendedores querem** e direciona as buscas pra isso.
- **Sem padrão → distribui alfabeticamente** (varre em ordem, nunca para por falta de alvo).

## Local × VPS
- **VPS:** tem um motor **alimentador** que lê o que os vendedores estão pedindo e abastece as buscas. A VPS **não pode cair** (é produção).
- **Turbo (agressivo, sem medo de IP/ban): só LOCAL.** É o único ambiente que pode arriscar. **Nunca turbo agressivo na VPS.**

## Estado (24/06)
FEITO (local, working tree): frota dos 20 em paralelo · fábrica 24/7 · governor gerencia container via ops-control · Elasticidade como único freio · barreiras de horário/teto deletadas · envs de frota fixados no `.env`.
FALTA (produto): gerenciador por padrões + fallback alfabético · motor-alimentador da VPS · garantir os envs de frota no `.env` da VPS (turbo já é conceito local).
