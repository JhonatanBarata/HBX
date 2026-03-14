// ================================
// AUTENTICACAO
// ================================

let arquivosNovasFotos = [];
let fotoAtualUrl = '';
let mesasCache = [];
let previewObjectUrls = [];
let isSavingMesa = false;
const MAX_UPLOAD_SIZE = 1280;
const JPEG_QUALITY = 0.78;
const PLACEHOLDER_IMAGE = '/dist/img/placeholder.svg';
const TOUCH_DRAG_HOLD_MS = 220;
const TOUCH_DRAG_MOVE_TOLERANCE = 12;
const MODAL_TRANSITION_MS = 360;
let draggedMesaId = null;
let dragOverMesaId = null;
let dragInsertPosition = 'before';
let touchDragTimer = null;
let touchDragStartPoint = null;
let dragPreviewElement = null;
let paymentRequestsCache = [];
let paymentRequestsUnsubscribe = null;
let isCreatingPaymentRequest = false;
let latestPaymentRequestId = "";
let latestPaymentRequestRecord = null;
let activeCarouselType = 'leve';
const CAROUSEL_TYPE_CONFIG = {
  leve: {
    key: 'leve',
    label: 'carrossel leve',
    name: 'Carrossel Leve',
    photoField: 'fotoCarrossel',
    photosField: 'fotosCarrossel',
    orderField: 'ordemCarrossel'
  },
  pesado: {
    key: 'pesado',
    label: 'carrossel pesado',
    name: 'Carrossel Pesado',
    photoField: 'fotoCarrosselPesado',
    photosField: 'fotosCarrosselPesado',
    orderField: 'ordemCarrosselPesado'
  }
};

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'i',
    warning: '!'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
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

function openBackdropModal(modalElement) {
  if (!modalElement) return;
  modalElement.classList.remove('hidden', 'is-closing');
  requestAnimationFrame(() => {
    modalElement.classList.add('is-open');
  });
}

function closeBackdropModal(modalElement, onClosed) {
  if (!modalElement) {
    if (typeof onClosed === 'function') onClosed();
    return;
  }

  if (modalElement.classList.contains('hidden')) {
    if (typeof onClosed === 'function') onClosed();
    return;
  }

  modalElement.classList.remove('is-open');
  modalElement.classList.add('is-closing');

  window.setTimeout(() => {
    modalElement.classList.add('hidden');
    modalElement.classList.remove('is-closing');
    if (typeof onClosed === 'function') {
      onClosed();
    }
  }, MODAL_TRANSITION_MS);
}

window.openBackdropModal = openBackdropModal;
window.closeBackdropModal = closeBackdropModal;

function revokePreviewObjectUrls() {
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewObjectUrls = [];
}

function setMesaFormBusy(isBusy) {
  const submitBtn = document.getElementById('salvarFotoBtn');
  const cancelBtn = document.getElementById('cancelarFotoBtn');
  const closeBtn = document.getElementById('closeModalMesaBtn');
  const fileInput = document.getElementById('mesaFotos');
  const isEditing = Boolean(document.getElementById('mesaId')?.value);

  if (submitBtn) {
    submitBtn.disabled = isBusy;
    submitBtn.textContent = isBusy
      ? (isEditing ? 'Enviando foto...' : 'Enviando fotos...')
      : (isEditing ? 'Salvar foto' : 'Salvar fotos');
  }

  if (cancelBtn) {
    cancelBtn.disabled = isBusy;
  }

  if (closeBtn) {
    closeBtn.disabled = isBusy;
  }

  if (fileInput) {
    fileInput.disabled = isBusy;
  }
}

function setUploadProgress({
  visible = false,
  percent = 0,
  label = 'Selecione as fotos para iniciar o envio.',
  countText = '0 de 0',
  status = 'Aguardando'
} = {}) {
  const card = document.getElementById('uploadProgressCard');
  const percentEl = document.getElementById('uploadProgressPercent');
  const bar = document.getElementById('uploadProgressBar');
  const labelEl = document.getElementById('uploadProgressLabel');
  const countEl = document.getElementById('uploadProgressCount');
  const statusEl = document.getElementById('uploadProgressStatus');

  if (!card || !percentEl || !bar || !labelEl || !countEl || !statusEl) return;

  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

  card.classList.toggle('hidden', !visible);
  percentEl.textContent = `${safePercent}%`;
  bar.style.width = `${safePercent}%`;
  labelEl.textContent = label;
  countEl.textContent = countText;
  statusEl.textContent = status;
}

function resetUploadProgress() {
  setUploadProgress();
}

function carregarImagemDeArquivo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };

    img.src = url;
  });
}

async function otimizarImagem(file) {
  try {
    const img = await carregarImagemDeArquivo(file);
    const maxSide = Math.max(img.width, img.height);
    const scale = maxSide > MAX_UPLOAD_SIZE ? MAX_UPLOAD_SIZE / maxSide : 1;
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );

    if (!blob) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch (error) {
    console.error('Erro ao otimizar imagem:', error);
    return file;
  }
}

async function prepararArquivosParaUpload(files) {
  const lista = Array.isArray(files) ? files.filter(Boolean) : [];

  if (!lista.length) {
    return [];
  }

  const total = lista.length;
  const otimizados = [];

  for (let index = 0; index < total; index += 1) {
    setUploadProgress({
      visible: true,
      percent: (index / total) * 100,
      label: total === 1 ? 'Otimizando foto...' : `Otimizando foto ${index + 1} de ${total}...`,
      countText: `${index + 1} de ${total}`,
      status: 'Otimizacao'
    });

    const otimizado = await otimizarImagem(lista[index]);
    otimizados.push(otimizado);
  }

  setUploadProgress({
    visible: true,
    percent: 100,
    label: total === 1 ? 'Otimizacao concluida.' : 'Otimizacao concluida.',
    countText: `${total} de ${total}`,
    status: 'Otimizacao'
  });

  return otimizados;
}

function setAuthNavVisible(isVisible) {
  const navAuth = document.getElementById('adminNavAuth');
  const logoutMobile = document.getElementById('logoutBtnMobile');
  const logoutBtn = document.getElementById('logoutBtn');

  if (navAuth) {
    navAuth.classList.toggle('hidden', !isVisible);
    navAuth.setAttribute('data-auth', isVisible ? '1' : '0');
  }

  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isVisible);
  }

  if (logoutMobile) {
    logoutMobile.classList.toggle('hidden', !isVisible);
    logoutMobile.setAttribute('data-auth', isVisible ? '1' : '0');
  }
}

