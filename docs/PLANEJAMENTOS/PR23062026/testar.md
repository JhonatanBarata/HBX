# O que testar antes de subir

Cada teste é assim: **entre em tal lugar → faça tal coisa → tem que acontecer isso.**
Se algo não acontecer como está escrito, me avisa.

## Bot: a chave e as 3 chavinhas (como testar)
- Primeiro o bot precisa estar **liberado** pra empresa: no **painel do dono** → **Empresas → Armar bot**. Sem isso, a tela do Bot mostra **"aguardando ativação"** e as chavinhas ficam **apagadas e travadas** — a tela **não** pode ficar cinza/quebrada, só travada com o aviso.
- Entre no **Bot** (pelo **robô** do topo ou pelo menu). Liberado, aparecem **3 chavinhas**: **Atendimento**, **Recuperação** e **Prospecção**. Cada uma mostra **3 luzinhas**: *WhatsApp conectado*, *configuração pronta* e *testado*. **Verde** = ok; **amarelo** = falta isso.
- **Atendimento** (responde quem chama): com a configuração pronta, você **liga fácil**.
- **Recuperação** e **Prospecção** (que **começam** conversa): a chavinha **só deixa ligar** quando as **3 luzinhas estão verdes**. Tente ligar com uma luz **amarela** → **não deixa** e **explica o que falta**. Ao ligar, **pede confirmação**.
- Pra acender a luz **"testado"**: use o **Testar bot** (o chat de teste), escolha o tipo e **troque algumas mensagens** — a luzinha **acende**.
- Na aba **Configurações** tem um **seletor** (Atendimento / Recuperação / Prospecção): troque e **edite as mensagens** de cada um, **Salvar**. O Atendimento tem que continuar funcionando **igual a antes**.
- Importante: **nada é enviado** a cliente de verdade nesses testes.

## Painel do dono: devolver dinheiro de uma cobrança (novo)
- Entre no **painel de empresas** (área do dono) → escolha uma empresa que **pagou no cartão** → abra a aba **Financeiro**. Numa cobrança **paga no cartão** tem que aparecer o botão **Reembolsar**.
- Aperte **Reembolsar** → aparece **Confirmar estorno** → confirme: tem que aparecer **"✓ Estorno solicitado"** e aquela cobrança passa a mostrar **estornado**. *(No ambiente de teste o dinheiro volta na conta de teste; na de verdade volta pro cliente.)*
- Numa cobrança que **não foi no cartão** (dinheiro/Pix na mão) o botão **Reembolsar não aparece** — só o de cancelar lançamento, como antes.

## Painel do dono: excluir empresa que pagou devolve a sobra (novo)
- No mesmo painel, escolha uma empresa que **está pagando** (já passou o cartão) → vá na área **Excluir empresa**: tem que aparecer um aviso amarelo **"Excluir vai reembolsar R$ tanto ao cliente"**, com os **dias que faltam** do período pago.
- Numa empresa que **nunca pagou** (ou está no **teste grátis**), esse aviso **não aparece** — excluir não devolve nada.
- Se você **excluir** uma empresa que estava pagando, o sistema **devolve sozinho** essa sobra pro cliente (além de parar as cobranças futuras). Excluir continua funcionando mesmo se o pagamento estiver fora do ar na hora.
