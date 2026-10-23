// Veille des textes de loi pour l'appli « Code du travail & Salaire net ».
// Lancé chaque nuit par .github/workflows/code-du-travail-regles.yml (et à la main : node veille-lois.mjs).
//
// Les calculs faits par l'appli elle-même (congés payés, arrêt maladie, heures supplémentaires) reposent
// sur quelques articles de loi. Leurs valeurs sont dans ../regles/parametres.json, que l'appli télécharge.
// Chaque nuit, ce script compare la version en vigueur de ces articles (données Légifrance publiées par
// @socialgouv/legi-data) à celle vérifiée la dernière fois (articles-surveilles.json) :
// - il écrit ../regles/veille.json, que l'appli lit pour prévenir l'utilisateur sur l'écran concerné ;
// - si un article vient de changer, il le signale au workflow, qui échoue : GitHub envoie un e-mail.
// Après vérification d'un article modifié : corriger parametres.json si besoin, puis mettre la nouvelle
// version dans articles-surveilles.json (elle est affichée dans le journal du workflow).
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const SORTIE = new URL('../regles/', import.meta.url);
const surveilles = JSON.parse(readFileSync(new URL('articles-surveilles.json', import.meta.url), 'utf8'));
const CODES = { travail: 'LEGITEXT000006072050', 'securite-sociale': 'LEGITEXT000006073189' };

const echec = (message) => {
  console.error(`ÉCHEC : ${message}`);
  process.exit(1);
};

// ---------- 1. parametres.json doit rester lisible par l'appli ----------
const parametres = JSON.parse(readFileSync(new URL('parametres.json', SORTIE), 'utf8'));
for (const groupe of ['conges', 'arretMaladie', 'heuresSup']) {
  const g = parametres[groupe];
  if (!g || !Object.values(g).every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) echec(`parametres.json : « ${groupe} » incomplet.`);
}

// ---------- 2. Version en vigueur de chaque article ----------
const legi = (await (await fetch('https://registry.npmjs.org/@socialgouv/legi-data/latest')).json()).version;
const base = `https://unpkg.com/@socialgouv/legi-data@${legi}/data/`;
const index = await (await fetch(`${base}articles/index.json`)).json();
if (!Array.isArray(index) || index.length < 10000) echec('index des articles de Légifrance illisible.');
const enVigueur = new Map(index.map((a) => [a.articleCid, a.articleId]));

const changes = surveilles.filter((a) => enVigueur.get(a.cid) !== a.version);

// Date d'entrée en vigueur des nouvelles versions (dans le texte complet du code, téléchargé seulement si besoin).
const dates = new Map();
for (const code of new Set(changes.map((a) => a.code))) {
  const texte = await (await fetch(`${base}${CODES[code]}.json`)).json();
  const parcourir = (n) => {
    if (n.type === 'article') for (const v of n.data.articleVersions ?? []) dates.set(v.id, new Date(v.dateDebut).toISOString().slice(0, 10));
    for (const c of n.children ?? []) parcourir(c);
  };
  parcourir(texte);
}

const modifies = changes.map((a) => {
  const nouvelle = enVigueur.get(a.cid);
  return { numero: a.numero, code: a.code, version: nouvelle ?? 'abrogé', depuis: nouvelle ? dates.get(nouvelle) ?? null : null };
});

// ---------- 3. veille.json, réécrit seulement si la liste change ----------
const fichier = new URL('veille.json', SORTIE);
const avant = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : { modifies: [] };
const deja = new Set(avant.modifies.map((m) => `${m.numero}:${m.version}`));
const nouveaux = modifies.filter((m) => !deja.has(`${m.numero}:${m.version}`));
if (!existsSync(fichier) || JSON.stringify(avant.modifies) !== JSON.stringify(modifies)) writeFileSync(fichier, JSON.stringify({ modifies }, null, 2) + '\n');

console.log(`Légifrance (legi-data ${legi}) : ${surveilles.length} articles surveillés, ${modifies.length} modifié(s) depuis la dernière vérification.`);
for (const m of modifies) console.log(`- ${m.numero} (${m.code}) : nouvelle version ${m.version}${m.depuis ? `, en vigueur depuis le ${m.depuis}` : ''}`);
if (nouveaux.length && process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `nouveau=${nouveaux.map((m) => m.numero).join(', ')}\n`);
}
