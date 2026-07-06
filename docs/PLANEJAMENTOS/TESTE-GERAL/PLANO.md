# TESTE-GERAL — validação do sistema TODO (06/07/2026)

Formato: `{user}: {modulo} — entrar X, fazer Y`. Básico do básico, nada de fora.
Marcar cada linha: ✅ ok | ⚠️ feio/incompleto | ❌ quebrado. Todo ⚠️/❌ vira linha em
[CORRECOES.md](CORRECOES.md) na hora (não confiar na memória).

**Onde:** localhost:3001, Chrome (cred em `.test-login.local.md`). Prod só spot-check se o dono mandar.
**Regra dura:** conexão/reconexão de chip WhatsApp NÃO se testa com chip real — mandar mensagem pelo chip já `open` pode, mas destino = número descartável.

---

## 1. VENDEDOR (seller)

- [ ] vendedor: Login — entrar /login, logar → cai no /dashboard sem erro
- [ ] vendedor: Dashboard — entrar /dashboard, KPIs carregam (nada de tela morta/spinner eterno)
- [ ] vendedor: Vendas — entrar /vendas, abrir "Buscar empresas", puxar 1 lead → lead aparece no funil
- [ ] vendedor: Vendas — arrastar lead de etapa → F5 → continua na etapa nova
- [ ] vendedor: Vendas — fechar 1 venda pelo modal → lead vai pra etapa final
- [ ] vendedor: Vendas — conferir que NÃO vê valores/preços (LEI DO VENDEDOR)
- [ ] vendedor: Agenda — entrar /agenda, criar compromisso pra hoje → aparece no dia
- [ ] vendedor: Automações — entrar /automacoes, abrir uma cadência, ativar/desativar → sem erro
- [ ] vendedor: Conversas — entrar /atendimento, abrir conversa, mandar texto p/ número descartável → entrega
- [ ] vendedor: Conversas — mandar imagem (Ctrl+V) e responder citando (quote) → renderiza certo
- [ ] vendedor: Empresas — entrar /empresas, abrir empresa puxada → razão social limpa (sem CNPJ na frente do nome)
- [ ] vendedor: Contatos — entrar /contatos, criar cliente manual → salvar → editar → persiste
- [ ] vendedor: Produtos — entrar /produtos, criar produto (ex.: Galão 20L, preço, flag Logística) → salva
- [ ] vendedor: Logística — entrar /logistica, ver rota do dia carregar
- [ ] vendedor: Bot — entrar /bot → tela abre (conferir o que vendedor pode ver/mexer)
- [ ] vendedor: Assistente IA — entrar /assistente, rodar sandbox "Teste sua IA" → responde sem tocar chip
- [ ] vendedor: Relatórios — entrar /relatorios → números batem com o funil que acabou de mexer
- [ ] vendedor: Configurações — entrar /configuracoes, trocar pele/tema → aplica e nada quebra
- [ ] vendedor: Tutorial — iniciar tour → balões ancoram nos lugares certos (suspeita: tours do Radar desancorados)

## 2. ADMIN

- [ ] admin: Login — logar como admin → dashboard
- [ ] admin: Vendas — spot-check: puxar 1 lead → conferir que baixou 1 da cota DA EMPRESA (e só 1)
- [ ] admin: Vendas — conferir que admin VÊ valores/preços (admin nunca capado por vendedor)
- [ ] admin: Gerencial — entrar /gerencial, aba Equipe: criar acesso de vendedor (cargo) → novo vendedor loga
- [ ] admin: Gerencial — aba Comissões: resumo carrega, gerar payout de teste → sem erro
- [ ] admin: Gerencial — aba Candidaturas: candidatura do /trabalhe-conosco aparece e dá pra triar
- [ ] admin: Bot — entrar /bot, configurar resposta, testar opt-out ("parar") → bot para de responder
- [ ] admin: Configurações — ver status do chip WhatsApp (só LER estado — não reconectar chip real)
- [ ] admin: Plano/cobrança — abrir tela de plano → **anotar onde ainda fala "X leads por mês"** (→ C1)
- [ ] admin: Relatórios — visão da empresa inteira (não só o próprio funil)

## 3. MASTER (system_master → /master)

