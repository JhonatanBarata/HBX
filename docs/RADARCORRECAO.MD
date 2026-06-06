# RADARCORRECAO

## Objetivo

Corrigir, com cadastro assistido em localhost, os bugs do processo de cadastro e regras do vendedor HBX sem mexer fora do fluxo combinado.

## Escopo

- Fluxo Radar -> Vendas -> WhatsApp -> Retorno.
- Cadastro assistido de cliente pelo card de Vendas.
- Regras do vendedor/parceiro HBX no Gerencial.
- Fluxo especial de Parceiro/Vendedor HBX, separado do vendedor comum e do admin comum.
- Registro claro de bugs, decisões e validações.

## Regras de trabalho

- Abrir telas e arquivos somente quando solicitado.
- Não alterar cobrança, planos, pagamento, autenticação, segredos, deploy ou dados produtivos.
- Preservar histórico de Radar e resultados negativos.
- Manter textos públicos em PT-BR.
- Fazer mudanças pequenas e testáveis.

## Roteiro em localhost

1. Abrir o frontend local quando solicitado.
2. Reproduzir o bug no fluxo real.
3. Registrar o comportamento esperado e o comportamento atual.
4. Identificar o menor ponto de correção.
5. Aplicar a correção.
6. Validar no mesmo fluxo em localhost.
7. Registrar evidência e comando executado.

## Bugs

### Bug 1

- Status: detectado
- Tela/fluxo: Master/Gerencial -> cadastro de vendedor/parceiro HBX
- Como reproduzir: cadastrar o vendedor Josefinho com o e-mail `henrique_lua16@hotmail.com` em localhost e clicar em `Cadastrar vendedor`.
- Comportamento atual: o cadastro não envia o e-mail pedindo documentos.
- Comportamento esperado: ao cadastrar o vendedor, o sistema deve gerar o contrato automaticamente e enviar o e-mail de pré-boas-vindas solicitando documentos.
- Causa provável: a ação de criação do vendedor está separada das etapas de geração de contrato e envio de e-mail/documentos, ou essas etapas não são disparadas no submit inicial.
- Correção: pendente para a etapa final de edições.
- Validação: leitura local em `2026-06-06` confirmou que o usuário foi criado, mas o onboarding ficou incompleto:
  - usuário `Josefinho`, e-mail `henrique_lua16@hotmail.com`, `role=USER`, `isActive=false`;
  - comissão principal `20%`, prazo `D+3`;
  - onboarding `status=draft`;
  - `emailStatus=not_sent`, `emailSentAt=null`, `emailMessageId=null`;
  - `contractSha256=null`, ou seja, sem contrato gerado/snapshot assinado;
  - anexos `[]`;
  - não foi possível entrar pela UI porque o navegador integrado não conectou nesta sessão e a senha do usuário não foi informada.

## Verificações

### Josefinho - cadastro em localhost

- Data: `2026-06-06`
- E-mail: `henrique_lua16@hotmail.com`
- Resultado: cadastro existe no banco local.
- Estado encontrado:
  - `user.id=20`
  - `companyId=11`
  - `name=Josefinho`
  - `role=USER`
  - `isActive=false`
  - `emailConfirmed=false`
  - `emailConfirmationSent=false`
  - onboarding `id=cmq2wsn4j00cu4us327k17mox`
  - onboarding `status=draft`
  - onboarding `emailStatus=not_sent`
  - contrato não gerado
  - nenhum anexo registrado
- Conclusão: cadastro foi gravado, mas não completou o fluxo esperado de pré-boas-vindas/documentos/contrato.

### Bug 2

- Status: corrigido no passo 3
- Tela/fluxo: Master/Gerencial -> popup de cadastro do vendedor/parceiro HBX
- Como reproduzir: abrir o cadastro do Josefinho no popup de parceiro HBX em localhost.
- Comportamento atual: o botão/ação de fechar some para fora da área visível e o popup não permite rolar para cima para recuperar o topo.
- Comportamento esperado: o popup deve manter o fechar sempre acessível ou permitir rolagem vertical até o topo em qualquer altura de tela.
- Causa provável: altura/overflow do container do popup está travando a rolagem, e o header/fechar não está fixo ou acessível quando o conteúdo ocupa a viewport.
- Correção: aplicada no passo 3.
- Validação: build/lint passaram; validação visual em localhost ainda deve ser feita com o popup aberto.

### Bug 3

- Status: corrigido nos passos 2 e 4
- Tela/fluxo: Master/Gerencial -> cadastro e ativação de Parceiro/Vendedor HBX
- Como reproduzir:
  - cadastrar Josefinho como Parceiro/Vendedor HBX;
  - anexar documentos mock;
  - clicar em `Criar parceiro`;
  - observar os e-mails recebidos.
- Comportamento atual:
  - o sistema envia 2 e-mails:
    - confirmação de e-mail: `Confirme seu email no HBX`;
    - boas-vindas: `Bem-vindo à equipe HBX, Josefinho`;
  - a confirmação aparece no momento final, junto do boas-vindas.
- Comportamento esperado:
  - Parceiro/Vendedor HBX deve seguir fluxo próprio, diferente de vendedor comum e admin comum;
  - não deve cair automaticamente no fluxo genérico de criação de usuário;
  - a pré-boas-vindas deve ser enviada no cadastro inicial do parceiro, com:
    - contrato gerado;
    - pedido de documentos;
    - link de confirmação/aceite quando necessário;
  - após documentos/validação, o `Criar parceiro` deve ativar/liberar o parceiro sem mandar uma confirmação genérica duplicada;
  - se houver e-mail de boas-vindas final, ele deve ser coerente com a confirmação já resolvida no fluxo especial.
