# HBX Inbox Premium — page.client.tsx

Arquivo-alvo: `frontend/src/app/dashboard/inbox/page.client.tsx`

Status: **não precisa de refatoração estrutural grande** para atingir o visual pedido.

Baseado no arquivo enviado, a tela já usa:
- `styles.whatsAppConversationHeader`
- `styles.whatsAppTimeline`
- `styles.whatsAppMessageRow*`
- `styles.whatsAppBubble`
- `styles.whatsAppComposerForm`

Então o ganho principal vem do `page.module.css`, sem desmontar a lógica da inbox. Isso aparece no próprio arquivo enviado, onde o stage principal continua vindo do mesmo módulo de estilos e a página preserva o shell atual. fileciteturn6file2 fileciteturn6file1

## O que manter

Mantenha a estrutura do `page.client.tsx` como está.

O render principal da inbox já encaixa corretamente nos painéis:
- `styles.inboxStageList`
- `styles.inboxStageMain`
- `styles.inboxStageContext`

Isso também já está compatível com a proposta premium. fileciteturn6file2

## Ajuste opcional 1 — classe extra para stage principal

Se você quiser um pouco mais de presença visual no painel central, localize o bloco:

```tsx
<div className={styles.inboxStageMain}>
  {inboxWorkspaceComponents.main()}
</div>
```

E troque por:

```tsx
<div className={`${styles.inboxStageMain} ${styles.inboxStageMainPremium}`}>
  {inboxWorkspaceComponents.main()}
</div>
```
```

Depois adicione no `page.module.css`:

```css
.inboxStageMainPremium {
  background:
    radial-gradient(circle at top center, rgba(0, 201, 167, 0.05), transparent 26%),
    linear-gradient(180deg, #09131d 0%, #08121b 100%);
}
```

## Ajuste opcional 2 — classe extra no shell da conversa

Se o JSX atual tiver algo como:

```tsx
<div className={styles.whatsAppConversationShell}>
```

Pode trocar por:

```tsx
<div className={`${styles.whatsAppConversationShell} ${styles.whatsAppConversationShellTransition}`}>
```

Isso aproveita a animação já existente no CSS enviado. fileciteturn5file1

## Ajuste opcional 3 — manter a timeline exatamente amarrada ao CSS novo

Garanta que a timeline continue usando a classe:

```tsx
<div ref={chatTimelineRef} className={`${styles.whatsAppTimeline} ${styles.scrollbarCustom}`}>
```

Se já estiver assim, não mexa.

## Ajuste opcional 4 — garantir row full width no map das mensagens

No trecho do map das mensagens, mantenha a estrutura com:

- row usando `styles.whatsAppMessageRow`
- row com variante inbound/outbound/system
- bubble usando `styles.whatsAppBubble`

Isso é o que permite o CSS novo esticar as mensagens sem reescrever a lógica.

## Conclusão objetiva

Para este caso, o `page.client.tsx` **não precisa ser refeito inteiro**.

O arquivo pronto para o resultado visual pedido é, na prática:
- `page.client.tsx` atual, com no máximo os ajustes opcionais acima
- `page.module.css` atualizado com o pacote premium

Forçar uma reescrita total do `page.client.tsx` aqui seria arriscado porque o arquivo enviado está incompleto no contexto desta conversa, enquanto o ganho visual real está claramente no CSS. fileciteturn5file0
