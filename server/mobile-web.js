const express = require('express');
const path = require('node:path');
const publicFiles = new Set([
  'index.html', 'manifest.webmanifest', 'sw.js', 'offline.html',
  'styles.css', 'modern-ui.css', 'social-upgrade.css', 'mobile.css', 'avatars.css',
  'theme-init.js', 'avatar-catalog.js', 'avatars.js', 'banner-catalog.js', 'banners.js',
  'experience.js', 'renderer.js', 'modern-ui.js', 'social-upgrade.js', 'setup.js', 'mobile.js', 'account.js',
]);
module.exports = function mobileWeb() {
  const router = express.Router();
  router.use((req, res, next) => {
    const file = req.path.replace(/^\//, '') || 'index.html';
    const asset = /^(assets|fonts|vendor)\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|ico|webp|mp3|woff2?|css|js)$/.test(file) && !file.split('/').includes('..');
    if (!publicFiles.has(file) && !asset) return res.sendStatus(404);
    if (file === 'sw.js' || file === 'index.html') res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(express.static(path.resolve(__dirname, '../app'), { dotfiles: 'deny', index: 'index.html', redirect: true }));
  return router;
};
