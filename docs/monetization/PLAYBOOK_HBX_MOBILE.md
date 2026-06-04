# Playbook HBX Mobile

Data de referencia: 2026-06-04

Este playbook organiza a venda e o suporte do HBX Mobile sem mudar regra comercial, pricing, onboarding ou automacao. O fluxo central continua:

Radar -> Vendas -> WhatsApp -> Retorno

## 1. Oferta em uma frase

HBX Mobile entrega oportunidades reais no celular, organiza quem chamar hoje, registra retorno e mostra dinheiro parado antes que o cliente perca a venda.

## 2. Planos atuais

Base: `backend/src/commercial-plans/commercial-plan-catalog.ts`.

| Plano | Preco mensal catalogado | Uso principal | Limites atuais | Observacoes |
| --- | ---: | --- | --- | --- |
| HBX List | R$ 45,00 | Entrada barata com cards simples | 880 cards/mes, ate 50 cards por pesquisa, 3 pesquisas comerciais por mes | Libera Radar Digital + Vendas com dados basicos e WhatsApp externo. |
| HBX Lead Plus | R$ 99,00 | Produto principal para venda mobile | 2.200 cards inteligentes/mes, 2 buscas Google/dia, limite tecnico diario de 100 cards | Tem trial de 14 dias. Inclui score, motivo, canal recomendado, filtros, templates e agenda. |
| HBX Full - Bot e IA | R$ 149,90 no catalogo backend | Operacao completa com atendimento, bot e automacao | 5.000 cards inteligentes/mes, 6 buscas Google/dia, limite tecnico diario de 250 cards | Exige implantacao assistida pela HBX antes de automacao/bot completo. |

Regras comerciais importantes:

- Nao prometer automacao completa sem implantacao assistida.
- Nao tratar HBX List como card inteligente completo.
- Nao vender busca generica; vender oportunidade real.
- Nao liberar modulo pago sem plano, pagamento, trial ou autorizacao correta.
- Para plano Full, alinhar configuracao, limites, horarios, handoff humano e risco WhatsApp antes de operar.

## 3. Persona e abordagem

### Cliente final

Perfil: dono ou gerente que depende de WhatsApp, orcamento e retorno manual.

Dor comum:

- esquece retorno;
- nao sabe quem chamar primeiro;
- perde contato bom no meio das conversas;
- nao mede onde existe oportunidade parada;
- depende de planilha ou memoria.

Mensagem curta:

> O HBX mostra quem voce deve chamar hoje, guarda o retorno e aponta o dinheiro parado antes de virar perda.

### Parceiro HBX

Perfil: vendedor parceiro da rede HBX, nao funcionario. Recebe ou trabalha cards, pode indicar novos parceiros quando autorizado, e acompanha comissao.

Regras:

- Parceiro nao e funcionario.
- Parceiro nao cria usuario final diretamente por indicacao.
- Indicacao vira candidate e passa pelo Master HBX.
- Herdeiro e parceiro vinculado por `referredByUserId`.
- Sem meta obrigatoria; o painel mostra operacao e oportunidade, nao punicao automatica.

## 4. Fluxo de parceiro HBX

1. Master acessa Gerencial na operacao HBX.
2. Master cria ou revisa parceiro em `Gerencial -> Equipe`.
3. Se a operacao for rede HBX, o cadastro de parceiro usa onboarding formal.
4. Master define comissao, possibilidade de indicar vendedores e percentual de heranca quando aplicavel.
5. Master gera contrato e exige anexos configurados.
6. Master envia e-mail de onboarding.
7. Quando o e-mail e enviado com sucesso, o usuario pode ser ativado conforme o fluxo do sistema.
8. Parceiro acessa Vendas/Mobile Vendas para trabalhar cards e registrar retornos.
9. Comissao aparece no Gerencial/Vendas conforme status de cliente e regras D+.

Checklist do parceiro:

- nome, telefone e e-mail corretos;
- comissao preenchida;
- documento obrigatorio anexado quando marcado;
- contrato gerado;
- e-mail enviado;
- usuario ativo apenas depois do ciclo correto;
- parceiro entende que deve trabalhar Radar -> Vendas -> WhatsApp -> Retorno.

## 5. Fluxo de herdeiro

