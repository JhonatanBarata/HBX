# PLAY-GUIA-DONO — Publicar o HBX na Google Play (teste fechado), do zero

Guia pra executar SOZINHO, etapa por etapa, sem nunca ter usado a Play Console.
Tudo que é resposta de formulário está em bloco de texto pronto pra copiar e colar.
Console: https://play.google.com/console

---

## Antes de começar — o que precisa estar PRONTO (dependências)

| # | Item | Quem entrega | Como conferir |
|---|------|--------------|---------------|
| 1 | `.aab` assinado, `applicationId br.com.hbxsystem`, targetSdk 35 | frente do shell (EntregaShell) | arquivo em `EntregaShell/app/build/outputs/bundle/release/app-release.aab` |
| 2 | Modo-shell escondendo TODA compra de créditos (5 superfícies da AUDITORIA-PLAY §7) | frente do front | abrir o app no celular: Configurações→Créditos sem vitrine/preço/CTA |
| 3 | Páginas públicas no ar: `https://www.hbxsystem.com.br/politicas` e `https://www.hbxsystem.com.br/excluir-conta` | já no código — falta VOCÊ publicar (`npm run publish`) | abrir as 2 URLs no navegador anônimo, sem login |
| 4 | Arte: ícone 512×512 e feature graphic 1024×500 (specs na Etapa 2) | você / designer | arquivos no PC |
| 5 | Cartão de crédito internacional (taxa única de US$ 25) e documento de identidade (CNH ou RG) | você | — |
| 6 | Lista com os e-mails DE CONTA GOOGLE dos vendedores (mínimo 12 contas distintas) | você | planilha/nota com os e-mails |

---

## ETAPA 0 — Criar a conta de desenvolvedor (1x na vida)

1. Acesse https://play.google.com/console/signup logado no Google que será o dono da conta (sugestão: um Google da empresa que você não perde, não o pessoal do dia a dia).
2. Escolha **"Você mesmo" (conta pessoal)**.
3. Preencha nome legal (como no documento), endereço, telefone. O telefone e o e-mail passam por verificação (código SMS/e-mail).
4. Pague a **taxa única de US$ 25** no cartão.
5. **Verificação de identidade**: envie foto da CNH ou RG quando o Console pedir. Costuma sair em 1–2 dias úteis (pode levar mais). Você recebe e-mail quando aprovar.
6. Só depois da verificação aprovada dá pra criar app.

> **Atenção (conta pessoal):** a Play mostra o seu NOME LEGAL como desenvolvedor na ficha do app, e conta pessoal criada depois de nov/2023 é OBRIGADA a rodar teste fechado com **12 testers por 14 dias corridos** antes de poder publicar em produção (Etapas 7 e 8 cobrem isso).

### Box — alternativa: conta de ORGANIZAÇÃO (avaliar antes de pagar)

| | Pessoal | Organização |
|---|---|---|
| Exige | documento pessoal | **CNPJ + número D-U-N-S** + e-mail/telefone/site da empresa |
| Verificação | 1–2 dias | mais lenta (D-U-N-S pode levar até 30 dias se ainda não existir — pedir grátis em dnb.com) |
| Nome na loja | seu nome legal | razão social/nome da empresa |
| Teste fechado obrigatório | **SIM: 12 testers × 14 dias** | **NÃO — dispensada** (pode ir direto pedir produção) |

Trade-off honesto: se o CNPJ da HBX já existe E você consegue o D-U-N-S rápido, a conta de organização **pula os 14 dias de espera** e fica com o nome da empresa na loja. Se o D-U-N-S ainda não existe, a espera do D-U-N-S costuma ser MAIOR que os 14 dias do teste — nesse caso, siga com a conta pessoal e use os vendedores como testers (o teste fechado com a equipe é útil de qualquer forma: valida o app em aparelho real antes de qualquer cliente ver).

---

## ETAPA 1 — Criar o app no Console

