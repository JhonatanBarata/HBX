// Script para carregar fotos do carrossel no index.html (leve e pesado)

(async function () {
  const AUTOPLAY_MS = 4200;
  const SWIPE_THRESHOLD = 24;

  function waitForFirebase() {
    return new Promise(function (resolve) {
      const checkFirebase = setInterval(function () {
        if (window.firebaseDB) {
          clearInterval(checkFirebase);
          resolve();
        }
      }, 100);
    });
  }

  function createBullets(container, total, onSelect) {
    if (!container) return;
    container.innerHTML = '';

    for (let index = 0; index < total; index += 1) {
      const bullet = document.createElement('button');
      bullet.type = 'button';
      bullet.className = 'carousel-dot';
      bullet.setAttribute('aria-label', 'Ir para imagem ' + (index + 1));
      bullet.addEventListener('click', function () {
        onSelect(index);
      });
      container.appendChild(bullet);
    }
  }

  function applyStackState(slides, bullets, activeIndex) {
    const total = slides.length;
    const previousIndex = (activeIndex - 1 + total) % total;
    const beforePreviousIndex = (activeIndex - 2 + total) % total;
    const nextIndex = (activeIndex + 1) % total;
    const afterIndex = (activeIndex + 2) % total;

    slides.forEach(function (slide, index) {
      slide.classList.remove('is-active', 'is-prev', 'is-before-prev', 'is-next', 'is-after', 'is-hidden');

      if (index === activeIndex) {
        slide.classList.add('is-active');
      } else if (index === previousIndex) {
        slide.classList.add('is-prev');
      } else if (total > 4 && index === beforePreviousIndex) {
        slide.classList.add('is-before-prev');
      } else if (index === nextIndex) {
        slide.classList.add('is-next');
      } else if (total > 3 && index === afterIndex) {
        slide.classList.add('is-after');
      } else {
        slide.classList.add('is-hidden');
      }
    });

    if (bullets) {
      Array.from(bullets.children).forEach(function (bullet, index) {
        bullet.classList.toggle('is-active', index === activeIndex);
      });
    }
  }

  function setupCarousel(rootSelector, fotos) {
    const swiperRoot = document.querySelector(rootSelector);
    if (!swiperRoot) return;

    const swiperWrapper = swiperRoot.querySelector('.swiper-wrapper');
    const pagination = swiperRoot.querySelector('.swiper-pagination');

    if (!swiperWrapper) return;

    if (!Array.isArray(fotos) || !fotos.length) {
      swiperWrapper.innerHTML =
        '<div class="swiper-slide"><div class="placeholder-slide">Sem imagens cadastradas por enquanto.</div></div>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    swiperWrapper.innerHTML = '';
    fotos.forEach(function (foto, index) {
      const slide = document.createElement('div');
      slide.className = 'swiper-slide';
      slide.innerHTML = '<img src="' + foto + '" alt="Imagem ' + (index + 1) + '">';
      swiperWrapper.appendChild(slide);
    });

    const slides = Array.from(swiperWrapper.children);
    let currentIndex = 0;
    let autoplayId = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let touchDragging = false;
    let touchLocked = false;

    const goTo = function (nextIndex) {
      currentIndex = (nextIndex + slides.length) % slides.length;
      applyStackState(slides, pagination, currentIndex);
    };

    const startAutoplay = function () {
      window.clearInterval(autoplayId);
      autoplayId = window.setInterval(function () {
        goTo(currentIndex + 1);
      }, AUTOPLAY_MS);
    };

    createBullets(pagination, slides.length, function (selectedIndex) {
      goTo(selectedIndex);
      startAutoplay();
    });

    goTo(0);
    startAutoplay();

    swiperRoot.addEventListener('mouseenter', function () {
      window.clearInterval(autoplayId);
    });

    swiperRoot.addEventListener('mouseleave', function () {
      startAutoplay();
    });

    swiperRoot.addEventListener('touchstart', function (event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return;

      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      touchDragging = true;
      touchLocked = false;
      window.clearInterval(autoplayId);
    }, { passive: true });

    swiperRoot.addEventListener('touchmove', function (event) {
      if (!touchDragging || touchLocked) return;

      const touch = event.touches && event.touches[0];
      if (!touch) return;

      const deltaY = touch.clientY - touchStartY;
      const deltaX = touch.clientX - touchStartX;

      if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) < SWIPE_THRESHOLD) {
        return;
      }

      event.preventDefault();
      touchLocked = true;
      goTo(currentIndex + (deltaY < 0 ? 1 : -1));
    }, { passive: false });

    swiperRoot.addEventListener('touchend', function () {
      touchDragging = false;
      touchLocked = false;
      startAutoplay();
    });

    swiperRoot.addEventListener('touchcancel', function () {
      touchDragging = false;
      touchLocked = false;
      startAutoplay();
    });
  }

  function collectCarouselPhotos(items, type) {
    const isPesado = type === 'pesado';
    const photoField = isPesado ? 'fotoCarrosselPesado' : 'fotoCarrossel';
    const orderField = isPesado ? 'ordemCarrosselPesado' : 'ordemCarrossel';

    return items
      .map(function (mesa) {
        const foto = typeof mesa[photoField] === 'string' ? mesa[photoField].trim() : '';
        if (!foto) return null;

        return {
          foto: foto,
          ordem: typeof mesa[orderField] === 'number' ? mesa[orderField] : 999
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.ordem - b.ordem;
      })
      .map(function (item) {
        return item.foto;
      });
  }

  try {
    await waitForFirebase();

    const snapshot = await firebaseDB.collection('mesas').get();
    const items = [];
    snapshot.forEach(function (doc) {
      items.push(doc.data() || {});
    });

    const fotosLeves = collectCarouselPhotos(items, 'leve');
    const fotosPesadas = collectCarouselPhotos(items, 'pesado');

    setupCarousel('.bannerSwiper', fotosLeves);
    setupCarousel('.heavyBannerSwiper', fotosPesadas);
  } catch (error) {
    console.error('Erro ao carregar carrossel:', error);
  }
})();
