// Petites fonctions des pages de calcul : les règles publiées chaque nuit (regles/), mises en forme à la française.

/** Les règles en ligne (les mêmes que l'appli) ; en cas d'échec, les valeurs écrites dans la page. */
export async function regles(fichier, secours) {
  try {
    const r = await fetch(new URL(`regles/${fichier}`, import.meta.url), { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch {
    // hors connexion : les valeurs de la page
  }
  return secours;
}

const nf = (d) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const euros = (n, d = 2) => `${nf(d).format(n)} €`;
export const nombre = (n, d = 0) => nf(d).format(n);
/** Un nombre tapé à la française (« 1 450,50 ») ; 0 si vide. */
export const lu = (champ) => Number(String(champ.value).replace(/\s/g, '').replace(',', '.')) || 0;

/** Boutons à choix unique : met à jour aria-pressed et appelle changer(valeur). */
export function choix(groupe, changer) {
  groupe.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of groupe.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    changer(b.dataset.valeur);
  });
}
