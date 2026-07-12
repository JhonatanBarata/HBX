# 12 — PLAY STORE E ANDROID

## Estado confirmado

O app Android atual compila em debug. A rodada local alterou GPS, compartilhamento, chegada, offline e comprovantes; por isso o artefato anterior não deve ser tratado como final sem novo QA.

## Microetapas técnicas

- [ ] 1. Revisar Manifest, FileProvider, permissões e serviços foreground.
- [ ] 2. Gerar release assinada e verificar certificado/applicationId.
- [ ] 3. Testar no aparelho: login persistente, câmera, upload, offline, GPS, Waze/Maps, notificação e chegada.
- [ ] 4. Testar voz no WebView; se não funcionar, remover microfone e declaração correspondente.
- [ ] 5. Validar insets Android 15 e comportamento com tela bloqueada.
- [ ] 6. Confirmar que app não mostra preço, recarga ou link de compra.
- [ ] 7. Publicar web antes de entregar o app ao revisor.

## Etapas do dono

- [ ] Fazer backup externo da upload key e propriedades.
- [ ] Criar/validar conta Play.
- [ ] Preparar conta demo do revisor.
- [ ] Preencher Data Safety, localização foreground e full-screen intent.
- [ ] Gravar vídeo exigido do uso de localização.
- [ ] Montar grupo de teste fechado quando aplicável.
- [ ] Após primeiro upload, gerar `assetlinks.json` com o SHA-256 da chave Play.

## Guardrails

- Não commitar keystore, senha ou APK de backup.
- Não subir novo AAB antes do QA físico.
- `applicationId` não muda após o primeiro upload.