- Causa provável:
  - o Parceiro/Vendedor HBX está reutilizando partes do fluxo comum de USER/ADMIN;
  - a criação inicial grava usuário/onboarding, mas não dispara a pré-boas-vindas com contrato/documentos;
  - a etapa final de ativação dispara boas-vindas, enquanto a confirmação genérica continua pendente e é enviada em paralelo.
- Correção: aplicada nos passos 2 e 4.
- Validação: backend passou; teste manual em localhost ainda deve repetir cadastro de parceiro HBX e confirmar que o fluxo envia os e-mails corretos, sem duplicidade genérica.

### Bug 4

- Status: corrigido nos passos 1 e 7
- Tela/fluxo: login do Parceiro/Vendedor HBX em desktop
- Como reproduzir: fazer login no computador/desktop com usuário Parceiro/Vendedor HBX recém-criado.
- Comportamento atual: o sistema força a experiência mobile mesmo no desktop.
- Comportamento esperado:
  - login feito em computador deve abrir experiência desktop;
  - mobile deve ser usado apenas quando o acesso for de fato mobile ou quando houver uma rota mobile explícita;
  - Parceiro/Vendedor HBX pode ter fluxo operacional simplificado, mas não deve ser forçado para mobile no desktop.
- Causa provável: regra de roteamento/perfil do vendedor HBX está tratando todo Parceiro/Vendedor HBX como mobile-first, sem respeitar viewport/dispositivo/rota.
- Correção: aplicada nos passos 1 e 7.
- Validação: build/lint passaram; teste manual do mesmo parceiro em desktop e mobile ainda deve ser feito em localhost.

### Bug 5

- Status: detectado
- Tela/fluxo: login do Parceiro/Vendedor HBX -> Radar Digital mobile
- Como reproduzir: entrar com Parceiro/Vendedor HBX e abrir Radar Digital.
- Comportamento atual:
  - Radar abre como `Radar pausado`;
  - aviso mostra `Meta/limite atingido`;
  - mensagem diz que o Radar tem continuidade e retoma quando houver espaço;
  - o aviso não responde claramente o que está acontecendo de verdade.
- Comportamento esperado:
  - o Radar deve explicar o motivo real da pausa/bloqueio;
  - se a meta diária foi atingida, informar limite diário, cards usados/restantes e quando reseta;
  - se o estoque do vendedor está cheio, informar estoque atual, capacidade e qual ação libera espaço;
  - se não há permissão/plano/quota/distribuição, mostrar exatamente esse estado;
  - não usar mensagem genérica que pareça esconder o problema.
- Causa provável:
  - aviso criado com fallback genérico de `meta/limite atingido`;
  - a UI não diferencia limite diário, estoque cheio, quota comercial, pausa operacional, ausência de distribuição ou erro de backend;
  - o texto de continuidade está sendo exibido mesmo quando o sistema não tem diagnóstico suficiente.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; testar Radar do parceiro HBX com os estados reais de limite diário, estoque cheio e sem permissão/distribuição.

### Bug 6

- Status: detectado
- Tela/fluxo: Radar Digital do Parceiro/Vendedor HBX
- Como reproduzir: entrar como vendedor HBX e abrir filtros/localização do Radar.
- Comportamento atual:
  - vendedor consegue escolher/alterar estado e cidade livremente;
  - UI mostra campos de `Estado` e `Cidade` como seleção operacional.
- Comportamento esperado:
  - Parceiro/Vendedor HBX não deve escolher qualquer estado/cidade livremente;
  - o filtro deve ser guiado por localização do vendedor;
  - vendedor pode ajustar apenas:
    - localização/base permitida;
    - alcance até `100 km`;
    - segmento;
  - UF/cidade não devem virar busca aberta para o vendedor HBX.
- Causa provável:
  - Radar está reutilizando UI/filtros de usuário com permissão mais ampla;
  - perfil de Parceiro/Vendedor HBX não está recebendo uma variante restrita de filtros;
  - permissões de território/localização não estão refletidas na UI.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; entrar como vendedor HBX e confirmar que só aparecem localização, raio até 100 km e segmento.

### Bug 7

- Status: detectado
- Tela/fluxo: Radar Digital do Parceiro/Vendedor HBX
- Como reproduzir: entrar como vendedor HBX e observar o contador/limite exibido no Radar.
- Comportamento atual: aparece limite/contador do Master no limite do vendedor, como `9999/99` ou valor equivalente de Master.
- Comportamento esperado:
  - vendedor HBX deve ver apenas o limite dele;
  - limite do Master não pode vazar para a UI do vendedor;
  - contador deve refletir estoque, uso diário ou quota do próprio vendedor, conforme a regra real.
- Causa provável:
  - payload ou UI do Radar está usando limite global/Master como fallback;
  - contexto de usuário vendedor não está substituindo corretamente a quota exibida;
  - badge/contador visual não diferencia Master de Parceiro/Vendedor HBX.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; comparar login Master x vendedor HBX e confirmar contadores separados.

### Bug 8

