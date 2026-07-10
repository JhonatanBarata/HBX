# W7 — P1.1: triagem dos unscoped do tenant guard
VPS (read-only): coletar TODOS os warns [tenant-guard] unscoped do docker logs hbx-backend.
Localizar e corrigir cada call site no código (ex.: User.updateMany dos tenants 37/5 hoje) escopando
por companyId ou wrapper master explícito. Testes do guard continuam 20/20. NÃO mudar default do guard;
flip p/ enforce é operacional pós-publish (relatório com recomendação).