setAuthNavVisible(false);

function getFriendlyAuthError(error) {
  const errorMessages = {
    'auth/invalid-credential': 'Email ou senha incorretos.',
    'auth/wrong-password': 'Email ou senha incorretos.',
    'auth/user-not-found': 'Email ou senha incorretos.',
    'auth/invalid-email': 'Email inválido.',
    'auth/invalid-api-key': 'Configuracao do Firebase invalida.',
    'auth/network-request-failed': 'Falha de conexao. Tente novamente.'
  };

  return errorMessages[error.code] || `Erro ao entrar: ${error.message}`;
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');

  try {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    errorDiv.classList.add('hidden');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('userEmail').textContent = email;
    setAuthNavVisible(true);
    loadMesas();
    startPaymentRequestsListener();
  } catch (error) {
    errorDiv.textContent = getFriendlyAuthError(error);
    errorDiv.classList.remove('hidden');
    console.error('Erro no login:', error);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
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

firebaseAuth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;
    setAuthNavVisible(true);
    loadMesas();
    startPaymentRequestsListener();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('userEmail').textContent = '';
    setAuthNavVisible(false);
    stopPaymentRequestsListener();
    renderPaymentRequests([]);
  }
});

// ================================
// TABS
// ================================

function showTab(tabName, triggerButton = null) {
  document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));

  const content = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (content) {
    content.classList.remove('hidden');
    content.classList.remove('tab-entering');
    requestAnimationFrame(() => {
      content.classList.add('tab-entering');
      window.setTimeout(() => content.classList.remove('tab-entering'), 450);
    });
  }

  if (triggerButton) {
    triggerButton.classList.add('active');
  } else if (event?.target) {
    event.target.classList.add('active');
  }

  const addPhotoButton = document.getElementById('tabAddPhotoAction');
  if (addPhotoButton) {
    const showAddPhoto = tabName === 'mesas';
    addPhotoButton.classList.toggle('is-hidden', !showAddPhoto);
    addPhotoButton.disabled = !showAddPhoto;
  }
}

showTab('payments', document.getElementById('tabBtnPayments'));

// ================================
// CARROSSEL
// ================================

function getCarouselTypeConfig(type = activeCarouselType) {
  return CAROUSEL_TYPE_CONFIG[type] || CAROUSEL_TYPE_CONFIG.leve;
}

function getCarouselPhotoByType(mesa, type = activeCarouselType) {
  if (!mesa) return '';
  const config = getCarouselTypeConfig(type);
  const photo = mesa[config.photoField];
  return typeof photo === 'string' ? photo.trim() : '';
}

function getCarouselOrderByType(mesa, type = activeCarouselType) {
  if (!mesa) return 0;
  const config = getCarouselTypeConfig(type);
  return typeof mesa[config.orderField] === 'number' ? mesa[config.orderField] : 999;
}

function updateCarouselTypeUI() {
  const leveBtn = document.getElementById('carouselTypeLeveBtn');
  const pesadoBtn = document.getElementById('carouselTypePesadoBtn');
  const hint = document.getElementById('carouselTypeHint');
  const addPhotoButton = document.getElementById('tabAddPhotoAction');

  if (leveBtn) {
    leveBtn.classList.toggle('active', activeCarouselType === 'leve');
  }

  if (pesadoBtn) {
    pesadoBtn.classList.toggle('active', activeCarouselType === 'pesado');
  }

  if (hint) {
    hint.textContent = activeCarouselType === 'pesado'
      ? 'Gerencie aqui as fotos do carrossel pesado.'
      : 'Gerencie aqui as fotos do carrossel leve.';
  }

  if (addPhotoButton) {
    addPhotoButton.textContent = activeCarouselType === 'pesado'
      ? '+ Adicionar fotos pesados'
      : '+ Adicionar fotos';
  }
}

function setActiveCarouselType(type) {
  if (!CAROUSEL_TYPE_CONFIG[type]) return;
  activeCarouselType = type;
  updateCarouselTypeUI();

  const mesasTab = document.getElementById('tabMesas');
  if (mesasTab && !mesasTab.classList.contains('hidden')) {
    loadMesas();
  }
}

document.getElementById('carouselTypeLeveBtn')?.addEventListener('click', function () {
  setActiveCarouselType('leve');
});

document.getElementById('carouselTypePesadoBtn')?.addEventListener('click', function () {
  setActiveCarouselType('pesado');
});

updateCarouselTypeUI();

async function loadMesas() {
  const container = document.getElementById('listaMesas');
  if (!container) return;

  container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--muted);">Carregando...</p>';

  try {
    const snapshot = await firebaseDB.collection('mesas').orderBy('createdAt', 'desc').get();
    mesasCache = [];
    const config = getCarouselTypeConfig(activeCarouselType);

    snapshot.forEach((doc) => {
      mesasCache.push({ id: doc.id, ...doc.data() });
    });

    const mesasCarrossel = getMesasCarrosselOrdenadas(activeCarouselType);
    if (!mesasCarrossel.length) {
      container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--muted);">Nenhuma foto cadastrada no ${config.label}.</p>`;
      return;
    }

    container.innerHTML = mesasCarrossel.map((mesa, index) => {
      const foto = getCarouselPhotoByType(mesa, activeCarouselType) || mesa.fotoPrincipal || mesa.fotos?.[0] || PLACEHOLDER_IMAGE;
      const posicaoTexto = `Posição ${index + 1} de ${mesasCarrossel.length}`;

      return `
        <div class="admin-card admin-carousel-card" data-mesa-id="${mesa.id}" style="padding: 18px;">
          <div style="position: relative;">
            <div class="drag-meta-row">
              <div class="drag-handle drag-position-badge" data-mesa-id="${mesa.id}" draggable="true" aria-label="Arraste para reordenar">${posicaoTexto}</div>
            </div>
            <img src="${foto}" style="display: block; width: 100%; height: 220px; object-fit: contain; border-radius: 18px; margin-bottom: 14px; background: #ffffff; border: 1px solid var(--line);" onerror="this.src='${PLACEHOLDER_IMAGE}'">
          </div>
          <h3 style="margin: 0 0 14px; font-family: 'Oswald', sans-serif; font-size: 1.15rem; letter-spacing: 0.02em;">${mesa.nome || ('Foto do ' + config.name)}</h3>
          <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
            <button onclick="editarMesa('${mesa.id}')" class="btn-secondary" style="flex: 1; min-height: 44px;">
              Editar
            </button>
            <button onclick="deletarMesa('${mesa.id}')" class="btn-danger" style="flex: 1; min-height: 44px;">
              Deletar
            </button>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button onclick="moverMesaCarrossel('${mesa.id}', -1)" class="btn-secondary" style="flex: 1; min-height: 44px;">Anterior</button>
            <button onclick="moverMesaCarrossel('${mesa.id}', 1)" class="btn-secondary" style="flex: 1; min-height: 44px;">Proxima</button>
          </div>
        </div>
      `;
    }).join('');

    bindReorderInteractions(container);
  } catch (error) {
    container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #f82e32;">Erro ao carregar fotos</p>';
    console.error(error);
  }
}