- Status: detectado
- Tela/fluxo: Radar Digital do Parceiro/Vendedor HBX
- Como reproduzir: abrir Radar como vendedor HBX e observar avisos avançados/diagnósticos exibidos.
- Comportamento atual: Radar mostra aviso avançado vindo do backend com códigos/mensagens técnicas que não deveriam aparecer para o vendedor.
- Comportamento esperado:
  - vendedor HBX deve ver mensagem simples, operacional e em PT-BR;
  - códigos internos, chaves, nomes de status técnicos, payloads e detalhes avançados devem ficar ocultos;
  - diagnóstico técnico pode existir para Master/admin/log, mas não na UI operacional do vendedor.
- Causa provável:
  - componente está renderizando diretamente `reason`, `code`, `status`, `debug` ou mensagem bruta do backend;
  - falta camada de tradução/normalização de estado para texto público;
  - modo avançado não está restrito a Master/admin.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; testar Radar do vendedor HBX e confirmar que nenhum código técnico aparece.

### Bug 9

- Status: detectado
- Tela/fluxo: Vendas/Radar mobile do Parceiro/Vendedor HBX -> cards de leads
- Como reproduzir:
  - deixar por padrão a coroa/enriquecimento desativada no topo do Vendas;
  - entrar como vendedor HBX;
  - observar cards entregues no Radar/Vendas.
- Comportamento atual:
  - todas as coroas aparecem douradas;
  - visual indica enriquecimento/estado premium mesmo em cards que não deveriam estar enriquecidos;
  - ícone inferior aparece cinza/desativado, criando inconsistência com as coroas douradas dos cards.
- Comportamento esperado:
  - coroa dourada deve aparecer apenas quando o card realmente foi enriquecido ou quando a regra de destaque estiver ativa;
  - se o enriquecimento/coroa foi desativado no Vendas, os cards devem aparecer sem estado dourado;
  - vendedor HBX não deve receber sinal visual de enriquecimento quando o backend não marcou o card como enriquecido.
- Causa provável:
  - UI está usando coroa dourada como badge padrão do card, não como estado real;
  - estado global de coroa/enriquecimento desativado não está sendo aplicado nos cards entregues ao vendedor;
  - payload do card pode estar vindo com flag incorreta, fallback `true` ou estilo sem checar enriquecimento real;
  - possível divergência entre controle superior do Vendas e renderização mobile dos cards.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; analisar payload/estado do card e confirmar que coroa dourada só aparece quando houver enriquecimento real.

### Bug 10

- Status: detectado
- Tela/fluxo: Vendas/Radar mobile do Parceiro/Vendedor HBX -> ação da coroa/enriquecimento
- Como reproduzir:
  - entrar como vendedor HBX;
  - observar cards no Vendas que deveriam não estar enriquecidos;
  - clicar na coroa para enriquecer;
  - observar que os cards já existentes não mudam.
- Comportamento atual:
  - clicar na coroa não inicia enriquecimento automático dos cards existentes no Vendas;
  - nenhuma mudança visível ocorre nos cards;
  - pode haver conflito porque a UI já mostrava coroas douradas, possivelmente tratando cards como enriquecidos sem estarem.
- Comportamento esperado:
  - ao ativar/clicar a coroa, o sistema deve identificar cards não enriquecidos já presentes no Vendas;
  - deve iniciar enriquecimento automático desses cards, respeitando limites/quota;
  - UI deve mostrar fila, progresso, sucesso/falha ou motivo claro de não executar;
  - se o backend considerar os cards já enriquecidos, a UI deve mostrar quais campos/provas indicam isso.
- Causa provável:
  - ação da coroa está apenas alternando estado visual/local, sem disparar job/API de enriquecimento;
  - cards podem estar marcados erroneamente como enriquecidos por flag/fallback;
  - endpoint de enriquecimento automático pode estar filtrando os cards como já processados;
  - status visual dourado pode estar impedindo a seleção dos cards pendentes;
  - falta feedback quando não há cards elegíveis ou quando limite impede execução.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; inspecionar estado real dos cards, flags de enriquecimento e chamadas feitas ao clicar na coroa.

### Bug 11

- Status: detectado
- Tela/fluxo: Vendas mobile -> Observação/Cadastro de cliente -> status de venda
- Como reproduzir:
  - abrir `Observação` ou fluxo de `Cadastro de cliente`;
  - clicar em um status como `Trial iniciado`, `Pagamento confirmado`, `Cancelado` ou equivalente;
  - tentar desfazer/desmarcar o status.
- Comportamento atual:
  - vendedor consegue clicar manualmente em status que deveriam ser automáticos;
  - depois de clicar, não há forma clara de desclicar/desfazer;
  - status pode ficar preso em um estado incorreto.
- Comportamento esperado:
  - status como `Trial iniciado`, `Pagamento confirmado` e estados derivados de cadastro/pagamento devem ser automáticos, vindos do backend;
  - vendedor não deve marcar manualmente um estado que depende de confirmação real;
  - se houver ação manual permitida, deve existir desfazer/voltar para estado anterior ou confirmação clara;
  - o vendedor pode registrar observação/retorno, mas não forçar status comercial sensível.
- Causa provável:
  - UI está expondo botões de status internos como ações manuais;
  - fluxo não separa status operacional do vendedor de status automático de onboarding/pagamento;
  - falta estado neutro/desfazer no componente.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; testar que status automáticos só mudam por eventos reais e que ações manuais permitidas têm reversão.

