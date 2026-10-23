// Publie les dernières règles publiques de calcul pour l'appli « Code du travail & Salaire net ».
// Lancé chaque nuit par .github/workflows/code-du-travail-regles.yml (et à la main : node maj-regles.mjs).
//
// 1. Cherche les dernières versions des règles du ministère du Travail (@socialgouv/modeles-social)
//    et de l'URSSAF (modele-social).
// 2. Les fait tourner avec EXACTEMENT les moteurs de calcul embarqués dans l'appli (versions figées
//    dans package.json) : si elles ne fonctionnent pas avec eux, rien n'est publié.
// 3. Récupère aussi les fiches pratiques du ministère du Travail (@socialgouv/fiches-travail-data).
// 4. Si tout passe, écrit les fichiers dans ../regles/ ; le workflow les publie.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { fichesAppli } from './fiches.mjs';

const require = createRequire(import.meta.url);
const ms = require('@socialgouv/modeles-social');
const Engine = (await import('publicodes')).default;

// Versions majeures que l'appli sait lire. Une nouvelle version majeure demande une mise à jour de l'appli.
const MAJEURES = { ministere: 4, urssaf: 11 };
const PROGRAMME = 1;
const SORTIE = new URL('../regles/', import.meta.url);

const FICHIERS = {
  indemniteLicenciement: 'modeles-indemnite-licenciement.json',
  ruptureConventionnelle: 'modeles-rupture-conventionnelle.json',
  preavisDemission: 'modeles-preavis-demission.json',
  preavisLicenciement: 'modeles-preavis-licenciement.json',
  indemnitePrecarite: 'modeles-indemnite-precarite.json',
  heuresRechercheEmploi: 'modeles-heures-recherche-emploi.json',
  indemniteRetraite: 'modeles-indemnite-retraite.json',
  preavisRetraite: 'modeles-preavis-retraite.json',
};

async function derniere(paquet) {
  const j = await (await fetch(`https://registry.npmjs.org/${paquet}/latest`)).json();
  return { version: j.version, archive: j.dist.tarball };
}

function extraire(archive, dossier) {
  mkdirSync(dossier, { recursive: true });
  const fichier = join(dossier, 'paquet.tgz');
  execFileSync('curl', ['-sL', archive, '-o', fichier]);
  // Chemin relatif : sous Windows, tar prend « C: » pour un serveur distant.
  execFileSync('tar', ['-xzf', 'paquet.tgz'], { cwd: dossier });
  return join(dossier, 'package');
}

const echec = (message) => {
  console.error(`ÉCHEC : ${message}`);
  process.exit(1);
};

// ---------- 1. Dernières versions ----------
const ministere = await derniere('@socialgouv/modeles-social');
const urssaf = await derniere('modele-social');
const fichesTravail = await derniere('@socialgouv/fiches-travail-data');
const actuel = existsSync(new URL('version.json', SORTIE)) ? JSON.parse(readFileSync(new URL('version.json', SORTIE), 'utf8')) : null;
console.log(`Ministère du Travail ${ministere.version}, URSSAF ${urssaf.version}, fiches ${fichesTravail.version}`);
if (actuel && actuel.sources.ministere === ministere.version && actuel.sources.urssaf === urssaf.version && actuel.sources.fiches === fichesTravail.version) {
  console.log('Règles déjà à jour : rien à publier.');
  process.exit(0);
}
if (Number(ministere.version.split('.')[0]) !== MAJEURES.ministere || Number(urssaf.version.split('.')[0]) !== MAJEURES.urssaf) {
  echec("nouvelle version majeure des règles : il faut mettre à jour l'appli avant de les publier.");
}

