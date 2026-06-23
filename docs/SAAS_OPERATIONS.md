# HBX — Panorama da Plataforma (Status & Funcionalidades)

> Documento de apresentação para leitura externa. Descreve **o que a plataforma faz e em que
> estágio está** — não a engenharia por trás. Atualizado em **23/06/2026**.

---

## 1. O que é o HBX

O HBX é uma plataforma SaaS de **aquisição e relacionamento com clientes para times de venda**.
Ele cobre o ciclo comercial inteiro num só lugar: **encontra** empresas com o perfil ideal,
**conversa** com elas de forma automática (principalmente por WhatsApp) e ajuda a **receber** —
com cobrança e recuperação de quem some. O objetivo de produto é direto: **mais conversas, menos
trabalho manual, mais recebimentos.**

A plataforma é multiempresa (cada cliente tem seu próprio espaço isolado), funciona no desktop e no
celular, e foi desenhada para operar com o mínimo de operação manual do dia a dia.

---

## 2. Os três pilares

| Pilar | Promessa | O que entrega |
|---|---|---|
| **Encontrar** (Radar) | "Mais clientes" | Descobre, todo dia, empresas e contatos com o perfil ideal do negócio do cliente, já validados e enriquecidos. |
| **Atender** (Atendimento) | "Atendimento até 100% automático" | Conversas no WhatsApp e em outros canais, no automático e com a identidade do cliente; follow-up inteligente 24/7. |
| **Receber** (Cobrança) | "Cobrança facilitada" | Cobra quem desaparece e aumenta as chances de o cliente receber pelo que vendeu. |

---

## 3. Para quem é — os papéis dentro da plataforma

A experiência muda conforme quem entra. São três visões, com narrativas próprias já na porta de
entrada (**Empresa × Vendedor**):

- **Empresa (administrador).** Enxerga o negócio inteiro: equipe, oportunidades, conversas,
  resultados, plano e cobrança. É quem configura e acompanha.
- **Vendedor (operador).** Vê só o que precisa para trabalhar: suas oportunidades, sua caixa de
  conversas e suas vendas. Nunca vê valores, plano ou assuntos financeiros — a experiência dele é
  100% operacional.
- **Master (operação HBX).** Painel de comando para administrar a plataforma como um todo:
  empresas atendidas, provisionamento, saúde do sistema e suporte.

---

## 4. Catálogo de funcionalidades

### 4.1 Radar de oportunidades
- Descoberta contínua de empresas e contatos pelo **perfil ideal** definido pelo cliente
  (segmento, região e outros critérios).
- **Validação e enriquecimento** dos dados antes de chegar ao operador: o lead chega pronto para
  falar com a pessoa certa, pelo canal certo.
- **Cards de oportunidade** com sinais de qualidade, melhor canal de contato sugerido e o porquê de
  cada oportunidade ser relevante.
- **Memória de leads:** o histórico de oportunidades é preservado — nada de retrabalho buscando o
  mesmo contato duas vezes.
- Capacidade de processamento **elástica**: a plataforma acelera quando há volume e recua quando
  não há, sem intervenção manual.

### 4.2 Atendimento & WhatsApp
- **Conexão de WhatsApp própria de cada vendedor** (um número por pessoa), com fluxo guiado de
  ativação.
- **Caixa de entrada unificada** das conversas, com modos de visão compartilhada (empresa) ou
  individual (cada vendedor vê só as suas).
- **Automação de atendimento (bot):** responde, contorna objeções e agenda — 24 horas por dia, com
  a "cara" do cliente. Há modos de configuração para diferentes estilos de atendimento e um **modo
  de teste** antes de colocar no ar.
- **Outros canais** de mensagem além do WhatsApp, integrados ao mesmo fluxo.
- Operação pensada para ser **estável e segura** com os números de WhatsApp dos clientes.

### 4.3 Vendas (CRM operacional)
- Tela de trabalho do vendedor com suas oportunidades e o andamento de cada negociação.
- Cadastro de **clientes, produtos e categorias** para apoiar a venda.
- Ligação direta entre a oportunidade encontrada no Radar e a conversa no Atendimento.

### 4.4 Financeiro & Cobrança
- **Cobrança facilitada** de clientes que somem, com lembretes e recuperação.
- Acompanhamento financeiro do que foi vendido e do que está por receber.
- Integração com **provedor de pagamento** para as cobranças.

### 4.5 Comissões
- Cálculo e acompanhamento de **comissões** da equipe de vendas.

### 4.6 Relatórios & Painel
- **Dashboard** com a visão consolidada do negócio.
- **Relatórios** de desempenho — conversas, vendas e recebimentos.

### 4.7 Gerencial
- Camada de administração da empresa para configurações e gestão de acesso de nível elevado.

