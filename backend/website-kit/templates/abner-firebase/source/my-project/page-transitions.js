(function () {
  const loader = document.getElementById('page-loader');

  const MIN_LOADER_MS = (() => {
    const raw = loader?.getAttribute('data-min-duration');
    const parsed = raw ? Number.parseInt(raw, 10) : 2000;
    return Number.isFinite(parsed) ? Math.max(1200, parsed) : 2000;
  })();

  let loaderShownAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let hideTimeoutId = null;
  let visibilityToken = 0;

  const showLoader = () => {
    if (loader) {
      visibilityToken += 1;
      if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
      }

      loader.classList.remove('is-hidden');
      loader.style.opacity = '1';
      loader.style.visibility = 'visible';

      loaderShownAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
  };

  const hideLoader = () => {
    if (!loader) return;

    const myToken = visibilityToken;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = now - loaderShownAt;
    const remaining = Math.max(0, MIN_LOADER_MS - elapsed);

    if (hideTimeoutId) {
      clearTimeout(hideTimeoutId);
      hideTimeoutId = null;
    }

    hideTimeoutId = window.setTimeout(() => {
      // If the loader was shown again while waiting, don't hide it.
      if (myToken !== visibilityToken) return;
      loader.classList.add('is-hidden');
      loader.style.opacity = '0';
      loader.style.visibility = 'hidden';
      hideTimeoutId = null;
    }, remaining);
  };

  const isInternalLink = (href) => {
    if (!href) return false;
    if (href.startsWith('#')) return false;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    if (href.startsWith('http') && !href.includes(window.location.host)) return false;
    return true;
  };

  // Hide loader on page start if document is already loaded
  if (document.readyState === 'loading') {
    showLoader();
  } else {
    hideLoader();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('page-visible');
    // Hide after a minimum duration só the loader is noticeable.
    hideLoader();
  });

  window.addEventListener('load', () => {
    hideLoader();
  });

  window.addEventListener('pageshow', (e) => {
    hideLoader();
    document.body.classList.add('page-visible');
    document.body.classList.remove('page-fadeout');
  });

  // Listen for beforeunload to show loader
  window.addEventListener('beforeunload', () => {
    showLoader();
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;

    const href = link.getAttribute('href');
    if (!isInternalLink(href)) return;

    e.preventDefault();
    showLoader();
    document.body.classList.add('page-fadeout');

    const delay = 350;
    window.setTimeout(() => {
      window.location.href = link.href;
    }, delay);
  });
})();
