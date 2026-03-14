document.addEventListener('DOMContentLoaded', function () {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu, #mobileMenu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function (event) {
      event.preventDefault();
      menuBtn.classList.toggle('active');
      mobileMenu.classList.toggle('active');
      document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    });

    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menuBtn.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    mobileMenu.addEventListener('click', function (event) {
      if (event.target === mobileMenu) {
        menuBtn.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.mobile-menu a, #mobileMenu a, nav a').forEach(function (link) {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });
});

let resizeTimer;
window.addEventListener('resize', function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    if (window.innerWidth > 768) {
      const mobileMenu = document.querySelector('.mobile-menu, #mobileMenu');
      const menuBtn = document.querySelector('.mobile-menu-btn');

      if (mobileMenu) {
        mobileMenu.classList.remove('active');
      }

      if (menuBtn) {
        menuBtn.classList.remove('active');
      }

      document.body.style.overflow = '';
    }
  }, 250);
});
