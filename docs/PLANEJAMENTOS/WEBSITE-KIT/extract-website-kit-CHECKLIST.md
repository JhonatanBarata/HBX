# T5 — Checklist de extração do `website-kit` (preparo, NÃO executado)

> Contexto: `backend/website-kit/` = 31 MB / 331 arquivos no repo do app, com fotos
> reais de cliente no git. Sai daqui pra um repo próprio (`hbx-sites`).
> **Depende da janela da faxina `.git` da INFRA (349 MB, force-push do master,
> ver docs/Rules/INFRA.md e memória INFRA)** — é o mesmo trem: os 31 MB devem
> sair da HISTÓRIA do repo junto com a faxina, senão o `.git` continua gigante
> e a faxina teria que rodar duas vezes.
>
> Nada disto foi executado nesta sessão (Sprint 2). Isto é o roteiro pronto
> pra quando o dono abrir a janela.

## Ordem recomendada (não inverter)

1. **Criar o repo `hbx-sites`** (GitHub, privado) e cloná-lo localmente.
2. **Rodar `extract-website-kit.ps1` em dry-run** primeiro (sem `-Execute`) pra
   ver a lista do que seria copiado, depois com `-Execute` pra copiar de
   verdade `templates/` + `companies/` + `projects.json` pro clone local do
   `hbx-sites`. O script NÃO apaga nada do repo atual — só copia.
3. **Revisar manualmente o que foi copiado**:
   - Fotos de cliente (a razão de existir deste sprint) estão só no novo repo?
   - `projects.json`: o campo `localPath` tem caminho absoluto
     `C:\Users\Jhonatan\...` — reescrever pra relativo (ou já matar o arquivo
     nesse momento, se `templateKey` já tiver virado coluna em
     `CompanyWebsiteConfig`, ver item 7).
   - `hbx-master-saas` (dentro de `templates/` hoje) é o site do **próprio
     HBX**, não de cliente — não é a mesma natureza de `hbx-sites` (repo de
     templates+config de CLIENTE). Decidir destino próprio antes de incluir
     no `hbx-sites` (provavelmente fica de fora, vai pra outro repo/pasta).
4. **Atualizar os 2 scripts que apontam pro caminho antigo**:
   - `scripts/deploy-abner-firebase.ps1` — hoje resolve
     `backend\website-kit\templates\abner-firebase\source`. Precisa apontar
     pro clone local de `hbx-sites/templates/abner-firebase/source` (ou
     equivalente).
   - Qualquer outro script/rota do backend que leia `backend/website-kit/*`
     em disco (checar `grep -rn "website-kit" backend/src` antes de migrar —
     nesta sessão não achei leitura em runtime do backend além do
     `projects.json`, mas confirmar de novo no momento da execução, pode ter
     mudado).
5. **Testar o deploy do GuinchoBarata a partir do novo caminho** (dry-run do
   `deploy-abner-firebase.ps1 -DryRun` primeiro, depois um deploy real de
   HOSTING apontando pro novo repo) — **só depois de confirmar que o Git novo
   está correto**, e fora do horário de pico do cliente.
6. **Coordenar com a faxina `.git` da INFRA**: ela reescreve a história do
   repo do app (349 MB → menor, force-push do master). O momento certo de
   remover `backend/website-kit/` do repo do app (passo 2, destrutivo, NÃO
   incluído neste script) é **dentro dessa mesma janela**, pra que a faxina
   já remova os 31 MB da história de uma vez. Rodar a remoção fora dessa
   janela deixa o lixo na história até a próxima faxina.
7. **Matar `projects.json`** (planejado no `.md` do sprint): `templateKey`
   vira coluna opcional em `CompanyWebsiteConfig` (banco = fonte única);
   `hbx.website.json` continua no site como metadado informativo, mas deixa
   de ser autoritativo.
8. **Atualizar `docs/Rules/WEBSITE-KIT.md`** removendo a nota sobre
   `backend/website-kit/` estar no repo do app (ela deixa de ser verdade) e
   apontando pro repo `hbx-sites` como fonte.

## O que NÃO fazer sem ordem explícita do dono

- Não dar `git push --force` em nada.
- Não apagar `backend/website-kit/` do working tree do repo do app até o
  passo 6 (coordenado com a faxina INFRA) estar confirmado.
- Não redeployar Firebase Hosting/Functions dos 2 sites vivos como "teste" da
  migração — testar local/dry-run primeiro.

## Critério de pronto

- [ ] `hbx-sites` tem `templates/` + `companies/` com paridade de conteúdo
      (nenhum arquivo de cliente perdido, nenhuma foto deixada pra trás).
- [ ] `scripts/deploy-abner-firebase.ps1` funciona apontando pro novo repo
      (dry-run OK).
- [ ] Repo do app não tem mais `backend/website-kit/` no working tree NEM na
      história (pós faxina INFRA).
- [ ] `docs/Rules/WEBSITE-KIT.md` atualizado com o novo local.
