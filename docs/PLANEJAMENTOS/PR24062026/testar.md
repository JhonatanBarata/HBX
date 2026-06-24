# Testar (o dono testa antes de subir)

## Pele "Future!" — o Construtor de Bot cinematográfico
1. Clique no seletor de pele no topo (mostra "Aurora" ou o nome atual) → escolha **"Future!"**.
2. Vá em **Bot** → clique na aba **Prospecção** → clique em **"Configurar com ajuda"**.
3. Tem que abrir uma **tela cheia escura com glow azul** estilo sci-fi: HUD hexagonal "HBX" no topo, 3 cards de modo (Atendimento / Recovery / Prospecção), campos de configuração, o celular com preview do WhatsApp na direita.
4. Clique em **Recovery** → a tela inteira fica **âmbar/dourado**. Clique em **Prospecção** → fica **roxo**.
5. Clique em **"Salvar e continuar"** → avança para o Passo 2. No passo 5 tem que aparecer o **termo de responsabilidade**; role até o fim para liberar os aceites.
6. Aperte **Esc** ou clique no fundo escuro → a tela fecha e volta ao construtor normal.
7. Troque a pele para qualquer outra (ex.: Aurora) → **nada muda** no resto do sistema.

## Construtor de Bot — a tela nova (painel por abas)
1. Entre no **Bot** → em cima tem **3 abas: Atendimento, Recovery e Prospecção**. Cada aba é um bot separado, com o fluxo e os ajustes dela. (Sumiram os 3 quadrões e o seletor de tipo de antes — virou tudo uma coisa só.)
2. Logo abaixo tem um seletor **Tabuleiro · Trilha · Bandeja** — são **3 jeitos** de montar o mesmo bot. Clique em cada um e veja qual você prefere (depois a gente fica com um só).
3. **Clique numa peça** (ex.: "Boas-vindas") → abre uma **janela deslizando da direita** pra escrever a mensagem daquela parte. Escreva algo e feche → a peça fica marcada como **pronta** e a contagem/desenho anda.
4. Dentro dessa janela, clique em **"Variáveis"** → abre o castelo com **campo de busca**. Digite (ex.: "telefone"), clique numa → ela **entra no texto**. Clique **fora** → a janela **fecha** (sem travar a tela).
5. Numa peça com opções, **adicione uma opção**. Se sua conexão é **QR Code**, vira lista **1, 2, 3**; se é oficial, vira **botão**.
6. A peça **"Ajustes"** abre as regras gerais do bot na mesma janela.
7. Clique em **"Testar bot"** (em cima) → abre um **bate-papo de teste** deslizando do lado.
8. Clique em **Salvar** → saia e volte → o que você escreveu tem que **continuar lá**.

## Finalizadas (Sem interesse) no Atendimento
1. Entre no **Atendimento** → abra qualquer conversa → no quadro da direita, nas notas do cliente, veja o botão **"Sem interesse ▾"**.
2. Clique nele → abre um **menu** com opções (ex.: "Sem interesse geral", "Já tem solução", "Preço alto demais"). Clique em uma.
3. A conversa tem que **desaparecer da lista** imediatamente. No seletor de fila (onde fica "Todas as filas") escolha **"Finalizadas"** → a conversa aparece lá.
4. Se o cliente mandar mensagem de novo → ele **volta pra "Todas as filas"** automaticamente (você vê aparecer na lista).
5. Abra a fila **"Finalizadas"** → clique na conversa → o sistema tem que detectar que esse contato já foi finalizado e mantê-lo na fila certa (sem precisar marcar de novo).

## Fechar venda direto no Atendimento — é aqui que fecha
1. Entre no **Atendimento** → abra uma conversa → no quadro da direita aparece um **botão roxo "Fechar venda"** bem em cima.
2. Clique nele → abre uma **janela bonita** com os passos. Escolha o **plano**, digite o **valor combinado** (ex.: 99) e a **implantação** (ex.: 500).
3. Olhe o **quadro escuro "Sua comissão nesta venda"**: ele mostra **quanto você ganha por mês** já calculado, e logo abaixo um **passo a passo** explicando que é todo mês, automático.
4. Clique em **"Gerar link de contratação"** → vira uma **tela de comemoração** com o **link do cliente** e o botão verde **"Enviar no WhatsApp"**.
5. Feche a janela → o **mesmo cliente** continua amarrado a você (a venda fica registrada no seu nome).
6. (Para conferir a comissão) Entre no **Gerencial** → tem um cliente já fechado de teste, a **Camila Barsotti**, mostrando a comissão. Aí você vê onde acompanha o que cada vendedor fechou.

## Fechar venda no Vendas — agora igual ao Atendimento
1. Entre em **Vendas** → clique num card → no quadro da direita clique em **"Fechar venda"**.
2. Tem que abrir a **mesma janela bonita** do Atendimento (passos + o quadro escuro da comissão). No topo vêm os **dados do cliente** (nome e telefone já puxados do card) — confira e, se o cliente falou, complete **e-mail** e **CPF**.
3. Agora tem o campo **Implantação** aqui também (antes não tinha).
4. Dá pra **"Salvar produto/valor no card"** sem gerar link, ou **"Gerar link de contratação"** normal.

## O link do cliente já vem preenchido
1. Feche uma venda (no Vendas ou no Atendimento) preenchendo nome, telefone e — se tiver — **e-mail** e **CPF** do cliente.
2. Copie o **link de contratação** gerado e abra numa aba anônima (como se fosse o cliente).
3. Na tela de criar conta, **Empresa, Nome e E-mail já vêm preenchidos** com o que você digitou. Se o cliente tem Gmail, aparece em cima **"Tem Gmail? Ative em 1 clique"**.
4. Continue até a tela do cartão → **CPF e Telefone já vêm preenchidos** também. O cliente só completa o que faltar e digita o cartão.

## Implantação avisa o master sozinho
1. Feche uma venda preenchendo o campo **Implantação** (ex.: 500).
2. Entre no **Master** → janela **Pagamentos** → na lista de avisos tem que aparecer um **"Venda fechada COM implantação"** com o cliente, o plano e os valores. (Você não precisa que o vendedor te mande nada.)
3. (No servidor de verdade esse aviso também chega no seu **WhatsApp e e-mail**; no localhost fica só na lista.)