### 4.8 E-mail
- Módulo de **e-mail** integrado à plataforma, disponível conforme o plano, sem exigir
  ferramenta externa.

### 4.9 Sites de clientes (Website Kit)
- A plataforma também entrega **sites prontos** para empresas clientes, cada um com painel próprio
  de administração de conteúdo (textos, imagens, vitrine) e, quando aplicável, **pagamento online**.

### 4.10 Integrações
- Captação de leads de **anúncios** (ex.: formulários de campanhas), que entram direto no fluxo de
  atendimento.
- Arquitetura preparada para conectar novos canais e provedores ao longo do tempo.

### 4.11 Onboarding & Tutorial
- Entrada guiada com **narrativas distintas para Empresa e Vendedor**.
- **Tutorial embutido por módulo** ("Como usar"), que orienta o usuário dentro de cada tela sem
  precisar de treinamento externo.
- Caminho de **autocontratação** (self-checkout) em construção, para o cliente assinar sozinho.

### 4.12 Painel Master (operação da plataforma)
- Visão e administração de **todas as empresas** atendidas.
- **Provisionamento** de novos clientes, suporte e acompanhamento de saúde do sistema.
- Concessão de acessos e cortesias de forma controlada.

---

## 5. Planos & modelo comercial

- **Planos escalonados** (linha de entrada → intermediário → completo), cada um liberando um
  conjunto de módulos e capacidades.
- O que cada plano libera é **definido centralmente** e pode ser ajustado por cliente — inclusive
  ativar módulos individuais conforme a necessidade.
- **Período de avaliação (trial)** e **cortesia** (liberação sem cobrança, com motivo e prazo) para
  casos específicos.
- O acesso é sempre coerente: um recurso pago só fica disponível com o plano/assinatura válidos, e
  o vendedor nunca é exposto a qualquer assunto de cobrança.

---

## 6. Experiência & Design

- **Identidade visual consistente** em toda a plataforma, com **modo claro e escuro** automáticos e
  diferentes "peles" (temas) disponíveis.
- **Responsivo:** funciona bem no desktop e no celular, com a mesma lógica de acesso nos dois.
- Telas pensadas para **caber na tela sem rolagem** no uso normal de desktop — leitura rápida e
  direta.
- Foco em **clareza para o operador**: quem não tem acesso a um módulo simplesmente não o vê,
  evitando confusão.

---

## 7. Plataforma & confiabilidade (visão de alto nível)

- **Hospedagem em nuvem**, com ambiente de produção separado do ambiente de desenvolvimento.
- **Isolamento entre empresas:** os dados de um cliente nunca se misturam com os de outro.
- **Envio de mensagens resiliente:** entregas com novas tentativas automáticas em caso de falha
  temporária.
- **Capacidade que se ajusta à demanda**, para sustentar volume sem desperdício.
- **Atualizações controladas:** o sistema é publicado de forma verificada, com checagens de saúde
  após cada atualização.

---

## 8. Status de maturidade

Legenda: 🟢 **Operacional** · 🟡 **Em validação** · 🔵 **Em desenvolvimento**

| Área | Status | Observação |
|---|---|---|
| Radar (descoberta + enriquecimento) | 🟢 | Em operação, com capacidade elástica ativa. |
| Atendimento / WhatsApp (conexão + caixa) | 🟢 | Em uso real por operador. |
| Automação de atendimento (bot, 3 modos) | 🟡 | Implementado; em rodada de testes antes do uso amplo. |
| Vendas / CRM | 🟢 | Operacional. |
| Financeiro & Cobrança | 🟡 | Operacional, com cobrança avulsa em ajuste fino. |
| Comissões | 🟢 | Operacional. |
| Relatórios & Dashboard | 🟢 | Operacional. |
| E-mail | 🟡 | Módulo ativo; integração de envio em evolução. |
| Sites de clientes (Website Kit) | 🟢 | Em uso por empresas clientes. |
| Integrações (anúncios/leads) | 🟡 | Disponível, em expansão de canais. |
| Painel Master | 🟢 | Operacional. |
| Autocontratação (self-checkout) | 🔵 | Em construção. |
| Tutorial por módulo | 🟡 | Em rollout, módulo a módulo. |

---

## 9. Próximos passos (roadmap de alto nível)

- Concluir a **autocontratação** ponta a ponta (o cliente assina e começa a usar sozinho).
- Ampliar a **automação de atendimento** para mais cenários e colocá-la no ar de forma ampla.
- Expandir **canais e integrações** de captação.
- Completar o **tutorial guiado** em todos os módulos.
- Evoluir os **relatórios** com mais visões de desempenho.

---

*HBX — encontrar, atender e receber, no automático. Documento de panorama; detalhes técnicos e
operacionais não fazem parte deste material.*