// ---------- 2. Récupération des règles ----------
const tmp = join(tmpdir(), `regles-${Date.now()}`);
const dossierMinistere = extraire(ministere.archive, join(tmp, 'ministere'));
const dossierUrssaf = extraire(urssaf.archive, join(tmp, 'urssaf'));
const calculateurs = Object.fromEntries(
  Object.entries(FICHIERS).map(([cle, f]) => [cle, JSON.parse(readFileSync(join(dossierMinistere, 'lib', 'modeles', f), 'utf8'))]),
);
const source = readFileSync(join(dossierUrssaf, 'dist', 'index.js'), 'utf8');
const texteJson = source.match(/export const json = (?:\/\*@__PURE__\*\/ )?("(?:[^"\\]|\\.)*")/);
if (!texteJson) echec('format du paquet URSSAF inconnu.');
const reglesUrssaf = JSON.parse(JSON.parse(texteJson[1]));

// ---------- 3. Vérifications avec les moteurs de l'appli ----------
const silence = (f) => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return f();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};
const CLASSES = {
  indemniteLicenciement: 'IndemniteLicenciementPublicodes',
  ruptureConventionnelle: 'RuptureConventionnellePublicodes',
  preavisDemission: 'PreavisDemissionPublicodes',
  preavisLicenciement: 'PreavisLicenciementPublicodes',
  indemnitePrecarite: 'IndemnitePrecaritePublicodes',
  heuresRechercheEmploi: 'HeuresRechercheEmploiPublicodes',
  indemniteRetraite: 'IndemniteRetraitePublicodes',
};
const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const depart = {
  salaryPeriods: JSON.stringify(mois.map((m) => ({ month: `${m} 2025`, value: 2500 }))),
  absencePeriods: '[]',
  "contrat salarié . indemnité de licenciement . date d'entrée": '01/01/2014',
  'contrat salarié . indemnité de licenciement . date de notification': '01/01/2026',
  'contrat salarié . indemnité de licenciement . date de sortie': '01/03/2026',
  'contrat salarié . indemnité de licenciement . inaptitude suite à un accident ou maladie professionnelle': 'non',
  'contrat salarié . indemnité de licenciement . arrêt de travail': 'non',
};
const bases = {
  indemniteLicenciement: depart,
  ruptureConventionnelle: depart,
  indemniteRetraite: { ...depart, 'contrat salarié . indemnité de retraite . mise à la retraite': 'non' },
  preavisDemission: {},
  preavisLicenciement: { 'contrat salarié . convention collective . ancienneté légal': "'Plus de 2 ans'" },
  heuresRechercheEmploi: {},
  indemnitePrecarite: {
    'contrat salarié . type de contrat': "'CDD'",
    'contrat salarié . type de cdd': "'Autres'",
    'contrat salarié . fin à la date prévue': "'oui'",
    'contrat salarié . salaire de référence': '20000',
  },
};