1. Console → **Todos os apps** → botão **"Criar app"**.
2. Preencha exatamente:
   - **Nome do app:** `HBX`
   - **Idioma padrão:** `Português (Brasil) – pt-BR`
   - **App ou jogo:** `App`
   - **Gratuito ou pago:** `Gratuito` (não dá pra mudar de gratuito pra pago depois — pra nós é gratuito mesmo)
3. Marque as 2 declarações (Políticas do Programa pra Desenvolvedores e leis de exportação dos EUA) → **Criar app**.

O Console abre o **Painel** com a lista "Configure seu app" — as Etapas 2 a 6 percorrem essa lista.

---

## ETAPA 2 — Ficha da loja (Presença na loja principal)

Caminho: menu lateral → **Aumentar o número de usuários → Presença na loja principal → Ficha da loja principal**.

1. **Textos**: copie tudo de `docs/PLANEJAMENTOS/RELEASE-20X/STORE-LISTING.md` (nome, descrição curta, descrição longa). Cole sem alterar — os textos foram escritos pra NÃO citar preço/compra (regra de billing da Play).
2. **Detalhes de contato** (em Configurações da loja): e-mail `jhonatan@hbxsystem.com.br` (fica público), site `https://www.hbxsystem.com.br`.
3. **Categoria** (em Configurações da loja → Categoria do app): `Negócios`. Sem anúncios.

### Assets gráficos (specs exatas)

| Asset | Spec | O que mostrar |
|-------|------|----------------|
| Ícone do app | **512×512 px**, PNG 32 bits (com transparência ok), até 1 MB | logo HBX centralizado sobre fundo sólido escuro da marca; sem texto pequeno; a Play recorta em círculo — deixe margem |
| Feature graphic | **1024×500 px**, PNG ou JPEG **sem transparência** | logo HBX + uma linha "CRM, WhatsApp e entregas" sobre fundo da marca; nada de print de tela apertado, nada de preço |
| Screenshots de telefone | **mínimo 2** (recomendo 4–6), PNG/JPEG, retrato, mínimo 320 px e máximo 3840 px no maior lado (padrão: 1080×1920 ou a resolução nativa do aparelho) | roteiro abaixo |

### Roteiro dos screenshots (capturar no aparelho, com a EMPRESA DEMO da Etapa 6 — nunca dados de cliente real)

Como capturar no Android: abrir a tela desejada no app instalado → apertar **Liga/Desliga + Volume-baixo** juntos → a imagem fica em Fotos/Screenshots → passar pro PC.

1. Tela de entrada do app (login/landing).
2. Radar de leads (lista de oportunidades).
3. Tela de rota/entrega (mapa/paradas do módulo de entregas).
4. Card de cliente (cadastro com telefone/endereço).

**Checagem antes de subir:** nenhum screenshot pode mostrar preço de crédito, botão de recarga ou tela de pagamento (no modo-shell essas superfícies já ficam escondidas — se aparecer alguma, PARE e avise o dev antes de continuar).

---

## ETAPA 3 — Questionários (Conteúdo do app)

Caminho: menu lateral → **Política → Conteúdo do app**. Preencher item por item:

### 3.1 Política de privacidade
```
https://www.hbxsystem.com.br/politicas
```

### 3.2 Anúncios
- "Seu app tem anúncios?" → **Não**

### 3.3 Classificação de conteúdo (questionário IARC)
- E-mail de contato: `jhonatan@hbxsystem.com.br`
- Categoria do questionário: **"Todos os outros tipos de app"** (utilitário/produtividade/negócios)
- Violência: **Não** · Sexualidade: **Não** · Linguagem imprópria: **Não** · Drogas/álcool/tabaco: **Não** · Apostas/cassino: **Não** · Conteúdo assustador: **Não**
- "O app permite que usuários interajam ou troquem conteúdo (chat, mensagens)?" → **Sim** (o usuário conversa com os clientes dele via WhatsApp) — isso NÃO muda a classificação livre, só adiciona o aviso "Interação de usuários".
- "Compartilha localização do usuário com outros usuários?" → **Não**
- Resultado esperado: **Livre (L) / Everyone**.

