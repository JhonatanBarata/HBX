# O que testar antes de subir

Cada teste é assim: **entre em tal lugar → faça tal coisa → tem que acontecer isso.**
Se algo não acontecer como está escrito, me avisa.

## Bot: a chave e as 3 chavinhas (como testar)
- Primeiro o bot precisa estar **liberado** pra empresa: no **painel do dono** → **Empresas → Armar bot**. Sem isso, a tela do Bot mostra **"aguardando ativação"** e as chavinhas ficam **apagadas e travadas** — a tela **não** pode ficar cinza/quebrada, só travada com o aviso.
- Entre no **Bot** (pelo **robô** do topo ou pelo menu). Liberado, aparecem **3 chavinhas**: **Atendimento**, **Recuperação** e **Prospecção**. Cada uma mostra **3 luzinhas**: *WhatsApp conectado*, *configuração pronta* e *testado*. **Verde** = ok; **amarelo** = falta isso.
- **Atendimento** (responde quem chama): com a configuração pronta, você **liga fácil**.
- **Recuperação** e **Prospecção** (que **começam** conversa): a chavinha **só deixa ligar** quando as **3 luzinhas estão verdes**. Tente ligar com uma luz **amarela** → **não deixa** e **explica o que falta**. Ao ligar, **pede confirmação**.
- Pra acender a luz **"testado"**: use o **Testar bot** (o chat de teste), escolha o tipo e **troque algumas mensagens** — a luzinha **acende**.
- Na aba **Configurações** tem um **seletor** (Atendimento / Recuperação / Prospecção): troque e **edite as mensagens** de cada um, **Salvar**. O Atendimento tem que continuar funcionando **igual a antes**.
- Importante: **nada é enviado** a cliente de verdade nesses testes.

## Radar: busca funciona no 1º clique (novo)
- Entre em **Leads** → preencha **Estado**, **Cidade** e **Segmento** no painel da direita → aperte **Buscar**. Tem que aparecer o status **"Varrendo agora"** **sem precisar clicar duas vezes**.
- O disco do radar tem que girar mais rápido e um ponto verde tem que piscar no banner azul quando está varrendo.

## Radar: segmento aceita digitar livremente (novo)
- Entre em **Leads** → no painel da direita, campo **Segmento** → digite qualquer palavra (exemplo: "arquitetos") → o valor tem que **ficar** mesmo se você mudar o campo **Alcance** logo depois — sem apagar o que digitou.

## Radar: setas some ao preencher (novo)
- Entre em **Leads** → veja os campos **Estado**, **Cidade** e **Segmento** vazios: tem que aparecer uma **seta piscando** ao lado do nome de cada campo. Ao preencher o campo, a **seta some**.

## Radar: aviso ao buscar sem preencher (novo)
- Entre em **Leads** → aperte **Buscar** sem preencher **Cidade** e **Segmento** → tem que aparecer uma **janelinha no centro da tela** dizendo o que falta, com botão **Entendi** pra fechar. Nunca deve ser silêncio.

## Radar: leads aparecem na carteira após a busca (novo)
- Entre em **Leads** → faça uma busca com cidade e segmento → espere terminar de varrer → tem que aparecer a aba **"Minha carteira"** com os leads encontrados (não a aba "Disponíveis" vazia). Uma mensagem verde com o total deve aparecer rapidinho na tela.

## Radar: mensagens sem código técnico (novo)
- Entre em **Leads** → faça uma busca → se aparecer alguma mensagem de status embaixo do disco (enquanto varre ou ao terminar), **não pode ter** termos como "attempts=", "queryTaskCount=", "currentQuery=", "approved=" nem nada parecido. Só texto normal.

## Painel do dono: devolver dinheiro de uma cobrança (novo)
- Entre no **painel de empresas** (área do dono) → escolha uma empresa que **pagou no cartão** → abra a aba **Financeiro**. Numa cobrança **paga no cartão** tem que aparecer o botão **Reembolsar**.
- Aperte **Reembolsar** → aparece **Confirmar estorno** → confirme: tem que aparecer **"✓ Estorno solicitado"** e aquela cobrança passa a mostrar **estornado**. *(No ambiente de teste o dinheiro volta na conta de teste; na de verdade volta pro cliente.)*
- Numa cobrança que **não foi no cartão** (dinheiro/Pix na mão) o botão **Reembolsar não aparece** — só o de cancelar lançamento, como antes.

## Painel do dono: excluir empresa que pagou devolve a sobra (novo)
- No mesmo painel, escolha uma empresa que **está pagando** (já passou o cartão) → vá na área **Excluir empresa**: tem que aparecer um aviso amarelo **"Excluir vai reembolsar R$ tanto ao cliente"**, com os **dias que faltam** do período pago.
- Numa empresa que **nunca pagou** (ou está no **teste grátis**), esse aviso **não aparece** — excluir não devolve nada.
- Se você **excluir** uma empresa que estava pagando, o sistema **devolve sozinho** essa sobra pro cliente (além de parar as cobranças futuras). Excluir continua funcionando mesmo se o pagamento estiver fora do ar na hora.

## Vendas: os botões agora têm ordem (novo)
- Entre em **Vendas** → toque num card → no painel da direita os botões vêm **em blocos**: em cima **Fechar venda**; logo abaixo **"Como foi a ligação?"** com **quatro botões grandes** — **Atendeu** fica **verde**, **Sem interesse** fica **amarelo**, os outros dois neutros.
- Toque em **Atendeu** (ou outro) → tem que registrar e aparecer um **✓** de confirmação no card.

## Vendas: avançar etapa num toque (novo)
- Ainda em **Vendas**, no mesmo painel → na faixa **"Avançar etapa"** aparecem as etiquetas **Novo, Contato, Retorno, Qualificado, Encerrado**. A etapa **atual** do card tem que vir **destacada**.
- Toque numa etapa diferente → tem que mudar **num toque só** (sem precisar de um segundo botão).

## Vendas: ações raras ficam escondidas (novo)
- Ainda no painel de Vendas → embaixo tem **"▾ Mais ações"** fechado. **Negativar** e **Cadastrar cliente** começam **escondidos**. Toque em **Mais ações** → ele **abre**, a **setinha vira**, e aparece o **Negativar** (em vermelho) e o cadastrar.

## Vendas (conta que vende os planos HBX): pré-cadastro em destaque (novo)
- Entre em **Vendas** numa conta que **vende os planos HBX** → toque num card → no topo do painel, além de **Fechar venda**, tem que aparecer um botão em destaque **"Pré-cadastro do cliente"** e um lembrete de que **no fechamento você escolhe o plano**.

## Atendimento: card mais limpo + enriquecer (novo)
- Entre em **Atendimento** → escolha uma conversa → no painel da direita **não** pode mais aparecer a lista de **horários repetidos** (Recebida/Enviada com hora) nem "Bot Inativo" — o card tem que estar **mais enxuto**.
- Se o contato ainda **não tem as informações** do Radar (pontuação, motivo, dor), tem que aparecer um botão **"Enriquecer lead"**. Toque → ele busca os dados e o painel **passa a mostrar** a inteligência do contato.
