# Arquivos de runtime

Arquivos gerados em tempo de execucao nao entram no repositorio. Isso inclui uploads, midias de inbox, anexos temporarios, logs e copias locais de backup.

## Uploads

`backend/public/uploads/**` fica ignorado pelo Git. O repositorio mantem apenas `backend/public/uploads/.gitkeep` para preservar a estrutura da pasta.

Midias em `backend/public/uploads/inbox` sao arquivos de runtime criados pela operacao do inbox. Elas podem conter dados privados de clientes, por isso devem ficar fora do controle de versao.

## Onboarding de vendedores

Anexos temporarios do onboarding devem usar `SELLER_ONBOARDING_UPLOAD_DIR`. Quando a variavel nao estiver configurada, o fallback operacional deve continuar em uma pasta local ignorada, como `backend/storage/seller-onboarding-temp`.

Esses anexos sao temporarios. O banco deve guardar metadados necessarios para auditoria, mas o arquivo fisico nao deve ser versionado.

## Storage local

`storage/**` e `backend/storage/**` sao areas de runtime local. O Git mantem apenas os arquivos `.gitkeep` para criar as pastas base quando necessario.

## Logs e backups

Logs locais ficam em `logs/**` ou em pastas de log especificas ja ignoradas. Backups devem ficar fora do Git, preferencialmente em volume externo, storage privado ou rotina de backup com acesso controlado.
