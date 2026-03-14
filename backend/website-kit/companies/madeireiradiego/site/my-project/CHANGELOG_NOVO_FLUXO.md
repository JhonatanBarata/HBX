# 🔄 Atualização: Novo Fluxo de Navegação em 2 Etapas

## Alterações Implementadas

### 1. **Estrutura de Dados no Firebase**
- ✅ Adicionado campo `tipo` em cada mesa (ex: "Garapeira", "Pedra", "Pequiá")
- ✅ Adicionado campo `disponivel` (boolean) - status simples da mesa (pronta/encomenda)
- ✅ Alterado `foto_principal` para `fotoPrincipal` (melhor convenção)
- ✅ Removido `disponibilidades` (array por foto) - agora apenas 1 status por mesa

### 2. **Frontend - Colecao.html**
**Novo Fluxo:**
- **Tela 1:** Exibe tipos de madeira como cards clicáveis
- **Tela 2:** Ao clicar em um tipo, mostra apenas as mesas daquele tipo
- Botão "Voltar" para retornar à tela de tipos

**Arquivo de Script:**
- Novo arquivo: `load-tipos-e-mesas.js` (substitui o antigo `load-mesas.js`)
- Funções principais:
  - `carregarMesasDoTipo(nomeType)` - carrega mesas filtradas
  - `selecionarTipo(nomeType)` - alterna entre telas
  - `voltarParaTipos()` - volta para seleção de tipos

### 3. **Admin Panel - admin.html**
**Novos Campos no Modal de Mesa:**
- **Tipo de Mesa** (melhorado com descrição)
- **Disponibilidade da Mesa** (select simples: Pronta Entrega / Por Encomenda)
- **Foto Principal** (label atualizado)

**Estrutura Simplificada:**
- Removido select de disponibilidade por foto
- Apenas 1 status simples por mesa
- Melhor UX para o admin

### 4. **Admin Scripts - admin-scripts.js**
**Alterações:**
- Removidas funções de `alterarDisponibilidade()` e `disponibilidadesFotos`
- Adicionado suporte a `mesaDisponivel` no formulário
- Salvo campo `disponivel` (boolean) no Firebase

### 5. **Arquivo Antigo**
- `load-mesas.js` pode ser deletado (não é mais utilizado)
- Substituído por `load-tipos-e-mesas.js`

## Como Funciona

### Para Usuários:
1. Acessam `/colecao.html`
2. Veem cards dos tipos de madeira
3. Clicam em um tipo (ex: "Garapeira")
4. Veem apenas as mesas daquele tipo
5. Clicam na mesa para abrir galeria
6. Clicam em "Voltar" para ver outros tipos

### Para Admin:
1. Entra no painel
2. Adiciona/Edita mesa
3. Seleciona o **Tipo** (ex: Garapeira)
4. Define se está **Disponível** ou **Por Encomenda**
5. Seleciona **Foto Principal** (capa)
6. Salva

## Estrutura de Dados no Firebase

```javascript
{
  id: "mesa_123",
  tipo: "Garapeira",           // Novo: tipo de madeira
  nome: "Mesa Garapeira Premium",
  descricao: "...",
  especificacoes: ["Madeira Nobre", "Acabamento Acetinado"],
  disponivel: true,             // Novo: boolean simples
  fotoPrincipal: "url...",      // Renomeado de foto_principal
  fotos: ["url1", "url2", ...],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## Coleção "tipos" (Novo)

```javascript
{
  id: "tipo_123",
  nome: "Garapeira",
  descricao: "Madeira nobre de alta qualidade",
  imgPrincipal: "url...",       // Opcional
  createdAt: timestamp
}
```

## ⚠️ Migrações Necessárias

Se você tem dados antigos no Firebase:

1. **Adicione campo `tipo`** em todas as mesas existentes
2. **Renomeie `foto_principal` para `fotoPrincipal`**
3. **Remova ou ignore campo `disponibilidades`** (era array)
4. **Adicione campo `disponivel: true`** em todas as mesas
5. **Crie a coleção `tipos`** com os tipos de madeira usados

### Script SQL aproximado (Firebase):
```javascript
// Para cada mesa, execute:
db.collection('mesas').doc(mesaId).update({
  tipo: "Garapeira",  // Ajuste conforme tipo
  disponivel: true,   // Defina conforme necessário
  fotoPrincipal: doc.foto_principal,
  removido: FieldValue.arrayRemove('foto_principal')
})
```

## Testes Recomendados

- [ ] Tipos carregam na tela 1
- [ ] Clique em tipo mostra apenas aquelas mesas
- [ ] Botão voltar retorna aos tipos
- [ ] Galeria abre normalmente
- [ ] Admin consegue criar nova mesa com tipo
- [ ] Admin consegue editar disponibilidade
- [ ] Foto principal é exibida corretamente
- [ ] WhatsApp link funciona com dados corretos

## Benefícios

✅ **UX Melhorada:** 2 etapas claras ao invés de tela única
✅ **Admin Simplificado:** Menos campos para gerenciar por mesa
✅ **Dados Estruturados:** Tipos bem definidos
✅ **Escalável:** Fácil adicionar mais tipos e mesas
✅ **Performance:** Menos carga ao mostrar tela inicial

---

**Versão:** 2.0 - Novo Fluxo de Navegação
**Data:** Fevereiro 2026
