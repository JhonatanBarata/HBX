// Script para carregar tipos de madeira e mesas do Firebase

(async function() {
  try {
    // Aguardar Firebase carregar
    await new Promise(resolve => {
      const checkFirebase = setInterval(() => {
        if (window.firebaseDB) {
          clearInterval(checkFirebase);
          resolve();
        }
      }, 100);
    });
    
    const containerTipos = document.getElementById('telasTipos');
    if (!containerTipos) return;
    
    // Mostrar loading
    containerTipos.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Carregando tipos...</p>';
    
    // Buscar tipos do Firebase
    const snapshotTipos = await firebaseDB.collection('tipos').orderBy('nome', 'asc').get();
    
    if (snapshotTipos.empty) {
      containerTipos.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Nenhum tipo disponível no momento</p>';
      return;
    }
    
    const tipos = [];
    snapshotTipos.forEach(doc => {
      tipos.push({ id: doc.id, ...doc.data() });
    });
    
    // Filtrar apenas tipos que têm mesas e pegar fotos delas
    const tiposComMesas = [];
    
    for (const tipo of tipos) {
      // Se o tipo tem mesas selecionadas para o carrossel, usar apenas essas
      let mesasParaCarrossel = [];
      
      if (tipo.mesasCarrossel && tipo.mesasCarrossel.length > 0) {
        // Buscar apenas as mesas selecionadas
        const snapshotMesas = await firebaseDB.collection('mesas').get();
        snapshotMesas.forEach(mesaDoc => {
          if (tipo.mesasCarrossel.includes(mesaDoc.id)) {
            mesasParaCarrossel.push(mesaDoc.data());
          }
        });
      } else {
        // Se não tem mesas selecionadas, usar todas as mesas do tipo
        const snapshotMesas = await firebaseDB.collection('mesas').where('tipo', '==', tipo.nome).get();
        snapshotMesas.forEach(mesaDoc => {
          mesasParaCarrossel.push(mesaDoc.data());
        });
      }
      
      if (mesasParaCarrossel.length > 0) {
        // Coletar fotos principais das mesas selecionadas
        const todasFotos = [];
        mesasParaCarrossel.forEach(mesa => {
          const fotoPrincipal = mesa.fotoPrincipal || (mesa.fotos && mesa.fotos[0]) || null;
          if (fotoPrincipal) {
            todasFotos.push(fotoPrincipal);
          }
        });
        
        tiposComMesas.push({
          ...tipo,
          fotos: todasFotos // Adicionar array de fotos para carrossel
        });
      }
    }
    
    if (tiposComMesas.length === 0) {
      containerTipos.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Nenhum tipo com mesas disponível no momento</p>';
      return;
    }
    
    // Renderizar apenas tipos com mesas, mostrando fotos das mesas
    containerTipos.innerHTML = tiposComMesas.map((tipo, tipoIndex) => {
      const fotos = tipo.fotos || [];
      const primeiraFoto = fotos[0] || null;
      
      // Se tem imagem, usar tag img, senão usar div com gradiente
      const fotoHTML = primeiraFoto 
          ? `<img src="${primeiraFoto}" loading="lazy" class="card-foto rounded-xl shadow-2xl group-hover:shadow-ouro/40 object-contain w-full h-full" alt="${tipo.nome}" style="background: linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(0,0,0,0.6) 100%), radial-gradient(ellipse at top right, rgba(212,175,55,0.06), transparent 70%); box-shadow: 0 15px 35px rgba(0,0,0,0.5), inset 0 0 30px rgba(212,175,55,0.15); transition: transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.7s ease;" data-tipo-index="${tipoIndex}" data-foto-atual="0" />`
          : `<div class="card-foto rounded-xl shadow-2xl group-hover:shadow-ouro/40 w-full h-full border-4 border-ouro/30 flex items-center justify-center text-center" style="background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); box-shadow: 0 15px 35px rgba(0,0,0,0.5); transition: opacity 0.4s ease-in-out, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.7s ease;" data-tipo-index="${tipoIndex}">
          <div class="text-ouro opacity-40 text-sm font-title">
            Sem fotos<br/>cadastradas
          </div>
        </div>`;
      
      return `
      <div class="relative fade-up flex flex-col min-h-[340px] pb-6 md:min-h-[450px] md:pb-10 justify-between bg-gradient-to-br from-black/70 to-black/40 rounded-2xl shadow-2xl border-2 border-ouro/50 hover:border-ouro hover:shadow-ouro/30 transition-all duration-700 hover:-translate-y-3 backdrop-blur-sm group cursor-pointer" 
           onclick="selecionarTipo('${tipo.nome}', '${tipo.descricao || ''}')" 
           data-tipo="${tipo.nome}" 
           data-tipo-index="${tipoIndex}" 
           data-fotos='${JSON.stringify(fotos).replace(/'/g, "&apos;")}'
           style="transform-style: preserve-3d; box-shadow: 0 20px 60px rgba(212,175,55,0.15), 0 8px 16px rgba(0,0,0,0.6);">
        <div class="block px-5 pt-5 stellar-button">
          <div class="relative foto-container group/img w-full h-64 md:h-72 overflow-hidden rounded-xl">
            ${fotoHTML}
          </div>
        </div>
        <div class="px-6">
          <h3 class="font-title text-2xl md:text-3xl text-ouro mt-6 mb-2 drop-shadow-lg" style="text-shadow: 0 2px 8px rgba(212,175,55,0.5);">${tipo.nome}</h3>
          <p class="text-gray-300 mt-3 leading-relaxed">${tipo.descricao || 'Explore nossa coleção em ' + tipo.nome}</p>
        </div>
      </div>
      `;
    }).join('');
    
    // Aplicar animação fade-up
    setTimeout(() => {
      document.querySelectorAll('.fade-up').forEach((el, i) => {
        setTimeout(() => el.classList.add('show'), i * 100);
      });
    }, 100);
    
    // Iniciar carrossel de fotos para cada tipo
    document.querySelectorAll('[data-fotos]').forEach((card) => {
      const fotosData = card.getAttribute('data-fotos');
      const fotos = JSON.parse(fotosData);
      
      if (fotos.length > 1) {
        const img = card.querySelector('.card-foto');
        if (img && img.tagName === 'IMG') {
          let indiceAtual = 0;
          
          setInterval(() => {
            const proximoIndice = (indiceAtual + 1) % fotos.length;
            const proximaUrl = fotos[proximoIndice];

            // Pré-carregar a próxima imagem antes de trocar
            const preload = new Image();
            preload.onload = () => {
              img.style.transition = 'opacity 0.4s ease-in-out';
              img.style.opacity = '0';

              window.setTimeout(() => {
                indiceAtual = proximoIndice;
                img.src = proximaUrl;
                img.setAttribute('data-foto-atual', indiceAtual);

                requestAnimationFrame(() => {
                  img.style.opacity = '1';
                });
              }, 400);
            };

            preload.onerror = () => {
              // Se a próxima falhar, mantém a atual e tenta na próxima rodada
            };

            preload.src = proximaUrl;
          }, 4000); // Trocar foto a cada 4 segundos
        }
      }
    });

    // Armazenar tipos globalmente
    window.tiposGaleria = tiposComMesas;
    
  } catch (error) {
    console.error('Erro ao carregar tipos:', error);
    const container = document.getElementById('telasTipos');
    if (container) {
      container.innerHTML = '<p class="text-red-400 col-span-full text-center py-12">Erro ao carregar tipos. Tente novamente mais tarde.</p>';
    }
  }
})();

