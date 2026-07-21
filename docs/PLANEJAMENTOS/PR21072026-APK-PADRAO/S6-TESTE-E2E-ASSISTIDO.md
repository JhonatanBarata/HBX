# S6 — TESTE DE PONTA A PONTA ASSISTIDO (o dono grava; eu dirijo via ADB)

**Contrato:** só roda DEPOIS de S1–S5 commitados + APK rebuildado e instalado no moto g15
(`ZF5255SMWF`). Eu executo TUDO sozinho via ADB ([[apk-teste-via-adb]]); o dono só assiste e
grava. Se qualquer passo falhar: PARAR, corrigir, rebuildar, recomeçar DO ZERO — o vídeo é
de uma passada limpa, sem "vou só contornar aqui".

## Pré-voo (sem gravação) — estado real conferido 21/07, ver `01-ACHADOS-AO-VIVO.md`

1. Aparelho: 213 clientes (Rio Claro), 5 produtos, 9 rotas salvas, **sem rota ativa**.
   Dono autorizou (21/07): conta mock, pode incluir/excluir à vontade. Ainda assim: dado novo
   sempre com prefixo `E2E` e nunca excluir em massa o que não foi criado por mim.
2. **Ajustes › Financeiro — o estado ATUAL é: Ativar ON · Cobrança simples OFF · Na hora OFF ·
   Mensal ON · Fiado ON · Preço por cliente ON.** Para o roteiro do dono é preciso
   **LIGAR "Na hora"** (sem isso não existe "pagou em dinheiro") e **MANTER "Cobrança simples"
   OFF** — o roteiro pede a folha COMPLETA (editar quantidade de galões, comprovante).
3. **Desligar "Avisar chegada"** (hoje em 20 m) antes de rodar — evita disparo de WhatsApp real.
4. Conferir dias de trabalho incluindo HOJE; GPS concedido; créditos ≥ 10 (2 rotas).
5. Limpar as rotas salvas de teste antigas ("Rota 21/07", "Rota blabla", "Andre teste",
   "QA Rota 2107 …") segurando pressionado — dogfooding do gesto.
6. Sortear AGORA o cliente pagador (1 dos 3, aleatório de verdade) e anotar.

## Roteiro gravado

### Ato 1 — Cadastros (Enter do teclado em ação)
1. **3 clientes** pelo popup "Novo cliente", digitando com o teclado e navegando SÓ com
   Enter (avança campo a campo; no último, salva): `E2E Ana` / `E2E Bruno` / `E2E Carla`,
   telefones válidos com DDD, endereços reais distintos do bairro, CEP puxando
   endereço automático.
2. **3 produtos** com 3 valores: `E2E Galão 20L` R$ 12,00 · `E2E Galão 10L` R$ 8,00 ·
   `E2E Caixa Copos` R$ 25,00 (campo de preço estilo banco: centavos, limpa ao digitar).

### Ato 2 — Rota de LEITURA (atualizando endereço) → salvar
3. Iniciar Leitura de Rota. Para CADA um dos 3 clientes (wizard central com setas ‹›):
   escolher o cliente existente → passo ENDEREÇO compara GPS × cadastro → escolher
   **"Usar endereço do GPS"** (o aviso "atualizar substitui o anterior" aparece) → número →
   telefone (já vem) → produto: vincular 1 produto com quantidade e **valor do cliente**
   (Ana=Galão 20L ×2; Bruno=Galão 10L ×3; Carla=Caixa Copos ×1) → passo OBSERVAÇÕES:
   escrever rápido e diferente em cada um (`portão azul, buzinar 2x` / `cuidado cachorro` /
   `entregar nos fundos`) — a contagem de 5s para quando digito.
4. Finalizar leitura → nomear **"E2E Leitura"** → salvar. Conferir endereço ATUALIZADO na
   ficha de 1 cliente (prova da substituição).

### Ato 3 — Rota MANUAL → salvar
5. Criar rota manual com os MESMOS 3 clientes em ordem DIFERENTE (Carla, Ana, Bruno),
   reordenando com as setas ▲▼ → salvar como **"E2E Manual"**.

### Ato 4 — Salvos: editar TUDO
6. Abrir Salvos → **"E2E Leitura"** → editar: reordenar parada (setas), **tirar** o Bruno
   (segurar pressionado na parada — vermelho enche, vibra), **adicionar** o Bruno de volta
   (busca), trocar quantidade/valor de um item (segurar no item tira; recolocar). Salvar e
   reabrir pra provar que persistiu.

### Ato 5 — RODAR ROTA 1 ("E2E Leitura") — a parte principal do vídeo
7. Montar Rota → Salvos → "E2E Leitura" → Gerar → Iniciar. (Estando parado, o GPS de todos
   é o mesmo ponto → a chegada AUTOMÁTICA dispara: pop-up/selo verde "Você chegou no
   endereço".)
8. Em cada chegada conferir NA TELA: nome gigante, **observação escrita no Ato 2 aparecendo**,
   "Deve R$" com o valor do dia, botões Pago/Próximo:
   - **Hipótese H1 (acabou galão):** cliente 1 → "Ver detalhes" → stepper reduz qtd (2→1)
     → valor recalcula → confirmar.
   - **Hipótese H2 (cliente quis extra):** cliente 2 → "Ver detalhes" → "+ Adicionar
     produto" (E2E Caixa Copos ×1) → confirmar.
   - **Pagamento:** os 2 clientes NÃO sorteados = **Pago**; o SORTEADO = **Próximo**
     (fiado — fica devendo).
9. Após cada entrega: pop-up de próxima parada com contagem no anel (sem reiniciar do zero).
   No fim: encerrar rota 1. Abrir a FICHA do cliente sorteado e mostrar o **débito atual**
   (o fiado entrou no financeiro como a receber).

### Ato 6 — RODAR ROTA 2 ("E2E Manual") — o devedor paga
10. Montar Rota → Salvos → "E2E Manual" → Gerar → Iniciar (mesmo dia — encerrar não trava
    re-sair). Na chegada do cliente SORTEADO: a tela mostra **Deve R$ = fiado da rota 1 +
    valor de hoje** → **Pago** → o débito ZERA. Nos outros 2: Pago normal.
11. Encerrar rota 2. Conferir: ficha do sorteado sem débito; card de clientes sem badge de
    dívida; valores do dia batendo com o que foi editado (H1 reduziu, H2 somou).

### Ato 7 — Fechamento
12. Voltar do Android navegando pra fora (popup fecha → Rota → sai) — prova do S5.
13. Relatório curto pro dono: o que passou, valores conferidos (esperado × visto na tela),
    qualquer desvio.

## Limpeza (pós-vídeo, se o dono mandar)
Excluir os 3 clientes E2E, 3 produtos E2E e 2 rotas salvas — tudo por segurar pressionado.

## Regras
- NENHUM cliente real tocado; prefixo `E2E` em todo dado. Zero WhatsApp disparado (clientes
  de teste com telefone que não é de ninguém = risco zero de mensagem indevida — conferir
  aviso de entrega DESLIGADO nos Ajustes antes).
- Se aparecer QUALQUER tela fora do padrão durante o roteiro (layout diferente, botão solto,
  popup coberto pelo teclado), é REPROVA da frente: anotar, corrigir no sprint dono do tema,
  regravar.
