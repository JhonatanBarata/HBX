# PLANO — as 5 fotos das vendedoras (03/08/2026)

Pedido do dono: *"vou mandar as 5 fotos das vendedoras, onde vamos colocar fotos nas
pessoas do HBX, e vão aparecer no whatsapp (sei q o conversas não tem mais fotos, mas
vai ter a foto DO HBX) e pelo webwhats eu já linko uma foto e cadastro certinho elas,
com nome, empresa e horário."*

**São DUAS fotos diferentes, em dois lugares que não se falam** — e é isso que este
plano separa, porque tratar como uma coisa só é o jeito de descobrir na hora errada
que o lead nunca viu foto nenhuma.

---

## 1. A foto DENTRO do HBX (quem vê: você e a equipe)

**Onde mora:** coluna `User.avatarUrl`, gravada como data URL (base64) — já existe,
não precisa de nada novo.

**Porta pronta:** `PATCH /profile/avatar` (`auth/profile.controller.ts:450`) e
`DELETE /profile/avatar` para tirar.

**Como entra:** cada vendedora entra com o login dela e sobe a própria foto pelo
perfil. Como você tem as 5 senhas (`{login}123`), dá pra fazer as 5 sem esperar
ninguém.

⚠️ **Isto NÃO chega no WhatsApp.** É a foto do sistema: aparece pra você no
Desempenho por vendedor, na atribuição de card, no histórico. O lead nunca vê.

---

## 2. A foto que o LEAD vê (quem vê: o cliente, no WhatsApp dele)

**Onde mora:** no perfil do WhatsApp **do próprio chip**, não no HBX. Quem manda é a
conta do número — o HBX só usa o socket.

**Como entra:** pelo aparelho/WhatsApp Web daquele chip, uma vez, no momento do
cadastro. É o que você já descreveu: *"pelo webwhats eu já linko uma foto e cadastro
certinho elas, com nome, empresa e horário."*

**Checklist por chip, tudo na mesma sentada (o chip conecta UMA vez — parear e
desparear em série foi o que derrubou o …884):**

| Campo | Valor |
|---|---|
| Foto do perfil | a foto da vendedora |
| Nome | o primeiro nome dela (Bianca, Maria Clara, Flávia, Letícia, Ana Júlia) |
| Nome da empresa | HBX |
| Categoria | Software / Serviço comercial |
| Horário de atendimento | 08:00–18:00, seg–sex |
| Recado / descrição | uma linha do que a HBX faz |

**Por que isso importa mais do que parece:** perfil vazio é um dos sinais que separa
"pessoa trabalhando" de "número descartável" na hora em que alguém decide bloquear ou
denunciar — e bloqueio/denúncia é o que a Meta declara observar. Perfil completo é
barato e é o único aquecimento que dá pra fazer ANTES do primeiro disparo.

---

## 3. A ordem que evita retrabalho

1. Você manda as 5 fotos.
2. **Antes do chip existir:** subo as 5 no HBX (`PATCH /profile/avatar`, uma por
   login). Fica pronto e não depende de compra nenhuma.
3. **Quando cada chip chegar:** você preenche o perfil do WhatsApp daquele número com
   a MESMA foto + a tabela acima, **na mesma sentada em que pareia**.
4. Só então o chip entra na fila do HBX.

---

## 4. O que NÃO existe, pra não virar promessa

- **O HBX não empurra foto pro perfil do WhatsApp.** Não há porta pra isso hoje, e o
  Baileys entra como dispositivo companheiro — quem edita o perfil é a conta.
  Se um dia virar necessidade, é feature nova, não configuração.
- **A foto do HBX não vira a foto do lead**, e a foto do WhatsApp não aparece no
  Conversas. São dois cadastros, de propósito.

---

## 5. Estado

- ⬜ Fotos: aguardando o dono mandar as 5.
- ✅ Porta do HBX pronta (`PATCH /profile/avatar`).
- ⬜ Perfis de WhatsApp: dependem dos chips, que ainda não foram comprados.
