try {
  if (localStorage.getItem('ecomatch_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch (e) {}
