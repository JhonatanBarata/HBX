# S4 — Aviso único, erro humano em todo catch, chegada consistente nos 3 níveis

**Pedido do dono:** "aviso, seta, não quero coisa solta". Aviso/alerta/erro tem que ter UMA
cara; a chegada (coração do app) tem que ser idêntica nas 3 configurações do financeiro.

## Evidências

0. **PROVADO AO VIVO (21/07):** o status do CEP no cadastro é **texto cinza solto**, colado
   no label do campo de baixo, sem moldura — e o aviso de SUCESSO ("Endereço preenchido.
   Informe o número.") tem a MESMA cara do de ERRO ("CEP não encontrado. Preencha o
   endereço."). É o exemplo mais claro da "coisa solta". Ver `01-ACHADOS-AO-VIVO.md`.
   → esse status vira a 1ª aplicação da classe única de aviso, com variante ok × warn.
1. **3 estilos de aviso inline diferentes** no app.css: `.lrt-endereco-warning` (~737),
   `.client-ddd-hint` (~293), `.client-duplicate-warning` (~363) — mesmos ingredientes
   (borda color-mix + fundo suave + texto pequeno), três receitas.
2. **Erro**: padrão `toast(humanApiError(e), true)` já usado 34× e `toast(err(` zerado — mas
   auditar catches silenciosos `catch(_){}` que engolem erro de AÇÃO do usuário (o fix do
   PATCH de local em 18/07 provou que isso esconde bug real). Engolir é ok SÓ em telemetria/
   cache/cosmético.
3. **Chegada em 3 níveis** (`deliverySheet` ~2144 decide): offline / simples ("Deve R$" +
   Pago/Próximo + Ver detalhes) / completa. Selo "Você chegou no endereço"
   (`state.deliveryArrived`) e observações do cliente já aparecem nos 3 — manter e PROVAR.

## Tarefas

1. Criar UMA classe de aviso inline (`.hbx-aviso` + variantes `--warn`/`--danger`/`--ok`,
   tokens existentes) e migrar os 3 estilos pra ela (manter os nomes velhos como alias na
   mesma regra CSS se o HTML for extenso demais pra trocar — decisão do worker, sem quebrar).
2. Auditoria de catch: listar todos os `catch` do app.js; classificar AÇÃO-do-usuário ×
   silencioso-legítimo; todo catch de ação ganha `toast(humanApiError(...), true)`.
3. Conferir mensagens de erro conhecidas do backend no `humanApiError` (~219): códigos que o
   app encontra hoje (`ENTREGA_EM_OUTRA_ROTA`, `ROTA_NOME_DUPLICADO`) têm frase; anotar
   qualquer code novo visto nos testes e dar frase.
4. **Prova da chegada nos 3 níveis** no aparelho (Ajustes: financeiro OFF → nível 1; ON +
   cobrança simples → nível 2; ON completo → nível 3): cada nível com selo de chegada,
   observações em destaque, botões ≥64px, e MESMA moldura sheet. Screenshot dos 3.
5. Toast: conferir que com teclado aberto (`keyboard-open`) o toast não nasce escondido
   atrás do teclado (hoje `bottom:62px` fixo) — se nascer, ancorar no `--hbx-visible-height`.

## NÃO fazer

- NÃO mudar copy dos avisos existentes (Lei 8 — só o texto que o dono pediu).
- NÃO criar níveis novos de chegada nem mexer em `confirmDelivery`/billing.
- NÃO transformar aviso inline em toast (aviso fica NO lugar do problema).

## Checks

- `node --check app.js`; screenshots: 3 níveis de chegada + 1 aviso de cada variante +
  1 erro de rede forçado (modo avião) mostrando toast humano.

**Pronto quando:** 1 classe de aviso, zero catch de ação silencioso, 3 chegadas provadas,
commit local `fix(apk): S4 avisos+erros+chegada`.