Cada janela: abrir, dado REAL carrega, 1 ação básica funciona. Tudo que estiver feio/mentindo → C2.

- [ ] master: Login — logar master → /master abre com chrome próprio (topbar/janelas)
- [ ] master: Cockpit — abrir → números reais (não zerado/placeholder)
- [ ] master: Empresas — abrir uma empresa → plano, status, consumo de leads corretos
- [ ] master: Quem está online — bate com quem está logado agora (logar vendedor em outra aba e conferir)
- [ ] master: Self-Checkout — percorrer o fluxo de venda de plano até o fim (sem pagar de verdade)
- [ ] master: Créditos — abrir janela → conferir comportamento com flag OFF (não pode quebrar; anotar o que mostra)
- [ ] master: Integrações — status do motor WhatsApp/Evolution bate com o motor ao vivo
- [ ] master: E-mails — templates listam, mandar 1 e-mail de teste
- [ ] master: Tickets — abrir e responder 1 ticket
- [ ] master: Pagamentos — transações MP carregam (local = cred de teste; NUNCA copiar cred local→VPS)
- [ ] master: Contabil — Livro Caixa carrega + wizard "Fechar o mês" abre e anda (S6/S7 ficam OFF)
- [ ] master: Sistema — flags/saúde carregam e batem com a realidade
- [ ] master: Dashboard comum — master também navega /dashboard, /vendas etc. sem quebrar (funil não-vazio)

## 4. ENTREGADOR (celular — /entrega)

Pré-requisito: mock de 5 clientes (seção 6). Testar no CELULAR de verdade, Chrome Android.

- [ ] entregador: Instalar — /logistica/instalar → instala PWA na tela inicial
- [ ] entregador: Hoje — abrir app → lista de entregas do dia (5 clientes do mock)
- [ ] entregador: Rota — swipe/navegar → deep-link abre o Waze no endereço certo → voltar pro app
- [ ] entregador: Chegada — confirmar entrega no local → GPS grava o ponto da confirmação
- [ ] entregador: Clientes — /entrega/clientes lista os 5
- [ ] entregador: Produtos — /entrega/produtos lista o catálogo
- [ ] entregador: Ajustes — /entrega/ajustes abre e salva

## 5. PÚBLICO + REDIRECTS (5 min, sem login)

- [ ] público: Landing — / abre (Portal v3.0)
- [ ] público: Planos — /planos abre → **anotar "X leads por mês"** (→ C1)
- [ ] público: Registro — /register cria conta nova → confirm-email → login funciona
- [ ] público: Reset — /reset-password envia e completa
- [ ] público: Trabalhe conosco — /trabalhe-conosco envia → aparece no /gerencial do admin (fecha o ciclo)
- [ ] público: Termos/Políticas — /termos e /politicas abrem
- [ ] redirect: /workspace→/dashboard, /webscraping→/leads, /dashboard/master→/master (só conferir que redirecionam)

## 6. MOCK LOGÍSTICA — 5 clientes (depois da validação acima)

**Mock de clientes: SIM, sempre.** Seed de 5 clientes fake com **endereços REAIS** da sua
cidade (espalhados, 2–5 km entre si), 1 produto (Galão 20L) e dias de entrega — roda em
LOCAL ou tenant de teste (fake em prod suja o CRM; você decide onde).

**GPS: os dois, mas em fases — porque testam coisas diferentes:**
1. **GPS emulado (desktop, DevTools→Sensors):** valida o FLUXO Hoje→Rota→Chegada→Entregue
   em 15 min, sem sair da cadeira. Pega bug de tela/estado.
2. **GPS DE VERDADE no celular (1 volta de carro, ~20 min, 2–3 pontos):** é o único que pega
   o que quebra de verdade — prompt de permissão do Chrome Android, precisão urbana,
   comportamento com tela bloqueada, handoff Waze→app e volta. Emulador não reproduz nada disso.

**Recomendação:** seed dos 5 → fluxo no desktop com GPS emulado → volta de carro com GPS real
em 2–3 pontos (os outros 2 confirma parado). Custo quase zero, cobre os dois mundos.
GPS mockado "de vez" só serve pro teste automatizado (Playwright, já previsto no M-check do
[PLANO da appificação](../LOGISTICA-MOBILE/PLANO.md)).
