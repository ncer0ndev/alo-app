(function () {
  var VALID_THEMES = ['terminal', 'newsprint', 'kinetic', 'modern'];
  var theme = 'terminal';
  try {
    var stored = localStorage.getItem('theme');
    if (VALID_THEMES.indexOf(stored) !== -1) theme = stored;
  } catch (err) {
    theme = 'terminal';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