### Bug 12

- Status: detectado
- Tela/fluxo: Vendas mobile -> Cadastro de cliente / Fechou venda
- Como reproduzir:
  - abrir cadastro de cliente a partir de um card;
  - observar campo de WhatsApp/e-mail;
  - editar WhatsApp existente ou cadastrar dados já usados anteriormente.
- Comportamento atual:
  - WhatsApp fica disponível para edição livre;
  - pode permitir trocar o telefone do card;
  - risco de duplicar cadastro/e-mail/telefone e criar trial repetido.
- Comportamento esperado:
  - WhatsApp deve vir do telefone do card e não pode ser editado livremente;
  - se o card não tiver telefone, pode adicionar número;
  - número adicionado deve ser salvo no cadastro do cliente/card;
  - e-mail informado também deve ficar salvo no cadastro do cliente;
  - não pode repetir telefone/e-mail/cadastro;
  - se já houve cadastro antes, tratar como cliente/trial já existente, não criar novo trial;
  - sistema deve avisar claramente quando telefone/e-mail já foram usados.
- Causa provável:
  - formulário de cadastro assistido está tratando WhatsApp/e-mail como campos soltos do submit;
  - persistência no cadastro do cliente/card não está garantida para dados adicionados;
  - validação de duplicidade/trial anterior não está suficientemente refletida na UI;
  - fluxo pode estar reaproveitando signup comum sem regra forte de trial único por contato.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; testar cadastro com telefone existente, telefone novo adicionado, e-mail existente e e-mail novo.

### Bug 13

- Status: detectado
- Tela/fluxo: Vendas mobile -> Cadastro de cliente / cadastro assistido HBX
- Como reproduzir:
  - abrir cadastro de cliente;
  - preencher telefone/e-mail/senha/plano;
  - clicar em `Criar cadastro e enviar confirmação`;
  - observar mensagem de parabéns/sucesso;
  - clicar novamente no mesmo botão.
- Comportamento atual:
  - vendedor precisou clicar 2 vezes em `Criar cadastro`;
  - primeira tentativa exibiu `Parabéns! Cadastro assistido criado...`, mas o e-mail não chegou;
  - botão continuou disponível e permitiu segunda tentativa;
  - console mostrou:
    - `403 Forbidden` em aviso `hbx-popup2`;
    - `409 Conflict` em `hbx-assisted-signup`;
  - UI não explicou qual conflito ocorreu;
  - vendedor fica sem saber se o cadastro foi criado, se o e-mail foi enviado ou se houve duplicidade.
- Comportamento esperado:
  - se houver `409 Conflict`, a UI deve mostrar aviso claro em PT-BR informando o conflito real;
  - não pode mostrar `Parabéns` quando cadastro/e-mail não foram concluídos corretamente;
  - botão não deve permitir clique duplicado enquanto a operação está pendente ou depois de sucesso;
  - se telefone/e-mail já estiverem usados, informar:
    - se já existe cadastro;
    - se já houve trial;
    - qual dado conflitou, sem expor informação sensível além do necessário;
  - se o e-mail não foi enviado, mostrar estado `cadastro criado, envio pendente/falhou` ou `cadastro não criado`, conforme backend;
  - vendedor precisa receber ação próxima clara.
- Causa provável:
  - frontend está tratando resposta parcial ou erro como sucesso;
  - estado `assistedSignupResult` pode ser preenchido antes de confirmar envio/resultado final;
  - conflito 409 do backend não está sendo normalizado para mensagem operacional;
  - 403 do popup/aviso pode estar tentando buscar ou exibir recurso restrito;
  - botão não fica travado após resultado ou não limpa corretamente em caso de conflito;
  - duplicidade de celular/e-mail/trial anterior pode estar disparando o 409.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; reproduzir com celular repetido, e-mail repetido e cadastro novo, confirmando mensagens e bloqueio de clique duplo.

### Bug 14

- Status: detectado
- Tela/fluxo: Radar desktop -> controle da coroa/enriquecimento
- Como reproduzir:
  - abrir Radar em desktop;
  - clicar na coroa.
- Comportamento atual:
  - ao clicar na coroa, abre `http://localhost:3001/mobile/planos?intent=lead`;
  - isso está errado para o fluxo do vendedor/Radar;
  - o print do Radar desktop serve apenas como referência de posição desejada: coroa logo na direita do Radar, com contador à direita da coroa.
- Comportamento esperado:
  - desktop deve seguir a mesma regra do mobile:
    - coroa dourada = enriquecimento ativo/card enriquecido;
    - coroa acinzentada = modo sem enriquecimento/desativado;
  - na direita do Radar desktop também deve existir a coroa;
  - essa coroa deve ativar/desativar enriquecimento automático;
  - deve existir contador junto da coroa para o vendedor saber quantos enriquecimentos/cards disponíveis ele tem;
  - visual deve deixar claro se está enriquecendo, parado, sem quota ou já enriquecido.
- Causa provável:
  - clique da coroa ainda está apontando para upsell/planos mobile (`/mobile/planos?intent=lead`);
  - desktop usa componente/controle antigo ou separado do mobile;
  - estado de enriquecimento automático não está padronizado entre layouts;
  - contador do vendedor não foi integrado no header/área direita do Radar desktop;
  - coroa pode estar misturada com fluxo de plano/lead, em vez de ação operacional de enriquecimento.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; comparar desktop e mobile e confirmar mesma semântica visual e contador correto do vendedor.