Herdeiro e um parceiro cadastrado a partir de indicacao de outro parceiro.

1. Parceiro autorizado informa nome e WhatsApp da indicacao.
2. Sistema cria `HbxPartnerReferralCandidate` com status `pending`.
3. Master avalia no Gerencial.
4. Master aprova ou rejeita.
5. Ao cadastrar o novo parceiro com `referralCandidateId`, o sistema vincula:
   - `referredByUserId`;
   - snapshot de percentual de heranca;
   - onboarding como `hbx_heir` quando houver indicador.
6. Candidate vira `converted` depois do cadastro formal.

Cuidados:

- nao criar User antes do Master;
- bloquear telefone duplicado pending/approved;
- validar indicador ativo da mesma empresa;
- preservar historico da indicacao;
- nao transformar herdeiro em funcionario.

## 6. Como cadastrar parceiro

Uso recomendado no Gerencial:

1. Abrir `Gerencial`.
2. Entrar em `Equipe`.
3. Clicar em `Criar acesso`.
4. Informar nome, e-mail e WhatsApp.
5. Em rede HBX, manter papel como vendedor/parceiro.
6. Preencher comissao.
7. Se houver indicacao aprovada, selecionar ou deixar o sistema preencher pelo telefone.
8. Salvar cadastro.
9. Abrir onboarding do parceiro.
10. Conferir documentos obrigatorios.
11. Gerar contrato.
12. Enviar e-mail.

Quando usar cadastro direto:

- parceiro veio direto da HBX;
- sem indicador;
- comissao normal da operacao.

Quando usar candidate:

- parceiro foi indicado por outro parceiro;
- precisa registrar heranca;
- Master quer preservar trilha de aprovacao.

## 7. Como aprovar indicacao

1. Abrir `Gerencial`.
2. Conferir se a empresa e rede HBX.
3. Acessar o painel de indicacoes.
4. Avaliar nome, telefone, observacao e segmentos preferidos.
5. Aprovar se o candidato e valido.
6. Rejeitar com motivo se nao fizer sentido.
7. Ao criar o usuario, usar a indicacao aprovada.

Boa pratica:

- telefone deve ser WhatsApp real;
- evitar candidatos duplicados;
- registrar observacao curta;
- confirmar se o indicador esta ativo;
- nao prometer comissao fora do percentual configurado.

## 8. Como enviar contrato e e-mail

1. Abrir cadastro/onboarding do parceiro.
2. Conferir dados legais: nome, CPF quando aplicavel, e-mail, telefone e endereco.
3. Conferir exigencias de documento.
4. Anexar documentos obrigatorios.
5. Gerar contrato PDF.
6. Se houver e-mail de arquivo, conferir antes do envio.
7. Enviar e-mail.
8. Verificar status de envio.
9. Confirmar ativacao do usuario quando o fluxo indicar sucesso.

Regras de seguranca:

- nao anexar documentos fora do fluxo;
- nao versionar uploads;
- nao enviar se documento obrigatorio estiver faltando;
- se e-mail falhar, nao ativar usuario automaticamente;
- anexos temporarios devem expirar, mas metadados e hash ficam para auditoria.

## 9. Como distribuir cards

Distribuicao manual ou operacional:

1. Abrir Radar Digital ou Banco de Dados/Master, conforme permissao.
2. Selecionar UF, cidade/regiao e segmento/categoria.
3. Verificar preferencias do parceiro.
4. Verificar limite diario.
5. Atribuir parceiro.
6. Rodar distribuicao quando permitido.
7. Acompanhar entregues hoje.
8. Pausar parceiro se necessario.
9. Trocar parceiro quando territorio ou segmento estiver errado.

Regras:

- card sem empresa real nao deve virar venda;
- card de empresa real com canal publico e util, mesmo sem telefone;
- negativos protegem a operacao contra repeticao;
- parceiro comum de empresa cliente nao deve ser quebrado por regra da rede HBX;
- sem mapa pesado quando tabela operacional resolve.

## 10. Como medir resultado

Usar HBX Pulse e Gerencial.

Indicadores diarios:

- cards parados;
- retornos vencidos;
- leads sem primeiro contato;
- clientes pending activation;
- comissao pendente;
- oportunidades por segmento;
- valor potencial estimado.

