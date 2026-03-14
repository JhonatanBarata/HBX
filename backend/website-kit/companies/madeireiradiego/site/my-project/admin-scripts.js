// ================================
// AUTENTICAÇÃO
// ================================

// Variáveis globais para gerenciamento de fotos
let arquivosNovasFotos = [];
let fotosExistentesAtual = [];

// SISTEMA DE NOTIFICAÇÕES TOAST
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

function setAuthNavVisible(isVisible) {
  const navAuth = document.getElementById('adminNavAuth');
  const logoutMobile = document.getElementById('logoutBtnMobile');

  if (navAuth) {
    navAuth.classList.toggle('hidden', !isVisible);
    navAuth.setAttribute('data-auth', isVisible ? '1' : '0');
  }
  if (logoutMobile) {
    logoutMobile.classList.toggle('hidden', !isVisible);
    logoutMobile.setAttribute('data-auth', isVisible ? '1' : '0');
  }
}

// Default: hide auth-only controls until we confirm auth state
setAuthNavVisible(false);

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');
  
  try {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('userEmail').textContent = email;
    setAuthNavVisible(true);
    
    // Carregar dados iniciais
    loadMesas();
    loadTipos();
  } catch (error) {
    errorDiv.textContent = 'Email ou senha incorretos';
    errorDiv.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  // Hide immediately so it never “sticks” on screen
  setAuthNavVisible(false);
  try {
    await firebaseAuth.signOut();
  } finally {
    location.reload();
  }
});

document.getElementById('logoutBtnMobile')?.addEventListener('click', async () => {
  setAuthNavVisible(false);
  try {
    await firebaseAuth.signOut();
  } finally {
    location.reload();
  }
});

// Verificar se já está logado
firebaseAuth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;
    setAuthNavVisible(true);
    loadMesas();
    loadTipos();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('userEmail').textContent = '';
    setAuthNavVisible(false);
  }
});

// ================================
// TABS
// ================================