### Ajuste UI 1

- Status: solicitado
- Tela/fluxo: Vendas/Radar mobile do Parceiro/Vendedor HBX
- Elementos: `HBX Pulse` e `Próximo card recomendado`.
- Problema atual:
  - blocos ocupam muito espaço;
  - poluem a tela mobile;
  - competem com ações principais do vendedor.
- Comportamento esperado:
  - transformar `HBX Pulse` em um botão único, fino, azul e expansível;
  - transformar `Próximo card recomendado` em um botão único, fino, azul e expansível;
  - dentro do conteúdo expandido manter ações como `Chamar agora` e `Observação`;
  - por padrão, deixar recolhido para priorizar cards e ações diretas.
- Correção: pendente para a etapa final de edições.
- Validação: pendente; conferir mobile sem sobrecarga visual e com expansão por clique.

## Plano de Correção do Fluxo Parceiro/Vendedor HBX

1. Separar explicitamente o fluxo de Parceiro/Vendedor HBX do fluxo comum de vendedor/admin.
2. No cadastro inicial do Parceiro HBX:
   - criar usuário/onboarding como rascunho ou pendente;
   - gerar contrato automaticamente;
   - enviar pré-boas-vindas solicitando documentos;
   - incluir confirmação/aceite no e-mail especial, sem usar o e-mail genérico solto.
3. Na etapa de documentação:
   - permitir anexos obrigatórios/opcionais;
   - manter status claro de pendência;
   - não ativar parceiro antes dos requisitos mínimos.
4. No clique `Criar parceiro`:
   - validar documentação/contrato;
   - ativar o parceiro HBX;
   - evitar envio duplicado de confirmação genérica;
   - enviar apenas boas-vindas final se o fluxo especial já estiver confirmado ou se ela for o próprio marco de liberação.
5. Garantir que USER comum e ADMIN comum continuem no fluxo atual, sem herdar regras especiais de Parceiro HBX.
6. Registrar testes manuais em localhost para:
   - parceiro HBX novo;
   - vendedor comum;
   - admin comum;
   - parceiro HBX indicado por outro parceiro.
7. Corrigir roteamento pós-login:
   - desktop deve ir para experiência desktop;
   - mobile deve ir para experiência mobile;
   - rota explícita mobile continua respeitada;
   - Parceiro/Vendedor HBX não pode sobrescrever o dispositivo de forma cega.
8. Corrigir diagnóstico do Radar:
   - separar os motivos reais de pausa/limite;
   - exibir números e reset quando houver limite;
   - exibir ação necessária quando depender do vendedor;
   - remover aviso genérico que não explica o estado real.
9. Corrigir filtros do Radar para Parceiro/Vendedor HBX:
   - remover escolha livre de UF/cidade;
   - manter localização/base operacional;
   - limitar alcance a no máximo `100 km`;
   - manter escolha de segmento;
   - garantir que backend e UI respeitem a mesma restrição.
10. Corrigir exibição de limite do Radar:
    - não usar limite do Master como fallback para vendedor;
    - calcular/mostrar limite por usuário vendedor;
    - ocultar contador global quando não houver limite do vendedor definido;
    - validar com dois logins: Master e vendedor HBX.
11. Corrigir mensagens do Radar:
    - criar camada de texto público para estados do backend;
    - esconder códigos técnicos do vendedor;
    - manter detalhes técnicos apenas para Master/admin ou logs;
    - validar que todos os avisos do Radar estão em PT-BR operacional.
12. Corrigir estado visual de coroa/enriquecimento:
    - descobrir se o problema vem do payload ou só do CSS/render;
    - respeitar configuração padrão desativada do Vendas;
    - renderizar coroa dourada apenas para card enriquecido/ativado;
    - manter coroa cinza/desativada quando não houver enriquecimento;
    - testar com cards enriquecidos e não enriquecidos.
13. Corrigir ação da coroa/enriquecimento:
    - mapear o que o clique dispara hoje;
    - verificar se os cards estão falsamente marcados como enriquecidos;
    - garantir enriquecimento automático dos cards existentes não enriquecidos;
    - mostrar progresso/resultado/erro operacional;
    - respeitar quota e explicar quando não executar.
14. Corrigir status no cadastro/observação:
    - separar status automático de status manual do vendedor;
    - bloquear clique manual em `Trial iniciado`, `Pagamento confirmado` e equivalentes;
    - manter esses estados sincronizados com backend;
    - permitir desfazer apenas onde a ação manual for válida.
15. Corrigir dados de contato no cadastro assistido:
    - bloquear edição livre do WhatsApp quando já existir telefone no card;
    - permitir adicionar telefone apenas quando o card não tiver;
    - salvar telefone/e-mail adicionados no cadastro do cliente/card;
    - validar duplicidade de telefone/e-mail antes de criar cadastro/trial;
    - impedir trial repetido quando já houve cadastro anterior.
16. Corrigir conflitos e feedback do cadastro assistido:
    - mapear respostas `409 Conflict` do backend para mensagens claras;
    - não exibir `Parabéns` em caso de conflito ou envio falho;
    - bloquear clique duplo durante processamento e após sucesso;
    - diferenciar cadastro criado, e-mail enviado, e-mail pendente e conflito;
    - investigar `403 Forbidden` do aviso `hbx-popup2`;
    - validar duplicidade de telefone/e-mail/trial antes de enviar.
