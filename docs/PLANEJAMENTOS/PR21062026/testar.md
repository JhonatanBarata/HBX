# O que testar antes de subir

Cada teste é assim: **entre em tal lugar → faça tal coisa → tem que acontecer isso.**
Se algo não acontecer como está escrito, me avisa.

## Radar (Leads) no celular — lista + card que abre na frente (novo)
- Entre no **Radar** pelo celular. Aparece uma **lista de clientes** (você rola a lista de cima pra baixo com o dedo).
- **Toque num cliente** da lista: abre um **card na frente** (no meio da tela) com os detalhes do negócio.
- Dentro desse card, **arraste pro lado** (estilo tinder) — ou use as **setinhas**: troca de cliente, um a um.
- Chegue no **último** e **arraste mais uma vez**: tem que **abrir a tela de Vendas**.
- O **✕** fecha o card e volta pra lista. O botão **Puxar** continua funcionando (manda pra sua carteira).
- As letras têm que estar **legíveis** (nem minúsculas nem gigantes) e tudo **proporcional** à tela.

## Configurações no celular (novo)
- Entre em **Configurações** pelo celular. Em cima, as seções (Perfil / Empresa / Equipe / Avisos) viram **botõezinhos lado a lado** — toque pra trocar.
- Embaixo, os dados aparecem em **cartões limpos** ocupando a tela (sem buraco vazio embaixo). Nada pode estar **torto**. O botão **Salvar** fica fácil de achar.

## Vendas no celular (novo)
- Entre em **Vendas** pelo celular. Tudo cabe numa **tela só**: os negócios em lista, separados por **Hoje / Atrasados / Agendados / Fechados**.
- **Toque num negócio**: abre um **card na frente** com os detalhes e os botões de ação (mover etapa, agendar retorno, fechar venda...). O **✕** fecha.

## Atendimento no celular (ajuste)
- Entre em **Atendimento** pelo celular. A lista de conversas tem que estar **mais fininha** (cabe mais conversa na tela), com uma **linha** separando cada uma.

## Entrar e pagar (cadastro/planos)
- Na escolha de planos: escolha um plano → preencha o cadastro → envie → cai na tela **Aguardando confirmação**. Aperte **F5 (recarregar)**: tem que **voltar pra tela de espera**, não pro formulário em branco.
- Tente **entrar** com um e-mail ainda **não confirmado** e a **senha certa**: tem que oferecer **Continuar cadastro** e te levar de volta de onde parou. Com **senha errada**: mensagem genérica, sem dizer mais nada.
- **Cadastrar de novo** o mesmo e-mail (ainda não confirmado): **não** pode dar "e-mail já cadastrado" seco — reenvia o link e volta pra espera.
- Na tela de espera, **Confirmar pelo WhatsApp** (no ambiente de teste): digite o telefone → **Enviar código** → o código de 6 números **aparece na própria tela** → digite → **confirma**. (Na versão de verdade o código **não** aparece na tela, chega no WhatsApp.)
- **Cartão** só abre **depois de confirmar o e-mail**. Antes disso, sempre a tela de espera.
- **Anti-abuso:** duas empresas diferentes tentando usar o **mesmo CPF/telefone** num plano com teste grátis → a segunda recebe **erro**. A mesma empresa refazendo → **passa** normal.
