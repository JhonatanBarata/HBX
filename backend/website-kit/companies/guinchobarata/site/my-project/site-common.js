(function () {
  const WHATSAPP_NUMBER = '5519996513456';
  const WHATSAPP_FLOW = {
    vehicle: '',
    serviceType: ''
  };
  let currentWhatsAppStep = 0;
  let isWhatsAppStepAnimating = false;
  let whatsappStepAnimationTimeoutId = null;
  let isWhatsAppHelpHiddenByFooter = false;

  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', function () {
      mobileMenu.classList.toggle('is-open');
    });
  }

  const privacyModal = document.getElementById('privacy-modal');
  const openPrivacyButtons = document.querySelectorAll('[data-open-privacy]');
  const closePrivacyButtons = document.querySelectorAll('[data-close-privacy]');

  if (privacyModal) {
    openPrivacyButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        privacyModal.classList.add('is-open');
        privacyModal.setAttribute('aria-hidden', 'false');
      });
    });

    closePrivacyButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        privacyModal.classList.remove('is-open');
        privacyModal.setAttribute('aria-hidden', 'true');
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        privacyModal.classList.remove('is-open');
        privacyModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // Apply scroll reveal broadly só all pages share the same movement pattern.
  const autoRevealSelectors = [
    'main section',
    'main .card',
    'main .hero-panel',
    'main .contact-highlight',
    '.developer-banner',
    '.developer-card',
    '.site-footer',
    '.footer-panel',
    '.footer-meta'
  ];

  const isAdminPage = window.location.pathname.endsWith('/admin.html') || window.location.pathname.endsWith('admin.html');
  if (!isAdminPage) {
    document.querySelectorAll(autoRevealSelectors.join(',')).forEach(function (element) {
      if (element.classList.contains('reveal')) return;
      if (element.hasAttribute('data-no-reveal')) return;
      element.classList.add('reveal');
    });
  }

  const revealItems = document.querySelectorAll('.reveal');
  if (revealItems.length) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealItems.forEach(function (item) {
        item.classList.add('is-visible');
      });
    } else {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.12
      });

      revealItems.forEach(function (item, index) {
        item.style.transitionDelay = Math.min(index * 70, 280) + 'ms';
        observer.observe(item);
      });
    }
  }

  const foundationCounters = document.querySelectorAll('[data-foundation-counter]');
  if (foundationCounters.length) {
    const calculateFoundationElapsed = function (startDate, nowDate) {
      let years = nowDate.getFullYear() - startDate.getFullYear();
      let months = nowDate.getMonth() - startDate.getMonth();
      let days = nowDate.getDate() - startDate.getDate();
      let hours = nowDate.getHours() - startDate.getHours();
      let minutes = nowDate.getMinutes() - startDate.getMinutes();

      if (minutes < 0) {
        minutes += 60;
        hours -= 1;
      }

      if (hours < 0) {
        hours += 24;
        days -= 1;
      }

      if (days < 0) {
        const previousMonthLastDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0).getDate();
        days += previousMonthLastDay;
        months -= 1;
      }

      if (months < 0) {
        months += 12;
        years -= 1;
      }

      if (years < 0) {
        return { years: 0, months: 0, days: 0, hours: 0, minutes: 0 };
      }

      return { years: years, months: months, days: days, hours: hours, minutes: minutes };
    };

    const updateFoundationCounter = function (counter) {
      const startRaw = counter.getAttribute('data-foundation-start') || '2012-05-16T00:00:00-03:00';
      const startDate = new Date(startRaw);
      if (Number.isNaN(startDate.getTime())) {
        return;
      }

      const elapsed = calculateFoundationElapsed(startDate, new Date());
      const values = {
        years: elapsed.years,
        months: elapsed.months,
        days: elapsed.days,
        hours: elapsed.hours,
        minutes: elapsed.minutes
      };

      Object.keys(values).forEach(function (key) {
        const valueTarget = counter.querySelector('[data-foundation-value="' + key + '"]');
        if (valueTarget) {
          valueTarget.textContent = String(values[key]);
        }
      });

      const yearRange = Math.max(20, elapsed.years + 6);
      const handAngles = {
        years: (elapsed.years / yearRange) * 360,
        months: (elapsed.months / 12) * 360,
        days: (elapsed.days / 31) * 360,
        hours: (elapsed.hours / 24) * 360,
        minutes: (elapsed.minutes / 60) * 360
      };

      Object.keys(handAngles).forEach(function (key) {
        const hand = counter.querySelector('[data-foundation-hand="' + key + '"]');
        if (hand) {
          hand.style.setProperty('--angle', String(handAngles[key]));
        }
      });
    };

    foundationCounters.forEach(function (counter) {
      updateFoundationCounter(counter);
    });

    const scheduleFoundationCounter = function () {
      foundationCounters.forEach(function (counter) {
        updateFoundationCounter(counter);
      });
      window.setInterval(function () {
        foundationCounters.forEach(function (counter) {
          updateFoundationCounter(counter);
        });
      }, 60000);
    };

    const now = new Date();
    const delayUntilNextMinute = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds();
    window.setTimeout(scheduleFoundationCounter, Math.max(100, delayUntilNextMinute));
  }

  const buildWhatsAppMessage = function (locationData) {
    const isUrgent = WHATSAPP_FLOW.serviceType === 'socorro urgente';
    const lines = [
      isUrgent ? 'Preciso de socorro com guincho com urgência.' : 'Quero fazer uma cotação de guincho.',
      WHATSAPP_FLOW.vehicle ? 'Tipo de veículo: ' + WHATSAPP_FLOW.vehicle + '.' : 'Tipo de veículo não informado.',
      'Atendimento solicitado pelo site da Auto Socorro Rio Claro.'
    ];

    if (locationData) {
      lines.push('Minha localização atual: ' + locationData.mapLink);
      lines.push('Coordenadas: ' + locationData.latitude + ', ' + locationData.longitude);
    } else {
      lines.push('Sem localização automática no momento.');
    }

    return lines.join('\n');
  };

  const showWhatsAppStatus = function (message) {
    let status = document.querySelector('[data-whatsapp-status]');

    if (!status) {
      status = document.createElement('div');
      status.className = 'whatsapp-help__status';
      status.setAttribute('data-whatsapp-status', '');
      document.body.appendChild(status);
    }

    status.classList.toggle('is-hidden-by-footer', isWhatsAppHelpHiddenByFooter);

    status.textContent = message;
    status.classList.add('is-visible');

    window.clearTimeout(showWhatsAppStatus.timeoutId);
    showWhatsAppStatus.timeoutId = window.setTimeout(function () {
      status.classList.remove('is-visible');
    }, 3200);
  };

  const openWhatsAppWithMessage = function (message) {
    const url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openWithoutLocation = function () {
    showWhatsAppStatus('Abrindo o WhatsApp sem localização automática.');
    openWhatsAppWithMessage(buildWhatsAppMessage(null));
  };

  const requestLocationAndOpenWhatsApp = function () {
    if (!('geolocation' in navigator)) {
      showWhatsAppStatus('Seu navegador não oferece geolocalização. Vou abrir o WhatsApp sem localização automática.');
      openWhatsAppWithMessage(buildWhatsAppMessage(null));
      return;
    }

    showWhatsAppStatus('Se você permitir, vou colocar sua localização atual na mensagem do WhatsApp.');

    navigator.geolocation.getCurrentPosition(function (position) {
      const latitude = position.coords.latitude.toFixed(6);
      const longitude = position.coords.longitude.toFixed(6);
      const locationData = {
        latitude: latitude,
        longitude: longitude,
        mapLink: 'https://maps.google.com/?q=' + latitude + ',' + longitude
      };

      showWhatsAppStatus('Localização capturada. Abrindo o WhatsApp com a mensagem pronta.');
      openWhatsAppWithMessage(buildWhatsAppMessage(locationData));
    }, function () {
      showWhatsAppStatus('Sem permissão de localização. Vou abrir o WhatsApp sem localização automática.');
      openWhatsAppWithMessage(buildWhatsAppMessage(null));
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  };

  const createWhatsAppConsent = function () {
    const existing = document.querySelector('[data-whatsapp-consent]');
    if (existing) {
      return existing;
    }

    const modal = document.createElement('div');
    modal.className = 'whatsapp-consent';
    modal.setAttribute('data-whatsapp-consent', '');
    modal.innerHTML =
      '<div class="whatsapp-consent__backdrop" data-whatsapp-consent-close></div>' +
      '<div class="whatsapp-consent__panel" role="dialog" aria-modal="true" aria-labelledby="whatsapp-consent-title">' +
        '<button class="whatsapp-consent__close" type="button" data-whatsapp-consent-close aria-label="Fechar">x</button>' +
        '<div class="whatsapp-consent__content" data-whatsapp-consent-content></div>' +
      '</div>';

    document.body.appendChild(modal);

    const closeConsent = function () {
      modal.classList.remove('is-open');
    };

    modal.querySelectorAll('[data-whatsapp-consent-close]').forEach(function (element) {
      element.addEventListener('click', closeConsent);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeConsent();
      }
    });

    return modal;
  };

  const getWhatsAppStepMarkup = function (step) {
    if (step === 1) {
      return (
        '<span class="whatsapp-consent__eyebrow">Etapa 1 de 3</span>' +
        '<h3 id="whatsapp-consent-title">O que é o veículo?</h3>' +
        '<p>Escolha o tipo principal para o guincheiro receber a chamada com mais contexto.</p>' +
        '<div class="whatsapp-consent__choices">' +
          '<button class="button button-secondary whatsapp-consent__choice" type="button" data-whatsapp-vehicle="Carro">Carro</button>' +
          '<button class="button button-secondary whatsapp-consent__choice" type="button" data-whatsapp-vehicle="Caminhonete">Caminhonete</button>' +
          '<button class="button button-secondary whatsapp-consent__choice" type="button" data-whatsapp-vehicle="Caminhao">Caminhao</button>' +
          '<button class="button button-secondary whatsapp-consent__choice" type="button" data-whatsapp-vehicle="Trator ou maquina">Trator ou maquina</button>' +
        '</div>'
      );
    }

    if (step === 2) {
      return (
        '<span class="whatsapp-consent__eyebrow">Etapa 2 de 3</span>' +
        '<h3 id="whatsapp-consent-title">Você quer cotação ou socorro urgente?</h3>' +
        '<p>Essa escolha entra na mensagem antes do WhatsApp abrir.</p>' +
        '<div class="whatsapp-consent__choices">' +
          '<button class="button whatsapp-consent__choice" type="button" data-whatsapp-service="socorro urgente">Socorro urgente</button>' +
          '<button class="button button-secondary whatsapp-consent__choice" type="button" data-whatsapp-service="cotação">Cotação</button>' +
        '</div>' +
        '<div class="whatsapp-consent__actions">' +
          '<button class="button button-secondary" type="button" data-whatsapp-back>Voltar</button>' +
        '</div>'
      );
    }

    return (
      '<span class="whatsapp-consent__eyebrow">Etapa 3 de 3</span>' +
      '<h3 id="whatsapp-consent-title">Compartilhar localização?</h3>' +
      '<p>Autorize os pop-ups do navegador para o WhatsApp abrir corretamente em uma nova aba.</p>' +
      '<p>Se você permitir a localização, já enviamos sua posição na mensagem para deixar o atendimento mais rápido.</p>' +
      '<div class="whatsapp-consent__actions">' +
        '<button class="button" type="button" data-whatsapp-share-location>Compartilhar localização e chamar agora</button>' +
        '<button class="button button-secondary" type="button" data-whatsapp-skip-location>Não, abrir sem localização</button>' +
      '</div>' +
      '<div class="whatsapp-consent__actions">' +
        '<button class="button button-secondary" type="button" data-whatsapp-back>Voltar</button>' +
      '</div>'
    );
  };

  const bindWhatsAppStepEvents = function (stage, step, modal) {
    if (!stage) {
      return;
    }

    if (step === 1) {
      stage.querySelectorAll('[data-whatsapp-vehicle]').forEach(function (button) {
        button.addEventListener('click', function () {
          if (isWhatsAppStepAnimating) return;
          WHATSAPP_FLOW.vehicle = button.getAttribute('data-whatsapp-vehicle') || '';
          renderWhatsAppStep(2);
        });
      });
      return;
    }

    if (step === 2) {
      stage.querySelectorAll('[data-whatsapp-service]').forEach(function (button) {
        button.addEventListener('click', function () {
          if (isWhatsAppStepAnimating) return;
          WHATSAPP_FLOW.serviceType = button.getAttribute('data-whatsapp-service') || '';
          renderWhatsAppStep(3);
        });
      });

      const backButton = stage.querySelector('[data-whatsapp-back]');
      if (backButton) {
        backButton.addEventListener('click', function () {
          if (isWhatsAppStepAnimating) return;
          renderWhatsAppStep(1);
        });
      }
      return;
    }

    const shareButton = stage.querySelector('[data-whatsapp-share-location]');
    if (shareButton) {
      shareButton.addEventListener('click', function () {
        modal.classList.remove('is-open');
        requestLocationAndOpenWhatsApp();
      });
    }

    const skipButton = stage.querySelector('[data-whatsapp-skip-location]');
    if (skipButton) {
      skipButton.addEventListener('click', function () {
        modal.classList.remove('is-open');
        openWithoutLocation();
      });
    }

    const backButton = stage.querySelector('[data-whatsapp-back]');
    if (backButton) {
      backButton.addEventListener('click', function () {
        if (isWhatsAppStepAnimating) return;
        renderWhatsAppStep(2);
      });
    }
  };

  const renderWhatsAppStep = function (step) {
    const modal = createWhatsAppConsent();
    const content = modal.querySelector('[data-whatsapp-consent-content]');

    if (!content) {
      return;
    }

    const previousStage = content.querySelector('.whatsapp-consent__stage');
    const nextStage = document.createElement('div');
    const isBack = currentWhatsAppStep && step < currentWhatsAppStep;
    const enteringClass = isBack ? 'is-entering-back' : 'is-entering-forward';
    const leavingClass = isBack ? 'is-leaving-back' : 'is-leaving-forward';

    nextStage.className = 'whatsapp-consent__stage ' + enteringClass;
    nextStage.innerHTML = getWhatsAppStepMarkup(step);

    window.clearTimeout(whatsappStepAnimationTimeoutId);

    if (!previousStage) {
      content.innerHTML = '';
      content.appendChild(nextStage);
      bindWhatsAppStepEvents(nextStage, step, modal);
      isWhatsAppStepAnimating = true;
      content.style.minHeight = nextStage.scrollHeight + 'px';

      whatsappStepAnimationTimeoutId = window.setTimeout(function () {
        nextStage.classList.remove(enteringClass);
        nextStage.classList.add('is-current');
        content.style.minHeight = '';
        isWhatsAppStepAnimating = false;
      }, 340);

      currentWhatsAppStep = step;
      return;
    }

    isWhatsAppStepAnimating = true;
    previousStage.classList.remove('is-current');
    previousStage.classList.add(leavingClass);
    content.appendChild(nextStage);
    bindWhatsAppStepEvents(nextStage, step, modal);
    content.style.minHeight = Math.max(previousStage.scrollHeight, nextStage.scrollHeight) + 'px';

    whatsappStepAnimationTimeoutId = window.setTimeout(function () {
      nextStage.classList.remove(enteringClass);
      nextStage.classList.add('is-current');
      if (previousStage.parentNode) {
        previousStage.remove();
      }
      content.style.minHeight = '';
      isWhatsAppStepAnimating = false;
    }, 340);

    currentWhatsAppStep = step;
  };

  const openWhatsAppConsent = function () {
    const modal = createWhatsAppConsent();
    WHATSAPP_FLOW.vehicle = '';
    WHATSAPP_FLOW.serviceType = '';
    currentWhatsAppStep = 0;
    isWhatsAppStepAnimating = false;
    renderWhatsAppStep(1);
    modal.classList.add('is-open');
  };

  const setWhatsAppHelpHiddenByFooter = function (widget, shouldHide) {
    isWhatsAppHelpHiddenByFooter = shouldHide;

    if (widget) {
      widget.classList.toggle('is-hidden-by-footer', shouldHide);
    }

    const status = document.querySelector('[data-whatsapp-status]');
    if (status) {
      status.classList.toggle('is-hidden-by-footer', shouldHide);
    }
  };

  const watchWhatsAppHelpAgainstFooter = function (widget) {
    const footer = document.querySelector('footer');
    if (!widget || !footer) {
      return;
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        const entry = entries[0];
        setWhatsAppHelpHiddenByFooter(widget, Boolean(entry && entry.isIntersecting));
      }, {
        threshold: 0,
        rootMargin: '0px 0px 120px 0px'
      });

      observer.observe(footer);
      return;
    }

    const syncVisibility = function () {
      const footerTop = footer.getBoundingClientRect().top;
      setWhatsAppHelpHiddenByFooter(widget, footerTop <= (window.innerHeight + 120));
    };

    window.addEventListener('scroll', syncVisibility, { passive: true });
    window.addEventListener('resize', syncVisibility);
    syncVisibility();
  };

  const createWhatsAppHelp = function () {
    if (document.querySelector('[data-whatsapp-help]')) {
      return;
    }

    const widget = document.createElement('aside');
    widget.className = 'whatsapp-help';
    widget.setAttribute('data-whatsapp-help', '');
    widget.innerHTML =
      '<div class="whatsapp-help__text">' +
        '<span class="whatsapp-help__label">Precisa de socorro? Clique aqui.</span>' +
        '<span class="whatsapp-help__subtext">Responda 3 perguntas rápidas e abrimos o WhatsApp da forma mais pronta possível.</span>' +
      '</div>' +
      '<button class="whatsapp-help__button" type="button" aria-label="Abrir WhatsApp de socorro">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97ZM12.07 20.2h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.53 3.69-8.22 8.24-8.22 2.2 0 4.27.85 5.82 2.4a8.17 8.17 0 0 1 2.4 5.82c0 4.54-3.69 8.23-8.2 8.23Zm4.5-6.15c-.25-.13-1.47-.72-1.7-.8-.23-.08-.4-.12-.57.12-.17.25-.65.8-.8.97-.15.17-.3.19-.56.06-.25-.13-1.06-.39-2.01-1.26-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.5.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.44l-.49-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.45 1.02 2.62c.13.17 1.77 2.7 4.3 3.79.6.26 1.08.42 1.44.54.61.19 1.16.16 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.3Z"></path>' +
        '</svg>' +
      '</button>';

    document.body.appendChild(widget);

    const actionButton = widget.querySelector('.whatsapp-help__button');
    if (actionButton) {
      actionButton.addEventListener('click', openWhatsAppConsent);
    }

    watchWhatsAppHelpAgainstFooter(widget);
  };

  if (!isAdminPage) {
    createWhatsAppHelp();
  }
})();