17. Padronizar coroa/enriquecimento desktop e mobile:
    - aplicar mesma semântica visual nos dois modos;
    - coroa dourada para enriquecido/ativo;
    - coroa acinzentada para sem enriquecimento/desativado;
    - adicionar coroa na direita do Radar desktop;
    - posicionar contador à direita da coroa;
    - permitir ativar enriquecimento automático pela coroa;
    - exibir contador do vendedor junto da coroa;
    - remover redirect da coroa para `/mobile/planos?intent=lead` no fluxo operacional.
18. Simplificar UI mobile:
    - transformar HBX Pulse em botão fino azul expansível;
    - transformar Próximo card recomendado em botão fino azul expansível;
    - manter `Chamar agora` e `Observação` dentro da expansão;
    - reduzir poluição visual da tela inicial do vendedor.

## Observações

- Frontend local previsto: `http://localhost:3001`.
- Backend local depende da configuração atual do ambiente.
- Nada de deploy ou publish durante esta correção.

## Execução

### Passo 1 - Separação inicial de perfil/roteamento

- Status: aplicado
- Data: `2026-06-06`
- Escopo:
  - separar identificação de Parceiro/Vendedor HBX de vendedor comum/admin comum;
  - corrigir o primeiro caso de desktop sendo forçado para mobile no pós-login/confirmação.
- Mudanças aplicadas:
  - `/profile/current-user` agora expõe `userKind`:
    - `hbx_partner_seller`;
    - `seller`;
    - `admin`;
    - `system_master`;
    - `user`.
  - `/profile/current-user` agora expõe `sellerProfile` com flags explícitas:
    - `isHbxPartnerSeller`;
    - `isCommonSeller`;
    - `isAdmin`.
  - empresa do perfil agora expõe `company.isHbxSellerNetwork`.
  - backend deixou de retornar `/mobile/vendas` como destino fixo para parceiro HBX operacional; agora retorna `/vendas`.
  - frontend ganhou `toDesktopRoute()` para converter rotas `/mobile/...` para desktop quando a tela real não é mobile.
  - login em `/mobile/login` aberto no desktop não deve mais forçar destino mobile depois de autenticar.
- Arquivos alterados:
  - `backend/src/auth/profile.controller.ts`
  - `backend/src/auth/auth.service.ts`
  - `frontend/src/app/_lib/mobileRoutes.ts`
  - `frontend/src/app/login/page.tsx`
- Validações:
  - `cd frontend && npm run lint`: passou com 8 warnings preexistentes em arquivos fora do passo.
  - `cd frontend && npm run build`: passou.
  - `cd backend && npm run build`: passou.
  - `cd backend && npm run prisma:validate`: passou.
- Observação:
  - este passo não altera ainda e-mails, contrato, documentos, Radar, coroa/enriquecimento ou cadastro assistido de cliente; ele prepara a base para esses próximos passos sem misturar o fluxo HBX com USER/ADMIN comum.

### Passo 2 - Onboarding do Parceiro HBX

- Status: aplicado
- Data: `2026-06-06`
- Escopo:
  - cadastro inicial do Parceiro HBX deve gerar contrato e disparar pré-boas-vindas solicitando documentos;
  - confirmação de e-mail deve ficar dentro do fluxo especial do Parceiro HBX, não como e-mail genérico duplicado na ativação final;
  - ativação final deve enviar apenas boas-vindas/acesso depois da aprovação documental.
- Mudanças aplicadas:
  - `sendOnboardingEmail` ganhou opção explícita para envio de solicitação com pendências obrigatórias, preservando o bloqueio rígido padrão para usos que exigem documentação completa.
  - Cadastro de Parceiro HBX por Gerencial e por Master agora:
    - cria o onboarding;
    - salva os dados contratuais;
    - gera contrato PDF quando ainda não existir;
    - envia o pré-boas-vindas com contrato anexado;
    - lista documentos pendentes no e-mail;
    - inclui link de confirmação de e-mail no próprio pré-boas-vindas.
  - Botão manual `Solicitar documentos` também pode enviar mesmo com documentos pendentes e inclui link de confirmação se o parceiro ainda não confirmou o e-mail.
  - Ativação final (`Criar parceiro`) deixou de enviar o e-mail genérico `Confirme seu email no HBX`; fica só o boas-vindas final com acesso.
  - Confirmação de e-mail de Parceiro HBX ainda inativo não cria sessão, não informa acesso liberado e não dispara sincronização de ativação; retorna status de aprovação pendente.
  - Mensagens do Gerencial foram ajustadas para não orientar `gere o contrato` quando o backend já gerou/enviou o pré-boas-vindas.
- Arquivos alterados:
  - `backend/src/gerencial/seller-onboarding.service.ts`
  - `backend/src/gerencial/gerencial.controller.ts`
  - `backend/src/users/users.controller.ts`
  - `backend/src/auth/auth.service.ts`
  - `backend/src/mail/email-template.service.ts`
  - `frontend/src/app/gerencial/page.client.tsx`
- Validações:
  - `cd backend && npm run build`: passou.
  - `cd backend && npm run prisma:validate`: passou.
  - `cd backend && node --test dist/gerencial/seller-onboarding.service.test.js`: passou, 8 testes.
  - `cd frontend && npm run lint`: passou com 8 warnings preexistentes.
  - `cd frontend && npm run build`: passou.