// Função para carregar mesas de um tipo específico
async function carregarMesasDoTipo(nomeType) {
  try {
    const containerMesas = document.getElementById('colecao-lista');
    if (!containerMesas) return;
    
    containerMesas.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Carregando mesas...</p>';
    
    // Buscar mesas do tipo selecionado
    const snapshotMesas = await firebaseDB.collection('mesas')
      .where('tipo', '==', nomeType)
      .get();
    
    if (snapshotMesas.empty) {
      containerMesas.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Nenhuma mesa disponível para este tipo</p>';
      return;
    }
    
    const mesas = [];
    snapshotMesas.forEach(doc => {
      mesas.push({ id: doc.id, ...doc.data() });
    });
    
    // Ordenar por data no cliente (evita necessidade de índice composto)
    mesas.sort((a, b) => {
      const dateA = a.createdAté.toDate?.() || new Date(0);
      const dateB = b.createdAté.toDate?.() || new Date(0);
      return dateB - dateA;
    });
    
    // Separar por status para criar seções
    const grupos = {
      disponivel: [],
      encomenda: [],
      vendida: []
    };

    mesas.forEach((mesa, index) => {
      const status = mesa.status || (mesa.disponivel !== false ? 'disponivel' : 'encomenda');
      const item = { mesa, index };
      if (grupos[status]) {
        grupos[status].push(item);
      } else {
        grupos.disponivel.push(item);
      }
    });

    const renderMesas = (lista) => lista.map(({ mesa, index }) => {
      // Pegar disponibilidade da primeira foto (foto principal)
      const fotos = mesa.fotos || [];
      const fotoInicial = mesa.fotoPrincipal || (fotos.length > 0 ? fotos[0] : null);
      let indiceFoto = fotoInicial ? fotos.indexOf(fotoInicial) : -1;
      if (indiceFoto === -1 && fotos.length > 0) indiceFoto = 0;
      
      // Status e badge
      const status = mesa.status || (mesa.disponivel !== false ? 'disponivel' : 'encomenda');
      const statusConfig = {
        'disponivel': { texto: 'PRONTA ENTREGA', cor: '34, 197, 94', botao: 'FALAR COM VENDEDOR' },
        'encomenda': { texto: 'POR ENCOMENDA', cor: '239, 68, 68', botao: 'SOLICITAR ORÇAMENTO' },
        'vendida': { texto: 'VENDIDA', cor: '156, 163, 175', botao: 'CONSULTAR DISPONIBILIDADE' }
      };
      
      const config = statusConfig[status] || statusConfig['disponivel'];
      const badgeTexto = config.texto;
      const badgeCor = config.cor;
      const botaoTexto = config.botao;
      
      // Preço formatado
      const precoFormatado = mesa.preco ? `R$ ${mesa.preco.toFixed(2).replace('.', ',')}` : '';
      
      // Dimensões
      const dim = mesa.dimensoes || {};
      const dimensoesTexto = dim.comprimento && dim.largura 
        ? `${dim.comprimento}cm × ${dim.largura}cm × ${dim.altura || 0}cm`
        : '';
      
      const totalFotos = fotos.length;
      const fotoInfo = totalFotos > 0 ? ` (Foto 1 de ${totalFotos})` : '';
      const mensagemWhatsApp = status === 'disponivel'
        ? `Olá! Gostaria de saber mais sobre a mesa ${mesa.nome}.${fotoInfo}`
        : `Olá! Gostaria de informações sobre a mesa ${mesa.nome}.${fotoInfo}`;
      
      // Estilos do botão
      const botaoEstilo = status === 'vendida'
        ? 'background: rgba(156, 163, 175, 0.25); backdrop-filter: blur(8px); border: 1.5px solid rgba(156, 163, 175, 0.6); box-shadow: 0 0 20px rgba(156, 163, 175, 0.4); color: white;'
        : status === 'disponivel'
        ? 'background: rgba(34, 197, 94, 0.25); backdrop-filter: blur(8px); border: 1.5px solid rgba(34, 197, 94, 0.6); box-shadow: 0 0 20px rgba(34, 197, 94, 0.4); color: white;'
        : 'background: rgba(212, 175, 55, 0.25); backdrop-filter: blur(8px); border: 1.5px solid rgba(212, 175, 55, 0.6); box-shadow: 0 0 20px rgba(212, 175, 55, 0.4); color: white;';
      
        return `
        <div class="relative fade-up flex flex-col min-h-[340px] pb-6 md:min-h-[580px] md:pb-10 justify-between bg-gradient-to-br from-black/70 to-black/40 rounded-2xl shadow-2xl border-2 border-ouro/50 hover:border-ouro hover:shadow-ouro/30 transition-all duration-700 hover:-translate-y-3 backdrop-blur-sm group" style="transform-style: preserve-3d; box-shadow: 0 20px 60px rgba(212,175,55,0.15), 0 8px 16px rgba(0,0,0,0.6);" data-madeira="${mesa.tipo}" data-mesa-index="${index}">
        <span class="mesa-badge absolute top-4 left-4 text-white px-4 py-1.5 text-xs font-bold tracking-widest rounded-lg shadow-lg z-10 transition-all duration-400" style="background: rgba(${badgeCor}, 0.25); backdrop-filter: blur(8px); border: 1.5px solid rgba(${badgeCor}, 0.6); box-shadow: 0 0 20px rgba(${badgeCor}, 0.4), inset 0 0 10px rgba(${badgeCor}, 0.2);">${badgeTexto}</span>
        <div class="block px-5 pt-5 cursor-pointer stellar-button" onclick="abrirGaleria(${index})" data-mesa-index="${index}">
          <div class="relative foto-container group/img w-full h-64 md:h-72 overflow-hidden rounded-xl">
              <img src="${fotoInicial || '/dist/img/placeholder.svg'}" loading="lazy" class="card-foto rounded-xl shadow-2xl group-hover:shadow-ouro/40 object-contain w-full h-full" alt="${mesa.nome}" style="background: linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(0,0,0,0.6) 100%), radial-gradient(ellipse at top right, rgba(212,175,55,0.06), transparent 70%); box-shadow: 0 15px 35px rgba(0,0,0,0.5), inset 0 0 30px rgba(212,175,55,0.15); transition: opacity 0.4s ease-in-out, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.7s ease; opacity: 1;" data-mesa-index="${index}" onerror="this.src='/dist/img/placeholder.svg'" />
            ${totalFotos > 1 ? `<div class="absolute bottom-3 right-3 bg-black/70 px-3 py-1 rounded-lg text-xs text-ouro font-bold">${totalFotos} FOTOS</div>` : ''}
          </div>
        </div>
        <div class="px-6">
          <h3 class="font-title text-2xl md:text-3xl text-ouro mt-6 mb-2 drop-shadow-lg" style="text-shadow: 0 2px 8px rgba(212,175,55,0.5);">${mesa.nome}</h3>
          
          ${precoFormatado ? `<p class="text-green-400 font-bold text-xl mb-2">${precoFormatado}</p>` : ''}
          
          ${dimensoesTexto ? `
          <div class="flex items-center gap-2 mb-3 text-gray-400 text-sm">
            <span class="text-ouro">📏</span>
            <span>${dimensoesTexto}</span>
          </div>
          ` : ''}
          
          <p class="text-gray-300 mt-3 mb-5 leading-relaxed">${mesa.descricao || ''}</p>
          <ul class="text-gray-400 text-sm mb-6 pl-5 space-y-1.5 list-disc">
            ${mesa.especificacoes ? mesa.especificacoes.map(spec => `<li>${spec}</li>`).join('') : ''}
          </ul>
          <a href="https://wa.me/5519997024884?text=${encodeURIComponent(mensagemWhatsApp)}" target="_blank" class="mesa-botao-whatsapp inline-block w-full py-3 text-center font-bold rounded-xl shadow-lg hover:scale-105 transition-all duration-400" style="${botaoEstilo}">
            ${botaoTexto}
          </a>
        </div>
      </div>
      `;
    }).join('');

    // Renderizar todas as mesas sem separadores de status
    containerMesas.innerHTML = renderMesas(mesas.map((mesa, index) => ({ mesa, index })));
    
    // Aplicar animação fade-up
    setTimeout(() => {
      document.querySelectorAll('.fade-up').forEach((el, i) => {
        setTimeout(() => el.classList.add('show'), i * 100);
      });
    }, 100);
    
    // Armazenar mesas globalmente para galeria
    window.mesasGaleria = mesas;
    
  } catch (error) {
    console.error('Erro ao carregar mesas:', error);
    const containerMesas = document.getElementById('colecao-lista');
    if (containerMesas) {
      containerMesas.innerHTML = '<p class="text-red-400 col-span-full text-center py-12">Erro ao carregar mesas. Tente novamente mais tarde.</p>';
    }
  }
}