### 3.4 Público-alvo e conteúdo
- Faixa etária: marcar somente **18 anos ou mais**.
- "O app pode atrair crianças sem querer?" → **Não**.
(Não marcar nenhuma faixa infantil — isso evita todo o pacote de exigências de apps para famílias.)

### 3.5 App de notícias → **Não** · App governamental → **Não** · Recursos financeiros → **"Meu app não oferece nenhum dos recursos financeiros listados"** (o HBX não empresta, não é banco, não é corretora) · Apps de saúde → **Não**

### 3.6 Segurança dos dados (Data Safety) — ITEM POR ITEM

Perguntas gerais:
- "Seu app coleta ou compartilha algum dos tipos de dados do usuário?" → **Sim**
- "Todos os dados do usuário coletados pelo app são criptografados em trânsito?" → **Sim**
- "Você oferece uma forma de o usuário solicitar a exclusão dos dados?" → **Sim** → URL:
```
https://www.hbxsystem.com.br/excluir-conta
```

Tipos de dados — marcar EXATAMENTE estes:

| Tipo de dado | Coletado? | Compartilhado? | Processado de forma efêmera? | Obrigatório ou opcional? | Finalidade |
|---|---|---|---|---|---|
| **Localização → Local exato** | Sim | Não | Não | Obrigatório (dentro da função de rota não há escolha; fora da rota o app nem coleta) | Funcionalidade do app |
| **Informações pessoais → Nome** | Sim | Não | Não | Obrigatório | Funcionalidade do app, Gerenciamento da conta |
| **Informações pessoais → E-mail** | Sim | Não | Não | Obrigatório | Funcionalidade do app, Gerenciamento da conta |
| **Informações pessoais → Número de telefone** | Sim | Não | Não | Obrigatório | Funcionalidade do app, Gerenciamento da conta |
| **Informações pessoais → Endereço** | Sim | Não | Não | Opcional (é o endereço dos CLIENTES que o usuário cadastra pra entrega) | Funcionalidade do app |
| **Mensagens → Outras mensagens no app** | Sim | Não | Não | Opcional (só se o usuário conectar o WhatsApp dele) | Funcionalidade do app |

O que **NÃO** declarar (não marcar nada):
- **Áudio/gravações de voz** → NÃO é coletado: a confirmação por voz (se ativa) é processada no próprio aparelho e nada de áudio sobe pro servidor. (Se a validação em aparelho mostrar que a voz nem funciona no app, a permissão de microfone sai do app e o assunto morre.)
- **Informações financeiras** → NÃO: pagamento acontece fora do app, no ambiente do Mercado Pago; o app não vê cartão.
- **Histórico de navegação, contatos do aparelho, fotos, arquivos, IDs de dispositivo** → NÃO coletados.

Observação: declarar a localização como "coletada" é a escolha conservadora e segura — o app pede a permissão de localização precisa e roda serviço de localização em primeiro plano; declarar menos do que o revisor enxerga no APK é o que gera reprovação.

---

## ETAPA 4 — Declarações de permissão (aparecem DEPOIS do 1º upload do .aab)

Estes formulários só destravam quando um `.aab` que usa as permissões já foi enviado (Etapa 7). Volte aqui depois do upload — o Console aponta pendências em **Política → Conteúdo do app**.

### 4.1 Serviço em primeiro plano — LOCALIZAÇÃO (Foreground Service location)

