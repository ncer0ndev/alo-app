(function () {
  var VALID_THEMES = ['terminal', 'newsprint', 'kinetic'];
  var theme = 'terminal';
  try {
    var stored = localStorage.getItem('theme');
    if (VALID_THEMES.indexOf(stored) !== -1) theme = stored;
  } catch (err) {
    theme = 'terminal';
  }

  var uiMode = 'classic';
  try {
    if (localStorage.getItem('uiMode') === 'modern') uiMode = 'modern';
  } catch (err) {
    uiMode = 'classic';
  }

  document.documentElement.setAttribute('data-theme', uiMode === 'modern' ? 'modern' : theme);
  document.documentElement.setAttribute('data-ui', uiMode);
})();