// ================================
// GALERIA DE FOTOS
// ================================

let galeriaAtual = 0;
let indexFotoAtual = 0;
let autoplayInterval = null;
let cardIntervals = [];

function abrirGaleria(mesaIndex) {
  if (!window.mesasGaleria || !window.mesasGaleria[mesaIndex]) return;
  
  galeriaAtual = mesaIndex;
  indexFotoAtual = 0;
  
  const mesa = window.mesasGaleria[mesaIndex];
  const modal = obterModalGaleria();
  
  // Atualizar título
  document.getElementById('galeriaModalTitle').textContent = mesa.nome;
  
  // Atualizar imagem
  if (mesa.fotos && mesa.fotos.length > 0) {
    document.getElementById('galeriaImagem').src = mesa.fotos[0];
    document.getElementById('galeriaCounter').textContent = `1 / ${mesa.fotos.length}`;
    document.getElementById('galeriaContainer').style.display = 'grid';
  }
  
  // Atualizar link do WhatsApp
  const whatsappBtn = document.getElementById('galeriaWhatsappBtn');
  if (whatsappBtn) {
    const fotoAtual = mesa.fotos[0];
    const mensagem = `Olá! Vi a ${mesa.nome} na galeria e gostaria de solicitar um orçamento.\n\n📸 Foto da mesa: ${fotoAtual}\n\n🌐 Visite nosso catálogo: https://guinchorioclarosp.web.app/colecao.html`;
    whatsappBtn.href = `https://wa.me/5519997024884?text=${encodeURIComponent(mensagem)}`;
  }
  
  // Renderizar miniaturas
  if (mesa.fotos && mesa.fotos.length > 1) {
    const miniaturas = document.getElementById('galeriaThumbnails');
    miniaturas.innerHTML = mesa.fotos.map((foto, idx) => `
      <img src="${foto}" class="w-20 h-20 object-contain rounded cursor-pointer border-2 ${idx === 0 ? 'border-ouro' : 'border-gray-600'} hover:border-ouro transition-all duration-300 ease-in-out bg-gray-800" style="box-shadow: ${idx === 0 ? '0 4px 12px rgba(212,175,55,0.4)' : '0 2px 8px rgba(0,0,0,0.3)'};" onclick="trocarFoto(${idx})">
    `).join('');
    miniaturas.style.display = 'flex';
  } else {
    document.getElementById('galeriaThumbnails').style.display = 'none';
  }
  
  // Mostrar/ocultar botões de navegação
  const botoes = document.querySelectorAll('.galeria-nav-btn');
  botoes.forEach(b => b.style.display = mesa.fotos && mesa.fotos.length > 1 ? 'flex' : 'none');
  
  // Iniciar autoplay
  pararAutoplay();
  if (mesa.fotos && mesa.fotos.length > 1) {
    iniciarAutoplay();
  }
  
  // Mostrar modal
  modal.style.display = 'flex';
  modal.style.opacity = '0';
  setTimeout(() => {
    modal.style.transition = 'opacity 0.3s ease-in-out';
    modal.style.opacity = '1';
  }, 10);
}

