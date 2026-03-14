# 🚀 GUIA RÁPIDO - 5 Minutos

## ✅ Checklist de Configuração

### 1️⃣ Criar Projeto Firebase (2 min)
- [ ] Acessar https://console.firebase.google.com/
- [ ] Criar novo projeto: "madeireira-Monteiro Madeiras"
- [ ] Desabilitar Analytics (opcional)

### 2️⃣ Ativar Serviços (2 min)
- [ ] **Authentication** → Ativar Email/Senha → Adicionar seu usuário
- [ ] **Firestore Database** → Criar banco (modo produção)
- [ ] **Storage** → Ativar (modo produção)

### 3️⃣ Configurar Regras (1 min)

**Firestore:**
```
match /{document=**} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

**Storage:**
```
match /{allPaths=**} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

### 4️⃣ Copiar Credenciais (30 seg)
- [ ] Configurações do projeto → Adicionar app Web
- [ ] Copiar `firebaseConfig`
- [ ] Colar em `firebase-config.js`

### 5️⃣ Testar (30 seg)
- [ ] Abrir `admin.html` no navegador
- [ ] Fazer login
- [ ] Adicionar uma mesa de teste
- [ ] Verificar se aparece em `colecao.html`

---

## 🎯 Primeiro Uso

### Adicionar suas mesas atuais

1. **Criar tipos primeiro:**
   - Garapeira
   - Pequiá  
   - Angelim de Pedra

2. **Adicionar cada mesa:**
   - Selecionar tipo
   - Nome da mesa
   - Descrição
   - Especificações (uma por linha)
   - Upload das fotos

3. **Configurar carrossel:**
   - Upload das 8 fotos do banner
   - Pode adicionar/remover depois

---

## 📱 URLs Importantes

- **Painel Admin:** `seusite.com/admin.html`
- **Site público:** `seusite.com`
- **Firebase Console:** https://console.firebase.google.com/

---

## 🆘 Problemas Comuns

**Não consigo fazer login:**
→ Verificar se criou usuário no Firebase Authentication

**Mesas não aparecem no site:**
→ Verificar console do navegador (F12)
→ Verificar se Firebase SDK está carregando

**Fotos não fazem upload:**
→ Verificar regras do Storage (permitir write para autenticados)

---

## 📞 Próximos Passos

Após configurar, você pode:
- ✅ Deletar mesas hardcoded do HTML
- ✅ Adicionar quantas mesas quiser pelo painel
- ✅ Trocar fotos do carrossel quando quiser
- ✅ Criar novos tipos de mesa
- ✅ Fazer deploy no Vercel/Netlify

**Tudo sem mexer em código! 🎉**
