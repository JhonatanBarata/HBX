# O que testar antes de subir

Cada teste é assim: **entre em tal lugar → faça tal coisa → tem que acontecer isso.**
Se algo não acontecer como está escrito, me avisa.

## Conectar o WhatsApp
- Entre no **Atendimento** → clique em **Conectar WhatsApp**. O QR Code tem que **aparecer e ficar na tela** (não some sozinho). Escaneie com o celular → o selo tem que virar **Conectado**, sem você atualizar a página.
- Com o WhatsApp **desconectado**, deixe a tela do Atendimento aberta um tempo. O selo tem que ficar parado em **Desconectado** — não pode ficar piscando "Iniciando" / "Reconectando" sozinho.

## Depois de conectar um número novo
- Conecte um número novo. As **conversas e os contatos** têm que aparecer **sozinhos** em poucos segundos, sem você atualizar a página.
- As **fotos** dos contatos têm que aparecer também. Quem não tem foto fica com a **bolinha de inicial** — nunca uma foto quebrada.
- Se um número **recebe mas não consegue enviar** (a mensagem fica com errinho) e outro número envia normal: o problema é o **chip daquele número** (bloqueio do WhatsApp), não o sistema.

## Conversa: reagir e foto
- **Reaja** a uma mensagem (clique no emoji). A reação tem que aparecer, **sem dar erro**.
- Abra uma conversa de um contato **sem foto**. A foto tem que **carregar sozinha**, sem piscar e sem recarregar a página. Clicar na foto lá em cima força buscar de novo.
- A lista de conversas tem que **se reorganizar sozinha**: quem manda mensagem nova **sobe pro topo** e o textinho/horário atualizam, em uns 10 segundos, sem você atualizar a página.

## Modo de atendimento: Compartilhado x Individual (novo)
- Entre no **Atendimento**. Tem que **abrir normal** (a lista e abrir uma conversa). Se aparecer tela de erro, me avisa.
- Como **admin**, clique em **Modelo** (em cima) → escolha **Usar número compartilhado**. Se tiver vendedores conectados, aparece um **aviso com os nomes e números** de quem vai cair → confirme. Eles têm que **desconectar limpo** (sem ficar com QR travado).
- No **compartilhado**: todos veem as conversas do **número da empresa**. Numa conversa, clique em **Puxar atendimento pra mim** → seu nome aparece como responsável; o outro vendedor vê **"Atendimento com você"** e **não consegue responder** até clicar em **Assumir**.
- Volte pra **Chips individuais**: cada vendedor conecta o **próprio número** de novo (você libera no painel, na opção **Pode conectar chip?**).

## No celular
- Abra no celular as telas principais (Início, Radar, Vendas, Atendimento, Bot, Relatórios, Configurações). Nenhuma pode ter **corte ou rolagem pro lado**.
- A barra de baixo (Início/Radar/Vendas/Chat/Mais) **navega**; o **Mais** abre e fecha. No Atendimento, a caixinha de escrever fica **fixa** (teste com o teclado aberto).

## Entrar e pagar (cadastro/planos)
- Na escolha de planos: escolha um plano → preencha o cadastro → envie → cai na tela **Aguardando confirmação**. Aperte **F5 (recarregar)**: tem que **voltar pra tela de espera**, não pro formulário em branco.
- Tente **entrar** com um e-mail ainda **não confirmado** e a **senha certa**: tem que oferecer **Continuar cadastro** e te levar de volta de onde parou. Com **senha errada**: mensagem genérica, sem dizer mais nada.
- **Cadastrar de novo** o mesmo e-mail (ainda não confirmado): **não** pode dar "e-mail já cadastrado" seco — reenvia o link e volta pra espera.
- Na tela de espera, **Confirmar pelo WhatsApp** (no ambiente de teste): digite o telefone → **Enviar código** → o código de 6 números **aparece na própria tela** → digite → **confirma**. (Na versão de verdade o código **não** aparece na tela, chega no WhatsApp.)
- **Cartão** só abre **depois de confirmar o e-mail**. Antes disso, sempre a tela de espera.
- **Anti-abuso:** duas empresas diferentes tentando usar o **mesmo CPF/telefone** num plano com teste grátis → a segunda recebe **erro**. A mesma empresa refazendo → **passa** normal.
