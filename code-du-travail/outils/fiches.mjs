// Fiches pratiques du ministère du Travail (paquet @socialgouv/fiches-travail-data, repris de
// travail-emploi.gouv.fr). Informations publiques réutilisées sans modification du sens,
// avec leur source et leur date (articles L321-1 et L322-1 du Code des relations entre le public et l'administration).
//
// Copie de tools/fiches.mjs de l'appli (données livrées avec l'appli), utilisée par le script de mise à jour
// automatique (maj-regles.mjs) : les deux doivent rester identiques.

const PERMIS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'h3', 'h4', 'a', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote']);
const A_JETER = /<(script|style|iframe|noscript|svg|button|form|figure|img|video)[\s\S]*?<\/\1>|<(img|input|source)[^>]*>/gi;

/** Ne garde que des balises simples et sûres, sans aucun attribut sauf les liens http(s). */
export function nettoyerHtml(html) {
  return String(html ?? '')
    .replace(A_JETER, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tout, nom, attributs) => {
      const n = nom.toLowerCase();
      const fermante = tout.startsWith('</');
      const cible = n === 'h2' ? 'h3' : n === 'h5' || n === 'h6' ? 'h4' : n;
      if (!PERMIS.has(cible)) return n === 'div' || n === 'section' ? (fermante ? '' : ' ') : '';
      if (fermante) return `</${cible}>`;
      if (cible === 'a') {
        const href = /href\s*=\s*"([^"]*)"/i.exec(attributs)?.[1] ?? '';
        const url = href.startsWith('/') ? `https://travail-emploi.gouv.fr${href}` : href;
        return /^https?:\/\//.test(url) ? `<a href="${url.replace(/"/g, '&quot;')}">` : '<a>';
      }
      return `<${cible}>`;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
}

const texte = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

// Sections qui ne sont que des listes de documents ou de liens : sans intérêt hors du site.
const SECTIONS_INUTILES = /^(Documents( à télécharger)?|Services en ligne|Ressources( utiles.*)?|À lire sur service-public.*)$/i;

const dateIso = (d) => String(d ?? '').split('/').reverse().join('-');

/** Fiches brutes du paquet → fiches de l'appli : titre, résumé, date, adresse, sections nettoyées. */
export function fichesAppli(brutes) {
  // Certaines fiches existent en double : on garde la plus récente.
  const parTitre = new Map();
  for (const f of brutes) {
    const t = texte(f.title);
    const deja = parTitre.get(t);
    if (!deja || dateIso(f.date) > dateIso(deja.date)) parTitre.set(t, f);
  }
  return [...parTitre.values()]
    .filter((f) => f.title && f.sections?.length)
    .map((f) => ({
      id: f.pubId,
      titre: texte(f.title),
      resume: texte(f.description),
      date: f.date,
      url: f.url,
      intro: nettoyerHtml(f.intro),
      sections: f.sections
        .filter((s) => s.html && !SECTIONS_INUTILES.test(texte(s.title ?? '')))
        .map((s) => ({ titre: texte(s.title ?? ''), html: nettoyerHtml(s.html) }))
        .filter((s) => s.html.length > 0),
    }))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}
