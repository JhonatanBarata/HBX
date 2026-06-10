Message bubble for the atendimento (customer-service) inbox.

```jsx
<ChatBubble direction="in" author="Auto Center Sul" time="09:32">Oi, a peça já chegou?</ChatBubble>
<ChatBubble direction="out" time="09:33">Chegou sim! Posso agendar a troca?</ChatBubble>
<ChatBubble direction="system">Bot HBX transferiu para atendimento humano</ChatBubble>
```

`direction`: `in` (customer, left, white), `out` (agent, right, blue tint), `system` (centered status pill). `author` only renders on inbound.
