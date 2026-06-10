Icon-only glass control for toolbars, the nav rail and card overflow actions. Always pass `label`.

```jsx
<IconButton label="Filtrar"><img src="assets/icons/radar.svg" width={18} /></IconButton>
<IconButton label="Nova conversa" variant="primary">+</IconButton>
```

Variants: `secondary` (default glass), `primary` (brand fill), `ghost` (transparent until hover). Default 38px square — match `Button`'s md height in a row.
