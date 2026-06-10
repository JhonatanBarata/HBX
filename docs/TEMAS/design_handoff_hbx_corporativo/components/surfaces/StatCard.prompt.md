KPI tile for dashboards and the workspace hero — value set in IBM Plex Mono tabular numerals.

```jsx
<StatCard label="Leads na esteira" value="1.284" delta="+18% hoje" />
<StatCard label="Pendente" value="R$ 42.380" delta="-6% vs. ontem" deltaTone="danger" />
```

Use inside a `metrics-grid` (auto-fit, min 180px). `deltaTone`: `success` (up, green), `danger` (down, magenta), `muted`.
