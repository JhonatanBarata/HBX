# 🔥 Sistema Admin - Guincho Rio Claro

## 📋 O que foi implementado

✅ **Painel Admin completo** (`/admin.html`)
✅ **Sistema de autenticação** (login/logout)
✅ **CRUD de Mesas** (criar, editar, deletar)
✅ **CRUD de Tipos** (categorias de mesa)
✅ **Gerenciar Carrossel** (fotos do banner inicial)
✅ **Upload de imagens** (automático para Firebase Storage)
✅ **Integração com site** (carrega dados dinamicamente)

---

## 🚀 Como configurar

### 1. Criar projeto no Firebase

1. Acesse: https://console.firebase.google.com/
2. Clique em **"Adicionar projeto"**
3. Nome: `madeireira-Monteiro Madeiras` (ou o que preferir)
4. Desabilite Google Analytics (opcional)
5. Clique em **"Criar projeto"**

### 2. Configurar Authentication

1. No menu lateral, clique em **"Authentication"**
2. Clique em **"Começar"**
3. Ative o método **"Email/senha"**
4. Clique em **"Usuários"** → **"Adicionar usuário"**
5. Cadastre seu email e senha (você vai usar para login)

### 3. Configurar Firestore Database

1. No menu lateral, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Modo: **"Produção"** (vamos configurar regras depois)
4. Local: **"southamerica-east1"** (São Paulo)
5. Clique em **"Ativar"**

### 4. Configurar Storage

1. No menu lateral, clique em **"Storage"**
2. Clique em **"Começar"**
3. Modo: **"Produção"**
4. Local: **"southamerica-east1"**
5. Clique em **"Concluir"**

### 5. Configurar Regras de Segurança

**Firestore (Database):**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir leitura pública (site)
    match /{document=**} {
      allow read: if true;
    }
    
    // Permitir escrita apenas para usuários autenticados (admin)
    match /{document=**} {
      allow write: if request.auth != null;
    }
  }
}
```

**Storage:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Permitir leitura pública
    match /{allPaths=**} {
      allow read: if true;
    }
    
    // Permitir upload apenas para usuários autenticados
    match /{allPaths=**} {
      allow write: if request.auth != null;
    }
  }
}
```

### 6. Obter credenciais do Firebase

1. Clique no ícone de **engrenagem** ⚙️ → **"Configurações do projeto"**
2. Role até **"Seus apps"**
3. Clique no ícone **</> Web**
4. Nome do app: `Guincho Rio Claro Admin`
5. **NÃO** marque Firebase Hosting
6. Clique em **"Registrar app"**
7. **COPIE** o código que aparece em `firebaseConfig`

### 7. Colar credenciais no projeto

Copie `firebase-config.local.example.js` para `firebase-config.local.js` e preencha:

```javascript
window.__FIREBASE_CONFIG__ = {
  apiKey: "AIza...",  // ← Cole aqui
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto-id",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123...:web:abc..."
};
```

---

## 🎯 Como usar o painel admin

### Acessar o painel

1. Abra: `http://localhost:5173/admin.html` (ou seu domínio + `/admin.html`)
2. Faça login com email/senha cadastrados no Firebase
3. Pronto! 🎉

### Gerenciar Tipos de Mesa

1. Clique na aba **"🏷️ Tipos"**
2. Clique em **"+ Adicionar Tipo"**
3. Digite o nome: `Garapeira`, `Pequiá`, `Angelim`, etc
4. Salve

### Adicionar Mesa

1. Clique na aba **"📋 Mesas"**
2. Clique em **"+ Adicionar Mesa"**
3. Preencha:
   - **Tipo**: Escolha da lista (Garapeira, Pequiá...)
   - **Nome**: Ex: "Mesa de Garapeira Grande"
   - **Descrição**: Texto livre
   - **Especificações**: Uma por linha (ex: `Madeira: Garapeira nobre`)
   - **Fotos**: Selecione múltiplas imagens
4. Clique em **"Salvar Mesa"**
5. A mesa aparece automaticamente no site! ✨

### Editar/Deletar Mesa

- Clique em **"Editar"** para modificar
- Clique em **"Deletar"** para remover (pede confirmação)

### Gerenciar Carrossel

1. Clique na aba **"🖼️ Carrossel"**
2. Veja as 8 fotos atuais
3. Clique em **"× "** para remover foto
4. Clique em **"+ Adicionar Foto"** para nova
5. Site atualiza instantaneamente! 🚀

---

## 🔌 Integração com o site

### Arquivos modificados:

Você precisa adicionar nos seus HTMLs:

**Em `colecao.html`** (antes de `</body>`):
```html
<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js"></script>
<script src="firebase-config.local.js"></script>
<script src="firebase-config.js"></script>
<script src="load-mesas.js"></script>
```

**Em `index.html`** (antes de `</body>`):
```html
<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="firebase-config.local.js"></script>
<script src="firebase-config.js"></script>
<script src="load-carrossel.js"></script>
```

**Em `colecao.html`**, altere o container das mesas:
```html
<!-- Trocar o conteúdo hardcoded por: -->
<div id="colecao-lista" class="max-w-7xl mx-auto grid md:grid-cols-3 gap-16">
  <!-- Mesas serão carregadas aqui pelo JavaScript -->
</div>
```

---

## 📦 Deploy

### Opção 1: Vercel (Recomendado - Grátis)

1. Suba código no GitHub
2. Conecte Vercel ao repositório
3. Deploy automático
4. Acesse: `seusite.vercel.app/admin.html`

### Opção 2: Netlify (Alternativa)

1. Arraste pasta para Netlify Drop
2. Site no ar em segundos
3. Acesse: `seusite.netlify.app/admin.html`

### Opção 3: Hospedagem tradicional (FTP)

1. Suba todos os arquivos via FileZilla
2. Acesse: `seudominio.com.br/admin.html`

---

## 🔒 Segurança

✅ **Autenticação obrigatória** para admin  
✅ **Leitura pública** (visitantes veem o site)  
✅ **Escrita protegida** (só admin logado edita)  
✅ **Credenciais no Firebase** (não no código)  
✅ **HTTPS automático** (Vercel/Netlify)  

---

## 🐛 Troubleshooting

### Erro: "Firebase not defined"
- Ordem atual: Firebase SDK -> firebase-config.local.js -> firebase-config.js -> load-mesas.js
- Verifique se as tags `<script>` do Firebase estão **ANTES** dos seus scripts
- Ordem correta: Firebase SDK → firebase-config.js → load-mesas.js

### Erro: "Email ou senha incorretos"
- Verifique se criou usuário no Firebase Authentication
- Tente resetar senha no Firebase Console

### Fotos não aparecem
- Verifique regras do Storage (deve permitir leitura pública)
- Teste upload de 1 foto pequena primeiro

### Site não atualiza
- Limpe cache do navegador (Ctrl + Shift + R)
- Verifique console do navegador (F12) para erros

---

## 📞 Suporte

Dúvidas? Entre em contato ou verifique a documentação do Firebase:
- https://firebase.google.com/docs

---

**Desenvolvido para Guincho Rio Claro** 🌲✨
