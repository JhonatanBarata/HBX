# Testes manuais obrigatórios antes de subir qualquer branch

- Atendimento → Conexão WhatsApp → Conectar/gerar QR: o QR deve PERSISTIR durante o poll (4s) e ser escaneável; após escanear, pill vira Conectado.
- Pill de Atendimento com modal FECHADO (poll 20s): com WhatsApp desconectado, a pill fica "Desconectado" parada — sem chamar o motor, sem piscar "Iniciando" ou "Reconectando" de forma fantasma.
- Modal aberto → clicar "Conectar / gerar QR" → QR aparece → aguardar 2 ciclos de poll (8s) → QR PERSISTE (não some); escanear com o celular → pill vira "Conectado" sem recarregar a página.
