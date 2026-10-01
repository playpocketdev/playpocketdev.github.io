/* Affiche une seule langue à la fois. Ordre de choix : l'adresse (#es),
   puis la langue du navigateur, puis l'anglais. */
(function () {
  var blocs = Array.prototype.slice.call(document.querySelectorAll('main section[data-langue]'));
  if (!blocs.length) return;
  var codes = blocs.map(function (b) { return b.getAttribute('data-langue'); });
  document.documentElement.classList.add('js');
  /* Les blocs perdent leur ancre (#fr, #es...) : sinon le navigateur saute
     dessus et cache l'en-tête. Sans JavaScript, les ancres restent et servent. */
  blocs.forEach(function (b) { b.removeAttribute('id'); });

  function choisir(code) {
    if (codes.indexOf(code) < 0) code = codes.indexOf('en') >= 0 ? 'en' : codes[0];
    blocs.forEach(function (b) {
      var actif = b.getAttribute('data-langue') === code;
      b.classList.toggle('actif', actif);
      if (actif) document.documentElement.lang = b.getAttribute('lang') || code;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.langues a'), function (a) {
      a.setAttribute('aria-current', a.getAttribute('href') === '#' + code ? 'true' : 'false');
    });
  }

  function depuisAdresse() { return location.hash.replace('#', ''); }

  var voulu = depuisAdresse();
  if (codes.indexOf(voulu) < 0) voulu = (navigator.language || 'en').slice(0, 2).toLowerCase();
  choisir(voulu);
  window.addEventListener('hashchange', function () { choisir(depuisAdresse()); window.scrollTo(0, 0); });
})();
