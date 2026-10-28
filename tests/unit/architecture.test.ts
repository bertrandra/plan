import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Une regle d'architecture qu'aucun test ne verifie n'est pas une regle, c'est un souhait. Celle-ci
// tient aujourd'hui ; ce fichier est ce qui la fera tenir demain (architecture.md §9).

const src = resolve(__dirname, '../../src');

/**
 * Les couches, de la plus pure a la plus dependante. Une couche ne peut importer que d'un niveau
 * inferieur ou egal au sien.
 *
 * - **0** `shell` et `util` : des primitives. `util` est pur ; `shell` touche au DOM mais ne connait
 *   rien du domaine — dire un message, trouver un element.
 * - **1** `geometry` : des mathematiques, rien d'autre.
 * - **2** `model` : ce qu'est un plan. Les donnees et leurs regles.
 * - **3** `engine`, `geo` : ce qu'on calcule a partir du plan, et ce qu'on va chercher dehors.
 * - **4** `core`, `io`, `render`, `export`, `three`, `interaction` : ce qui fait quelque chose du
 *   plan — l'afficher, l'enregistrer, l'exporter, le manipuler.
 * - **5** `ui` : les panneaux.
 * - **6** `app` : ce qui orchestre le tout.
 */
const NIVEAU: Record<string, number> = {
  shell: 0, util: 0,
  geometry: 1,
  // plateforme/ decrit le contrat de backprod : des types engendres et deux constantes, sans une
  // seule dependance. Meme rang que model/, qui decrit le domaine — l'un dit ce que la plateforme
  // promet, l'autre ce que le plan est.
  model: 2, plateforme: 2,
  // regles/ : le moteur de regles, partie donnees et contrat (reglages, profils, faits, decisions). Son pendant
  // calcul est facade/regles/ (MD/architecture.md §5.2.4).
  regles: 2,
  engine: 3, geo: 3, facade: 3,
  core: 4, io: 4, render: 4, export: 4, three: 4, interaction: 4,
  ui: 5,
  app: 6, zones: 6
};

function fichiersTs(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return /\.tsx?$/.test(chemin) ? [chemin] : [];
  });
}

/** Une dependance d'un fichier vers un autre, resolue en chemin absolu sans extension. */
interface Dependance { cible: string; type: boolean; dynamique: boolean }

// Toutes les formes qu'un import prend dans ce depot, sur plusieurs lignes au besoin :
//   import { a } from '…'   import type { A } from '…'   import '…'
//   export { a } from '…'   export type { A } from '…'   import('…')
// L'ancienne version ne lisait que `from '../x'` sur une seule ligne : un module de `app/ecouteurs/`
// ou de `ui/champs/` ecrit `../../x/`, et echappait a la regle sans que personne ne le voie.
const STATIQUE = /\b(import|export)(\s+type)?\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const DYNAMIQUE = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)(\.(?!then\b)\w+)?/g;

function resoudre(depuis: string, specifiant: string): string {
  return resolve(dirname(depuis), specifiant).replace(/\.(js|tsx?)$/, '');
}

/** Les dependances d'un fichier vers d'autres fichiers de src/. */
function dependances(chemin: string, texte = readFileSync(chemin, 'utf8')): Dependance[] {
  const out: Dependance[] = [];
  for (const m of texte.matchAll(STATIQUE)) {
    // `import type` et `export type` sont effaces au build : ils ne creent aucune dependance reelle.
    out.push({ cible: resoudre(chemin, m[3]!), type: m[2] !== undefined, dynamique: false });
  }
  for (const m of texte.matchAll(DYNAMIQUE)) {
    // `import('../model/types.js').PtBrut` est une reference de type ecrite en syntaxe d'import.
    out.push({ cible: resoudre(chemin, m[1]!), type: m[2] !== undefined, dynamique: true });
  }
  return out.filter(d => d.cible.startsWith(src + sep));
}

