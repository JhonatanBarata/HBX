Pulsing presence/status dot, used in the inbox rail, agent lists and "ao vivo" markers.

```jsx
<StatusDot tone="online" label="Operacional" />
<StatusDot tone="live" />
<StatusDot tone="offline" pulse={false} />
```

Tones: `online` (green), `live` (brand cyan), `busy` (amber), `offline` (muted, usually `pulse={false}`).