function showTab(tabName) {
  // Esconder todos
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  // Mostrar selecionado
  document.getElementById('tab' + capitalize(tabName)).classList.remove('hidden');
  event.target.classList.add('active');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Estilos das tabs
const style = document.createElement('style');
style.textContent = `
  .tab-btn { background: transparent; color: #9ca3af; }
  .tab-btn.active { background: rgba(212,175,55,0.1); color: #d4af37; border-bottom: 2px solid #d4af37; }
  .tab-btn:hover { color: #d4af37; }
`;
document.head.appendChild(style);

// ================================
// MESAS - CRUD
// ================================

let mesasCache = [];

async function loadMesas() {
  const container = document.getElementById('listaMesas');
  container.innerHTML = '<p class="text-gray-400 col-span-full text-center">Carregando...</p>';
  
  try {
    const snapshot = await firebaseDB.collection('mesas').orderBy('createdAt', 'desc').get();
    mesasCache = [];
    
    snapshot.forEach(doc => {
      mesasCache.push({ id: doc.id, ...doc.data() });
    });
    
    // Ordenar mesas: primeiro as do carrossel (por ordemCarrossel), depois as outras
    mesasCache.sort((a, b) => {
      const aCarrossel = a.fotoCarrossel && a.fotoCarrossel.trim() !== '';
      const bCarrossel = b.fotoCarrossel && b.fotoCarrossel.trim() !== '';
      
      if (aCarrossel && bCarrossel) {
        return (a.ordemCarrossel || 0) - (b.ordemCarrossel || 0);
      }
      return aCarrossel ? -1 : 1;
    });
    
    if (mesasCache.length === 0) {
      container.innerHTML = '<p class="text-gray-400 col-span-full text-center">Nenhuma mesa cadastrada</p>';
      return;
    }

    // Contar quantas mesas estão no carrossel
    const mesasCarrossel = mesasCache.filter(m => m.fotoCarrossel && m.fotoCarrossel.trim() !== '');
    let posicaoCarrossel = 0;
    
    container.innerHTML = mesasCache.map(mesa => {
      const statusTexto = {
        'disponivel': '✅ Disponível',
        'encomenda': '📦 Encomenda',
        'vendida': '💰 Vendida'
      }[mesa.status] || (mesa.disponivel ? '✅ Disponível' : '📦 Encomenda');
      
      const precoFormatado = mesa.preco ? `R$ ${mesa.preco.toFixed(2).replace('.', ',')}` : 'Sem preço';
      const temCarrossel = mesa.fotoCarrossel && mesa.fotoCarrossel.trim() !== '';
      
      // Se tem carrossel, incrementa posição e mostra
      let posicaoTexto = '';
      if (temCarrossel) {
        posicaoCarrossel++;
        posicaoTexto = `Posição ${posicaoCarrossel} de ${mesasCarrossel.length}`;
      }
      
      return `
      <div class="admin-card rounded-xl p-4">
        <div class="relative">
          <img src="${mesa.fotoPrincipal || mesa.fotos?.[0] || '/img/placeholder.svg'}" class="w-full h-48 object-contain rounded-lg mb-3 bg-gray-800" onerror="this.src='/img/placeholder.svg'">
          ${temCarrossel ? `<div class="absolute top-2 right-2 bg-ouro text-black px-2 py-1 rounded-lg text-xs font-bold">🖼️ ${posicaoTexto}</div>` : `<div class="absolute top-2 right-2 bg-gray-600 text-white px-2 py-1 rounded-lg text-xs">Fora do Carrossel</div>`}
        </div>
        <h3 class="font-title text-ouro mb-1">${mesa.nome}</h3>
        <p class="text-sm text-gray-400 mb-1">Tipo: ${mesa.tipo}</p>
        <p class="text-xs text-green-400 mb-1">${precoFormatado}</p>
        <p class="text-xs text-gray-500 mb-1">${statusTexto}</p>
        <p class="text-xs text-gray-500 mb-3">${mesa.fotos ? mesa.fotos.length : 0} foto(s) total</p>
        <div class="flex gap-2 mb-2">
          <button onclick="editarMesa('${mesa.id}')" class="flex-1 py-2 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-500/30 rounded text-blue-400 text-sm transition">
            Editar
          </button>
          <button onclick="deletarMesa('${mesa.id}')" class="flex-1 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 rounded text-red-400 text-sm transition">
            Deletar
          </button>
        </div>
        ${temCarrossel ? `
          <div class="flex gap-2">
            <button onclick="moverMesaCarrossel('${mesa.id}', -1)" class="flex-1 py-2 bg-ouro/20 hover:bg-ouro/30 border border-ouro/50 rounded text-ouro text-sm transition">↑ Anterior</button>
            <button onclick="moverMesaCarrossel('${mesa.id}', 1)" class="flex-1 py-2 bg-ouro/20 hover:bg-ouro/30 border border-ouro/50 rounded text-ouro text-sm transition">Próxima ↓</button>
          </div>
        ` : ''}
      </div>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = '<p class="text-red-400 col-span-full text-center">Erro ao carregar mesas</p>';
    console.error(error);
  }
}

async function openModalMesa(mesaId = null) {
  document.getElementById('modalMesa').classList.remove('hidden');
  document.getElementById('modalMesaTitle').textContent = mesaId ? 'Editar Mesa' : 'Adicionar Mesa';
  document.getElementById('mesaId').value = mesaId || '';
  document.getElementById('fotoPrincipalIndex').value = '-1';
  
  if (mesaId) {
    // Se é edição, carregar tipos e dados da mesa
    await loadTiposSelect();
    
    const mesa = mesasCache.find(m => m.id === mesaId);
    if (mesa) {
      document.getElementById('mesaTipo').value = mesa.tipo;
      document.getElementById('mesaNome').value = mesa.nome;
      document.getElementById('mesaDescricao').value = mesa.descricao || '';
      document.getElementById('mesaEspecs').value = (mesa.especificacoes || []).join('\n');
      
      // Disponibilidade com nova lógica
      const statusDisp = mesa.status || (mesa.disponivel !== false ? 'disponivel' : 'encomenda');
      document.getElementById('mesaDisponivel').value = statusDisp;
      
      // Preço e dimensões
      document.getElementById('mesaPreco').value = mesa.preco || '';
      document.getElementById('mesaComprimento').value = mesa.dimensoes?.comprimento || '';
      document.getElementById('mesaLargura').value = mesa.dimensoes?.largura || '';
      document.getElementById('mesaAltura').value = mesa.dimensoes?.altura || '';
      document.getElementById('mesaEspessura').value = mesa.dimensoes?.espessura || '';
      
      // Armazenar fotos existentes
      fotosExistentesAtual = mesa.fotos ? [...mesa.fotos] : [];
      
      // Carregar fotos selecionadas para carrossel (múltiplas)
      if (mesa.fotosCarrossel && Array.isArray(mesa.fotosCarrossel)) {
        document.getElementById('fotosCarrosselArray').value = JSON.stringify(mesa.fotosCarrossel);
      } else if (mesa.fotoCarrossel) {
        // Compatibilidade com o campo antigo (única foto)
        document.getElementById('fotosCarrosselArray').value = JSON.stringify([mesa.fotoCarrossel]);
      } else {
        document.getElementById('fotosCarrosselArray').value = JSON.stringify([]);
      }
      
      // Mostrar fotos existentes
      if (mesa.fotos && mesa.fotos.length > 0) {
        exibirTodasFotos(mesa.fotoPrincipal);
      }
    }
  } else {
    // Novo mesa - limpar completamente e carregar tipos
    await loadTiposSelect();
    
    fotosExistentesAtual = [];
    arquivosNovasFotos = [];
    
    // Limpar todos os campos do formulário
    document.getElementById('mesaTipo').value = '';
    document.getElementById('mesaNome').value = '';
    document.getElementById('mesaDescricao').value = '';
    document.getElementById('mesaEspecs').value = '';
    document.getElementById('mesaDisponivel').value = 'disponivel';
    document.getElementById('mesaPreco').value = '';
    document.getElementById('mesaComprimento').value = '';
    document.getElementById('mesaLargura').value = '';
    document.getElementById('mesaAltura').value = '';
    document.getElementById('mesaEspessura').value = '';
    document.getElementById('fotosCarrosselArray').value = JSON.stringify([]);
    
    // Limpar preview de fotos
    document.getElementById('previewFotos').innerHTML = '<p class="text-gray-400">Nenhuma foto adicionada</p>';
    
    // Limpar seletor de carrossel
    document.getElementById('fotosCarrosselContainer').innerHTML = '<p class="text-gray-400 text-sm">Carregue fotos primeiro para selecionar</p>';
    
    // Limpar input de arquivos
    document.getElementById('fotosInput').value = '';
  }
}

function exibirFotosExistentes(fotos, fotoPrincipal) {
  const preview = document.getElementById('previewFotos');
  preview.innerHTML = fotos.map((foto, idx) => `
    <div class="relative group cursor-pointer" onclick="selecionarFotoPrincipal(${idx}, true)">
      <img src="${foto}" class="w-full h-24 object-contain rounded-lg border-2 ${idx === fotos.indexOf(fotoPrincipal) ? 'border-ouro' : 'border-gray-600'} hover:border-ouro transition bg-gray-800">
      ${idx === fotos.indexOf(fotoPrincipal) ? '<div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg"><span class="text-ouro font-bold text-sm">PRINCIPAL</span></div>' : ''}
      <button onclick="removerFotoExistente(event, ${idx})" class="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold">×</button>
    </div>
  `).join('');
}

// Exibir todas as fotos (existentes + novas)
function exibirTodasFotos(fotoPrincipal = null) {
  const preview = document.getElementById('previewFotos');
  const todasFotos = [...fotosExistentesAtual];
  
  // Determinar índice da foto principal (-1 significa nenhuma principal)
  let principalIdx = fotoPrincipal ? todasFotos.indexOf(fotoPrincipal) : -1;
  if (principalIdx === -1 && fotoPrincipal !== null && fotoPrincipal !== undefined) {
    principalIdx = -1;
  }
  
  preview.innerHTML = todasFotos.map((foto, idx) => {
    return `
    <div class="relative group" data-foto-idx="${idx}">
      <img src="${foto}" class="w-full h-24 object-contain rounded-lg border-2 ${idx === principalIdx ? 'border-ouro' : 'border-gray-600'} hover:border-ouro transition cursor-pointer bg-gray-800" onclick="selecionarFotoPrincipalGlobal(${idx})">
      ${idx === principalIdx ? '<div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg pointer-events-none"><span class="text-ouro font-bold text-sm">PRINCIPAL</span></div>' : ''}
      <div class="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        ${idx > 0 ? `<button onclick="moverFoto(${idx}, ${idx - 1})" class="bg-blue-600 hover:bg-blue-700 text-white rounded w-6 h-6 flex items-center justify-center text-xs font-bold">↑</button>` : ''}
        ${idx < todasFotos.length - 1 ? `<button onclick="moverFoto(${idx}, ${idx + 1})" class="bg-blue-600 hover:bg-blue-700 text-white rounded w-6 h-6 flex items-center justify-center text-xs font-bold">↓</button>` : ''}
        <button onclick="removerFotoGlobal(event, ${idx})" class="bg-red-600 hover:bg-red-700 text-white rounded w-6 h-6 flex items-center justify-center text-xs font-bold">×</button>
      </div>
    </div>
  `}).join('');
  
  // Adicionar preview das novas fotos a serem adicionadas
  if (arquivosNovasFotos.length > 0) {
    const novasHTML = arquivosNovasFotos.map((file, idx) => {
      const globalIdx = todasFotos.length + idx;
      const srcFoto = file instanceof File || (typeof file === 'object' && file.slice) ? URL.createObjectURL(file) : file;
      return `
        <div class="relative group" data-foto-idx="${globalIdx}">
          <img src="${srcFoto}" class="w-full h-24 object-contain rounded-lg border-2 border-green-500 hover:border-ouro transition cursor-pointer bg-gray-800" onclick="selecionarFotoPrincipalGlobal(${globalIdx})">
          <div class="absolute top-1 left-1 bg-green-600 px-2 py-0.5 rounded text-xs text-white font-bold">NOVA</div>
          <div class="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            ${globalIdx > 0 ? `<button onclick="moverFoto(${globalIdx}, ${globalIdx - 1})" class="bg-blue-600 hover:bg-blue-700 text-white rounded w-6 h-6 flex items-center justify-center text-xs font-bold">↑</button>` : ''}
            ${globalIdx < todasFotos.length + arquivosNovasFotos.length - 1 ? `<button onclick="moverFoto(${globalIdx}, ${globalIdx + 1})" class="bg-blue-600 hover:bg-blue-700 text-white rounded w-6 h-6 flex items-center justify-center text-xs font-bold">↓</button>` : ''}
            <button onclick="removerFotoGlobal(event, ${globalIdx})" class="bg-red-600 hover:bg-red-700 text-white rounded w-6 h-6 flex items-center justify-center text-xs font-bold">×</button>
          </div>
        </div>
      `;
    }).join('');
    preview.innerHTML += novasHTML;
  }
  
  // Atualizar índice da foto principal
  document.getElementById('fotoPrincipalIndex').value = principalIdx;
  
  // Atualizar seletor de fotos do carrossel (incluir também as novas fotos)
  const todasAsFotos = [...todasFotos];
  // Adicionar referências às fotos novas (marcadas com "NEW:")
  for (let i = 0; i < arquivosNovasFotos.length; i++) {
    todasAsFotos.push(`NEW:${i}`);
  }
  exibirSeletorCarrossel(todasAsFotos);
}

function selecionarFotoPrincipalGlobal(idx) {
  const principalAtual = parseInt(document.getElementById('fotoPrincipalIndex').value);
  
  // Se clicar na mesma foto que é principal, remove a marcação
  if (idx === principalAtual) {
    document.getElementById('fotoPrincipalIndex').value = '-1';
    exibirTodasFotos(null);
  } else {
    // Senão, marca como principal
    document.getElementById('fotoPrincipalIndex').value = idx;
    const todasFotos = [...fotosExistentesAtual];
    const fotoPrincipal = idx < todasFotos.length ? todasFotos[idx] : null;
    exibirTodasFotos(fotoPrincipal);
  }
}

function exibirSeletorCarrossel(todasFotos = []) {
  const container = document.getElementById('fotosCarrosselContainer');
  
  if (todasFotos.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-sm">Carregue fotos primeiro para selecionar</p>';
    return;
  }
  
  // Recuperar fotos selecionadas para o carrossel
  let selecionadas = [];
  try {
    selecionadas = JSON.parse(document.getElementById('fotosCarrosselArray').value || '[]');
    if (!Array.isArray(selecionadas)) selecionadas = [];
  } catch (e) {
    selecionadas = [];
  }
  
  container.innerHTML = `
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3 p-3 rounded border border-gray-600 bg-black/30 hover:border-red-500/40 transition">
        <button type="button" onclick="limparFotosCarrossel()" class="px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/35 border border-red-500/30 text-red-300 text-sm transition">
          Não incluir no carrossel
        </button>
        <span class="text-xs text-gray-500">Selecionadas: ${selecionadas.length}</span>
      </div>
      ${todasFotos.map((foto, idx) => {
        // Verificar se é uma foto nova (começa com "NEW:")
        const isNovaFoto = foto.startsWith('NEW:');
        const srcPreview = isNovaFoto ? 
          URL.createObjectURL(arquivosNovasFotos[parseInt(foto.split(':')[1])]) : 
          foto;
        const labelFoto = isNovaFoto ? `Foto Nova ${parseInt(foto.split(':')[1]) + 1}` : `Foto ${idx + 1}`;
        
        // Verificar se está selecionada no carrossel
        const isSelected = selecionadas.includes(foto);
        
        return `
        <div class="flex items-center gap-3 p-3 rounded border border-gray-600 bg-black/30 hover:border-ouro/50 transition">
          <input type="checkbox" 
                 name="fotoCarrossel"
                 value="${foto}"
                 id="carrossel-foto-${idx}"
                 data-foto-url="${foto}"
                 ${isSelected ? 'checked' : ''}
                 onchange="atualizarFotosCarrossel()"
                 class="cursor-pointer w-4 h-4">
          <img src="${srcPreview}" class="w-12 h-12 object-contain rounded border border-gray-600 bg-gray-800">
          <label for="carrossel-foto-${idx}" class="text-sm text-gray-400 cursor-pointer flex-1">${labelFoto}</label>
          ${isSelected ? '<span class="text-xs bg-ouro text-black px-2 py-1 rounded font-bold">✓ CARROSSEL</span>' : ''}
        </div>
      `;
      }).join('')}
    </div>
  `;
}

function atualizarFotosCarrossel() {
  // Recuperar quais checkboxes estão selecionados
  const checkboxesSelecionados = document.querySelectorAll('input[type="checkbox"][name="fotoCarrossel"]:checked');
  const fotosCarrossel = Array.from(checkboxesSelecionados).map(cb => cb.value);
  
  // Salvar como JSON no hidden input
  document.getElementById('fotosCarrosselArray').value = JSON.stringify(fotosCarrossel);
  
  // Re-renderizar para atualizar UI
  const todasFotos = [...fotosExistentesAtual];
  // Adicionar referências às fotos novas
  for (let i = 0; i < arquivosNovasFotos.length; i++) {
    todasFotos.push(`NEW:${i}`);
  }
  exibirSeletorCarrossel(todasFotos);
}

function limparFotosCarrossel() {
  document.getElementById('fotosCarrosselArray').value = JSON.stringify([]);

  const todasFotos = [...fotosExistentesAtual];
  for (let i = 0; i < arquivosNovasFotos.length; i++) {
    todasFotos.push(`NEW:${i}`);
  }
  exibirSeletorCarrossel(todasFotos);
}

function moverFoto(deIdx, paraIdx) {
  const totalExistentes = fotosExistentesAtual.length;
  
  // Se ambas são existentes
  if (deIdx < totalExistentes && paraIdx < totalExistentes) {
    [fotosExistentesAtual[deIdx], fotosExistentesAtual[paraIdx]] = [fotosExistentesAtual[paraIdx], fotosExistentesAtual[deIdx]];
  }
  // Se ambas são novas
  else if (deIdx >= totalExistentes && paraIdx >= totalExistentes) {
    const deIdxNova = deIdx - totalExistentes;
    const paraIdxNova = paraIdx - totalExistentes;
    [arquivosNovasFotos[deIdxNova], arquivosNovasFotos[paraIdxNova]] = [arquivosNovasFotos[paraIdxNova], arquivosNovasFotos[deIdxNova]];
  }
  // Se está movendo entre existente e nova - NÃO PERMITIR
  // As fotos existentes devem permanecer juntas e as novas juntas
  
  exibirTodasFotos();
}

function removerFotoGlobal(event, idx) {
  event.stopPropagation();
  
  const totalExistentes = fotosExistentesAtual.length;
  const totalFotos = totalExistentes + arquivosNovasFotos.length;
  
  if (totalFotos <= 1) {
    showToast('A mesa precisa ter pelo menos uma foto.', 'warning');
    return;
  }
  
  if (idx < totalExistentes) {
    // Remover foto existente
    fotosExistentesAtual = fotosExistentesAtual.filter((_, i) => i !== idx);
  } else {
    // Remover foto nova
    const novaIdx = idx - totalExistentes;
    arquivosNovasFotos = arquivosNovasFotos.filter((_, i) => i !== novaIdx);
  }
  
  // Ajustar índice da foto principal se necessário
  const fotoPrincipalIdx = parseInt(document.getElementById('fotoPrincipalIndex').value);
  if (fotoPrincipalIdx >= totalFotos - 1) {
    document.getElementById('fotoPrincipalIndex').value = '0';
  } else if (fotoPrincipalIdx > idx) {
    document.getElementById('fotoPrincipalIndex').value = (fotoPrincipalIdx - 1).toString();
  }
  
  exibirTodasFotos();
}

// Event listener para preview de fotos
document.getElementById('mesaFotos').addEventListener('change', function() {
  const files = Array.from(this.files);
  
  const totalFotos = fotosExistentesAtual.length + arquivosNovasFotos.length + files.length;
  if (totalFotos > 10) {
    showToast('Máximo de 10 fotos permitidas no total', 'warning');
    this.value = '';
    return;
  }
  
  arquivosNovasFotos = [...arquivosNovasFotos, ...files];
  exibirTodasFotos();
  
  // Limpar input para poder adicionar mais fotos depois
  this.value = '';
});

function closeModalMesa() {
  document.getElementById('modalMesa').classList.add('hidden');
  document.getElementById('formMesa').reset();
  document.getElementById('previewFotos').innerHTML = '';
  document.getElementById('fotoPrincipalIndex').value = '-1';
  arquivosNovasFotos = [];
  fotosExistentesAtual = [];
}

async function editarMesa(id) {
  openModalMesa(id);
}

async function moverMesaCarrossel(mesaId, direcao) {
  showLoading();
  try {
    // Buscar todas as mesas que estão no carrossel
    const snapshot = await firebaseDB.collection('mesas')
      .where('fotoCarrossel', '!=', '')
      .get();
    
    const mesasCarrossel = [];
    snapshot.forEach(doc => {
      mesasCarrossel.push({
        id: doc.id,
        ordemCarrossel: doc.data().ordemCarrossel !== undefined ? doc.data().ordemCarrossel : 0
      });
    });
    
    // Ordenar por ordem
    mesasCarrossel.sort((a, b) => a.ordemCarrossel - b.ordemCarrossel);
    
    // Encontrar índice da mesa atual
    const indice = mesasCarrossel.findIndex(m => m.id === mesaId);
    if (indice === -1) {
      showToast('Mesa não encontrada no carrossel', 'error');
      hideLoading();
      return;
    }
    
    const novoIndice = indice + direcao;
    if (novoIndice < 0 || novoIndice >= mesasCarrossel.length) {
      showToast('Não é possível mover para essa posição', 'warning');
      hideLoading();
      return;
    }
    
    // Trocar as duas mesas de posição no array
    [mesasCarrossel[indice], mesasCarrossel[novoIndice]] = [mesasCarrossel[novoIndice], mesasCarrossel[indice]];
    
    // Atualizar TODAS as mesas com novas ordens sequenciais (0, 1, 2, 3...)
    const updates = [];
    mesasCarrossel.forEach((mesa, novaOrdem) => {
      updates.push(
        firebaseDB.collection('mesas').doc(mesa.id).update({
          ordemCarrossel: novaOrdem
        })
      );
    });
    
    await Promise.all(updates);
    await loadMesas();
    showToast('Ordem do carrossel atualizada!', 'success');
  } catch (error) {
    showToast('Erro ao atualizar ordem: ' + error.message, 'error');
    console.error(error);
  } finally {
    hideLoading();
  }
}

async function deletarMesa(id) {
  if (!confirm('Tem certeza que deseja deletar esta mesa?')) return;
  
  showLoading();
  try {
    await firebaseDB.collection('mesas').doc(id).delete();
    await loadMesas();
    showToast('Mesa deletada com sucesso!', 'success');
  } catch (error) {
    showToast('Erro ao deletar mesa: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

document.getElementById('formMesa').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const mesaId = document.getElementById('mesaId').value;
  const tipo = document.getElementById('mesaTipo').value.trim();
  const nome = document.getElementById('mesaNome').value;
  const descricao = document.getElementById('mesaDescricao').value;
  const especificacoes = document.getElementById('mesaEspecs').value.split('\n').filter(e => e.trim());
  const status = document.getElementById('mesaDisponivel').value;
  const preco = parseFloat(document.getElementById('mesaPreco').value);
  const fotosInput = document.getElementById('mesaFotos').files;
  const fotoPrincipalIndex = parseInt(document.getElementById('fotoPrincipalIndex').value);
  
  // Dimensões
  const dimensoes = {
    comprimento: parseFloat(document.getElementById('mesaComprimento').value),
    largura: parseFloat(document.getElementById('mesaLargura').value),
    altura: parseFloat(document.getElementById('mesaAltura').value),
    espessura: parseFloat(document.getElementById('mesaEspessura').value)
  };

  if (!tipo) {
    showToast('Selecione o tipo da mesa', 'warning');
    return;
  }
  
  if (isNaN(preco) || preco <= 0) {
    showToast('Informe um preço válido', 'warning');
    return;
  }
  
  if (Object.values(dimensoes).some(v => isNaN(v) || v <= 0)) {
    showToast('Informe todas as dimensões corretamente', 'warning');
    return;
  }
  
  // Verificar se o tipo existe
  if (!tiposCache.some(t => t.nome === tipo)) {
    showToast('O tipo selecionado não existe. Cadastre-o primeiro na aba "Tipos de Mesa".', 'error');
    return;
  }
  
  showLoading();
  try {
    // Começar com as fotos existentes
    const fotosUrls = [...fotosExistentesAtual];
    
    // Upload de fotos novas e mapear NEW: para URLs reais
    const urlMapeamento = {}; // Mapear NEW:0 -> URL real, etc
    for (let i = 0; i < arquivosNovasFotos.length; i++) {
      const file = arquivosNovasFotos[i];
      const storageRef = firebaseStorage.ref(`mesas/${Date.now()}_${file.name}`);
      const snapshot = await storageRef.put(file);
      const url = await snapshot.ref.getDownloadURL();
      fotosUrls.push(url);
      urlMapeamento[`NEW:${i}`] = url;
    }
    
    // Determinar foto principal
    const fotoPrincipalIndex = parseInt(document.getElementById('fotoPrincipalIndex').value);
    const fotoPrincipal = fotosUrls[fotoPrincipalIndex >= 0 && fotoPrincipalIndex < fotosUrls.length ? fotoPrincipalIndex : 0];
    
    // Recuperar fotos selecionadas para o carrossel (múltiplas)
    let fotosCarrossel = [];
    try {
      const fotosCarrosselRaw = JSON.parse(document.getElementById('fotosCarrosselArray').value || '[]');
      
      // Mapear NEW: para URLs reais
      fotosCarrossel = fotosCarrosselRaw.map(foto => {
        if (foto.startsWith('NEW:')) {
          return urlMapeamento[foto] || null;
        }
        return foto;
      }).filter(f => f !== null); // Remover nulas
    } catch (e) {
      fotosCarrossel = [];
    }
    
    // Para compatibilidade, usar a primeira foto do carrossel como fotoCarrossel principal
    const fotoCarrossel = fotosCarrossel.length > 0 ? fotosCarrossel[0] : '';
    
    // Determinar ordemCarrossel
    let ordemCarrossel = undefined;
    let removerOrdem = false;
    
    if (fotoCarrossel) {
      // Adicionando ou atualizando para carrossel
      if (mesaId) {
        // Se é edição e já tinha ordem, manter a ordem existente
        const mesaAtual = mesasCache.find(m => m.id === mesaId);
        if (mesaAtual && typeof mesaAtual.ordemCarrossel === 'number') {
          ordemCarrossel = mesaAtual.ordemCarrossel;
        } else {
          // Se é edição mas não tinha ordem, atribuir nova ordem no final
          const snapshot = await firebaseDB.collection('mesas').get();
          let maxOrdem = -1;
          snapshot.forEach(doc => {
            if (doc.id !== mesaId) { // Não contar a mesa atual
              const mesa = doc.data();
              if (mesa.fotoCarrossel && mesa.fotoCarrossel.trim() !== '') {
                const ordem = mesa.ordemCarrossel;
                if (typeof ordem === 'number' && ordem > maxOrdem) {
                  maxOrdem = ordem;
                }
              }
            }
          });
          ordemCarrossel = maxOrdem + 1;
        }
      } else {
        // Se é mesa nova, atribuir no final
        const snapshot = await firebaseDB.collection('mesas').get();
        let maxOrdem = -1;
        snapshot.forEach(doc => {
          const mesa = doc.data();
          if (mesa.fotoCarrossel && mesa.fotoCarrossel.trim() !== '') {
            const ordem = mesa.ordemCarrossel;
            if (typeof ordem === 'number' && ordem > maxOrdem) {
              maxOrdem = ordem;
            }
          }
        });
        ordemCarrossel = maxOrdem + 1;
      }
    } else {
      // Removendo do carrossel, marcar para remover a ordem
      removerOrdem = true;
    }
    
    const mesaData = {
      tipo,
      nome,
      descricao,
      especificacoes,
      status,
      disponivel: status === 'disponivel', // manter compatibilidade
      preco,
      dimensoes,
      fotos: fotosUrls,
      fotoPrincipal: fotoPrincipal,
      fotoCarrossel: fotoCarrossel, // Primeira foto para compatibilidade
      fotosCarrossel: fotosCarrossel, // Array de múltiplas fotos para o carrossel
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Adicionar ou remover ordemCarrossel
    if (ordemCarrossel !== undefined) {
      mesaData.ordemCarrossel = ordemCarrossel;
    } else if (removerOrdem && mesaId) {
      // Se está removendo do carrossel, deletar a ordem
      mesaData.ordemCarrossel = firebase.firestore.FieldValue.delete();
    }
    
    if (mesaId) {
      await firebaseDB.collection('mesas').doc(mesaId).update(mesaData);
    } else {
      mesaData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await firebaseDB.collection('mesas').add(mesaData);
    }
    
    closeModalMesa();
    await loadMesas();
    await loadTipos();
    showToast('Mesa salva com sucesso!', 'success');
    hideLoading();
  } catch (error) {
    showToast('Erro ao salvar mesa: ' + error.message, 'error');
    console.error(error);
    hideLoading();
  }
});

// ================================
// TIPOS - CRUD
// ================================

let tiposCache = [];

async function loadTipos() {
  const container = document.getElementById('listaTipos');
  if (container) {
    container.innerHTML = '<p class="text-gray-400 col-span-full text-center">Carregando...</p>';
  }
  
  try {
    const snapshot = await firebaseDB.collection('tipos').orderBy('nome').get();
    tiposCache = [];
    
    snapshot.forEach(doc => {
      tiposCache.push({ id: doc.id, ...doc.data() });
    });
    
    if (!container) return;
    
    if (tiposCache.length === 0) {
      container.innerHTML = '<p class="text-gray-400 col-span-full text-center">Nenhum tipo cadastrado</p>';
      return;
    }
    
    // Para cada tipo, buscar as mesas daquele tipo
    const tiposHTML = await Promise.all(tiposCache.map(async (tipo) => {
      const mesasDoTipo = await firebaseDB.collection('mesas').where('tipo', '==', tipo.nome).get();
      const mesas = [];
      mesasDoTipo.forEach(doc => {
        mesas.push({ id: doc.id, ...doc.data() });
      });
      
      // Pegar as fotos principais das mesas
      const fotosPreview = mesas.map(m => m.fotoPrincipal || m.fotos?.[0] || '/img/placeholder.svg').slice(0, 3);
      
      return `
      <div class="admin-card rounded-xl p-4 flex flex-col h-full">
        <div class="flex justify-between items-start mb-4">
          <div class="flex-1">
            <h3 class="font-title text-ouro text-lg">${tipo.nome}</h3>
            <p class="text-xs text-gray-400 mt-1">${mesas.length} mesa(s)</p>
          </div>
          <div class="flex gap-2">
            <button onclick="editarTipo('${tipo.id}')" class="text-blue-400 hover:text-blue-300 text-sm">
              ✏️
            </button>
            <button onclick="deletarTipo('${tipo.id}')" class="text-red-400 hover:text-red-300 text-sm">
              🗑️
            </button>
          </div>
        </div>
        
        <div class="grid grid-cols-3 gap-2 mb-3 flex-1">
          ${fotosPreview.map(foto => `
            <img src="${foto}" class="w-full h-20 object-contain rounded-lg border border-ouro/20 bg-gray-800" alt="mesa" onerror="this.src='/img/placeholder.svg'">
          `).join('')}
        </div>
        
        ${tipo.descricao ? `<p class="text-xs text-gray-400 mt-2">${tipo.descricao}</p>` : ''}
      </div>
      `;
    }));
    
    container.innerHTML = tiposHTML.join('');
  } catch (error) {
    if (container) {
      container.innerHTML = '<p class="text-red-400 col-span-full text-center">Erro ao carregar tipos</p>';
    }
    console.error('Erro ao loadTipos:', error);
  }
}

async function loadTiposSelect() {
  await loadTipos();
  const selectTipo = document.getElementById('mesaTipo');
  if (!selectTipo) return;
  
  // Guardar valor atual
  const valorAtual = selectTipo.value;
  
  // Limpar e preencher select
  selectTipo.innerHTML = '<option value="" disabled>Selecione um tipo...</option>';
  selectTipo.innerHTML += tiposCache.map(tipo => 
    `<option value="${tipo.nome}">${tipo.nome}</option>`
  ).join('');
  
  // Restaurar valor se existir
  if (valorAtual && tiposCache.some(t => t.nome === valorAtual)) {
    selectTipo.value = valorAtual;
  }
}

function openModalTipo(tipoId = null) {
  document.getElementById('modalTipo').classList.remove('hidden');
  document.getElementById('tipoId').value = tipoId || '';
  document.getElementById('modalTipoTitle').textContent = tipoId ? 'Editar Tipo' : 'Adicionar Tipo de Mesa';
  
  let nomeTypeAtual = '';
  let mesasCarrosselAtual = [];
  
  if (tipoId) {
    const tipo = tiposCache.find(t => t.id === tipoId);
    if (tipo) {
      document.getElementById('tipoNome').value = tipo.nome || '';
      document.getElementById('tipoDescricao').value = tipo.descricao || '';
      nomeTypeAtual = tipo.nome;
      mesasCarrosselAtual = tipo.mesasCarrossel || [];
    }
  } else {
    document.getElementById('tipoNome').value = '';
    document.getElementById('tipoDescricao').value = '';
  }
  
  // Carregar mesas deste tipo
  carregarMesasParaCarrossel(nomeTypeAtual, mesasCarrosselAtual);
}

async function carregarMesasParaCarrossel(nomeType, mesasCarrosselAtual = []) {
  const container = document.getElementById('mesasCarrosselContainer');
  
  try {
    let snapshot;
    if (nomeType) {
      // Se estamos editando um tipo, buscar as mesas dele
      snapshot = await firebaseDB.collection('mesas').where('tipo', '==', nomeType).get();
    } else {
      container.innerHTML = '<p class="text-gray-400 text-sm">Salve o tipo primeiro para adicionar mesas</p>';
      return;
    }
    
    if (snapshot.empty) {
      container.innerHTML = '<p class="text-gray-400 text-sm">Nenhuma mesa cadastrada para este tipo</p>';
      return;
    }
    
    const mesas = [];
    snapshot.forEach(doc => {
      mesas.push({ id: doc.id, ...doc.data() });
    });
    
    // Renderizar checkboxes para cada mesa
    container.innerHTML = mesas.map(mesa => `
      <label class="flex items-center gap-3 cursor-pointer hover:bg-black/50 p-2 rounded transition">
        <input type="checkbox" class="mesa-carrossel-checkbox" value="${mesa.id}" 
               ${mesasCarrosselAtual.includes(mesa.id) ? 'checked' : ''} 
               class="w-4 h-4">
        <span class="text-sm text-gray-300">${mesa.nome}</span>
      </label>
    `).join('');
    
    // Armazenar globalmente para usar no submit
    window.mesasParaCarrossel = mesas.map(m => m.id);
  } catch (error) {
    console.error('Erro ao carregar mesas:', error);
    container.innerHTML = '<p class="text-red-400 text-sm">Erro ao carregar mesas</p>';
  }
}

function closeModalTipo() {
  document.getElementById('modalTipo').classList.add('hidden');
  document.getElementById('formTipo').reset();
  document.getElementById('tipoId').value = '';
}

async function editarTipo(id) {
  openModalTipo(id);
}

async function deletarTipo(id) {
  if (!confirm('Tem certeza que deseja deletar este tipo?')) return;
  
  showLoading();
  try {
    await firebaseDB.collection('tipos').doc(id).delete();
    showToast('Tipo deletado com sucesso!', 'success');
    await loadTipos();
  } catch (error) {
    showToast('Erro ao deletar tipo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

document.getElementById('formTipo').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const tipoId = document.getElementById('tipoId').value;
  const nome = document.getElementById('tipoNome').value;
  const descricao = document.getElementById('tipoDescricao').value;
  
  // Pegar IDs das mesas selecionadas no carrossel
  const mesasCarrosselSelecionadas = Array.from(
    document.querySelectorAll('.mesa-carrossel-checkbox:checked')
  ).map(checkbox => checkbox.value);
  
  // Verificar se está autenticado
  const user = firebaseAuth.currentUser;
  if (!user) {
    showToast('Você precisa estar logado para realizar esta ação', 'warning');
    return;
  }
  
  showLoading();
  
  try {
    const updateData = {
      nome,
      descricao,
      mesasCarrossel: mesasCarrosselSelecionadas,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (tipoId) {
      // Editar tipo existente
      await firebaseDB.collection('tipos').doc(tipoId).update(updateData);
      showToast('Tipo atualizado com sucesso!', 'success');
    } else {
      // Adicionar novo tipo
      await firebaseDB.collection('tipos').add({
        ...updateData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('Tipo adicionado com sucesso!', 'success');
    }
    
    closeModalTipo();
    await loadTipos();
  } catch (error) {
    console.error('Erro:', error);
    showToast('Erro ao salvar tipo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

