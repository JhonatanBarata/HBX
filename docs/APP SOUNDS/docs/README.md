# HBX Sound Pack v2

Pacote sonoro operacional para o HBX Logística.

## Estrutura

- `mobile-ready-ogg/`: arquivos prontos para `app/src/main/res/raw/`.
- `masters-wav/`: masters PCM 48 kHz estéreo.
- `docs/sound-map.json`: chave, arquivo, gatilho, volume e uso recomendado.
- `docs/INTEGRACAO-CODEX.md`: orientação de implementação.

## Direção sonora

A família usa a mesma linguagem da abertura aprovada:
pulso tecnológico, rede ativando, rota conectada e operação pronta.

Não é recomendado tocar som em todos os botões. Use áudio apenas em:
- início/fim de rota;
- chegada;
- operações concluídas;
- estado offline/sincronização;
- avisos e erros relevantes;
- pareamento e atualização.

## Licença

Sons originais gerados especificamente para o projeto HBX.