Leitura rapida:

- muitos retornos vencidos: foco em follow-up hoje;
- muitos leads sem primeiro contato: foco em primeira mensagem;
- muito pending activation: foco em validar cliente e liberar proxima etapa;
- muita comissao pendente: foco em fechamento financeiro e previsibilidade;
- segmento concentrado: ajustar abordagem e template daquele nicho.

Rotina de 10 minutos:

1. Abrir Mobile Vendas.
2. Ver `Dinheiro parado hoje`.
3. Copiar resumo se for prestar conta ou mandar no WhatsApp interno.
4. Chamar retornos vencidos.
5. Fazer primeiro contato dos cards novos.
6. Registrar resultado.
7. Agendar proximo retorno.
8. Marcar venda, trial ou encerramento quando aplicavel.

## 11. Scripts de abordagem por nicho

Use os textos como ponto de partida. O vendedor deve revisar antes de enviar.

### Assistencia tecnica e refrigeracao

Primeiro contato:

> Oi, tudo bem? Vi sua empresa de assistencia/refrigeracao e queria te mostrar uma forma simples de organizar orcamentos, retornos e chamados pelo WhatsApp sem depender de planilha. Posso te mandar um exemplo rapido?

Follow-up:

> Passando para nao deixar esfriar: a ideia e ajudar sua equipe a lembrar quem precisa de retorno, quem pediu orcamento e quem ficou sem resposta. Quer que eu te mostre em 5 minutos?

Gancho de dor:

- orcamento esquecido;
- cliente chama em varios horarios;
- tecnico fica sem visao do retorno;
- dono nao sabe qual atendimento virou venda.

### Estetica e cosmeticos

Primeiro contato:

> Oi, tudo bem? Vi seu trabalho em estetica/cosmeticos e pensei em uma rotina simples para organizar interessadas, retornos e horarios pelo WhatsApp. Posso te mostrar como o HBX ajuda a nao perder cliente quente?

Follow-up:

> Muitas vendas em estetica dependem de lembrar a cliente no momento certo. O HBX mostra quem chamar hoje e guarda o historico. Posso te mandar uma demonstracao rapida?

Gancho de dor:

- cliente pergunta e some;
- retorno de procedimento;
- horario ou avaliacao pendente;
- mensagens espalhadas.

### Oficinas

Primeiro contato:

> Oi, tudo bem? Vi sua oficina e queria te mostrar um jeito simples de acompanhar orcamentos, retornos e clientes que ainda nao fecharam. O objetivo e nao perder servico por falta de follow-up. Posso te mostrar?

Follow-up:

> Oficina costuma perder venda quando o cliente pede orcamento e ninguem retorna no dia certo. O HBX organiza essa fila e mostra quem chamar primeiro.

Gancho de dor:

- orcamento parado;
- cliente pesquisando preco;
- retorno de revisao;
- garantia ou servico pendente.

### Escolas e cursos

Primeiro contato:

> Oi, tudo bem? Vi sua escola/curso e pensei em uma forma de organizar interessados, retornos e matriculas pendentes. O HBX ajuda a equipe a saber quem chamar hoje. Posso te mostrar em poucos minutos?

Follow-up:

> Quando o lead de curso esfria, a matricula fica mais dificil. O HBX ajuda a registrar o contato, lembrar retorno e priorizar os interessados certos.

Gancho de dor:

- interessado sem retorno;
- matricula pendente;
- campanha sem acompanhamento;
- secretaria sem visao da fila.

### Servicos B2B locais

Primeiro contato:

> Oi, tudo bem? Vi sua empresa e queria te mostrar uma rotina simples para organizar prospeccao, retornos e oportunidades comerciais. O HBX mostra quem chamar hoje e onde existe dinheiro parado. Posso te mandar um exemplo?

Follow-up:

> A maioria das oportunidades B2B nao se perde no primeiro contato; se perde no retorno. O HBX ajuda a manter a fila clara e acionavel.

Gancho de dor:

- proposta sem acompanhamento;
- decisor demora responder;
- equipe esquece follow-up;
- dono nao sabe qual oportunidade esta parada.

## 12. Checklist de demo de 15 minutos

### Antes da demo