Justificativa — colar isto:
```
O HBX usa um serviço de localização em primeiro plano apenas no módulo de
entregas: quando o entregador toca em "Iniciar rota", o app acompanha a posição
do aparelho para navegar até as paradas e avisar a chegada ao destino, exibindo
notificação persistente durante todo o rastreio. O rastreio começa somente por
ação explícita do usuário, roda apenas em primeiro plano (o app não solicita
ACCESS_BACKGROUND_LOCATION), é encerrado quando o usuário finaliza a rota e a
posição não é compartilhada com terceiros.
```

**Vídeo obrigatório (30–60s)** — gravar a tela do celular (a gravação de tela nativa do Android serve), subir no YouTube como **"Não listado"** e colar o link no formulário. Roteiro:
1. Abrir o app HBX já logado (conta demo) e entrar no módulo de entregas. (~10s)
2. Tocar em **Iniciar rota** com 2–3 paradas. (~10s)
3. Puxar a barra de notificações e mostrar a **notificação persistente** da rota ativa. (~10s)
4. Mostrar a navegação abrindo (mapa) e o alerta de chegada. (~15s)
5. Encerrar a rota e mostrar que a notificação some. (~10s)

### 4.2 Intent de tela cheia (Full-screen intent)

Justificativa — colar isto:
```
O app usa full-screen intent exclusivamente para o alerta de chegada ao destino
durante uma rota de entrega ativa — notificação sensível ao tempo, análoga a
apps de navegação e delivery. O alerta só ocorre em rota iniciada pelo próprio
usuário e possui fallback de notificação heads-up quando a permissão não está
concedida.
```

### 4.3 Outras permissões do app (não têm formulário próprio, só consistência)
- `RECORD_AUDIO` (microfone): sem declaração no Console; coberto na política de privacidade e fora do Data Safety (processado no aparelho). Se a voz não passar na validação em aparelho, a permissão SAI do app antes do upload.
- `SYSTEM_ALERT_WINDOW` (sobrepor tela): sem formulário; se a revisão questionar, a resposta é a mesma do 4.2 (alerta de chegada, com fallback quando negada).
- **NÃO existe** `ACCESS_BACKGROUND_LOCATION` no app — se qualquer formulário perguntar sobre localização em segundo plano, a resposta é **"o app não usa"**.

---

## ETAPA 5 — URLs públicas exigidas

| Formulário | URL |
|---|---|
| Política de privacidade (Conteúdo do app) | `https://www.hbxsystem.com.br/politicas` |
| Exclusão de conta (Data Safety) | `https://www.hbxsystem.com.br/excluir-conta` |

Antes de preencher: abrir as duas em **aba anônima** (sem login) e conferir que carregam. Se der 404, falta publicar o site (`npm run publish`).

---

## ETAPA 6 — Conta demo pro revisor (Acesso ao app)

O revisor do Google precisa entrar no app e exercitar a rota (é ele quem valida o vídeo da Etapa 4). Roteiro pra criar a conta no sistema REAL:

1. Crie uma empresa nova no HBX (cadastro normal): nome **"HBX Demo"**.
2. Ative o **módulo de logística/entregas** pra essa empresa (pelo Master).
3. Crie um usuário dedicado **SEM privilégio master** (perfil comum da empresa demo): e-mail sugerido `demo.play@hbxsystem.com.br`, senha forte anotada no seu gerenciador (essa credencial vai escrita no formulário do Google — não reutilize senha de nada).
4. Cadastre **2–3 clientes fictícios** com endereço real de rua (ex.: pontos comerciais públicos da sua cidade) e **1 rota de exemplo** montada com eles.
5. Deixe créditos/cota suficientes na empresa demo pro revisor mexer sem travar em bloqueio.

No Console: **Política → Conteúdo do app → Acesso ao app** → "Todo ou parte do app tem acesso restrito" → **Adicionar instruções**:

```
Usuário: demo.play@hbxsystem.com.br
Senha: [COLE AQUI A SENHA CRIADA]

Como testar:
1. Abra o app e entre com as credenciais acima.
2. No menu, abra o módulo "Entregas".
3. Toque em "Iniciar rota" para ver o rastreio de localização em primeiro
   plano com notificação persistente (rota de exemplo já cadastrada com
   2-3 paradas).
4. O alerta de chegada dispara ao se aproximar do endereço da parada.
5. Ao final, toque em "Encerrar rota" — o rastreio e a notificação param.
Os demais módulos (clientes, vendas, atendimento) ficam no menu principal.
```

**Não apague nem mexa nessa empresa demo enquanto o app estiver em revisão** — o revisor pode entrar a qualquer momento.

---

## ETAPA 7 — Teste fechado (o coração do processo)

### 7.1 Criar a faixa e subir o .aab
1. Menu lateral → **Testar e lançar → Teste → Teste fechado** → faixa padrão **"Alfa"** → **Gerenciar faixa**.
2. Aba **Versões** → **Criar nova versão**.
3. **Assinatura**: aceite o **Play App Signing** (opção padrão "Usar chave gerada pelo Google") — é o cofre da chave; sem drama.
4. **Upload**: arraste o arquivo `.aab` do PC — caminho no repo:
```
EntregaShell\app\build\outputs\bundle\release\app-release.aab
```
5. Notas da versão: copiar de `STORE-LISTING.md` (seção Release notes).
6. **Salvar** → **Avaliar versão** → **Iniciar lançamento pra Teste fechado**.

### 7.2 Lista de testers
1. Ainda na faixa: aba **Testers** → **Criar lista de e-mails** → nome `Vendedores HBX`.
2. Cole os e-mails **das CONTAS GOOGLE** dos vendedores (o e-mail que cada um usa na Play Store do celular — se o cara usa Gmail pessoal no aparelho, é ESSE que entra na lista). **Mínimo 12 contas distintas** — coloque 14–15 se tiver, pra sobrar folga se alguém desistir.
3. Salvar, marcar a lista na faixa, e em **"Feedback dos testers"** colocar `jhonatan@hbxsystem.com.br`.
4. Copie o **link de adesão (opt-in)** que aparece em "Como os testers entram no teste" (fica disponível quando o lançamento da 7.1 estiver no ar — pode levar algumas horas na primeira vez).

### 7.3 Mensagem pro grupo dos vendedores (copiar/colar)
```
Equipe: vamos testar o app HBX oficial da Play. Cada um faz UMA VEZ:
1. Abra este link NO CELULAR, logado na conta Google que você me passou:
   [COLE AQUI O LINK DE ADESAO]
2. Toque em "ACEITAR O CONVITE" (vira tester).
3. Na mesma página, toque no link da Play Store e INSTALE o app.
4. Use o app normalmente TODOS OS DIAS por 2 semanas (abrir, olhar leads,
   clientes, rota). NAO desinstale e NAO saia do teste nesse período.
Qualquer erro que aparecer, manda print aqui no grupo.
```

### 7.4 A regra dos 14 dias (conta pessoal)
- Exigência do Google: **12 testers aderidos (opt-in) de forma CONTÍNUA pelos últimos 14 dias corridos** antes de poder pedir produção.
- **O que conta como tester válido:** aceitou o convite pelo link E mantém a adesão (não saiu do teste). Se cair pra 11 aderidos, o relógio **reinicia** — por isso a folga de 14–15 na lista. Google também olha engajamento: oriente todo mundo a **instalar e abrir o app várias vezes por semana** (uso real, não só instalar e esquecer).
- **Onde acompanhar:** Console → **Painel** → seção **"Publicar seu app em produção"** (aparece pra conta pessoal): mostra quantos testers válidos você tem e há quantos dias. É esse contador que precisa fechar 12+ por 14 dias.

---

## ETAPA 8 — Depois dos 14 dias: pedir produção

1. Console → Painel → **"Solicitar acesso à produção"** (o botão só ativa com o critério dos 14 dias cumprido).
2. O formulário faz perguntas sobre o teste — respostas sugeridas (adapte com seus números reais):