function getMesasCarrosselOrdenadas(type = activeCarouselType) {
  const config = getCarouselTypeConfig(type);
  return mesasCache
    .filter((mesa) => getCarouselPhotoByType(mesa, type))
    .slice()
    .sort((a, b) => {
      const aOrder = typeof a[config.orderField] === 'number' ? a[config.orderField] : 999;
      const bOrder = typeof b[config.orderField] === 'number' ? b[config.orderField] : 999;
      return aOrder - bOrder;
    });
}

function clearTouchDragTimer() {
  if (touchDragTimer) {
    clearTimeout(touchDragTimer);
    touchDragTimer = null;
  }
}

function updateDragClasses() {
  const cards = document.querySelectorAll('.admin-carousel-card[data-mesa-id]');
  cards.forEach((card) => {
    const mesaId = card.dataset.mesaId;
    card.classList.toggle('is-dragging-source', mesaId === draggedMesaId);
    card.classList.toggle('is-drop-target', mesaId === dragOverMesaId && mesaId !== draggedMesaId);
    card.classList.toggle('is-drop-before', mesaId === dragOverMesaId && mesaId !== draggedMesaId && dragInsertPosition === 'before');
    card.classList.toggle('is-drop-after', mesaId === dragOverMesaId && mesaId !== draggedMesaId && dragInsertPosition === 'after');
  });
}

function removeDragPreview() {
  if (dragPreviewElement) {
    dragPreviewElement.remove();
    dragPreviewElement = null;
  }
}

function resetDragState() {
  draggedMesaId = null;
  dragOverMesaId = null;
  dragInsertPosition = 'before';
  touchDragStartPoint = null;
  clearTouchDragTimer();
  removeDragPreview();
  updateDragClasses();
}

function setDragSource(mesaId) {
  draggedMesaId = mesaId;
  dragOverMesaId = null;
  dragInsertPosition = 'before';
  updateDragClasses();
}

function setDragTarget(mesaId, insertPosition = 'before') {
  dragOverMesaId = mesaId && mesaId !== draggedMesaId ? mesaId : null;
  dragInsertPosition = insertPosition === 'after' ? 'after' : 'before';
  updateDragClasses();
}

function ensureDragPreview(mesaId) {
  if (dragPreviewElement) {
    return dragPreviewElement;
  }

  const sourceCard = document.querySelector(`.admin-carousel-card[data-mesa-id="${mesaId}"]`);
  if (!sourceCard) {
    return null;
  }

  const preview = sourceCard.cloneNode(true);
  preview.className = 'admin-card drag-preview-card';
  preview.removeAttribute('data-mesa-id');
  preview.querySelectorAll('button').forEach((button) => button.remove());

  const rect = sourceCard.getBoundingClientRect();
  preview.style.width = `${rect.width}px`;
  preview.style.left = `${rect.left}px`;
  preview.style.top = `${rect.top}px`;

  document.body.appendChild(preview);
  dragPreviewElement = preview;
  return preview;
}

function updateDragPreviewPosition(clientX, clientY) {
  if (!dragPreviewElement) {
    return;
  }

  const offsetX = dragPreviewElement.offsetWidth / 2;
  const offsetY = 38;
  dragPreviewElement.style.left = `${clientX - offsetX}px`;
  dragPreviewElement.style.top = `${clientY - offsetY}px`;
}

async function persistirNovaOrdemCarrossel(idsEmOrdem) {
  showLoading();

  try {
    const config = getCarouselTypeConfig(activeCarouselType);
    await Promise.all(
      idsEmOrdem.map((id, novaOrdem) =>
        firebaseDB.collection('mesas').doc(id).update({ [config.orderField]: novaOrdem })
      )
    );

    await loadMesas();
    showToast('Ordem do carrossel atualizada!', 'success');
  } catch (error) {
    showToast('Erro ao atualizar ordem: ' + error.message, 'error');
    console.error(error);
  } finally {
    hideLoading();
  }
}

async function reorderMesasByDrop(origemId, destinoId, insertPosition = 'before') {
  if (!origemId || !destinoId || origemId === destinoId) {
    return;
  }

  const mesasCarrossel = getMesasCarrosselOrdenadas();
  const origemIndex = mesasCarrossel.findIndex((mesa) => mesa.id === origemId);
  const destinoIndexOriginal = mesasCarrossel.findIndex((mesa) => mesa.id === destinoId);

  if (origemIndex === -1 || destinoIndexOriginal === -1) {
    showToast('Não foi possível reordenar essa foto.', 'error');
    return;
  }

  const [mesaMovida] = mesasCarrossel.splice(origemIndex, 1);
  const destinoIndex = mesasCarrossel.findIndex((mesa) => mesa.id === destinoId);
  const insertIndex = insertPosition === 'after' ? destinoIndex + 1 : destinoIndex;
  mesasCarrossel.splice(insertIndex, 0, mesaMovida);

  await persistirNovaOrdemCarrossel(mesasCarrossel.map((mesa) => mesa.id));
}

function getInsertPositionFromPointer(card, clientY) {
  const rect = card.getBoundingClientRect();
  const midpoint = rect.top + (rect.height / 2);
  return clientY > midpoint ? 'after' : 'before';
}

function handleReorderDragStart(event) {
  const mesaId = event.currentTarget.dataset.mesaId;
  if (!mesaId) {
    event.preventDefault();
    return;
  }

  setDragSource(mesaId);

  if (event.dataTransfer) {
    const sourceCard = event.currentTarget.closest('.admin-carousel-card[data-mesa-id]');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', mesaId);
    if (sourceCard) {
      event.dataTransfer.setDragImage(sourceCard, sourceCard.offsetWidth / 2, 40);
    }
  }
}