- Teste manual pendente em localhost:
  - criar novo Parceiro HBX e confirmar que chega 1 pré-boas-vindas com contrato + pendências + link de confirmação;
  - confirmar que o link de confirmação não libera acesso antes da aprovação;
  - anexar documentos/contrato e clicar `Criar parceiro`;
  - confirmar que chega apenas o boas-vindas final, sem e-mail genérico de confirmação duplicado.

### Passo 3 - UI do popup de cadastro do Parceiro HBX

- Status: aplicado
- Data: `2026-06-06`
- Escopo:
  - corrigir o popup de cadastro do vendedor/parceiro HBX quando o conteúdo passa da altura da viewport;
  - manter o botão `Fechar` acessível;
  - permitir rolagem vertical previsível sem perder o topo do modal.
- Mudanças aplicadas:
  - overlay do popup ganhou classe específica `hbx-popup-layer--partner-access`.
  - overlay desse popup passou a alinhar o modal no topo e permitir rolagem vertical.
  - popup de parceiro passou a usar altura calculada pela viewport, em vez de depender apenas de `max-height`.
  - header do popup ficou fixo dentro do modal, com fundo próprio.
  - botão `Fechar` recebeu posicionamento/camada explícitos para não sumir atrás do conteúdo.
  - ajuste foi isolado ao popup de cadastro de Parceiro HBX, sem alterar os outros avisos/popups.
- Arquivos alterados:
  - `frontend/src/app/gerencial/page.client.tsx`
  - `frontend/src/app/globals.css`
- Validações:
  - `cd frontend && npm run lint`: passou com 8 warnings preexistentes.
  - `cd frontend && npm run build`: passou.
- Teste manual pendente em localhost:
  - abrir o cadastro de Parceiro HBX com conteúdo completo;
  - reduzir a altura da janela;
  - confirmar que o botão `Fechar` continua acessível;
  - confirmar que a rolagem permite chegar ao topo e ao fim do popup.

### Passo 4 - Validação final do `Criar parceiro`

- Status: aplicado
- Data: `2026-06-06`
- Escopo:
  - fechar a liberação final do Parceiro HBX;
  - impedir boas-vindas/acesso final quando a confirmação do pré-boas-vindas ainda não foi concluída;
  - manter USER comum e ADMIN comum fora dessa regra especial.
- Mudanças aplicadas:
  - `assertCanActivatePartner` agora exige `emailConfirmedAt` antes de aprovar/liberar Parceiro HBX.
  - Se o e-mail ainda não foi confirmado, o backend retorna erro claro:
    - `HBX_PARTNER_EMAIL_CONFIRMATION_PENDING`;
    - `Parceiro ainda não pode ser liberado. O e-mail do pré-boas-vindas precisa ser confirmado antes do acesso final.`
  - A regra cobre os dois caminhos que ativam parceiro HBX:
    - endpoint `PATCH /users/:id/active`;
    - edição Master que tenta mudar `isActive` para `true`.
  - O fluxo comum de usuário/admin não foi alterado.
  - A ativação final continua sem enviar confirmação genérica duplicada; quando passa na validação, envia apenas o boas-vindas final.
- Arquivos alterados:
  - `backend/src/gerencial/seller-onboarding.service.ts`
  - `backend/src/gerencial/seller-onboarding.service.test.ts`
- Validações:
  - `cd backend && npm run build`: passou.
  - `cd backend && npm run prisma:validate`: passou.
  - `cd backend && node --test dist/gerencial/seller-onboarding.service.test.js`: passou, 10 testes.
- Teste manual pendente em localhost:
  - tentar `Criar parceiro` antes de confirmar o e-mail do pré-boas-vindas e verificar aviso claro;
  - confirmar o e-mail pelo link do pré-boas-vindas;
  - anexar documentos/contrato necessários;
  - clicar `Criar parceiro` e confirmar que chega apenas o boas-vindas final.

### Passo 5 - Isolamento do fluxo comum

- Status: aplicado
- Data: `2026-06-06`
- Escopo:
  - garantir que USER comum e ADMIN comum continuem no fluxo atual;
  - impedir que regras especiais de Parceiro HBX vazem para empresas comuns;
  - preservar onboarding/pré-boas-vindas/contrato apenas para empresa da operação HBX.
- Mudanças aplicadas:
  - adicionadas regressões no teste do `UsersController` cobrindo criação de vendedor comum.
  - adicionadas regressões cobrindo criação de admin comum.
  - os testes forçam falha se qualquer fluxo comum chamar:
    - `getOrCreateForUser`;
    - `updateDraft`;
    - `sendOnboardingEmail`.
  - harness do teste foi atualizado para refletir o pré-boas-vindas HBX do passo 2 no caso específico de parceiro HBX.
- Arquivos alterados:
  - `backend/src/gerencial/hbx-partner-referral.service.test.ts`
- Validações:
  - `cd backend && npm run build`: passou.
  - `cd backend && npm run prisma:validate`: passou.
  - `cd backend && node --test dist/gerencial/hbx-partner-referral.service.test.js`: passou, 11 testes.
- Observação:
  - este passo não alterou regra de produção; ele travou em teste que vendedor/admin comum não herdam o fluxo especial de Parceiro HBX.

### Passo 6 - Roteiro de testes manuais em localhost