function trocarFoto(idx) {
  if (!window.mesasGaleria || !window.mesasGaleria[galeriaAtual]) return;
  
  reiniciarAutoplay();
  
  indexFotoAtual = idx;
  const mesa = window.mesasGaleria[galeriaAtual];
  const foto = mesa.fotos[idx];
  
  const imgElement = document.getElementById('galeriaImagem');
  
  imgElement.style.opacity = '0';
  imgElement.style.transform = 'scale(0.95)';
  
  setTimeout(() => {
    imgElement.src = foto;
    document.getElementById('galeriaCounter').textContent = `${idx + 1} / ${mesa.fotos.length}`;
    
    setTimeout(() => {
      imgElement.style.opacity = '1';
      imgElement.style.transform = 'scale(1)';
    }, 50);
  }, 200);
  
  // Atualizar miniaturas
  document.querySelectorAll('#galeriaThumbnails img').forEach((img, i) => {
    img.classList.remove('border-ouro', 'scale-110');
    img.classList.add('border-gray-600');
    if (i === idx) {
      img.classList.add('border-ouro', 'scale-110');
      img.classList.remove('border-gray-600');
    }
  });
  
  // Atualizar WhatsApp
  const whatsappBtn = document.getElementById('galeriaWhatsappBtn');
  if (whatsappBtn && mesa) {
    const fotoAtual = mesa.fotos[idx];
    const mensagem = `Olá! Vi a ${mesa.nome} na galeria e gostaria de solicitar um orçamento.\n\n📸 Foto da mesa: ${fotoAtual}\n\n🌐 Visite nosso catálogo: https://guinchorioclarosp.web.app/colecao.html`;
    whatsappBtn.href = `https://wa.me/5519997024884?text=${encodeURIComponent(mensagem)}`;
  }
}