function handleReorderDragEnd() {
  resetDragState();
}

function handleReorderDragOver(event) {
  if (!draggedMesaId) return;

  event.preventDefault();
  const card = event.currentTarget.closest('.admin-carousel-card[data-mesa-id]');
  if (!card) return;

  setDragTarget(card.dataset.mesaId, getInsertPositionFromPointer(card, event.clientY));
}

async function handleReorderDrop(event) {
  if (!draggedMesaId) return;

  event.preventDefault();
  const card = event.currentTarget.closest('.admin-carousel-card[data-mesa-id]');
  const origemId = draggedMesaId;
  const destinoId = card?.dataset.mesaId || null;
  const insertPosition = dragInsertPosition;

  resetDragState();
  await reorderMesasByDrop(origemId, destinoId, insertPosition);
}

function handleTouchDragStart(event) {
  if (event.touches.length !== 1) {
    resetDragState();
    return;
  }

  const mesaId = event.currentTarget.dataset.mesaId;
  const touch = event.touches[0];

  touchDragStartPoint = { x: touch.clientX, y: touch.clientY };
  clearTouchDragTimer();

  touchDragTimer = setTimeout(() => {
    setDragSource(mesaId);
    ensureDragPreview(mesaId);
    updateDragPreviewPosition(touch.clientX, touch.clientY);

    if (navigator.vibrate) {
      navigator.vibrate(12);
    }
  }, TOUCH_DRAG_HOLD_MS);
}

function handleTouchDragMove(event) {
  if (!touchDragStartPoint) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = Math.abs(touch.clientX - touchDragStartPoint.x);
  const deltaY = Math.abs(touch.clientY - touchDragStartPoint.y);

  if (!draggedMesaId) {
    if (deltaX > TOUCH_DRAG_MOVE_TOLERANCE || deltaY > TOUCH_DRAG_MOVE_TOLERANCE) {
      clearTouchDragTimer();
      touchDragStartPoint = null;
    }
    return;
  }

  event.preventDefault();
  updateDragPreviewPosition(touch.clientX, touch.clientY);

  const element = document.elementFromPoint(touch.clientX, touch.clientY);
  const card = element?.closest('.admin-carousel-card[data-mesa-id]');
  if (card) {
    setDragTarget(card.dataset.mesaId, getInsertPositionFromPointer(card, touch.clientY));
  } else {
    setDragTarget(null);
  }
}

async function handleTouchDragEnd() {
  const origemId = draggedMesaId;
  const destinoId = dragOverMesaId;
  const insertPosition = dragInsertPosition;

  resetDragState();

  if (origemId && destinoId) {
    await reorderMesasByDrop(origemId, destinoId, insertPosition);
  }
}

function bindReorderInteractions(container) {
  const cards = container.querySelectorAll('.admin-carousel-card[data-mesa-id]');
  const handles = container.querySelectorAll('.drag-handle[data-mesa-id]');

  cards.forEach((card) => {
    card.addEventListener('dragover', handleReorderDragOver);
    card.addEventListener('drop', handleReorderDrop);
  });

  handles.forEach((handle) => {
    handle.addEventListener('dragstart', handleReorderDragStart);
    handle.addEventListener('dragend', handleReorderDragEnd);
    handle.addEventListener('touchstart', handleTouchDragStart, { passive: true });
    handle.addEventListener('touchmove', handleTouchDragMove, { passive: false });
    handle.addEventListener('touchend', handleTouchDragEnd);
    handle.addEventListener('touchcancel', resetDragState);
  });
}

