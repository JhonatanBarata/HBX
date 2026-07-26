# LISTA DE TESTES — Logística ponta a ponta (26/07)

Roteiro do dono no aparelho. Marcar ✅/❌ e anotar o que estranhar.
⚠️ Antes de começar: "Avisar chegada" manda zap DE VERDADE pro cliente — teste com cliente seu.

## 1. MONTAR ROTA (todos os tipos)
- [ ] Play → Montar Rota → **Hoje**: gera as paradas do dia (contagem do chip = lista)
- [ ] **Agenda**: escolher 1 dia · vários dias · contagem por dia aparece · buscar cliente na prévia
- [ ] Sequência: **Ordem do app** · **Minha ordem** (▲▼ manual) · **Rota salva** · "salvar como minha rota"
- [ ] **Rotas salvas**: gerar por uma · editar (adicionar/remover parada, itens, ▲▼) · excluir SEGURANDO
- [ ] **Leitura de Rota** (GPS em campo): iniciar · parada com cliente NOVO · com cliente EXISTENTE · remover parada segurando · finalizar e salvar com nome
- [ ] **Entrega avulsa**: com cliente já cadastrado · com nome avulso novo
- [ ] 🆕 **CONFERÊNCIA (ligada hoje)**: ao planejar abre a conferência — semáforo por parada · resolver pendência por cima · pausar · **preview de créditos** · aprovar → a rota iniciada é EXATAMENTE a aprovada
- [ ] **Limpar o dia** e regerar: contador volta certo (não "some" o dia)

## 2. USANDO A ROTA (tudo)
- [ ] Iniciar rota: som toca **1x** · mapa com pinos numerados · linha da rota
- [ ] Painel **próxima parada**: distância viva · contagem de 5s abre a folha
- [ ] **Navegação interna**: instruções na tela · **voz** falando · botão mudo · recálculo ao sair do caminho
- [ ] Navegar por fora: **Waze / Google Maps** abrem no destino certo
- [ ] **Chegada automática** (entrar no raio): aviso "Você chegou" + folha abre sozinha
- [ ] Folha de chegada nos 3 modos: **sem financeiro** (zero dinheiro) · **cobrança simples** ("Deve R$ X" + Entregue e pagou / ficou devendo) · **completa** (qtd −/+ · trocar produto · adicionar · editar preço · comprovante foto/assinatura)
- [ ] **Não atendeu** (com motivo) · **Sem atendimento**
- [ ] Duplo toque rápido em Pago/Entregue = **1 ação e 1 som só**
- [ ] **Pausar** e **retomar** (inclusive fechando o app no meio da rota)
- [ ] Tirar parada de hoje: SEGURAR no card da parada
- [ ] **Encerrar rota**: popup único (encerrar + salvar como rota) · resumo do dia
- [ ] Entregar na porta corrige o pino do cliente (próxima rota nasce com pino certo)

## 3. HISTÓRICO E CADASTRO (tudo)
- [ ] **Cliente novo**: Enter pula os campos e cadastra no último · telefone com máscara · pop-up do **DDD** se faltar · **CEP preenche endereço** · "usar minha localização"
- [ ] Cliente sem **End/Dia** = vermelho (trava rota) · Tel/Dup = chip neutro (não pinta)
- [ ] Editar cliente · **excluir SEGURANDO** (com confirmação)
- [ ] **Produtos**: novo · editar · arquivar/reativar (pelo editar e segurando)
- [ ] **Produto do cliente** (recorrência): criar (qtd, a cada X dias, próxima data, preço acordado) · editar · excluir segurando · dias da semana do cliente (chips)
- [ ] **Histórico do cliente**: linhas de entrega/pagamento/não atendeu · apagar UMA segurando · "Apagar tudo" com confirmação · dinheiro NÃO muda
- [ ] Buscar funciona em Clientes e Produtos

## 4. FECHAMENTO / FINANCEIRO (tudo)
- [ ] Ajustes → **Financeiro**: ligar/desligar módulo · formas (na hora, mensal, fiado) · preço por cliente · cobrança simples
- [ ] **Conta do cliente**: "ficou devendo" SOMA no débito · "Pago" abate · folha mostra valor antigo + entrega = total
- [ ] Preço por cliente vence o preço do catálogo na folha
- [ ] **Consumo e bônus**: saldo · hoje/semana/mês · lista de entregas rastreadas
- [ ] **Recarga**: vitrine com pacotes · checkout abre em tela própria · saldo atualiza ao voltar
- [ ] **Créditos zerados**: app avisa/trava a rota · recarga destrava
- [ ] **Modo da rota** (Essencial × Rastreada): congela com rota ativa
- [ ] **Avisar chegada** (raio em metros) — manda zap real ⚠️
- [ ] Nome da empresa no topo · **Sair** desvincula o aparelho

## 5. POSSÍVEIS BUGS / SONS / GERAL
- [ ] **Sons**: chip liga/desliga geral · folha Sons com prévia ▶ de cada um · voz do GPS on/off · cada evento toca **1x**
- [ ] Tela **não pisca** com rota ativa (GPS atualizando) · **não congela** depois de cancelar a Leitura
- [ ] **Voltar do Android**: fecha o que está por cima · wizard volta 1 passo · na Rota sai do app · update OBRIGATÓRIA não deixa escapar
- [ ] **Teclado** nunca cobre campo/botão · Enter avança · no último confirma
- [ ] **Tema claro/escuro**: tudo legível · mapa repinta na hora
- [ ] **Sem internet**: leitura/comprovante entram na fila e sobem quando a rede volta
- [ ] **Atualização do app**: modal aparece · baixa e instala · "Agora não" quando opcional
- [ ] **Pino**: cliente sem GPS = pendência honesta (nunca pino chutado) · 1ª entrega cria o pino na porta
- [ ] **Erros em português claro** (nunca código/ID na tela)

---
Achou coisa errada? Anota o número do bloco + o que fez + o que apareceu. Eu corrijo em cima disso.
