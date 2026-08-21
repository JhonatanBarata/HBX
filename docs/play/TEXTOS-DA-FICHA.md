# TEXTOS DA FICHA — página "Detalhes do app" (pt-BR, idioma padrão)

> Console → **Aumentar número de usuários → Presença na loja → Página "Detalhes do app"**
> (o painel também chega aqui por *Ver etapas → Configurar a página "Detalhes do app"*).
> Conferido contra `versionName 1.0.0` / `br.com.hbxsystem.logistica` em 21/08/2026.
> 🔴 **Nada aqui pode contradizer** a Segurança de dados, a Classificação de conteúdo
> nem a política em `hbxsystem.com.br/politicas`. A Play cruza os textos.

---

## 1. Nome do app — 13/30

```
HBX Logística
```

Bate com o `hbxAppLabel` do flavor (`build.gradle.kts:262`). **Não** trocar por
"HBX Logística: rota e entrega" (29/30): ganha-se palavra-chave e perde-se a
igualdade com o rótulo do launcher — e a política de metadados trata nome de ficha
diferente do nome instalado como sinal de aviso. Para um app B2B que não vive de
busca na loja, o ganho de ASO é perto de zero e o risco não é.

---

## 2. Breve descrição — 75/80

```
Rota do dia, navegação, registro de entrega e fechamento do caixa na porta.
```

Sem "grátis", sem superlativo, sem emoji — os três motivos mais comuns de rejeição
por metadados. Diz o fluxo inteiro em uma linha, que é o que aparece na busca.

### Alternativas medidas (se quiser trocar)
| Texto | Nº |
|---|---|
| `Monte a rota, dirija, registre a entrega e feche o dia. Para distribuidoras.` | 76 |
| `App de entrega para distribuidoras: rota otimizada, navegação e fechamento.` | 75 |

---

## 3. Descrição completa — 3.031/4.000

```
O HBX Logística é o aplicativo de rota e entrega da plataforma HBX. Ele acompanha
o entregador do primeiro ao último cliente do dia: monta a sequência de paradas,
guia até a porta, registra o que foi entregue e fecha o caixa no fim da jornada.

O DIA INTEIRO, NA ORDEM EM QUE ELE ACONTECE

• Clientes do dia — a carteira já vem separada pelos dias de entrega de cada
  cliente, com endereço, telefone e histórico de compras.
• Montagem da rota — a lista nasce ordenada a partir de onde você está e o
  servidor refina a sequência pelas ruas. Dá para arrastar e mudar a ordem na mão,
  encaixar um cliente novo no meio do trajeto e salvar a rota para reusar.
• Modo dirigir — tela cheia com instrução de curva, distância, velocidade e
  previsão de chegada, com aviso automático quando o veículo chega ao cliente.
• Entrega na porta — confirme os itens, informe se o cliente pagou em dinheiro,
  Pix, cartão ou ficou marcado, e conte os vasilhames vazios que voltaram.
• Fechamento do dia — quanto entrou, quantos clientes foram atendidos e o que
  ficou para amanhã, em uma tela só.

TAMBÉM DENTRO DO APP

• Ficha completa do cliente, com histórico de entregas e produtos vinculados.
• Controle de vasilhame: quantos cascos estão na rua e com quem.
• Busca por voz nos campos de pesquisa.
• Recados da central e conversa com a equipe da própria empresa.
• Cadastro de clientes em massa: fotografe sua folha de clientes e nossa equipe
  digita a lista no seu sistema.
• Trajeto percorrido registrado por rota, para conferir a entrega depois.

CONHEÇA SEM TER DADOS CADASTRADOS

Ao entrar pela primeira vez, o aplicativo abre em modo demonstração, com clientes
de exemplo no seu próprio bairro. Dá para montar uma rota, dirigir e fechar o dia
sem cadastrar nada. A demonstração vive só no aparelho e some quando você desliga.

PARA QUEM É

Distribuidoras e revendas que entregam na porta do cliente — água mineral, gás,
bebidas, hortifrúti, alimentos, materiais e serviços com rota fixa.

USO DA LOCALIZAÇÃO

A localização precisa é usada enquanto uma rota está em andamento, para navegar,
avisar a chegada e registrar o trajeto daquela rota. Nesse período o aplicativo
mantém uma notificação permanente na barra, porque o acompanhamento continua com a
tela apagada ou com você usando outro aplicativo. O serviço para sozinho quando a
rota é encerrada ou cancelada. O aplicativo não coleta localização em segundo
plano e não registra sua posição fora de uma rota ativa.

CONTA E ACESSO

O acesso é feito com uma conta Google. O aplicativo é uma ferramenta de trabalho
usada por empresas: os clientes, produtos e entregas pertencem à empresa em que
você trabalha, e o trajeto das rotas fica visível para ela.

Não há compras dentro do aplicativo e não há anúncios. Os botões de forma de
pagamento apenas registram como o cliente pagou ao entregador — nenhum pagamento
é processado pelo aplicativo.

Política de privacidade: hbxsystem.com.br/politicas
Exclusão de conta e dados: hbxsystem.com.br/excluir-conta
Suporte: hbxsystem.com.br
```

---

## 4. O que NÃO colocar (e por quê)

- **Nenhuma menção a "Google Play", "Play Store" ou logotipo da Google** no corpo do
  texto: usar marca de terceiro na ficha é item da política de metadados.
- **Sem "teste", "beta", "alpha", "em desenvolvimento"** — a mesma pergunta de
  *production readiness* que fez o `versionName` sair de `alpha1`.
- **Sem preço, sem promoção, sem "grátis"** e sem depoimento de cliente.
- **Sem lista de palavra-chave repetida** ("entrega entrega delivery rota rota").
- **Sem promessa de recurso que o revisor não consegue ver** com a conta nova dele.
  Tudo o que está no texto acima existe na demonstração ou na primeira tela.

## 5. Coerência obrigatória com os outros formulários

| Frase da descrição | Tem que bater com |
|---|---|
| "registrar o trajeto daquela rota" | Segurança de dados: **localização precisa coletada, NÃO efêmera** |
| "fica visível para a empresa em que você trabalha" | Classificação: **compartilha localização com outros usuários = Sim** |
| "conversa com a equipe" / "recados" | Classificação: **permite comunicação entre usuários = Sim** |
| "fotografe sua folha de clientes" | Segurança de dados: **Fotos + Arquivos e documentos = coletados** |
| "não há compras dentro do aplicativo" | Recursos financeiros: **Nenhum** · Compras digitais: **Não** |
| "não há anúncios" | Anúncios: **Não contém anúncios** |
| "notificação permanente… tela apagada" | Serviço em primeiro plano: **Localização**, com o vídeo |

## 6. Traduções

**Não use "Importar traduções com IA" agora.** O app é vendido no Brasil, para
distribuidora brasileira; cada idioma adicionado é mais texto para a revisão cruzar
e mais lugar onde uma frase traduzida errado contradiz a Segurança de dados. Se um
dia entrar inglês, ele entra revisado à mão.
