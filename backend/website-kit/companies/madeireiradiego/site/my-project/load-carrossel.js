// Script para carregar fotos do carrossel do Firebase no index.html

console.log('🔄 load-carrossel.js carregado');

(async function() {
  try {
    console.log('Iniciando carregamento do carrossel...');
    
    // Aguardar Firebase carregar
    await new Promise(resolve => {
      const checkFirebase = setInterval(() => {
        if (window.firebaseDB) {
          clearInterval(checkFirebase);
          console.log('Firebase DB disponível');
          resolve();
        }
      }, 100);
    });

    // Aguardar Swiper estar disponível
    await new Promise(resolve => {
      const checkSwiper = setInterval(() => {
        if (window.Swiper) {
          clearInterval(checkSwiper);
          console.log('Swiper disponível');
          resolve();
        }
      }, 100);
    });
    
    const swiperWrapper = document.querySelector('.bannerSwiper .swiper-wrapper');
    if (!swiperWrapper) {
      console.log('⚠️ Carrossel wrapper não encontrado');
      return;
    }
    console.log('Carrossel wrapper encontrado');
    
    // Buscar fotos do carrossel das mesas (apenas as com fotoCarrossel definido)
    console.log('Buscando fotos de carrossel das mesas...');
    
    // Buscar TODAS as mesas e depois filtrar/ordenar no cliente
    const mesasSnapshot = await firebaseDB.collection('mesas').get();
    console.log('Total de mesas:', mesasSnapshot.size);
    
    // Coletar todas as mesas que estão no carrossel
    const mesasCarrossel = [];
    mesasSnapshot.forEach(doc => {
      const mesa = doc.data();
      if (mesa.fotoCarrossel && typeof mesa.fotoCarrossel === 'string' && mesa.fotoCarrossel.trim() !== '') {
        mesasCarrossel.push({
          nome: mesa.nome,
          fotoCarrossel: mesa.fotoCarrossel,
          ordemCarrossel: typeof mesa.ordemCarrossel === 'number' ? mesa.ordemCarrossel : 999
        });
      }
    });
    
    // Ordenar por ordemCarrossel
    mesasCarrossel.sort((a, b) => a.ordemCarrossel - b.ordemCarrossel);
    
    // Extrair apenas as URLs
    const fotos = mesasCarrossel.map(m => m.fotoCarrossel);
    
    if (fotos.length === 0) {
      console.log('❌ Nenhuma mesa com carrossel encontrada');
      return;
    }
    console.log('✅ Carregadas ' + fotos.length + ' fotos do Firebase');
    console.log('Fotos:', fotos);
    
    // Limpar slides antigos
    swiperWrapper.innerHTML = '';
    
    // Adicionar novos slides
    fotos.forEach((foto, idx) => {
      console.log('Adicionando foto ' + (idx+1) + ':', foto);
      const slide = document.createElement('div');
      slide.className = 'swiper-slide';
      slide.innerHTML = `<img src="${foto}" alt="Banner" style="width:100%;height:100%;object-fit:contain;object-position:center;">`;
      swiperWrapper.appendChild(slide);
    });
    
    console.log('Total de slides adicionados:', swiperWrapper.children.length);
    
    // Reinicializar o Swiper
    const swiperInstance = document.querySelector('.bannerSwiper').swiper;
    if (swiperInstance) {
      console.log('Destruindo instância anterior do Swiper');
      swiperInstance.destroy();
      
      // Espera um pouco e recria
      setTimeout(() => {
        console.log('Recriando Swiper com ' + fotos.length + ' slides');
        window.bannerSwiper = new Swiper('.bannerSwiper', {
          slidesPerView: 'auto',
          spaceBetween: 0,
          loop: false,
          centeredSlides: true,
          autoplay: {
            delay: 4000,
            disableOnInteraction: false,
          },
          pagination: {
            el: '.swiper-pagination',
            clickable: true,
          },
          navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
          },
          speed: 600,
          grabCursor: true,
          keyboard: {
            enabled: true,
          }
        });
        console.log('✅ Swiper recriado com sucesso');
      }, 100);
    } else {
      console.log('❌ Instância do Swiper não encontrada');
    }
    
  } catch (error) {
    console.error('❌ Erro ao carregar carrossel:', error);
  }
})();
