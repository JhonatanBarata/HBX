Glass switch for light/dark mode and feature flags. Controlled — own the state.

```jsx
const [on, setOn] = React.useState(true);
<Toggle checked={on} onChange={setOn} label="Tema escuro" />
```

Track fills with the brand gradient when on. Omit `label` for a bare switch in a settings row.