Sobre o teste fechado:
```
O teste fechado rodou com [N] testers, todos vendedores e entregadores da
nossa própria operação, usando o app diariamente em trabalho real: consulta
de leads no radar, cadastro e atendimento de clientes e execução de rotas de
entrega com o rastreio em primeiro plano. O feedback foi coletado por grupo
de WhatsApp e e-mail. Principais ajustes feitos durante o teste: [cite 2-3
correções reais, ex.: correção de tela X no Android Y, ajuste de notificação
de chegada, melhoria de desempenho do mapa].
```

Sobre o app e o público:
```
O HBX é um app de gestão comercial (CRM) para pequenas empresas brasileiras:
prospecção de clientes, atendimento via WhatsApp e logística de entregas.
O público são equipes de vendas e entregadores das empresas clientes.
Consideramos o app pronto para produção porque o teste cobriu os fluxos
principais em aparelhos e condições reais de uso por duas semanas, sem
falhas críticas pendentes.
```

3. Enviado o formulário, o Google responde (dias). Aprovado o acesso: **Produção → Criar nova versão** → subir o mesmo `.aab` (ou build mais novo) → países: **Brasil** → lançar.
4. A revisão final de produção pode levar de horas a ~7 dias (app novo com localização em primeiro plano costuma demorar mais — o vídeo da Etapa 4 já responde a maioria das perguntas).

---

## CHECKLIST DE 1 PÁGINA (imprimir e riscar)

**Preparo**
- [ ] `.aab` gerado e assinado (`br.com.hbxsystem`, targetSdk 35)
- [ ] Compra de créditos INVISÍVEL no app (conferido no celular)
- [ ] `/politicas` e `/excluir-conta` abrindo sem login (aba anônima)
- [ ] Ícone 512×512 + feature graphic 1024×500 prontos
- [ ] 4–6 screenshots capturados (empresa demo, sem tela de pagamento)
- [ ] Lista com 14–15 e-mails de conta Google dos vendedores

**Conta (Etapa 0)**
- [ ] Conta criada (pessoal) + US$ 25 pagos
- [ ] Identidade verificada (e-mail de aprovação recebido)

**App (Etapas 1–2)**
- [ ] App criado: HBX · pt-BR · App · Gratuito
- [ ] Ficha da loja: textos do STORE-LISTING.md colados
- [ ] Assets enviados (ícone, feature graphic, screenshots)
- [ ] Contato: jhonatan@hbxsystem.com.br + site

**Formulários (Etapas 3–6)**
- [ ] Política de privacidade: URL preenchida
- [ ] Anúncios: Não
- [ ] Classificação de conteúdo: Livre (questionário enviado)
- [ ] Público-alvo: 18+
- [ ] Notícias/Governo/Financeiro/Saúde: Não / nenhum
- [ ] Data Safety: tabela da Etapa 3.6 preenchida + URL de exclusão
- [ ] Conta demo criada (demo.play@…) + instruções em Acesso ao app

**Upload e declarações (Etapas 4 e 7)**
- [ ] Faixa Teste fechado criada + .aab enviado + lançamento iniciado
- [ ] Declaração Foreground Service location + vídeo (YouTube não listado)
- [ ] Declaração Full-screen intent
- [ ] Lista de testers criada e marcada na faixa
- [ ] Link de adesão copiado e mandado no grupo com a mensagem pronta

**Os 14 dias (Etapa 7.4)**
- [ ] 12+ testers aceitaram o convite e instalaram
- [ ] Todo mundo usando o app (cobrar no grupo 2x por semana)
- [ ] Contador do Painel fechou 14 dias contínuos com 12+

**Produção (Etapa 8)**
- [ ] Formulário de acesso à produção enviado
- [ ] Acesso aprovado → versão de produção criada (Brasil)
- [ ] App APROVADO e no ar
