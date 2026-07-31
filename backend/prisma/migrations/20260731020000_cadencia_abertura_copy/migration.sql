-- Texto da abertura reservado no momento do agendamento.
-- Antes: todo disparo agendado usava o corpo FIXO do passo da cadência, então
-- agendar 10 disparos significava 10 mensagens idênticas no dia seguinte —
-- carimbo de robô, que é exatamente o que faz a Meta remover o dispositivo.
-- NULL mantém o comportamento antigo (corpo do passo).
ALTER TABLE "CadenciaInscricao" ADD COLUMN IF NOT EXISTS "aberturaCopy" TEXT;
