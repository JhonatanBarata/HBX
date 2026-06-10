The signature HBX lead tile — drives the mobile esteira and the Radar/Leads product.

```jsx
<LeadCard
  hot
  company="Assistência Técnica Local"
  segment="Eletrônicos · Campinas/SP"
  channel="WhatsApp provável"
  priority={87}
  onAction={() => call(lead)}
/>
```

Set `hot` for high-priority leads (mint spotlight). `onAction` renders the mint "próxima melhor ação" CTA. Without it the card is a passive summary.