/** La couche d'un chemin sous src/ : son premier dossier, ou undefined hors dossier (main.ts). */
function couche(chemin: string): string | undefined {
  const morceaux = relative(src, chemin).split(sep);
  return morceaux.length > 1 ? morceaux[0] : undefined;
}

const tous = fichiersTs(src);

describe('les fleches ne pointent que vers le bas', () => {
  it('aucun module n importe d une couche plus haute que la sienne', () => {
    const violations: string[] = [];
    for (const f of tous) {
      const de = couche(f);
      if (de === undefined || NIVEAU[de] === undefined) continue;
      for (const d of dependances(f)) {
        if (d.type) continue;
        const vers = couche(d.cible);
        if (vers !== undefined && NIVEAU[vers] !== undefined && NIVEAU[vers] > NIVEAU[de]!) {
          violations.push(`${relative(src, f)} -> ${relative(src, d.cible)} (niveau ${NIVEAU[de]} vers ${NIVEAU[vers]})`);
        }
      }
    }
    expect(violations, 'dependances remontantes').toEqual([]);
  });

  it('voit les imports sur plusieurs lignes, les re-exports, les imports dynamiques et les chemins profonds', () => {
    // Le test ci-dessus ne vaut que ce que vaut sa lecture des imports : ce cas-ci la garde honnete.
    // Des modules reels, choisis pour chaque forme — s'ils changent, choisir d'autres temoins.
    const cibles = (f: string) => dependances(join(src, f)).filter(d => !d.type).map(d => relative(src, d.cible));
    expect(cibles('app/ecouteurs/exports.ts').some(c => !c.startsWith('app')), 'chemin ../../').toBe(true);
    expect(cibles('main.ts'), 'import dynamique').toContain(join('app', 'boot'));
    // Plus aucun module n'ecrit `import('…').Type` : la forme est verifiee sur un texte temoin.
    const temoin = dependances(join(src, 'ui/temoin.ts'), "const f = (p: import('../model/types.js').PtBrut) => p;\nvoid import('../app/boot.js').then(m => m);");
    expect(temoin.map(d => d.type), 'import(…).Type est un type, import(…).then une valeur').toEqual([true, false]);
  });

  it('range chaque dossier de src/ dans une couche connue', () => {
    // Un dossier neuf non classe echapperait silencieusement a la regle : le test le refuse.
    const dossiers = readdirSync(src).filter(n => {
      try { return statSync(join(src, n)).isDirectory(); } catch { return false; }
    }).filter(n => n !== 'styles');
    expect(dossiers.filter(d => NIVEAU[d] === undefined), 'dossiers hors couches').toEqual([]);
  });
});

