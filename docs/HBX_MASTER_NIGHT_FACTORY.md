# HBX Master Night Factory

Night Factory deve ser controlada pelo HBX Master, com manual-first como comportamento operacional seguro.

## Estado esperado

- `dormindo`: automatico habilitado, fora da janela ou sem trabalho.
- `rodando`: execucao ativa.
- `pausado`: automatico desligado ou pausa manual.
- `manual`: pronto para `run-now`.
- `erro`: ultima execucao falhou.

## Regras

- `run-now` pode funcionar mesmo com automatico pausado.
- Automatico so roda com `enabled=true`.
- Configuracao comercial, planos e billing nao devem ser alterados por este fluxo.
- Nenhuma migration e nenhum deploy fazem parte deste controle.

## Fase atual

A UI do HBX Master mostra Night Factory como automacao controlavel, mas acoes reais dependem da API existente estar disponivel.
