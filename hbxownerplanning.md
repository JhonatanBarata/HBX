# HBX Owner — Problemas do Painel (:3107)

> Só PROBLEMAS. Achados no teste botão a botão ao vivo. Data: 29/06/2026. Linguagem simples.

---

## 🚨 1. A fábrica não fabrica (o problema grande)

A tela diz **"Pressão de memória: o guard cortou 20 motores"** → **é mentira / texto errado**. A memória está tranquila.

Verdade (conferida por trás da tela): **os 20 motores estão MORTOS há ~44 horas.** Morreram por falta de memória (código 137 = o computador matou) e **ninguém ligou de volta**. Sem motor vivo, a fábrica fica parada, 0 lead por hora.

Arrumar:
- [ ] Religar os 20 motores (é o que volta a fabricar na hora).
- [ ] Pôr **limite de memória** por motor, senão morrem de novo igual há 44h.
- [ ] Corrigir a **frase mentirosa** "pressão de memória cortou 20 motores" (te despista da causa real).

## 🐞 2. Botão "Desligar Lab" não desliga

Aperto, ele pisca "desligando…", mas conferindo por trás o Lab **continua ligado**. Não obedece.
- [ ] Arrumar o botão "Desligar Lab".

## 🐌 3. Tudo da fábrica é LENTO (~20 segundos)

A tela da fábrica fica eterno em "Lendo…", e os botões também: "Próxima missão" levou **19s** pra responder (parece travado, mas funciona).
- [ ] Investigar a lentidão dos endereços da fábrica (uns 20s cada).

## 🔀 4. Botões "Enriquecer" e "Limpar lixo" do Cockpit estão MORTOS

O Cockpit virou "só VPS" (mostra os 5.889 do servidor), mas esses botões só funcionam no modo antigo "sua máquina (local)", que foi removido. Resultado: ficam **apagados pra sempre** (inclicáveis), conferido ao vivo.
- ✦ Enriquecer → apagado pra sempre
- ✕ Limpar lixo → apagado pra sempre
- ⬆ Mandar tudo pro VPS → nem aparece mais
- ⬇ Exportar CSV → esse funciona normal
**PLANO (decidido pelo dono):**
- [ ] **Remover o lixo**: tirar da tela os botões mortos (Enriquecer, Limpar lixo, e o "Mandar tudo pro VPS" que já sumiu).
- [ ] **Garantir que o outro funcione**: o caminho de enriquecimento que SOBRA (Descobrir site+CNPJ / CNPJ→dono / painel "Fabricante de e-mail") tem que enriquecer o VPS de verdade. Testar um por um.

**Achados ao testar o "que sobra":**
- ❌ **"Descobrir site + CNPJ (grátis)"**: clica e responde "ok", mas mira o banco **local (vazio)** → resultado "0 varridos · 0 enriquecidos". Não toca nos 5.889 do VPS. **Tem que mirar o VPS.**
- ⚠️ **"CNPJ → dono + tel + sociais"**: esse mira o VPS certo, mas deu **200 tentados · 0 enriquecidos**. Motivo: dos 5.889 leads, **NENHUM tem CNPJ** (conferido: 0 com CNPJ; 1.112 com site, 1.133 com e-mail). Ele precisa de CNPJ pra trabalhar, e a base não tem.
- 🔗 **Corrente quebrada**: quem acha o CNPJ é o "Descobrir" (quebrado, mira local). Sem ele achar CNPJ, o "CNPJ → dono" nunca terá o que enriquecer. Consertar o "Descobrir" (mirar VPS) é o que destrava a corrente.
- ⭐ **Painel "Fabricante de e-mail" (▶ Ligar)**: é o MELHOR caminho — liga de verdade, mira o VPS e sobe o Lab. **MAS em ~1 min produziu 0.** Três gargalos:
  1. Lê só **20 cards por vez** (trava do VPS em database-cards) → varrer 5.889 demoraria uma eternidade.
  2. **Tipo 1** (identidade): varreu 500, achou **0 CNPJ** (não enriquece identidade).
  3. **Tipo 2** (caça-e-mail): travou em **0 sites visitados** — o Lab não andou.
- [ ] **É esse painel que tem que funcionar.** Destravar: (a) ler mais que 20/página, (b) Tipo 1 achar CNPJ, (c) Tipo 2 realmente visitar os sites.

---

## ⚠️ Lembrete
- Deixei a **fábrica PARADA** durante o teste (botão "Parar fábrica"). **Religar no fim.**
- Troquei o tema pra claro no teste. Voltar pro escuro.

---

# 🎨 REDESENHO DO FRONT (feito AO VIVO com o dono — NÃO é tarefa de worker)

## Tirar da tela (lixo)
- ❌ Seção inteira **"Containers + logs + Top processos"** (os 33 containers, uvicorn, etc.) — inútil pro dono.
- ❌ Botões mortos do Cockpit: **"Enriquecer", "Limpar lixo", "Mandar tudo pro VPS"**.
- ❌ A **mensagem mentirosa** "pressão de memória cortou 20 motores".

## Juntar o que é repetido
- **"Parar fábrica" + "Desligar Lab" viram UM controle** (Ligar/Parar). Nada de dois botões pra mesma ideia.
- As 3 caixas separadas ("A fábrica que rapa" + "a verdade" + "VPS recebe e atende") viram **UM card de Fábrica** honesto.
- Enriquecimento: **um painel só** (o "Fabricante de e-mail"), mirando o VPS. Os botões soltos somem.

## Novo layout (1 tela limpa, de respeito)
1. **Topo**: logo + saúde (3 pontinhos: agente/backend/VPS) + botão de tema.
2. **Saúde**: Sua máquina × VPS, compacto (RAM/CPU/Disco em barrinhas).
3. **Fábrica** (card herói): estado HONESTO + 1 botão Ligar/Parar + fileira dos 20 motores (verde=vivo / vermelho=morto) + botão "Religar motores" + métricas (novos/hora, hoje, duplicados) + missão atual.
4. **Leads (Cockpit)**: banco VPS 5.889 + filtros + SÓ os botões que funcionam (Recarregar · CSV · Enriquecer-no-VPS) + tabela.
5. **Enriquecedor**: 1 painel, liga/desliga, Tipo 1 / Tipo 2 / Agressivo, contadores ao vivo, mira o VPS.

---

# 👷 DIVISÃO DO TRABALHO
- **Front (ao vivo, comigo)** → o redesenho acima.
- **Workers (resto deste .md, sem tocar no front):**
  - **W1** — "Desligar Lab" não desliga → consertar no agent (`hbx-owner/local-agent/server.js`, `stopLocalLab`).
  - **W2** — Lentidão ~20s do `factory/status` → investigar a origem e acelerar.
  - **W3** — Enricher não produz → Tipo 1 achar CNPJ, Tipo 2 visitar sites de verdade, ler mais que 20/página.
  - **W4 (infra)** — motores morrem por memória (código 137) → pôr limite de memória por motor + religar a frota.
