# HBX Start — decisões base (2026-04-17)

## 1. Cadastro inicial e trial

### Problema observado
- O cadastro inicial mistura conta física e jurídica sem deixar claro o papel real do cadastro dentro de um sistema multi-tenant.
- Quando duas empresas possuem o mesmo nome exibido, o MASTER duplica a leitura visual e a operação fica confusa.
- Trials gratuitos estão entrando como `USER`, e isso impede acesso a recursos críticos de ativação, como leitura de QR Code e uso do Webscraping.

### Diretriz de produto
- O sistema deve separar com clareza:
  - **Pessoa responsável pela conta** (usuário dono/admin)
  - **Empresa/tenant** (entidade operacional do sistema)
- O identificador operacional do tenant **não pode depender do nome fantasia exibido**.
- O nome exibido da empresa pode repetir; o MASTER deve diferenciar tenants por identificador interno e metadados operacionais.
- Free trial **não pode nascer capado a ponto de impedir ativação real**.

### Regra proposta
- Cadastro trial deve criar:
  - 1 usuário dono/admin
  - 1 empresa/tenant
- O usuário inicial do trial deve ter permissão suficiente para:
  - conectar WhatsApp por QR
  - usar Webscraping quando o módulo estiver liberado no trial
  - configurar bot inicial
  - configurar agenda inicial
- O trial pode ter limites comerciais, mas **não pode bloquear o setup principal do produto**.

### O que é erro grave
- Trial entrar como `USER` sem QR e sem Webscraping.
- Nome da empresa ser tratado como chave visual principal no MASTER.
- Misturar cadastro de pessoa com cadastro do tenant.

### Regra de UX
- A pergunta correta no cadastro não deve ser só `conta jurídica ou física`.
- O fluxo precisa primeiro definir:
  - quem está criando a conta
  - para qual empresa/operacao o sistema será usado
- Mesmo em operação individual/autônoma, o sistema continua criando um tenant.

### Conclusão
- O trial precisa ser uma experiência de ativação real.
- Se o cliente não consegue conectar, testar e operar sozinho no trial, o produto está sabotando a própria venda.

---

## 2. Passo 1 — fechar tela de cadastro/login

### Decisão principal
- O cadastro inicial deve ser radicalmente simples.
- **Não deve existir tipo de cadastro PF/PJ na entrada**.
- Na raiz do produto isso não muda o tenant nem a ativação inicial.

### Campos do cadastro inicial
Manter apenas:
- **Nome da empresa ou operação**
- **Email**
- **Senha**

Remover da tela inicial:
- **Tipo de cadastro (PF/PJ)**
- **Nome do responsável**
- **Campo separado de usuário/login**, se for possível usar o email como login

### Regras dos campos
#### Nome da empresa ou operação
- Trocar o rótulo de `Nome da empresa` para **`Nome da empresa ou operação`**.
- Texto de apoio sugerido:
  - `Esse nome identifica sua operação dentro do HBX. Ex.: Colsani Ar Condicionado`
- O nome exibido pode repetir entre tenants.
- O sistema deve criar internamente um identificador único do tenant, sem depender do nome visual.

#### Email
- Faz parte da ativação.
- Deve ser obrigatório.
- Deve virar o login principal do sistema, sempre que possível.

#### Senha
- Não aceitar senha curta demais.
- Regra mínima inicial:
  - **mínimo de 8 caracteres**
- Não usar regra fraca de 4 caracteres.

### Trial e módulos iniciais
- No trial inicial, o foco não é Recovery.
- **Recovery deve sair da entrada principal do trial**.
- Se ainda precisar existir por arquitetura:
  - deixar **`Em breve`** e **inclicável**
- Melhor decisão para agora:
  - **remover da experiência inicial do trial**, para reduzir ruído

### Webscraping e QR
- O trial precisa permitir ativação real.
- O usuário dono/admin criado no cadastro deve conseguir:
  - ler QR Code
  - configurar o começo do fluxo
  - usar Webscraping, se esse módulo fizer parte da proposta ativa do trial

### Sobre indicação / bônus de trial
- A lógica de indicação com recompensa (`indicou = +1 mês trial`, por exemplo) pode existir depois.
- **Não deve entrar agora na tela inicial**.
- Isso é crescimento e boca a boca, não ativação principal.
- Melhor deixar fora do Passo 1 e tratar depois no MASTER / growth flow.