- Status: registrado, execução pendente
- Data: `2026-06-06`
- Escopo:
  - registrar os testes manuais necessários antes de avançar para Radar;
  - cobrir Parceiro HBX novo, vendedor comum, admin comum e parceiro HBX indicado;
  - manter o teste manual separado dos ajustes de código.
- Ambiente previsto:
  - frontend: `http://localhost:3001`;
  - backend: ambiente local atual;
  - caixa de e-mail local/preview conforme configuração do provedor transacional local.
- Cenário 1: Parceiro HBX novo
  - abrir Gerencial/Master no localhost;
  - cadastrar novo Parceiro HBX com e-mail único;
  - confirmar que o cadastro inicial deixa o usuário inativo/pendente;
  - confirmar que foi gerado contrato;
  - confirmar que chega 1 pré-boas-vindas com:
    - contrato anexado;
    - documentos pendentes;
    - link de confirmação;
    - sem senha/acesso final.
  - clicar `Criar parceiro` antes de confirmar e-mail;
  - resultado esperado: bloquear com mensagem clara de confirmação pendente;
  - confirmar e-mail pelo link;
  - anexar documento obrigatório e contrato assinado/mock;
  - clicar `Criar parceiro`;
  - resultado esperado: ativar parceiro e enviar apenas boas-vindas final, sem e-mail genérico `Confirme seu email no HBX`.
- Cenário 2: Vendedor comum
  - entrar em uma empresa comum, fora da operação HBX;
  - criar usuário com perfil `USER`;
  - resultado esperado:
    - não criar onboarding de Parceiro HBX;
    - não gerar contrato;
    - não enviar pré-boas-vindas de documentos;
    - seguir fluxo comum de acesso/senha da empresa.
- Cenário 3: Admin comum
  - entrar em uma empresa comum, fora da operação HBX;
  - criar usuário com perfil `ADMIN`;
  - resultado esperado:
    - não criar onboarding de Parceiro HBX;
    - não gerar contrato;
    - não enviar pré-boas-vindas de documentos;
    - seguir fluxo comum de admin.
- Cenário 4: Parceiro HBX indicado
  - entrar como Parceiro HBX ativo que pode indicar;
  - registrar indicação de novo parceiro;
  - converter a indicação no Gerencial/Master;
  - resultado esperado:
    - novo parceiro herda o indicador correto;
    - comissão direta e herança/snapshot ficam corretos;
    - fluxo inicial é o mesmo do Parceiro HBX novo: contrato + pré-boas-vindas + confirmação;
    - ativação final só ocorre após e-mail confirmado e pendências concluídas.
- Cenário 5: Desktop x mobile
  - fazer login do Parceiro HBX em desktop;
  - resultado esperado: abrir rota/experiência desktop, sem forçar `/mobile/vendas`;
  - fazer login por rota mobile explícita ou viewport mobile;
  - resultado esperado: manter experiência mobile quando o acesso for realmente mobile.
- Critério de parada:
  - se qualquer cenário enviar confirmação genérica duplicada, forçar mobile no desktop ou liberar parceiro sem confirmação/documentos, parar antes do passo 7 e registrar o erro no topo deste arquivo.
- Observação:
  - localhost não foi aberto neste passo por orientação do dono; abrir somente quando solicitado.

### Passo 7 - Roteamento pós-login desktop/mobile

- Status: aplicado
- Data: `2026-06-06`
- Escopo:
  - garantir que Parceiro/Vendedor HBX não seja forçado para `/mobile/vendas` no desktop;
  - manter mobile quando a rota/superfície for realmente mobile;
  - corrigir redirecionamentos pós-login/pós-pagamento que ainda usavam apenas `role === USER`.
- Mudanças aplicadas:
  - confirmação feita no passo 1:
    - backend retorna destino operacional desktop (`/vendas`) para Parceiro/Vendedor HBX;
    - login converte para mobile só quando a superfície é mobile e viewport confirma mobile;
    - login desktop converte destino mobile para desktop.
  - ajustes deste passo:
    - `pagamento/page.client.tsx` deixou de redirecionar `USER` direto para `/mobile/vendas`;
    - página desktop de pagamento agora escolhe entre `toMobileRoute()` e `toDesktopRoute()` usando `shouldUseMobileRoute()`;
    - `pagamento/page.mobile.client.tsx` usa `toMobileRoute()` para manter rota mobile explícita;
    - busca nos fluxos `pagamento`, `login`, `confirm-email` e `auth` não encontrou mais `/mobile/vendas` fixo.
- Arquivos alterados:
  - `frontend/src/app/pagamento/page.client.tsx`
  - `frontend/src/app/pagamento/page.mobile.client.tsx`
- Validações:
  - `cd frontend && npm run lint`: passou com 8 warnings preexistentes.
  - `cd frontend && npm run build`: passou.
  - `rg -n "/mobile/vendas" frontend/src/app/pagamento frontend/src/app/login frontend/src/app/confirm-email backend/src/auth`: sem ocorrências.
- Teste manual pendente em localhost:
  - login de Parceiro HBX em desktop deve abrir `/vendas`/experiência desktop;
  - login de Parceiro HBX em `/mobile/login` com viewport mobile deve abrir `/mobile/vendas`;
  - passagem por pagamento em desktop não deve forçar `/mobile/vendas`;
  - passagem por pagamento mobile deve permanecer em rota mobile.
