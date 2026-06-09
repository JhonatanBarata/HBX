# Checkpoint Atual — Refatoração HBX

Branch:
refactor/master-tenant-clean-cut

Ultimo bloco analisado:
fix(gerencial): proteger ultimo admin e separar equipe por papel

Ultimo commit base analisado:
908eb9a4

Status:
Gerencial > Equipe separado por papel e backend protegendo tenant contra perda do ultimo ADMIN ativo proprio. Aguardando revisao apos commit/push.

Alterações extras de engine/deploy/docker/env:
Intencionais. Não reverter neste bloco.

Tarefa ativa:
Protecao do ultimo admin ativo em Gerencial > Equipe

Pendências atuais:
1. SMTP futuro por tenant ainda pendente.
2. contactAdmin real ainda pendente; communication.support.contactAdmin permanece backendEnforced=false.
3. Master Provisioning completo ainda pendente fora dos canais de comunicacao.
4. Sessao QR antiga nao deve ser renomeada por copia de banco, pois a instancia do provider usa a chave criada originalmente. O runtime agora aceita a tenantKey da sessao ativa apontada em currentWhatsappConnectionSessionId.
5. Frontend ainda precisa continuar reduzindo calculos locais de permissao em outros blocos.
6. Auditoria final ampla de runtime sem HBX especial ainda pendente.
7. Nao mexer/reverter engine/deploy/docker/env.

Concluído neste bloco:
1. Gerencial > Equipe recebeu subguias Administradores e Vendedores.
2. USERMASTER/System Master foi removido da lista operacional de equipe/modulos.
3. Acoes do proprio usuario para excluir, desativar ou rebaixar ADMIN para USER ficam bloqueadas visualmente com mensagem clara.
4. UsersService bloqueia autoexclusao, autodesativacao e autorrebaixamento perigoso.
5. UsersService bloqueia excluir, desativar ou rebaixar o ultimo ADMIN ativo do tenant.
6. ADMIN ativo do tenant conta apenas companyId do tenant, role ADMIN, isActive=true e isSystemMaster=false.
7. System Master pode dar suporte, mas nao supre ausencia de ADMIN ativo do tenant.
8. Endpoints de usuario comum agora validam tenant antes de exclusao.
9. Rotas de suporte Master tambem passam pela protecao de ultimo admin ativo.
10. Teste backend users.service cobre os bloqueios e permissoes do fluxo.
11. Teste frontend gerencial-team cobre subguias, bloqueio de autoexclusao e erro legivel de ultimo admin.
12. Erro de criacao de acesso agora aparece inline no pop-up Criar acesso, sem depender do Network/DevTools.
13. Grep obrigatorio de runtime retornou zero ocorrencias.
14. Validacoes executadas: backend prisma:validate, backend build, backend users.service.test, frontend gerencial-team test, frontend build e frontend lint.

Aviso final combinado:
HBX CHECKPOINT: pronto para revisão