### Conclusão do passo 1
- A tela de cadastro/login deve parar de tentar explicar estrutura interna.
- Ela precisa apenas fazer o cliente entrar rápido, criar o tenant certo e começar a ativação sem ruído.

---

## 3. Cobrança por usuários (assentos)

### O que o repo já mostra
- Admin da empresa já consegue criar usuários da própria empresa.
- O backend já trata limite de usuários ativos no trial.
- O cálculo atual olha para **usuários ativos** (`isActive = true`) e não para usuários históricos.
- No trial, o limite atual já está em **2 usuários ativos por empresa**.

### Diretriz
- O HBX deve cobrar por **assento ativo**, não por total histórico de usuários.
- Usuário desativado não deve continuar consumindo assento pago.
- Histórico continua preservado sem virar custo recorrente por cabeça inativa.

### Regra de produto recomendada
#### Trial
- Trial inclui **até 2 usuários ativos**.
- Se atingir o limite, admin não cria o terceiro sem migrar para plano pago.

#### Plano pago inicial
- Plano base inclui **2 usuários ativos**.
- Usuários adicionais entram como **assentos extras**.
- Fórmula simples:
  - `plano base + quantidade de assentos extras ativos`

### O que conta como assento cobrável
Contar como assento:
- usuário com `companyId` da empresa
- `isActive = true`
- não ser `isSystemMaster`

Não contar como assento:
- usuários desativados
- usuários master do sistema
- histórico retido para auditoria

### Regra importante
- **Não cobrar por role agora**.
- `USER` e `ADMIN` custam o mesmo no começo.
- Cobrar diferente por tipo de role agora só vai complicar faturamento, UX e suporte.

### Melhor modelo para início
- **1 preço base por empresa**
- **2 usuários inclusos**
- **valor fixo por usuário ativo extra**

### O que NÃO fazer agora
- não criar cobrança por role
- não criar pacote diferente por usuário de módulo X ou Y
- não cobrar por usuário inativo/histórico
- não misturar seat billing com lógica de indicação logo no começo
- não criar fórmula maluca de plano + módulo + seat + automação + uso em uma pancada só

### Regra operacional
- Se a empresa reduzir assentos pagos, o sistema deve exigir que ela fique dentro do novo limite por meio de desativação de usuários.
- Não apagar usuário para reduzir custo.
- Apenas desativar e preservar histórico.

### Regra de UX / cobrança
No futuro, a empresa deve enxergar algo simples como:
- `Plano atual: inclui 2 usuários`
- `Usuários ativos: 4`
- `Usuários extras cobrados: 2`

### Conclusão
- A cobrança de usuários no HBX deve nascer como **seat billing por usuário ativo**.
- O repo já está muito mais perto disso do que de qualquer outro modelo.
- O erro seria inventar cobrança complexa antes de consolidar esse básico.

---

## 4. Simplificação de papéis

### Decisão
- O HBX Start deve ter apenas **2 papéis**:
  - `ADMIN`
  - `USER`
- **`GERENTE` deve sair da equação**.

### Motivo
- Se a proposta agora é simplificar, manter `GERENTE` só aumenta:
  - confusão de permissão
  - complexidade de cobrança
  - complexidade de UI
  - chance de regra quebrada no bot, agenda, módulos e cadastro

### Regra recomendada
#### ADMIN
- cria usuários
- gerencia módulos da empresa
- controla QR e ativação inicial
- controla quem pode usar módulos sensíveis, como Webscraping
- enxerga cobrança e consumo

#### USER
- usa o sistema conforme acessos liberados
- não administra conta da empresa
- não controla cobrança

### Regra importante
- Webscraping **não deve depender do papel ADMIN por si só**.
- Webscraping deve seguir:
  - direito da empresa ao módulo
  - permissão do usuário ao módulo
  - limite/cota disponível
- Porém, no começo, o padrão pode ser:
  - ADMIN inicial com acesso
  - USER sem acesso por padrão

### Conclusão
- Sim, a simplificação correta é matar `GERENTE` agora.
- O repo hoje ainda carrega `GERENTE` em controller e validações, mas a direção do produto deve passar a ser só `ADMIN` e `USER`.