describe('aucun cycle d import (architecture.md §9, FF-1)', () => {
  it('le graphe des imports de valeur est acyclique', () => {
    // Un cycle marche jusqu'au jour ou l'ordre d'evaluation change et qu'une constante est lue avant
    // d'exister. Les imports de type ne comptent pas (effaces), ni les imports dynamiques : ils sont
    // resolus apres le chargement, et c'est justement l'outil qui sert a couper une boucle.
    const index = new Map(tous.map(f => [f.replace(/\.tsx?$/, ''), f]));
    const voisins = new Map(tous.map(f => [f, dependances(f)
      .filter(d => !d.type && !d.dynamique)
      .map(d => index.get(d.cible) ?? index.get(join(d.cible, 'index')))
      .filter((c): c is string => c !== undefined)]));
    const etat = new Map<string, 1 | 2>();
    const pile: string[] = [];
    const cycles: string[] = [];
    const visiter = (f: string): void => {
      etat.set(f, 1); pile.push(f);
      for (const v of voisins.get(f)!) {
        if (etat.get(v) === 1) cycles.push([...pile.slice(pile.indexOf(v)), v].map(x => relative(src, x)).join(' > '));
        else if (!etat.has(v)) visiter(v);
      }
      pile.pop(); etat.set(f, 2);
    };
    for (const f of tous) if (!etat.has(f)) visiter(f);
    expect(cycles, 'cycles').toEqual([]);
  });

  it('aucun cycle non plus par les imports de type', () => {
    // Effaces au build, ils ne cassent rien ; mais deux modules qui se citent l'un l'autre n'ont plus de sens de lecture, et un
    // import de type devient vite un import de valeur. Dix au 25 octobre 2026 (lot I), tous casses le meme jour (lot K) : le type
    // partage descend dans le module le plus bas, ou dans un module a lui. Groupes fortement connexes (Tarjan).
    const PLAFOND = 0;
    const index = new Map(tous.map(f => [f.replace(/\.tsx?$/, ''), f]));
    const voisins = new Map(tous.map(f => [f, dependances(f).filter(d => !d.dynamique)
      .map(d => index.get(d.cible) ?? index.get(join(d.cible, 'index')))
      .filter((c): c is string => c !== undefined)]));
    let n = 0;
    const rang = new Map<string, number>(), bas = new Map<string, number>(), surPile = new Set<string>(), pile: string[] = [];
    const groupes: string[][] = [];
    const relier = (f: string): void => {
      rang.set(f, n); bas.set(f, n); n++; pile.push(f); surPile.add(f);
      for (const v of voisins.get(f)!) {
        if (!rang.has(v)) { relier(v); bas.set(f, Math.min(bas.get(f)!, bas.get(v)!)); }
        else if (surPile.has(v)) bas.set(f, Math.min(bas.get(f)!, rang.get(v)!));
      }
      if (bas.get(f) === rang.get(f)) {
        const g: string[] = [];
        let x: string;
        do { x = pile.pop()!; surPile.delete(x); g.push(relative(src, x)); } while (x !== f);
        if (g.length > 1) groupes.push(g.sort());
      }
    };
    for (const f of tous) if (!rang.has(f)) relier(f);
    expect(groupes.length, groupes.map(g => g.join(' + ')).join('\n')).toBeLessThanOrEqual(PLAFOND);
  });
});

describe('ce qui doit rester pur', () => {
  it('geometry, model et util ne touchent jamais au DOM', () => {
    // C'est ce qui rend ces couches testables sans navigateur, et reutilisables ailleurs.
    const coupables: string[] = [];
    for (const couche of ['geometry', 'model', 'util']) {
      for (const f of fichiersTs(join(src, couche))) {
        const t = readFileSync(f, 'utf8');
        if (/\bdocument\.|\bwindow\.|localStorage|HTMLElement|SVGElement/.test(t)) {
          coupables.push(`${couche}/${f.split(/[\\/]/).pop()}`);
        }
      }
    }
    expect(coupables, 'couches pures qui touchent au DOM').toEqual([]);
  });

  it('engine et export ne lisent ni le hasard, ni les donnees de langue, ni le reseau, et l horloge seulement par defaut', () => {
    // Un nombre produit hier doit etre reproductible aujourd'hui (CLAUDE.md) : le calcul et les exports recoivent l'heure en
    // parametre (`?? new Date()`, `= new Date()` en dernier recours), et formatent sans toLocaleString (util/format.ts).
    const coupables: string[] = [];
    for (const couche of ['engine', 'export']) {
      for (const f of fichiersTs(join(src, couche))) {
        readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
          if (/^\s*(\/\/|\*)/.test(l)) return;
          const horloge = /new Date\(\)/.test(l.replace(/(\?\?|=>?)\s*(dateFr\()?new Date\(\)/g, ''));
          if (horloge || /Date\.now|Math\.random|toLocale|\bfetch\(/.test(l)) coupables.push(`${relative(src, f)}:${i + 1}`);
        });
      }
    }
    expect(coupables, 'horloge, hasard, langue ou reseau dans le calcul ou les exports').toEqual([]);
  });
});