let essais = 0;
const problemes = [];
for (const [cle, Classe] of Object.entries(CLASSES)) {
  const regles = calculateurs[cle];
  const conventions = ['base', ...Object.keys(regles).filter((k) => k !== 'base')];
  for (const idcc of cle === 'indemniteRetraite' ? ['base'] : conventions) {
    const cc = idcc === 'base' ? undefined : idcc;
    try {
      const p = silence(() => (cle === 'indemniteRetraite' ? new ms[Classe](regles) : new ms[Classe](regles, cc)));
      const entrees = { ...bases[cle], 'contrat salarié . convention collective': cc ? `'IDCC${ms.formatIdcc(Number(cc))}'` : "''" };
      let r;
      for (let i = 0; i < 20; i++) {
        r = silence(() => p.calculate(entrees));
        if (r.type !== 'missing-args') break;
        const q = r.missingArgs.find((a) => a.rawNode?.cdtn) ?? r.missingArgs[0];
        const t = q.rawNode?.cdtn?.type;
        entrees[q.rawNode.nom] = t === 'liste' ? String(Object.values(q.rawNode.cdtn.valeurs)[0]) : t === 'oui-non' ? 'non' : t === 'date' ? '01/01/2020' : '1';
      }
      essais++;
      if (r.type !== 'result' && r.type !== 'ineligibility') problemes.push(`${cle} / ${idcc} : pas de résultat (${r.type})`);
    } catch (e) {
      problemes.push(`${cle} / ${idcc} : ${e.message.slice(0, 160)}`);
    }
  }
}
try {
  const p = silence(() => new ms.PreavisRetraitePublicodes(calculateurs.preavisRetraite));
  const d = silence(() => p.setSituation({ 'contrat salarié . convention collective': "''", 'contrat salarié . ancienneté': '60', 'contrat salarié . mise à la retraite': 'non', 'contrat salarié . travailleur handicapé': 'non' }));
  if (!(d.result?.valueInDays > 0)) problemes.push('préavis de retraite : résultat vide');
  essais++;
} catch (e) {
  problemes.push(`préavis de retraite : ${e.message.slice(0, 160)}`);
}
try {
  const e = new Engine(reglesUrssaf, { logger: { log() {}, warn() {}, error() {} } });
  e.setSituation({ dirigeant: 'non', 'impôt . méthode de calcul': "'taux neutre'", 'salarié . contrat': "'CDI'", 'salarié . contrat . statut cadre': 'non', 'salarié . contrat . salaire brut': '2500 €/mois' });
  const net = e.evaluate({ valeur: 'salarié . rémunération . net . à payer avant impôt', unité: '€/mois' }).nodeValue;
  if (!(net > 1500 && net < 2400)) problemes.push(`URSSAF : net incohérent pour 2 500 € brut (${net})`);
  essais++;
} catch (e) {
  problemes.push(`URSSAF : ${e.message.slice(0, 160)}`);
}
// Fiches pratiques : nettoyées comme dans l'appli, et assez nombreuses pour être complètes.
const fiches = fichesAppli(await (await fetch(`https://unpkg.com/@socialgouv/fiches-travail-data@${fichesTravail.version}/data/fiches-travail.json`)).json());
if (fiches.length < 100 || !fiches.every((f) => f.titre && f.sections.length)) problemes.push(`fiches : seulement ${fiches.length} fiches valides`);
console.log(`${essais} calculs essayés, ${fiches.length} fiches, ${problemes.length} problème(s).`);
if (problemes.length) echec(`les nouvelles règles ne passent pas les vérifications :\n- ${problemes.join('\n- ')}`);

// ---------- 4. Publication ----------
const jour = new Date().toISOString().slice(0, 10);
const [a, m, j] = jour.split('-');
const fichiers = { calculateurs: `calculateurs-${ministere.version}.json`, urssaf: `urssaf-${urssaf.version}.json`, fiches: `fiches-${fichesTravail.version}.json` };
mkdirSync(SORTIE, { recursive: true });
// Seuls les fichiers produits ici sont remplacés (parametres.json et veille.json restent).
for (const f of readdirSync(SORTIE)) if (/^(calculateurs|urssaf|fiches)-.+\.json$/.test(f)) rmSync(new URL(f, SORTIE));
writeFileSync(new URL(fichiers.calculateurs, SORTIE), JSON.stringify(calculateurs));
writeFileSync(new URL(fichiers.urssaf, SORTIE), JSON.stringify(reglesUrssaf));
writeFileSync(new URL(fichiers.fiches, SORTIE), JSON.stringify(fiches));
writeFileSync(
  new URL('version.json', SORTIE),
  JSON.stringify({ version: `du ${j}/${m}/${a}`, programmeMin: PROGRAMME, sources: { ministere: ministere.version, urssaf: urssaf.version, fiches: fichesTravail.version }, fichiers }, null, 2) + '\n',
);
rmSync(tmp, { recursive: true, force: true });
console.log(`Règles publiées : ministère ${ministere.version}, URSSAF ${urssaf.version}, fiches ${fichesTravail.version}.`);
