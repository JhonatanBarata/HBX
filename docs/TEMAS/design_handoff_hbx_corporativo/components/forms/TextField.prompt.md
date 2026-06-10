Labelled glass input — the standard form field across login, cadastros and settings.

```jsx
<TextField label="E-mail" placeholder="Digite seu e-mail" type="email" />
<TextField label="Senha" type="password" error="Senha incorreta" />
```

Focus paints a brand ring. Pass `error` for the danger state, `hint` for quiet helper text. All native input props pass through.
