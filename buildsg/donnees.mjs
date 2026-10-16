// Ou vivent les donnees du serveur Node (app.js, demosAdmin.mjs, analyseAdmin.mjs) : le miroir de
// deploy/donnees.php, meme disposition et meme migration (MD/spec-demos-admin.md).
//
//   data/demo/         les demos de l'admin et de la vitrine ?mode=demo
//   data/admin/        palette.json, controleurs.json, arbres.json (les echecs de connexion restent en memoire)
//   data/claude/       journal, tarifs, plafonds, modeles, batches/
//   data/audits/       les audits recus, et pour chacun <id>/analyses/ et <id>/images/
//   data/conformite/   mesures.json
//   data/migration.json
//
// `DATA_DIR` choisit le dossier (par defaut `data/` a cote du dossier de l'application). Un ancien
// reglage `DEMOS_DIR` donne seul garde l'ancienne disposition (demos a la racine, `.palette.json`).
// Sinon, au demarrage, un ancien dossier (DEMOS_DIR s'il est encore la, puis `demos/` de
// l'application) est deplace dans data/, une fois, sans rien ecraser.

import fs from 'node:fs';
import path from 'node:path';

export const FORMAT_MIGRATION_DONNEES = 'plan-migration-donnees';
export const NOTE_DEPLACEMENT = 'DEPLACE-VERS-DATA.txt';

/**
 * @param {{ dossierDonnees?: string | null, dossierDemos?: string | null, parent: string, anciens?: string[] }} o
 *   `parent` : le dossier ou poser data/ par defaut ; `anciens` : les anciens dossiers a migrer, en plus de `dossierDemos`.
 */
export function dossiersDonnees({ dossierDonnees = null, dossierDemos = null, parent, anciens = [] }) {
  const net = (v) => (typeof v === 'string' && v.trim() ? v.replace(/\/+$/, '') : null);
  const donnees = net(dossierDonnees), demos = net(dossierDemos);
  if (!donnees && demos) {
    return { disposition: 'ancienne', racine: demos, demos, admin: demos, palette: path.join(demos, '.palette.json'), controleurs: path.join(demos, '.controleurs.json'), arbres: path.join(demos, '.arbres.json'), echecs: path.join(demos, '.echecs.json'), anciens: [] };
  }
  const racine = donnees || path.join(parent, 'data');
  const liste = [];
  for (const a of [demos, ...anciens]) if (a && a !== racine && !liste.includes(a)) liste.push(a);
  return {
    disposition: 'data', racine, demos: path.join(racine, 'demo'), admin: path.join(racine, 'admin'),
    palette: path.join(racine, 'admin', 'palette.json'), controleurs: path.join(racine, 'admin', 'controleurs.json'), arbres: path.join(racine, 'admin', 'arbres.json'), echecs: path.join(racine, 'admin', 'echecs.json'), anciens: liste
  };
}

/** Ce qu'un ancien dossier contient vraiment, sans la note d'un deplacement deja fait. */
function contenuAncien(dossier) {
  try { return fs.readdirSync(dossier).filter((n) => n !== NOTE_DEPLACEMENT); } catch { return []; }
}

const REGLAGES = { '.palette.json': 'palette.json', '.palette.json.bak': 'palette.json.bak', '.controleurs.json': 'controleurs.json', '.controleurs.json.bak': 'controleurs.json.bak', '.arbres.json': 'arbres.json', '.arbres.json.bak': 'arbres.json.bak', '.echecs.json': 'echecs.json' };

/** Ou va une entree de l'ancien dossier ; null : elle reste ou elle est. */
function destinationAncienne(nom, dossier, d) {
  if (dossier) return ['claude', 'audits', 'conformite'].includes(nom) ? path.join(d.racine, nom) : null;
  if (REGLAGES[nom]) return path.join(d.admin, REGLAGES[nom]);
  return nom.startsWith('.') ? null : path.join(d.demos, nom);
}

/** Le premier passage dans la disposition `data` : l'ancien dossier deplace, une fois. Rend `migration.json`. */
export function migrerDonnees(d, maintenant = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')) {
  if (d.disposition !== 'data') return null;
  const fMarque = path.join(d.racine, 'migration.json');
  try { return JSON.parse(fs.readFileSync(fMarque, 'utf8')); } catch { /* pas encore migre */ }
  try { fs.mkdirSync(d.racine, { recursive: true }); } catch { return null; }
  const marque = { format: FORMAT_MIGRATION_DONNEES, version: 1, le: maintenant, depuis: null, deplaces: [], laisses: [] };
  const ancien = d.anciens.find((a) => contenuAncien(a).length > 0) ?? null;
  if (ancien) {
    marque.depuis = ancien;
    for (const nom of contenuAncien(ancien)) {
      const source = path.join(ancien, nom);
      const cible = destinationAncienne(nom, fs.statSync(source).isDirectory(), d);
      if (!cible || fs.existsSync(cible)) { marque.laisses.push(nom); continue; }
      try {
        fs.mkdirSync(path.dirname(cible), { recursive: true });
        fs.renameSync(source, cible);
        marque.deplaces.push(nom);
      } catch { marque.laisses.push(nom); }
    }
    try {
      fs.writeFileSync(path.join(ancien, NOTE_DEPLACEMENT), 'Plan a deplace ce dossier dans ' + d.racine + ' le ' + marque.le + '.\n'
        + (marque.laisses.length ? 'Restent ici (deja presents la-bas, ou non deplacables) : ' + marque.laisses.join(', ') + '.\nA comparer et ranger a la main.\n' : 'Il peut etre supprime.\n')
        + 'Le detail : ' + fMarque + '\n');
    } catch { /* l'ancien dossier en lecture seule : migration.json suffit */ }
    console.log('Plan : donnees deplacees de ' + ancien + ' vers ' + d.racine + ' (' + marque.deplaces.length + ' deplacees, ' + marque.laisses.length + ' laissees : ' + marque.laisses.join(', ') + ')');
  }
  fs.writeFileSync(fMarque, JSON.stringify(marque, null, 2) + '\n');
  return marque;
}

/** Ce que l'etat de l'analyse dit des donnees, a l'administrateur. */
export function vueDonnees(d) {
  let migration = null;
  if (d.disposition === 'data') { try { migration = JSON.parse(fs.readFileSync(path.join(d.racine, 'migration.json'), 'utf8')); } catch { migration = null; } }
  return { disposition: d.disposition, racine: d.racine, migration };
}
