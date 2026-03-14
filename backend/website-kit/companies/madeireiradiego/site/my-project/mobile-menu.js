// Mobile Menu Hamburger
document.addEventListener('DOMContentLoaded', function() {
  console.log('🍔 Mobile menu script carregado');
  
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');
  
  console.log('Botão encontrado:', menuBtn);
  console.log('Menu encontrado:', mobileMenu);
  
  if (menuBtn && mobileMenu) {
    console.log('✅ Elementos encontrados, adicionando evento de clique');
    
    // Toggle menu
    menuBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('🎯 Botão clicado!');
      
      const isActive = menuBtn.classList.contains('active');
      console.log('Estado antes:', isActive ? 'ativo' : 'inativo');
      
      menuBtn.classList.toggle('active');
      mobileMenu.classList.toggle('active');
      
      console.log('Estado depois:', menuBtn.classList.contains('active') ? 'ativo' : 'inativo');
      
      document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    });
    
    // Fechar ao clicar em link
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function() {
        console.log('Link clicado, fechando menu');
        menuBtn.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
    
    // Fechar ao clicar fora
    mobileMenu.addEventListener('click', function(e) {
      if (e.target === mobileMenu) {
        console.log('Clicou fora, fechando menu');
        menuBtn.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  } else {
    console.error('❌ Elementos não encontrados!');
    console.error('Botão:', menuBtn);
    console.error('Menu:', mobileMenu);
  }
  
  // Marcar página atual
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.mobile-menu a, nav a').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });
  
});

// Ajustar menu no resize
let resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() {
    if (window.innerWidth > 768) {
      const mobileMenu = document.querySelector('.mobile-menu');
      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (mobileMenu) mobileMenu.classList.remove('active');
      if (menuBtn) menuBtn.classList.remove('active');
      document.body.style.overflow = '';
    }
  }, 250);
});