function exibirPreviewFotos(srcFotos = [], { isExisting = false } = {}) {
  const preview = document.getElementById('previewFotos');
  if (!preview) return;

  if (!srcFotos.length) {
    preview.innerHTML = '<p class="text-gray-400 text-sm">Nenhuma foto selecionada.</p>';
    return;
  }

  preview.innerHTML = `
    <div class="preview-grid">
      ${srcFotos.map((srcFoto, index) => `
        <div class="preview-card">
          <img src="${srcFoto}" onerror="this.src='${PLACEHOLDER_IMAGE}'">
          <div class="preview-meta">
            <span class="preview-badge">${isExisting ? 'Atual' : `Foto ${index + 1}`}</span>
            <span>${isExisting ? 'Foto salva' : 'Pronta para envio'}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function calcularProximaOrdemCarrossel() {
  const config = getCarouselTypeConfig(activeCarouselType);
  const ordens = mesasCache
    .filter((m) => typeof m[config.orderField] === 'number' && getCarouselPhotoByType(m, activeCarouselType))
    .map((m) => m[config.orderField]);

  return ordens.length ? Math.max(...ordens) + 1 : 0;
}

async function uploadArquivoComProgresso(file, onProgress) {
  const uniquePrefix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storageRef = firebaseStorage.ref(`mesas/${uniquePrefix}_${file.name}`);
  const uploadTask = storageRef.put(file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (typeof onProgress === 'function') {
          onProgress(snapshot);
        }
      },
      reject,
      async () => {
        try {
          const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
          resolve(downloadURL);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

async function uploadFotosComProgresso(files) {
  const lista = Array.isArray(files) ? files.filter(Boolean) : [];

  if (!lista.length) {
    return [];
  }

  const totalArquivos = lista.length;
  const totalBytes = lista.reduce((sum, file) => sum + (file.size || 1), 0);
  const bytesTransferidos = new Array(totalArquivos).fill(0);
  const urls = [];

  for (let index = 0; index < totalArquivos; index += 1) {
    const file = lista[index];

    const downloadURL = await uploadArquivoComProgresso(file, (snapshot) => {
      bytesTransferidos[index] = snapshot.bytesTransferred;
      const totalTransferido = bytesTransferidos.reduce((sum, value) => sum + value, 0);
      const percent = totalBytes ? (totalTransferido / totalBytes) * 100 : 0;

      setUploadProgress({
        visible: true,
        percent,
        label: totalArquivos === 1
          ? 'Enviando foto para o carrossel...'
          : `Enviando foto ${index + 1} de ${totalArquivos}...`,
        countText: `${index + 1} de ${totalArquivos}`,
        status: 'Upload'
      });
    });

    bytesTransferidos[index] = file.size || bytesTransferidos[index] || 1;
    urls.push(downloadURL);
  }

  setUploadProgress({
    visible: true,
    percent: 100,
    label: totalArquivos === 1 ? 'Upload concluído.' : 'Uploads concluidos.',
    countText: `${totalArquivos} de ${totalArquivos}`,
    status: 'Concluído'
  });

  return urls;
}

async function openModalMesa(mesaId = null) {
  const fileInput = document.getElementById('mesaFotos');
  const label = document.getElementById('mesaFotosLabel');
  const helper = document.getElementById('mesaFotosHelper');
  const config = getCarouselTypeConfig(activeCarouselType);
  const modal = document.getElementById('modalMesa');

  if (modal) {
    openBackdropModal(modal);
  }
  document.getElementById('modalMesaTitle').textContent = mesaId
    ? `Editar foto (${config.label})`
    : `Adicionar fotos (${config.label})`;
  document.getElementById('mesaId').value = mesaId || '';
  arquivosNovasFotos = [];
  revokePreviewObjectUrls();
  resetUploadProgress();

  if (fileInput) {
    fileInput.value = '';
    fileInput.multiple = !mesaId;
  }

  if (label) {
    label.textContent = mesaId ? 'Foto principal *' : `Fotos do ${config.label} *`;
  }

  if (helper) {
    helper.textContent = mesaId
      ? 'Troque apenas a foto deste card. A posição no carrossel continua a mesma.'
      : `Selecione uma ou varias fotos para o ${config.label}. A ordem inicial segue a sequencia dos arquivos escolhidos.`;
  }

  setMesaFormBusy(false);

  if (mesaId) {
    const mesa = mesasCache.find((m) => m.id === mesaId);
    fotoAtualUrl = getCarouselPhotoByType(mesa, activeCarouselType) || mesa?.fotoPrincipal || mesa?.fotos?.[0] || '';
    exibirPreviewFotos(fotoAtualUrl ? [fotoAtualUrl] : [], { isExisting: true });
  } else {
    fotoAtualUrl = '';
    exibirPreviewFotos([]);
  }
}

document.getElementById('mesaFotos').addEventListener('change', function () {
  const files = Array.from(this.files || []);

  revokePreviewObjectUrls();

  if (!files.length) {
    arquivosNovasFotos = [];
    resetUploadProgress();

    if (fotoAtualUrl) {
      exibirPreviewFotos([fotoAtualUrl], { isExisting: true });
    } else {
      exibirPreviewFotos([]);
    }

    return;
  }

  arquivosNovasFotos = files;
  previewObjectUrls = files.map((file) => URL.createObjectURL(file));
  exibirPreviewFotos(previewObjectUrls);

  setUploadProgress({
    visible: true,
    percent: 0,
    label: files.length === 1
      ? '1 foto pronta para envio.'
      : `${files.length} fotos prontas para envio.`,
    countText: `0 de ${files.length}`,
    status: 'Pronto'
  });
});

function closeModalMesa(force = false) {
  if (isSavingMesa && !force) return;
  const modal = document.getElementById('modalMesa');
  const finalizeClose = () => {
    document.getElementById('formMesa').reset();
    document.getElementById('previewFotos').innerHTML = '';
    arquivosNovasFotos = [];
    fotoAtualUrl = '';
    revokePreviewObjectUrls();
    resetUploadProgress();
    setMesaFormBusy(false);
  };

  if (modal) {
    closeBackdropModal(modal, finalizeClose);
    return;
  }

  finalizeClose();
}

function editarMesa(id) {
  openModalMesa(id);
}

async function moverMesaCarrossel(mesaId, direcao) {
  try {
    const mesasCarrossel = getMesasCarrosselOrdenadas();
    const indice = mesasCarrossel.findIndex((m) => m.id === mesaId);
    if (indice === -1) {
      showToast('Foto não encontrada no carrossel.', 'error');
      return;
    }

    const novoIndice = indice + direcao;
    if (novoIndice < 0 || novoIndice >= mesasCarrossel.length) {
      showToast('Não é possível mover para essa posição.', 'warning');
      return;
    }

    [mesasCarrossel[indice], mesasCarrossel[novoIndice]] = [mesasCarrossel[novoIndice], mesasCarrossel[indice]];
    await persistirNovaOrdemCarrossel(mesasCarrossel.map((mesa) => mesa.id));
  } catch (error) {
    showToast('Erro ao atualizar ordem: ' + error.message, 'error');
    console.error(error);
  }
}

async function deletarMesa(id) {
  if (!confirm('Tem certeza que deseja deletar esta foto?')) return;

  showLoading();

  try {
    await firebaseDB.collection('mesas').doc(id).delete();
    await loadMesas();
    showToast('Foto deletada com sucesso!', 'success');
  } catch (error) {
    showToast('Erro ao deletar foto: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

document.getElementById('formMesa').addEventListener('submit', async (e) => {
  e.preventDefault();

  const mesaId = document.getElementById('mesaId').value;
  const isEditing = Boolean(mesaId);
  const config = getCarouselTypeConfig(activeCarouselType);
  const arquivosSelecionados = isEditing ? arquivosNovasFotos.slice(0, 1) : arquivosNovasFotos.slice();

  if (!arquivosSelecionados.length && !fotoAtualUrl) {
    showToast('Selecione uma foto.', 'warning');
    return;
  }

  if (isSavingMesa) {
    return;
  }

  isSavingMesa = true;
  setMesaFormBusy(true);

  try {
    const arquivosParaUpload = arquivosSelecionados.length
      ? await prepararArquivosParaUpload(arquivosSelecionados)
      : [];

    if (isEditing) {
      let fotoPrincipal = fotoAtualUrl;

      if (arquivosParaUpload.length) {
        const [novaFoto] = await uploadFotosComProgresso(arquivosParaUpload);
        fotoPrincipal = novaFoto;
      }

      let ordemCarrossel = 0;
      const atual = mesasCache.find((m) => m.id === mesaId);

      if (atual && typeof atual[config.orderField] === 'number') {
        ordemCarrossel = atual[config.orderField];
      } else {
        ordemCarrossel = calcularProximaOrdemCarrossel();
      }

      const mesaData = {
        nome: `Foto do ${config.name}`,
        fotos: [fotoPrincipal],
        fotoPrincipal,
        [config.photoField]: fotoPrincipal,
        [config.photosField]: [fotoPrincipal],
        [config.orderField]: ordemCarrossel,
        carouselType: config.key,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await firebaseDB.collection('mesas').doc(mesaId).set(
        {
          ...mesaData,
          createdAt: mesasCache.find((m) => m.id === mesaId)?.createdAt || firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await firebaseDB.collection('mesas').doc(mesaId).update({
        tipo: firebase.firestore.FieldValue.delete(),
        descricao: firebase.firestore.FieldValue.delete(),
        especificacoes: firebase.firestore.FieldValue.delete(),
        status: firebase.firestore.FieldValue.delete(),
        disponível: firebase.firestore.FieldValue.delete(),
        preco: firebase.firestore.FieldValue.delete(),
        dimensoes: firebase.firestore.FieldValue.delete()
      });

      showToast(`Foto salva no ${config.label}!`, 'success');
    } else {
      const fotosPrincipais = await uploadFotosComProgresso(arquivosParaUpload);
      const ordemInicial = calcularProximaOrdemCarrossel();

      setUploadProgress({
        visible: true,
        percent: 100,
        label: fotosPrincipais.length === 1
          ? 'Salvando a foto no painel...'
          : 'Salvando as fotos no painel...',
        countText: `${fotosPrincipais.length} de ${fotosPrincipais.length}`,
        status: 'Finalizando'
      });

      for (let index = 0; index < fotosPrincipais.length; index += 1) {
        const fotoPrincipal = fotosPrincipais[index];
        const mesaData = {
          nome: `Foto do ${config.name}`,
          fotos: [fotoPrincipal],
          fotoPrincipal,
          [config.photoField]: fotoPrincipal,
          [config.photosField]: [fotoPrincipal],
          [config.orderField]: ordemInicial + index,
          carouselType: config.key,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await firebaseDB.collection('mesas').add(mesaData);
      }

      showToast(
        fotosPrincipais.length === 1
          ? `Foto salva no ${config.label}!`
          : `${fotosPrincipais.length} fotos salvas no ${config.label}!`,
        'success'
      );
    }

    closeModalMesa(true);
    await loadMesas();
  } catch (error) {
    if (arquivosSelecionados.length) {
      setUploadProgress({
        visible: true,
        percent: 0,
        label: 'Não foi possível concluir o envio. Tente novamente.',
        countText: `0 de ${arquivosSelecionados.length}`,
        status: 'Erro'
      });
    }

    showToast('Erro ao salvar foto: ' + error.message, 'error');
    console.error(error);
  } finally {
    isSavingMesa = false;
    setMesaFormBusy(false);
  }
});

const PAYMENT_STATUS_META = {
  preparing: { label: 'Gerando link', tone: 'pending' },
  pending: { label: 'Aguardando pagamento', tone: 'pending' },
  approved: { label: 'Pago', tone: 'approved' },
  released: { label: 'Pode sair', tone: 'released' },
  failed: { label: 'Falhou', tone: 'failed' },
  backend_pending: { label: 'Rascunho salvo', tone: 'backend_pending' }
};

function getPaymentStatusMeta(status) {
  return PAYMENT_STATUS_META[status] || PAYMENT_STATUS_META.pending;
}

function formatCurrencyBRL(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseCurrencyInput(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePhoneForWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function formatDateLabel(value) {
  if (!value) return 'Agora';

  if (typeof value.toDate === 'function') {
    return value.toDate().toLocaleString('pt-BR');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Agora';
  }

  return parsed.toLocaleString('pt-BR');
}

function getPaymentFormPayload() {
  return {
    customerName: document.getElementById('paymentCustomerName')?.value.trim() || '',
    customerPhone: document.getElementById('paymentCustomerPhone')?.value.trim() || '',
    customerEmail: document.getElementById('paymentCustomerEmail')?.value.trim() || '',
    licensePlate: document.getElementById('paymentLicensePlate')?.value.trim().toUpperCase() || '',
    vehicleType: document.getElementById('paymentVehicleType')?.value || 'Carro',
    serviceType: document.getElementById('paymentServiceType')?.value || 'Socorro urgente',
    pickupAddress: document.getElementById('paymentPickupAddress')?.value.trim() || '',
    dropoffAddress: document.getElementById('paymentDropoffAddress')?.value.trim() || '',
    amount: parseCurrencyInput(document.getElementById('paymentAmount')?.value || ''),
    installments: Number(document.getElementById('paymentInstallments')?.value || 1),
    notes: document.getElementById('paymentNotes')?.value.trim() || ''
  };
}

function updatePaymentSummary() {
  const payload = getPaymentFormPayload();
  const clientEl = document.getElementById('paymentSummaryClient');
  const amountEl = document.getElementById('paymentSummaryAmount');
  const vehicleEl = document.getElementById('paymentSummaryVehicle');
  const releaseEl = document.getElementById('paymentSummaryRelease');

  if (!clientEl || !amountEl || !vehicleEl || !releaseEl) return;

  clientEl.textContent = payload.customerName || 'Aguardando preenchimento';
  amountEl.textContent = formatCurrencyBRL(payload.amount);
  vehicleEl.textContent = `${payload.vehicleType}${payload.licensePlate ? ` | ${payload.licensePlate}` : ''}`;
  releaseEl.textContent = payload.amount > 0
    ? `Liberar somente quando status estiver Pago (${payload.installments}x max.)`
    : 'Somente depois do status Pago';
}

function setPaymentCreateBusy(isBusy) {
  const createBtn = document.getElementById('createPaymentBtn');
  const resetBtn = document.getElementById('paymentResetBtn');

  if (createBtn) {
    createBtn.disabled = isBusy;
    createBtn.textContent = isBusy ? 'Gerando cobrança...' : 'Gerar cobrança segura';
  }

  if (resetBtn) {
    resetBtn.disabled = isBusy;
  }
}

function setPaymentResultCard(record = null) {
  const card = document.getElementById('paymentResultCard');
  const link = document.getElementById('paymentLinkPreview');
  const openBtn = document.getElementById('paymentOpenCheckoutBtn');
  const copyBtn = document.getElementById('paymentCopyMessageBtn');
  const whatsappBtn = document.getElementById('paymentOpenWhatsAppBtn');

  if (!card || !link || !openBtn || !copyBtn || !whatsappBtn) return;

  if (!record) {
    latestPaymentRequestId = '';
    latestPaymentRequestRecord = null;
    card.classList.add('is-hidden');
    link.textContent = 'Link de pagamento';
    link.href = '#';
    openBtn.disabled = true;
    copyBtn.disabled = true;
    whatsappBtn.disabled = true;
    return;
  }

  latestPaymentRequestId = record.id || '';
  latestPaymentRequestRecord = record;
  const hasLink = Boolean(record.paymentUrl);

  card.classList.remove('is-hidden');
  link.textContent = hasLink ? record.paymentUrl : 'Rascunho salvo. Publique o backend para gerar o link automaticamente.';
  link.href = hasLink ? record.paymentUrl : '#';
  openBtn.disabled = !hasLink;
  copyBtn.disabled = false;
  whatsappBtn.disabled = false;
}

function resetPaymentForm() {
  const form = document.getElementById('paymentForm');
  if (!form) return;

  form.reset();
  document.getElementById('paymentVehicleType').value = 'Carro';
  document.getElementById('paymentServiceType').value = 'Socorro urgente';
  document.getElementById('paymentInstallments').value = '10';
  setPaymentResultCard(null);
  updatePaymentSummary();
}

function buildPaymentWhatsAppMessage(record) {
  const lines = [
    `Ola, ${record.customerName || 'cliente'}.`,
    'Segue o link oficial para pagamento do atendimento com guincho.',
    '',
    `Valor: ${formatCurrencyBRL(record.amount)}`,
    `Parcelamento máximo: até ${record.installments || 1}x`,
    `Veículo: ${record.vehicleType || 'Não informado'}${record.licensePlate ? ` | Placa ${record.licensePlate}` : ''}`,
    `Retirada: ${record.pickupAddress || 'Não informada'}`,
    record.dropoffAddress ? `Destino: ${record.dropoffAddress}` : 'Destino: confirmar no atendimento',
    '',
    'Assim que o pagamento for aprovado, seguimos com a saída.',
    record.paymentUrl ? `Link de pagamento: ${record.paymentUrl}` : 'Link de pagamento: backend ainda não publicado para gerar automaticamente.'
  ];

  return lines.join('\n');
}

async function copyTextToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, 'success');
  } catch (error) {
    showToast('Não foi possível copiar. Tente novamente.', 'error');
  }
}

function getPaymentRecordById(requestId) {
  const fromCache = paymentRequestsCache.find((item) => item.id === requestId);
  if (fromCache) {
    return fromCache;
  }

  if (latestPaymentRequestRecord?.id === requestId) {
    return latestPaymentRequestRecord;
  }

  return null;
}

function openLatestPaymentLink() {
  const record = getPaymentRecordById(latestPaymentRequestId);
  if (!record?.paymentUrl) {
    showToast('Essa cobrança ainda não tem link ativo.', 'warning');
    return;
  }

  window.open(record.paymentUrl, '_blank', 'noopener,noreferrer');
}

function copyLatestPaymentMessage() {
  const record = getPaymentRecordById(latestPaymentRequestId);
  if (!record) {
    showToast('Crie uma cobrança primeiro.', 'warning');
    return;
  }

  copyTextToClipboard(buildPaymentWhatsAppMessage(record), 'Mensagem pronta copiada!');
}

function openLatestPaymentWhatsApp() {
  const record = getPaymentRecordById(latestPaymentRequestId);
  if (!record) {
    showToast('Crie uma cobrança primeiro.', 'warning');
    return;
  }

  openPaymentWhatsApp(record.id);
}

function copyPaymentMessage(requestId) {
  const record = getPaymentRecordById(requestId);
  if (!record) {
    showToast('Cobrança não encontrada.', 'error');
    return;
  }

  copyTextToClipboard(buildPaymentWhatsAppMessage(record), 'Mensagem pronta copiada!');
}

function openPaymentWhatsApp(requestId) {
  const record = getPaymentRecordById(requestId);
  if (!record) {
    showToast('Cobrança não encontrada.', 'error');
    return;
  }

  const phone = normalizePhoneForWhatsApp(record.customerPhone);
  if (!phone) {
    showToast('Informe um WhatsApp valido para o cliente.', 'warning');
    return;
  }

  const message = encodeURIComponent(buildPaymentWhatsAppMessage(record));
  window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
}

async function markPaymentReleased(requestId) {
  if (!requestId) return;

  try {
    await firebaseDB.collection('paymentRequests').doc(requestId).set(
      {
        status: 'released',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    showToast('Status atualizado para "Pode sair".', 'success');
  } catch (error) {
    showToast('Não foi possível atualizar a liberação.', 'error');
    console.error(error);
  }
}

function renderPaymentRequests(requests = []) {
  const container = document.getElementById('paymentRequestsList');
  if (!container) return;

  paymentRequestsCache = requests.slice();

  if (latestPaymentRequestId) {
    const matched = requests.find((item) => item.id === latestPaymentRequestId);
    if (matched) {
      latestPaymentRequestRecord = matched;
    }
  }

  if (!requests.length) {
    container.innerHTML = `
      <div class="payment-empty">
        Nenhuma cobrança criada ainda. Assim que você gerar a primeira, ela aparece aqui com status, link e atalho para o WhatsApp.
      </div>
    `;
    return;
  }

  container.innerHTML = requests.map((record) => {
    const meta = getPaymentStatusMeta(record.status);
    const hasLink = Boolean(record.paymentUrl);
    const createdAtLabel = formatDateLabel(record.createdAt || record.createdAtIso);
    const netAmount = Number(record.netReceivedAmount || record.mercadoPago?.netReceivedAmount || 0);

    return `
      <article class="payment-record">
        <div class="payment-record__top">
          <div>
            <span class="admin-kicker" style="margin-bottom: 6px;">Cobrança #${record.id}</span>
            <h4 style="margin: 0; font-family: 'Oswald', sans-serif; font-size: 1.3rem; letter-spacing: 0.02em;">${record.customerName || 'Cliente sem nome'}</h4>
            <p class="payment-muted" style="margin-top: 8px;">
              ${record.serviceType || 'Atendimento com guincho'} | ${record.vehicleType || 'Veículo não informado'}${record.licensePlate ? ` | Placa ${record.licensePlate}` : ''}
            </p>
          </div>
          <span class="payment-status-pill" data-status="${meta.tone}">${meta.label}</span>
        </div>

        <div class="payment-summary-grid">
          <div>
            <span class="payment-summary-label">Valor</span>
            <span class="payment-summary-value">${formatCurrencyBRL(record.amount)}</span>
          </div>
          <div>
            <span class="payment-summary-label">Parcelamento</span>
            <span class="payment-summary-value">Até ${record.installments || 1}x</span>
          </div>
          <div>
            <span class="payment-summary-label">WhatsApp</span>
            <span class="payment-summary-value">${record.customerPhone || 'Não informado'}</span>
          </div>
          <div>
            <span class="payment-summary-label">Criada em</span>
            <span class="payment-summary-value">${createdAtLabel}</span>
          </div>
        </div>

        <div class="payment-record__meta">
          <div style="min-width: 0; flex: 1;">
            <span class="payment-summary-label">Retirada</span>
            <span class="payment-summary-value">${record.pickupAddress || 'Não informada'}</span>
            <span class="payment-summary-label" style="margin-top: 12px;">Recebimento</span>
            <span class="payment-summary-value">
              ${record.status === 'approved'
                ? `Pagamento aprovado. ${netAmount > 0 ? `Líquido no saldo Mercado Pago: ${formatCurrencyBRL(netAmount)}.` : 'Pode seguir para a saída.'}`
                : 'A aprovação aparece no painel. O saldo cai na conta Mercado Pago do lojista conforme o meio de pagamento.'}
            </span>
          </div>
          <div class="admin-actions" style="justify-content: flex-end;">
            ${hasLink ? `<button type="button" class="btn-secondary" onclick="openLatestPaymentLinkById('${record.id}')">Abrir link</button>` : ''}
            <button type="button" class="btn-secondary" onclick="copyPaymentMessage('${record.id}')">Copiar mensagem</button>
            <button type="button" class="btn-secondary" onclick="openPaymentWhatsApp('${record.id}')">WhatsApp</button>
            ${record.status === 'approved'
              ? `<button type="button" class="btn-primary" onclick="markPaymentReleased('${record.id}')">Pode sair</button>`
              : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function stopPaymentRequestsListener() {
  if (paymentRequestsUnsubscribe) {
    paymentRequestsUnsubscribe();
    paymentRequestsUnsubscribe = null;
  }
}

function startPaymentRequestsListener() {
  stopPaymentRequestsListener();

  if (!firebaseAuth.currentUser) {
    return;
  }

  const query = firebaseDB.collection('paymentRequests').orderBy('createdAt', 'desc').limit(12);

  paymentRequestsUnsubscribe = query.onSnapshot(
    (snapshot) => {
      const requests = [];
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        requests.push({
          id: doc.id,
          ...data,
          paymentUrl: data.paymentUrl || data.mercadoPago?.paymentUrl || '',
          sandboxPaymentUrl: data.sandboxPaymentUrl || data.mercadoPago?.sandboxPaymentUrl || '',
          netReceivedAmount: data.netReceivedAmount || data.mercadoPago?.netReceivedAmount || 0
        });
      });

      renderPaymentRequests(requests);
    },
    (error) => {
      console.error(error);
      showToast('Não foi possível acompanhar as cobranças em tempo real.', 'error');
    }
  );
}

async function requestMercadoPagoPreference(payload) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    throw new Error('Entre no admin para gerar a cobrança.');
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch('/api/mercadopago/create-preference', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Não foi possível gerar o link seguro agora.');
  }

  return data.paymentRequest;
}

async function savePaymentFallbackDraft(payload, reasonMessage) {
  const docRef = await firebaseDB.collection('paymentRequests').add({
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    customerEmail: payload.customerEmail,
    licensePlate: payload.licensePlate,
    vehicleType: payload.vehicleType,
    serviceType: payload.serviceType,
    pickupAddress: payload.pickupAddress,
    dropoffAddress: payload.dropoffAddress,
    notes: payload.notes,
    amount: payload.amount,
    installments: payload.installments,
    status: 'backend_pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    mercadoPago: {
      provider: 'mercadopago',
      providerStatus: 'backend_pending',
      errorMessage: reasonMessage
    }
  });

  return {
    id: docRef.id,
    ...payload,
    status: 'backend_pending',
    paymentUrl: '',
    createdAtIso: new Date().toISOString()
  };
}

async function submitPaymentForm(event) {
  event.preventDefault();

  if (isCreatingPaymentRequest) {
    return;
  }

  const payload = getPaymentFormPayload();

  if (!payload.customerName || !payload.customerPhone || !payload.pickupAddress || payload.amount <= 0) {
    showToast('Preencha nome, WhatsApp, Local de Origem e valor antes de continuar.', 'warning');
    return;
  }

  isCreatingPaymentRequest = true;
  setPaymentCreateBusy(true);

  try {
    const paymentRequest = await requestMercadoPagoPreference(payload);
    setPaymentResultCard(paymentRequest);
    showToast('Cobrança segura gerada com sucesso!', 'success');
  } catch (error) {
    console.error(error);
    try {
      const fallbackRecord = await savePaymentFallbackDraft(payload, error.message || 'Backend ainda não publicado.');
      setPaymentResultCard(fallbackRecord);
      showToast('Backend ainda não respondeu. O rascunho foi salvo para você não perder o atendimento.', 'warning');
    } catch (fallbackError) {
      console.error(fallbackError);
      showToast('Não foi possível gerar a cobrança nem salvar o rascunho.', 'error');
    }
  } finally {
    isCreatingPaymentRequest = false;
    setPaymentCreateBusy(false);
  }
}

function openLatestPaymentLinkById(requestId) {
  const record = getPaymentRecordById(requestId);
  if (!record?.paymentUrl) {
    showToast('Essa cobrança ainda não tem link ativo.', 'warning');
    return;
  }

  window.open(record.paymentUrl, '_blank', 'noopener,noreferrer');
}

document.getElementById('paymentForm')?.addEventListener('submit', submitPaymentForm);
document.getElementById('paymentResetBtn')?.addEventListener('click', resetPaymentForm);
document.getElementById('paymentOpenCheckoutBtn')?.addEventListener('click', openLatestPaymentLink);
document.getElementById('paymentCopyMessageBtn')?.addEventListener('click', copyLatestPaymentMessage);
document.getElementById('paymentOpenWhatsAppBtn')?.addEventListener('click', openLatestPaymentWhatsApp);

[
  'paymentCustomerName',
  'paymentCustomerPhone',
  'paymentLicensePlate',
  'paymentVehicleType',
  'paymentServiceType',
  'paymentPickupAddress',
  'paymentAmount',
  'paymentInstallments'
].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', updatePaymentSummary);
  document.getElementById(id)?.addEventListener('change', updatePaymentSummary);
});

document.getElementById('paymentAmount')?.addEventListener('blur', function () {
  const parsed = parseCurrencyInput(this.value);
  if (parsed > 0) {
    this.value = parsed.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  updatePaymentSummary();
});

updatePaymentSummary();
setPaymentResultCard(null);
