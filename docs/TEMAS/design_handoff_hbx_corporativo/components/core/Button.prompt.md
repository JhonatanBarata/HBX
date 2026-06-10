Glass action button for HBX System — use for every primary/secondary action; intent is carried by `variant`.

```jsx
<Button variant="primary" onClick={save}>Abrir esteira de leads</Button>
<Button variant="secondary" iconLeft={<Icon name="whatsapp" />}>Chamar no WhatsApp</Button>
<Button variant="success" size="sm">Recuperado</Button>
```

Variants: `primary` (brand→accent gradient, the main CTA), `secondary` (neutral glass), `ghost` (quiet), `success` (recovery confirmations), `accent` (magenta highlight), `danger` (destructive). Sizes: `sm` (32px) and `md` (38px, default). All variants share the inset top highlight + heavy backdrop blur. Pair with `IconButton` for icon-only actions.
