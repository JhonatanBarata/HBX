-- PAINEL DO CLIENTE (PR05082026-VER-TELA-PAINEL-CLIENTE) — o "Remover" do painel
-- de aparelhos do /master esconde a vaga sem apagar a linha (trilha, erros e
-- hardwareId ficam de pé; re-parear reconecta a MESMA vaga). Aditivo puro.

ALTER TABLE "MobileDevice" ADD COLUMN IF NOT EXISTS "ocultoEm" TIMESTAMP(3);