function proximaFoto() {
  if (!window.mesasGaleria || !window.mesasGaleria[galeriaAtual]) return;
  const mesa = window.mesasGaleria[galeriaAtual];
  const proximoIdx = (indexFotoAtual + 1) % mesa.fotos.length;
  trocarFoto(proximoIdx);
}

function fotoAnterior() {
  if (!window.mesasGaleria || !window.mesasGaleria[galeriaAtual]) return;
  const mesa = window.mesasGaleria[galeriaAtual];
  const anteriorIdx = (indexFotoAtual - 1 + mesa.fotos.length) % mesa.fotos.length;
  trocarFoto(anteriorIdx);
}

function fecharGaleria() {
  pararAutoplay();
  const modal = document.getElementById('galeriaModal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

function iniciarAutoplay() {
  if (autoplayInterval) return;
  autoplayInterval = setInterval(() => {
    proximaFoto();
  }, 4000);
}

function pararAutoplay() {
  if (autoplayInterval) {
    clearInterval(autoplayInterval);
    autoplayInterval = null;
  }
}

function reiniciarAutoplay() {
  pararAutoplay();
  const mesa = window.mesasGaleria[galeriaAtual];
  if (mesa && mesa.fotos && mesa.fotos.length > 1) {
    iniciarAutoplay();
  }
}

function obterModalGaleria() {
  let modal = document.getElementById('galeriaModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'galeriaModal';
    modal.style.cssText = `
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 9999;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      overflow-y: auto;
      backdrop-filter: blur(12px);
    `;
    
    modal.innerHTML = `
      <div style="position: relative; width: 100%; max-width: 800px;">
        <button onclick="fecharGaleria()" style="position: absolute; top: -50px; right: 0; background: rgba(212,175,55,0.18); border: 1.5px solid rgba(212,175,55,0.6); color: #fffbe6; font-size: 2rem; cursor: pointer; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 50%; backdrop-filter: blur(8px); box-shadow: 0 0 20px rgba(212,175,55,0.35), inset 0 0 10px rgba(212,175,55,0.2); transition: all 0.3s ease; font-weight: bold;" onmouseover="this.style.background='rgba(212,175,55,0.35)'; this.style.transform='scale(1.15) rotate(90deg)'; this.style.boxShadow='0 0 26px rgba(212,175,55,0.5), inset 0 0 12px rgba(212,175,55,0.3)';" onmouseout="this.style.background='rgba(212,175,55,0.18)'; this.style.transform='scale(1) rotate(0deg)'; this.style.boxShadow='0 0 20px rgba(212,175,55,0.35), inset 0 0 10px rgba(212,175,55,0.2)';">&times;</button>
        
        <h2 id="galeriaModalTitle" style="color: #d4af37; font-family: 'Cinzel', serif; font-size: 1.5rem; text-align: center; margin-bottom: 1.5rem; letter-spacing: 0.1em;"></h2>
        
        <!-- Botão Flutuante WhatsApp -->
        <a id="galeriaWhatsappBtn" href="https://wa.me/5519997024884" target="_blank" style="position: fixed; bottom: 1.5rem; right: 1.5rem; width: 70px; height: 70px; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(37, 211, 102, 0.4), 0 0 0 0 rgba(37, 211, 102, 0.6); z-index: 10000; transition: all 0.3s ease; animation: pulse-whatsapp 2s infinite; text-decoration: none; border: 3px solid rgba(255, 255, 255, 0.3);" onmouseover="this.style.transform='scale(1.15)'; this.style.boxShadow='0 12px 32px rgba(37, 211, 102, 0.5), 0 0 0 0 rgba(37, 211, 102, 0.6)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 8px 24px rgba(37, 211, 102, 0.4), 0 0 0 0 rgba(37, 211, 102, 0.6)';" ontouchstart="this.style.transform='scale(1.15)';" ontouchend="this.style.transform='scale(1)';" title="Solicitar Orçamento">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <span style="position: absolute; top: -8px; right: -8px; background: #ff3b30; color: white; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 10px; animation: bounce-icon 0.6s ease;">💬</span>
        </a>
        
        <style>
          @keyframes pulse-whatsapp {
            0%, 100% { box-shadow: 0 8px 24px rgba(37, 211, 102, 0.4), 0 0 0 0 rgba(37, 211, 102, 0.6); }
            50% { box-shadow: 0 8px 24px rgba(37, 211, 102, 0.4), 0 0 0 15px rgba(37, 211, 102, 0); }
          }
          @keyframes bounce-icon {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
          }
        </style>
        
        <div id="galeriaContainer" style="display: none; flex-direction: column; gap: 1rem;">
          <div style="position: relative; width: 100%; background: #000; border-radius: 12px; overflow: hidden; border: 2px solid #d4af37; box-shadow: 0 20px 60px rgba(212,175,55,0.2);">
            <img id="galeriaImagem" src="" style="width: 100%; height: auto; max-height: 500px; object-fit: contain; display: block; transition: all 0.3s ease-in-out; opacity: 1; transform: scale(1);">
            
            <button class="galeria-nav-btn" onclick="fotoAnterior()" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); background: rgba(212,175,55,0.18); border: 1.5px solid rgba(212,175,55,0.6); color: #fffbe6; padding: 0.75rem 1rem; border-radius: 10px; cursor: pointer; font-size: 1.5rem; display: none; font-weight: bold; transition: all 0.3s ease; backdrop-filter: blur(8px); box-shadow: 0 0 20px rgba(212,175,55,0.35), inset 0 0 10px rgba(212,175,55,0.2);" onmouseover="this.style.background='rgba(212,175,55,0.35)'; this.style.transform='translateY(-50%) scale(1.1)'; this.style.boxShadow='0 0 26px rgba(212,175,55,0.5), inset 0 0 12px rgba(212,175,55,0.3)';" onmouseout="this.style.background='rgba(212,175,55,0.18)'; this.style.transform='translateY(-50%) scale(1)'; this.style.boxShadow='0 0 20px rgba(212,175,55,0.35), inset 0 0 10px rgba(212,175,55,0.2)';">‹</button>
            
            <button class="galeria-nav-btn" onclick="proximaFoto()" style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); background: rgba(212,175,55,0.18); border: 1.5px solid rgba(212,175,55,0.6); color: #fffbe6; padding: 0.75rem 1rem; border-radius: 10px; cursor: pointer; font-size: 1.5rem; display: none; font-weight: bold; transition: all 0.3s ease; backdrop-filter: blur(8px); box-shadow: 0 0 20px rgba(212,175,55,0.35), inset 0 0 10px rgba(212,175,55,0.2);" onmouseover="this.style.background='rgba(212,175,55,0.35)'; this.style.transform='translateY(-50%) scale(1.1)'; this.style.boxShadow='0 0 26px rgba(212,175,55,0.5), inset 0 0 12px rgba(212,175,55,0.3)';" onmouseout="this.style.background='rgba(212,175,55,0.18)'; this.style.transform='translateY(-50%) scale(1)'; this.style.boxShadow='0 0 20px rgba(212,175,55,0.35), inset 0 0 10px rgba(212,175,55,0.2)';">›</button>
            
            <div id="galeriaCounter" style="position: absolute; bottom: 1rem; right: 1rem; background: rgba(0,0,0,0.8); color: #d4af37; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: bold;"></div>
          </div>
          
          <div id="galeriaThumbnails" style="display: none; gap: 0.75rem; justify-content: center; flex-wrap: wrap; padding: 1rem 0;"></div>
        </div>
      </div>
    `;
    
    // Fechar ao clicar fora
    modal.addEventListener('click', (e) => {
      if (e.target === modal) fecharGaleria();
    });
    
    // Fechar ao pressionar ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fecharGaleria();
    });
    
    // Navegação com setas
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('galeriaModal');
      if (!modal || modal.style.display === 'none') return;
      if (e.key === 'ArrowLeft') fotoAnterior();
      if (e.key === 'ArrowRight') proximaFoto();
    });
    
    document.body.appendChild(modal);
  }
  return modal;
}
// ================================
// FILTRO DE DISPONIBILIDADE
// ================================

