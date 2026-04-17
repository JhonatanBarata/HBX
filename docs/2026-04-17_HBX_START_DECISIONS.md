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