describe('ce qui est fige pour les anciens projets (AD-19)', () => {
  it('les copies figees de model/fige/ n importent que des types, et seul model/migrations.ts les importe', () => {
    // Une copie figee qui importerait une valeur suivrait de nouveau le code d'aujourd'hui ; importee ailleurs, on la corrigerait
    // pour un autre usage, et un ancien fichier changerait de toit.
    const fige = join(src, 'model', 'fige') + sep;
    const coupables: string[] = [];
    for (const f of tous) {
      for (const d of dependances(f)) {
        if (f.startsWith(fige) && !d.type) coupables.push(`${relative(src, f)} importe ${relative(src, d.cible)}`);
        if (!f.startsWith(fige) && d.cible.startsWith(fige) && relative(src, f) !== join('model', 'migrations.ts')) coupables.push(`${relative(src, f)} importe ${relative(src, d.cible)}`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it('le remplissage d un ancien projet ne lit aucune constante du moteur d aujourd hui', () => {
    // engine/remplissageFige.ts n'importe que des types ; engine/construction.ts, qui le pose, ne lit pas portees, prix ni constantes.
    const deps = (nom: string) => dependances(join(src, 'engine', nom)).filter(d => !d.type).map(d => relative(src, d.cible));
    expect(deps('remplissageFige.ts')).toEqual([]);
    expect(deps('construction.ts').filter(c => /engine[\\/](portees|prix|constantes)$/.test(c))).toEqual([]);
  });
});

describe('les entrees de session des couches pures (AD-15)', () => {
  // Trois registres, et pas un de plus : la calibration de la detection (admin/calibration), les faits de toit essayes par
  // l'administrateur (?regles=local), la bibliotheque d'essences d'arbres. Aucun ne change un nombre enregistre dans un projet :
  // la calibration ne change que la prochaine detection, un toit lu pendant un essai est relu a l'ouverture suivante, les
  // essences ne dessinent que la 3D (MD/roadmap-architecture.md, etape 1.3). Un etat de module nouveau dans ces couches, ou un
  // poseur appele depuis une couche pure, passe ici avant de passer inapercu.
  const PURES = ['util', 'geometry', 'model', 'regles', 'engine', 'geo', 'facade'];
  const REGISTRES: Record<string, string> = {
    'facade/regles/facades/surcharges.ts': 'poserSurchargesCalibrees',
    'regles/toits/faits.ts': 'essayerFaitsToits',
    'model/especesArbre.ts': 'poserEspeces',
  };
  const pures = tous.filter(f => PURES.includes(couche(f) ?? ''));

  it('seuls ces trois modules gardent un etat de module (let) dans les couches pures', () => {
    const avecEtat = pures.filter(f => /^(export )?let /m.test(readFileSync(f, 'utf8'))).map(f => relative(src, f).split(sep).join('/')).sort();
    expect(avecEtat).toEqual(Object.keys(REGISTRES).sort());
  });

  it('chaque registre ne se pose que depuis app/ ou io/, jamais depuis une couche pure', () => {
    const coupables: string[] = [];
    for (const f of tous) {
      if (['app', 'io'].includes(couche(f) ?? '')) continue;
      const texte = readFileSync(f, 'utf8'), ici = relative(src, f).split(sep).join('/');
      for (const [module, poseur] of Object.entries(REGISTRES)) {
        if (ici === module) continue;
        if (new RegExp('\\b' + poseur + '\\(').test(texte)) coupables.push(`${ici} appelle ${poseur}`);
      }
    }
    expect(coupables).toEqual([]);
  });
});

describe('ce qui n a qu un proprietaire', () => {
  it('l etat de la Vue 3D ne s ecrit, hors de three/, que par les fonctions de three/etat3d.ts (AD-14)', () => {
    // vue3d, glb, soleilVue3d, affichage3d, hotes3d : `three/` y ecrit, c'est son etat ; ailleurs, reglerVue3d, reglerGlb,
    // reglerSoleilVue3d, poserAffichage3d, poserHote3d. Une affectation directe depuis app/ ou zones/ passe inapercue.
    const coupables: string[] = [];
    const ecriture = /(^|[^\w.])(vue3d|glb|soleilVue3d|affichage3d|hotes3d)\.[\w.]+\s*(=(?![=>])|\+=|-=|\+\+|--)/;
    for (const f of tous) {
      if (relative(src, f).split(sep)[0] === 'three') continue;
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (!/^\s*(\/\/|\*)/.test(l) && ecriture.test(l)) coupables.push(`${relative(src, f)}:${i + 1}`);
      });
    }
    expect(coupables, 'ecritures directes de l etat 3D hors de three/').toEqual([]);
  });
});

describe('app/ et zones/, la meme couche, un seul sens (AD-16)', () => {
  it('app/ ne prend a zones/ que des ecrans a monter (.tsx, zones/monter.ts) et les types qu ils declarent', () => {
    // Les zones lisent l'application (magasin, commandes, services) ; l'application ne monte que les zones. Un calcul, un worker ou
    // un appel au reseau qu'app/ irait chercher dans zones/ remettrait les deux sens.
    const coupables = tous.filter(f => relative(src, f).split(sep)[0] === 'app')
      .flatMap(f => dependances(f).filter(d => !d.type && relative(src, d.cible).split(sep)[0] === 'zones')
        .filter(d => !existsTsx(d.cible) && relative(src, d.cible) !== join('zones', 'monter'))
        .map(d => `${relative(src, f)} -> ${relative(src, d.cible)}`));
    expect(coupables).toEqual([]);
  });

  it('zones/ n appelle pas le reseau et ne lance pas de worker : il passe par io/, geo/ ou app/', () => {
    const coupables: string[] = [];
    for (const f of tous) {
      if (relative(src, f).split(sep)[0] !== 'zones') continue;
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (!/^\s*(\/\/|\*)/.test(l) && /\bfetch\(|new Worker\b|\?worker\b|XMLHttpRequest/.test(l)) coupables.push(`${relative(src, f)}:${i + 1}`);
      });
    }
    expect(coupables).toEqual([]);
  });
});

describe('les domaines de app/ (feuille de route, etapes 3.1 et 3.2)', () => {
  // Un domaine est un dossier de app/ qui porte une fonction entiere ; le coeur (la racine de app/, boot/, ecouteurs/, assemblage/)
  // les assemble. Un domaine n'importe que le coeur et les domaines declares ici : une fleche nouvelle entre deux domaines est une
  // decision, qui s'ecrit dans cette table, pas un import de passage. Les types ne comptent pas (effaces au build).
  const DOMAINES: Record<string, string[]> = {
    // Les toits (fond, LiDAR, a cheval, murs, profils de facades, mode Toit) et le releve ne dependent d'aucun autre domaine.
    toits: [],
    releve: [],
    // L'import du cadastre et l'actualisation IGN lisent les toits des batiments qu'ils posent.
    cadastre: ['toits'],
    // L'audit charge la parcelle comme l'import, lit les toits, cherche les coins comme le releve, et propose par ses sujets.
    audit: ['cadastre', 'regles', 'releve', 'toits'],
    // Les sujets de l'audit (app/regles/sujets/) decrivent les lignes de sa liste : ils sont l'autre moitie de l'audit.
    regles: ['audit'],
    // Les ecrans d'admin montrent ce que les autres domaines savent : versions des toits, cas de calibration (audit, releve), sujets.
    administration: ['audit', 'regles', 'releve', 'toits']
  };
  it('un domaine n importe que le coeur et les domaines qu il declare', () => {
    const domaine = (f: string): string | undefined => {
      const m = relative(src, f).split(sep);
      return m[0] === 'app' && m.length > 2 && m[1]! in DOMAINES ? m[1] : undefined;
    };
    const coupables = new Set<string>();
    for (const f of tous) {
      const d = domaine(f);
      if (!d) continue;
      for (const dep of dependances(f)) {
        const e = domaine(dep.cible + '.ts') ?? domaine(dep.cible);
        if (!dep.type && e && e !== d && !DOMAINES[d]!.includes(e)) coupables.add(`${d} -> ${e} (${relative(src, f)} -> ${relative(src, dep.cible)})`);
      }
    }
    expect([...coupables]).toEqual([]);
  });
});

describe('les modules carrefours de app/ (feuille de route, etape 3.3)', () => {
  // Un module qui importe beaucoup de modules est un carrefour : tout changement de l'un d'eux le touche. Le but est qu'aucun module
  // de app/ n'en importe plus de vingt (imports de valeur ; les types, effaces au build, ne comptent pas). Ceux qui depassent
  // aujourd'hui seraient listes avec leur compte (un cliquet : ils ne grossiraient plus) ; il n'en reste aucun depuis le 27 octobre
  // 2026, ou le dernier (`boot/plan.ts`, 23) a passe le tiroir des resultats a boot/resultatsDuPlan.ts.
  const LIMITE = 20;
  const PLAFONDS: Record<string, number> = {};
  const comptes = new Map(tous.filter(f => relative(src, f).split(sep)[0] === 'app')
    .map(f => [relative(src, f).split(sep).join('/'), new Set(dependances(f).filter(d => !d.type).map(d => d.cible)).size] as const));
  it('aucun module de app/ n importe plus de vingt modules, hors des carrefours listes, qui ne grossissent plus', () => {
    const coupables = [...comptes].filter(([f, n]) => n > (PLAFONDS[f] ?? LIMITE)).map(([f, n]) => `${f} : ${n} (plafond ${PLAFONDS[f] ?? LIMITE})`);
    expect(coupables).toEqual([]);
  });
  it('un plafond suit son module quand il maigrit (s il en reste)', () => {
    const aBaisser = Object.entries(PLAFONDS).filter(([f, p]) => (comptes.get(f) ?? 0) < p).map(([f, p]) => `${f} : ${comptes.get(f) ?? 'absent'} < ${p}`);
    expect(aBaisser).toEqual([]);
  });
});

describe('les ouvrages (MD/spec-ouvrages.md, phase 6)', () => {
  // Ce que la fonction d'un objet lui donne vit dans son ouvrage : chaque couche a son registre (model/ouvrages/ pour le modele), et
  // une comparaison `fonction === '…'` ailleurs est une regle d'ouvrage ecrite hors de lui. Un cliquet par couche : le modele, le
  // moteur, geo/ et facade/ n'en ont plus (etape 6.2) ; les autres en gardent leur compte, qui ne peut que baisser (etape 6.4).
  const COMPARAISON = /fonction\s*[!=]==?\s*'[a-z]+'/g;
  const PLAFONDS: Record<string, number> = { app: 33, export: 12, io: 3, render: 5, three: 7, ui: 2, zones: 1 };
  const comptes = new Map<string, number>();
  for (const f of tous) {
    const r = relative(src, f).split(sep);
    if (r[0] === 'model' && r[1] === 'ouvrages') continue;
    const n = (readFileSync(f, 'utf8').match(COMPARAISON) ?? []).length;
    if (n) comptes.set(r[0]!, (comptes.get(r[0]!) ?? 0) + n);
  }
  it('aucune couche ne compare la fonction au-dela de son plafond', () => {
    const coupables = [...comptes].filter(([c, n]) => n > (PLAFONDS[c] ?? 0)).map(([c, n]) => `${c} : ${n} (plafond ${PLAFONDS[c] ?? 0})`);
    expect(coupables).toEqual([]);
  });
  it('un plafond suit sa couche quand elle en perd', () => {
    const aBaisser = Object.entries(PLAFONDS).filter(([c, p]) => (comptes.get(c) ?? 0) < p).map(([c, p]) => `${c} : ${comptes.get(c) ?? 0} < ${p}`);
    expect(aBaisser).toEqual([]);
  });
});

describe('l independance des ouvrages (MD/spec-ouvrages.md, etape 6.6)', () => {
  // Un ouvrage ne lit d'un autre que ce que leur lien declare, jamais ses modules internes. Chaque ouvrage nomme ici ses modules,
  // couche par couche, et ce qu'il publie (ce que les autres ont le droit de lire). Ce qui sert a plusieurs ouvrages a un nom a soi
  // et n'est a aucun : les liens entre ouvrages (engine/ouvrages/liens.ts), le bois (engine/bois/), le sol (engine/sol.ts), la
  // geometrie (geometry/). Les types comptent aussi : un type interne lu par un autre ouvrage est un couplage comme un autre.
  const OUVRAGES: Record<string, { modules: string[]; publie: string[] }> = {
    terrasse: {
      modules: ['engine/structure', 'engine/layers', 'engine/bom', 'engine/construction', 'engine/lames', 'engine/optimisation',
        'engine/implantation', 'engine/chantier', 'engine/remplissageFige', 'engine/debit', 'engine/prix',
        'engine/constantes', 'engine/hauteurs', 'render/terrasseCouches', 'three/sceneTerrasse', 'three/ouvrages/terrasse',
        'ui/champs/construction', 'engine/ouvrages/terrasse'],
      publie: ['engine/ouvrages/terrasse']
    },
    piscine: {
      modules: ['engine/piscine', 'engine/piscine/', 'render/piscineOverlay', 'three/piscine3d', 'ui/champs/piscine', 'export/dossierPiscine',
        'engine/ouvrages/piscine'],
      publie: ['engine/ouvrages/piscine']
    },
    abri: {
      modules: ['engine/abri/', 'render/pergolaOverlay', 'three/pergola3d', 'ui/champs/pergola',
        'ui/champs/noteCalcul', 'export/noteCalculPdf'],
      publie: []
    },
    parasol: { modules: ['engine/parasol', 'render/parasolOverlay', 'three/ouvrages/parasol'], publie: [] },
    cloture: {
      modules: ['model/cloture', 'model/typesCloture', 'model/clotureVue', 'render/cloture', 'three/cloture3d', 'three/clotureVoisinage',
        'ui/champs/cloture'],
      publie: ['model/cloture', 'model/typesCloture', 'model/clotureVue']
    },
    bati: {
      modules: ['facade/', 'three/toitCorps3d', 'three/toitMesure3d', 'three/cheminees3d', 'three/detailsBatiment', 'three/detailsOuvertures',
        'three/terrasse3d', 'three/releve3d', 'three/ouvrages/bati', 'ui/champs/facade', 'ui/champs/carteToit', 'ui/champs/fenetres3d'],
      publie: []
    }
  };
  // Les couplages d'aujourd'hui : un cliquet, qui ne peut que se vider.
  const RESTANTS: string[] = [
  ];
  const nom = (f: string) => relative(src, f).split(sep).join('/').replace(/\.tsx?$/, '');
  const dans = (n: string, prefixes: readonly string[]) => prefixes.some(p => p.endsWith('/') ? n.startsWith(p) : n === p);
  const ouvrageDe = (n: string): string | undefined => Object.keys(OUVRAGES).find(o => dans(n, OUVRAGES[o]!.modules));
  const couplages = [...new Set(tous.flatMap(f => {
    const de = nom(f), a = ouvrageDe(de);
    if (!a) return [];
    return dependances(f).flatMap(d => {
      const vers = nom(d.cible), b = ouvrageDe(vers) ?? ouvrageDe(vers + '/index');
      return b && b !== a && !dans(vers, OUVRAGES[b]!.publie) ? [`${de} -> ${vers}`] : [];
    });
  }))].sort();
  it('un module d un ouvrage n importe pas les modules internes d un autre ouvrage, hors des couplages listes', () => {
    expect(couplages.filter(c => !RESTANTS.includes(c))).toEqual([]);
  });
  it('un couplage leve sort de la liste', () => {
    expect(RESTANTS.filter(c => !couplages.includes(c))).toEqual([]);
  });
});

function existsTsx(cible: string): boolean {
  return existsSync(cible + '.tsx');
}