async function ativarFiltroDisponivel() {
  // Esconder tela de tipos
  document.getElementById('telasTipos').parentElement.parentElement.style.display = 'none';
  document.getElementById('colecao-mesas').style.display = 'none';
  document.getElementById('colecao-filtro-disponivel').style.display = 'block';
  
  // Buscar todas as mesas disponíveis
  try {
    const snapshot = await firebaseDB.collection('mesas').get();
    const mesasDisponiveis = [];
    
    snapshot.forEach(doc => {
      const mesa = doc.data();
      const status = mesa.status || (mesa.disponivel !== false ? 'disponivel' : 'encomenda');
      
      if (status === 'disponivel') {
        mesasDisponiveis.push({ id: doc.id, ...mesa });
      }
    });
    
    // Ordenar por data
    mesasDisponiveis.sort((a, b) => {
      const dateA = a.createdAté.toDate?.() || new Date(0);
      const dateB = b.createdAté.toDate?.() || new Date(0);
      return dateB - dateA;
    });
    
    // Renderizar mesas disponíveis
    const container = document.getElementById('colecao-lista-disponivel');
    
    if (mesasDisponiveis.length === 0) {
      container.innerHTML = '<p class="text-gray-400 col-span-full text-center py-12">Nenhuma mesa disponível no momento</p>';
      return;
    }
    
    container.innerHTML = mesasDisponiveis.map((mesa, mesaIndex) => {
      const fotos = mesa.fotos || [];
      const fotoInicial = mesa.fotoPrincipal || (fotos.length > 0 ? fotos[0] : null);
      let indiceFoto = fotoInicial ? fotos.indexOf(fotoInicial) : -1;
      if (indiceFoto === -1 && fotos.length > 0) indiceFoto = 0;
      
      const precoFormatado = mesa.preco ? `R$ ${mesa.preco.toFixed(2).replace('.', ',')}` : '';
      
      const dim = mesa.dimensoes || {};
      const dimensoesTexto = dim.comprimento && dim.largura 
        ? `${dim.comprimento}cm × ${dim.largura}cm × ${dim.altura || 0}cm`
        : '';
      
      const totalFotos = fotos.length;
      const fotoInfo = totalFotos > 0 ? ` (Foto 1 de ${totalFotos})` : '';
      const mensagemWhatsApp = `Olá! Gostaria de saber mais sobre a mesa ${mesa.nome}.${fotoInfo}`;
      
      return `
        <div class="relative fade-up flex flex-col min-h-[340px] pb-6 md:min-h-[580px] md:pb-10 justify-between bg-gradient-to-br from-black/70 to-black/40 rounded-2xl shadow-2xl border-2 border-ouro/50 hover:border-ouro hover:shadow-ouro/30 transition-all duration-700 hover:-translate-y-3 backdrop-blur-sm group" style="transform-style: preserve-3d; box-shadow: 0 20px 60px rgba(212,175,55,0.15), 0 8px 16px rgba(0,0,0,0.6);">
        <span class="mesa-badge absolute top-4 left-4 text-white px-4 py-1.5 text-xs font-bold tracking-widest rounded-lg shadow-lg z-10 transition-all duration-400" style="background: rgba(34, 197, 94, 0.25); backdrop-filter: blur(8px); border: 1.5px solid rgba(34, 197, 94, 0.6); box-shadow: 0 0 20px rgba(34, 197, 94, 0.4), inset 0 0 10px rgba(34, 197, 94, 0.2);">PRONTA ENTREGA</span>
        <div class="block px-5 pt-5 cursor-pointer stellar-button">
          <div class="relative foto-container group/img w-full h-64 md:h-72 overflow-hidden rounded-xl">
              <img src="${fotoInicial || '/dist/img/placeholder.svg'}" loading="lazy" class="card-foto rounded-xl shadow-2xl group-hover:shadow-ouro/40 object-contain w-full h-full" alt="${mesa.nome}" style="background: linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(0,0,0,0.6) 100%), radial-gradient(ellipse at top right, rgba(212,175,55,0.06), transparent 70%); box-shadow: 0 15px 35px rgba(0,0,0,0.5), inset 0 0 30px rgba(212,175,55,0.15); transition: opacity 0.4s ease-in-out, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.7s ease; opacity: 1;" onerror="this.src='/dist/img/placeholder.svg'" />
            ${totalFotos > 1 ? `<div class="absolute bottom-3 right-3 bg-black/70 px-3 py-1 rounded-lg text-xs text-ouro font-bold">${totalFotos} FOTOS</div>` : ''}
          </div>
        </div>
        <div class="px-6">
          <h3 class="font-title text-2xl md:text-3xl text-ouro mt-6 mb-2 drop-shadow-lg" style="text-shadow: 0 2px 8px rgba(212,175,55,0.5);">${mesa.nome}</h3>
          
          ${precoFormatado ? `<p class="text-green-400 font-bold text-xl mb-2">${precoFormatado}</p>` : ''}
          
          ${dimensoesTexto ? `
          <div class="flex items-center gap-2 mb-3 text-gray-400 text-sm">
            <span class="text-ouro">📏</span>
            <span>${dimensoesTexto}</span>
          </div>
          ` : ''}
          
          <p class="text-gray-300 mt-3 mb-5 leading-relaxed">${mesa.descricao || ''}</p>
          <ul class="text-gray-400 text-sm mb-6 pl-5 space-y-1.5 list-disc">
            ${mesa.especificacoes ? mesa.especificacoes.map(spec => `<li>${spec}</li>`).join('') : ''}
          </ul>
          <a href="https://wa.me/5519997024884?text=${encodeURIComponent(mensagemWhatsApp)}" target="_blank" class="inline-block w-full py-3 text-center font-bold rounded-xl shadow-lg hover:scale-105 transition-all duration-400" style="background: rgba(34, 197, 94, 0.25); backdrop-filter: blur(8px); border: 1.5px solid rgba(34, 197, 94, 0.6); box-shadow: 0 0 20px rgba(34, 197, 94, 0.4); color: white;">
            FALAR COM VENDEDOR
          </a>
        </div>
      </div>
      `;
    }).join('');
    
    // Aplicar animação fade-up
    setTimeout(() => {
      document.querySelectorAll('#colecao-filtro-disponivel .fade-up').forEach((el, i) => {
        setTimeout(() => el.classList.add('show'), i * 100);
      });
    }, 100);
    
    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
  } catch (error) {
    console.error('Erro ao carregar mesas disponíveis:', error);
    document.getElementById('colecao-lista-disponivel').innerHTML = '<p class="text-red-400 col-span-full text-center py-12">Erro ao carregar mesas. Tente novamente mais tarde.</p>';
  }
}

function limparFiltroDisponivel() {
  // Voltar para tela de tipos
  document.getElementById('telasTipos').parentElement.parentElement.style.display = 'block';
  document.getElementById('colecao-mesas').style.display = 'none';
  document.getElementById('colecao-filtro-disponivel').style.display = 'none';
  window.tipoSelecionado = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