- confirmar nicho e cidade;
- confirmar se o cliente usa WhatsApp;
- separar 3 dores reais do nicho;
- abrir Mobile Vendas;
- garantir que ha cards de exemplo ou demo segura;
- evitar dados sensiveis de outro cliente.

### Minuto 0-2: problema

Fala:

> Hoje a venda se perde quando ninguem sabe quem precisa de retorno. O HBX organiza isso no celular.

Mostrar:

- agenda do dia;
- atrasados;
- cards;
- retorno.

### Minuto 2-5: Radar para oportunidade

Mostrar:

- card com empresa real;
- telefone/canal quando disponivel;
- segmento/cidade;
- motivo de oportunidade quando plano permitir.

Fala:

> O Radar nao e lista generica. Ele vira card trabalhavel no Vendas.

### Minuto 5-8: WhatsApp e retorno

Mostrar:

- botao/acao de WhatsApp;
- observacao;
- proximo retorno;
- status do card.

Fala:

> O objetivo nao e mandar mensagem e esquecer. E registrar resultado e voltar no dia certo.

### Minuto 8-11: dinheiro parado

Mostrar:

- card `Dinheiro parado hoje`;
- cards parados;
- retornos vencidos;
- pending activation;
- copiar resumo.

Fala:

> Esse resumo mostra onde existe oportunidade travada hoje.

### Minuto 11-13: Gerencial

Mostrar:

- equipe;
- comissao;
- pending activation;
- indicacoes se for rede HBX.

Fala:

> No Gerencial voce acompanha equipe, implantacao e comissao sem transformar parceiro em funcionario.

### Minuto 13-15: fechamento

Perguntas:

- Quantos retornos voces esquecem por semana?
- Hoje quem decide quem chamar primeiro?
- Voce prefere comecar com cards simples ou card inteligente?

Fechamento sugerido:

> Eu recomendo comecar pelo HBX Lead Plus porque ele ja mostra prioridade, mensagem e retorno. Se fizer sentido, voce usa 14 dias para validar o fluxo com a equipe.

## 13. Roteiro de suporte operacional

Quando o cliente diz que nao recebeu cards:

1. verificar plano e status comercial;
2. verificar modulo Vendas/Webscraping;
3. verificar Radar e limites;
4. verificar negativos/duplicados;
5. verificar filtros de cidade e segmento;
6. orientar busca mais ampla se necessario.

Quando o parceiro diz que nao consegue acessar:

1. verificar se usuario esta ativo;
2. verificar e-mail/senha;
3. verificar onboarding enviado;
4. verificar se a empresa e rede HBX;
5. verificar modulo Vendas;
6. nao ativar manualmente se o fluxo de e-mail/documento falhou.

Quando o cliente diz que WhatsApp nao funciona:

1. separar WhatsApp externo, temporario e oficial;
2. verificar conexao no painel correto;
3. nao prometer disparo em massa;
4. orientar opt-in e uso seguro;
5. no Full, acionar implantacao assistida antes de bot/automacao.

Quando o dinheiro parado esta alto:

1. priorizar retornos vencidos;
2. depois primeiro contato;
3. depois pending activation;
4. revisar segmentos;
5. revisar limite e distribuicao de parceiro;
6. copiar resumo do Pulse para alinhamento interno.

## 14. Frases comerciais seguras

Pode falar:

- "O HBX ajuda a organizar retorno e oportunidade."
- "O painel mostra quem chamar hoje."
- "O Pulse mostra dinheiro parado com base nos cards e status."
- "No Lead Plus, o card traz inteligencia comercial e mensagem pronta."
- "No Full, automacao e bot precisam de implantacao assistida."

Evitar:

- "O sistema garante venda."
- "Pode disparar para todo mundo."
- "Busca qualquer coisa e vira cliente."
- "Parceiro e funcionario."
- "Comissao esta garantida antes da confirmacao do fluxo."
- "Plano pago pode ser usado sem cobranca ou autorizacao."

## 15. Proximas melhorias sugeridas

- Criar dashboard executivo do Pulse por semana.
- Criar template de resumo por nicho.
- Ligar Pulse a tarefas internas sem envio automatico.
- Criar playbook visual de onboarding do parceiro.
- Criar script de demo com dados ficticios por nicho.
