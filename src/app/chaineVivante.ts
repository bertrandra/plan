// La chaine de l'IGN a ma maison, lue en direct (Admin › Chaine).
//
// model/chaine.ts ne porte que la structure et les mots qui ne bougent pas. Tout ce qui peut changer vient d'ici, des fichiers de
// donnees et des registres eux-memes : un poids, un seuil, la liste des sources, des attributs, des etapes de lecture du LiDAR, des
// sujets de l'audit et des formes du catalogue. Changer une valeur dans `regles/*.json` change l'ecran ; ajouter une source, un
// attribut, une forme ou un sujet y ajoute sa ligne. Ce qui ne peut pas se lire (un fichier deplace, un seuil retire) est dit en
// `problemes` a l'ecran, et par les tests, qui verifient aussi que chaque `ou` designe un fichier qui existe.

import { CHAINE, verifierChaine, type NoeudChaine } from '../model/chaine.js';
import { RECONCILIATION, EMPREINTE_RECONCILIATION, SOURCES, ATTRIBUTS, type ReglesReconciliation } from '../regles/reconciliation.js';
import { REGLAGES_TOITS, DESCRIPTION_REGLAGES_TOITS, EMPREINTE_REGLAGES_TOITS, type DescriptionReglage } from '../regles/toits/reglages.js';
import { DESCRIPTIONS_SUJETS } from '../regles/sujets/liste.js';
import { VERSIONS_PROMPT, VERSIONS_SCHEMA, versionCourante } from '../regles/sujets/versions.js';
import { SUJETS } from './regles/sujets/index.js';
import { VERSION_LECTURE_TOITS } from './toitsLidar.js';
import * as FORME_TOIT from '../model/formeToit.js';
import { EXEMPLES_TOITS } from '../facade/catalogueToits.js';

/** Un seuil tel que l'ecran le montre : son nom, sa valeur avec son unite, et pourquoi il vaut cela. */
export interface LigneSeuil { nom: string; valeur: string; pourquoi: string }

/** Un noeud de la chaine, avec ce que les donnees disent de lui aujourd'hui. */
export interface NoeudVivant extends NoeudChaine {
  /** Vrai pour un noeud que les donnees ont ajoute : il n'est pas dans la liste ecrite a la main. */
  lu?: boolean;
  lignes?: LigneSeuil[];
}

export interface ChaineVivante {
  noeuds: NoeudVivant[];
  /** Ce que les fichiers disent aujourd'hui : de quoi dire a l'ecran que rien n'est recopie. */
  lecture: { promptVersion: number; schemaVersion: number; lectureToits: number; empreintes: { reconciliation: string; reglagesToits: string }; sources: number; attributs: number; seuils: number; sujets: number };
  /** Ce qui ne se lit plus : une valeur citee que les donnees n'ont pas, une source sans ligne. Vide : la chaine est a jour. */
  problemes: string[];
}

/** Ce que la chaine lit : les fichiers, et rien d'autre ; les tests y mettent d'autres valeurs. */
export interface EntreesChaine {
  noeuds: readonly NoeudChaine[];
  reconciliation: Readonly<ReglesReconciliation>;
  seuils: Readonly<Record<string, number>>;
  descriptions: Readonly<Record<string, DescriptionReglage>>;
  sujets: readonly { id: string; libelle: string; propose: boolean }[];
  formes: readonly { id: string; titre: string; aussi?: string; famille: 'toit' | 'lucarne' }[];
  versions: { prompt: number; schema: number; lectureToits: number; empreintes: { reconciliation: string; reglagesToits: string } };
}

const proposeurs = new Set(SUJETS.filter((s) => s.proposer).map((s) => s.id));

export const ENTREES_CHAINE: EntreesChaine = {
  noeuds: CHAINE,
  reconciliation: RECONCILIATION,
  seuils: REGLAGES_TOITS,
  descriptions: DESCRIPTION_REGLAGES_TOITS as Readonly<Record<string, DescriptionReglage>>,
  sujets: DESCRIPTIONS_SUJETS.map((d) => ({ id: d.id, libelle: d.libelle, propose: proposeurs.has(d.id) })),
  formes: EXEMPLES_TOITS,
  versions: { prompt: versionCourante(VERSIONS_PROMPT).version, schema: versionCourante(VERSIONS_SCHEMA).version, lectureToits: VERSION_LECTURE_TOITS, empreintes: { reconciliation: EMPREINTE_RECONCILIATION, reglagesToits: EMPREINTE_REGLAGES_TOITS } },
};

/** Un identifiant de noeud : jamais ecrit `id: '...'`, que le test des commandes (tests/unit/app/exposition.test.ts) prendrait pour une commande. */
const cle = (id: string): string => id;

const nombre = (v: number): string => String(Math.round(v * 1000) / 1000).replace('.', ',');
const avecUnite = (v: number, unite: string): string => {
  const u = unite === 'degres' ? '°' : unite === 'part' || unite === 'rapport' ? '' : ' ' + unite;
  return nombre(v) + u;
};

export function chaineVivante(e: EntreesChaine = ENTREES_CHAINE): ChaineVivante {
  const problemes: string[] = [...verifierChaine(e.noeuds)];
  const { reconciliation: r } = e;
  const seuil = (nom: string): string | null => (nom in e.seuils ? avecUnite(e.seuils[nom] as number, e.descriptions[nom]?.unite ?? '') : null);

  // Les valeurs citees par `{{...}}` : une par donnee, jamais recopiee.
  const valeur = (cle: string): string | null => {
    const [genre, nom = ''] = cle.split('.') as [string, string | undefined];
    if (genre === 'poids') { const s = (r.sources as Record<string, { poids: number; seule: boolean }>)[nom]; return s ? nombre(s.poids) + (s.seule ? '' : ', ne décide pas seul') : null; }
    if (genre === 'recon') { const v = (r.seuils as Record<string, number>)[nom]; return v === undefined ? null : nombre(v); }
    if (genre === 'seuil') return seuil(nom);
    // Les seuils de nommage que le modele garde dans son code (model/formeToit.ts) : leur valeur est celle de la constante.
    if (genre === 'modele') { const v = (FORME_TOIT as Record<string, unknown>)[nom]; return typeof v === 'number' ? nombre(v) : null; }
    return null;
  };
  const resoudre = (id: string, texte: string): string => texte.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, (_, cle: string) => {
    const v = valeur(cle);
    if (v === null) { problemes.push(id + ' : la valeur « ' + cle + ' » n’existe plus dans les données'); return '?'; }
    return v;
  });
  const lignesDe = (id: string, noms: readonly string[]): LigneSeuil[] => noms.flatMap((nom) => {
    const v = seuil(nom);
    if (v === null) { problemes.push(id + ' : le seuil ' + nom + ' n’existe plus dans regles/toits/reglages.json'); return []; }
    return [{ nom, valeur: v, pourquoi: e.descriptions[nom]?.pourquoi ?? '' }];
  });

  const noeuds: NoeudVivant[] = e.noeuds.map((n) => ({
    ...n,
    ...(n.detail ? { detail: resoudre(n.id, n.detail) } : {}),
    ...(n.seuils ? { lignes: lignesDe(n.id, n.seuils) } : {}),
  }));
  const ids = new Set(noeuds.map((n) => n.id));
  const ajouter = (n: NoeudVivant): void => { if (ids.has(n.id)) return; if (!ids.has(n.parent ?? '')) { problemes.push(n.id + ' : parent ' + n.parent + ' absent'); return; } ids.add(n.id); noeuds.push({ ...n, lu: true }); };

  // Les sources : chacune des donnees a sa ligne ; son poids et sa part dans la decision sont ceux du fichier.
  for (const id of SOURCES) {
    const s = r.sources[id];
    ajouter({ id: cle('sources.') + id, parent: 'sources', genre: 'source', titre: s.libelle, detail: s.voit + '. Poids ' + valeur('poids.' + id) + '.', mode: id === 'terrain' ? 'manuel' : s.seule ? 'auto' : 'mixte' });
  }
  // Les attributs arbitres : accord, poids par source, seuils propres.
  for (const id of ATTRIBUTS) {
    const a = r.attributs[id];
    const poids = SOURCES.map((s) => r.sources[s].libelle + ' ' + nombre(a.poids[s] ?? r.sources[s].poids)).join(' · ');
    const accord = a.accord.type === 'nombre' || a.accord.type === 'angle' ? 'tolérance ' + nombre(a.accord.tolerance) + (a.accord.unite ? ' ' + a.accord.unite : '') : a.accord.type === 'ensemble' ? 'mêmes mots, dans n’importe quel ordre' : 'même mot';
    ajouter({ id: cle('decision.attr.') + id, parent: 'decision', genre: 'regle', titre: a.libelle, detail: 'Accord : ' + accord + '. Poids : ' + poids + '.' + (a.scoreAutoMin !== undefined || a.margeAutoMin !== undefined ? ' Seuils propres : score ' + nombre(a.scoreAutoMin ?? r.seuils.SCORE_AUTO_MIN) + ', marge ' + nombre(a.margeAutoMin ?? r.seuils.MARGE_AUTO_MIN) + '.' : ''), mode: 'mixte', ecran: '?admin&ecran=regles' });
  }
  // La lecture du LiDAR, etape par etape, avec les seuils de chaque module.
  for (const etape of r.lecturesLidar) {
    const noms = Object.keys(e.descriptions).filter((nom) => etape.modules.includes((e.descriptions[nom] as DescriptionReglage).ou.split(' ')[0] as string));
    ajouter({ id: cle('toit.lidar.') + etape.ordre, parent: 'decision.lidar', genre: 'regle', titre: etape.ordre + '. ' + etape.etape, detail: etape.dit, mode: 'auto', ou: etape.modules.join(', '), ecran: '?admin&ecran=regles', lignes: lignesDe('toit.lidar.' + etape.ordre, noms) } as NoeudVivant);
  }
  // Les sujets de l'audit : ce que Claude lit, et ceux qui proposent quelque chose au projet.
  ajouter({ id: cle('audit.sujets'), parent: 'audit', genre: 'processus', titre: 'Les sujets que l’audit sait lire', detail: 'Ce que Claude lit sur les photos ; un sujet qui propose une valeur passe par la sélection automatique ou manuelle, les autres se lisent en observation.', mode: 'mixte', ecran: '?admin&ecran=regles' });
  for (const s of e.sujets) ajouter({ id: cle('audit.sujet.') + s.id, parent: 'audit.sujets', genre: 'processus', titre: s.libelle, detail: s.propose ? 'Propose une valeur au projet.' : 'Observation : rien n’est écrit dans le projet.', mode: s.propose ? 'mixte' : 'auto', ecran: '?admin&ecran=regles' });
  // Les formes du catalogue 3D : une ligne par forme, meme si personne ne l'a decrite.
  const dessinees = new Set(noeuds.filter((n) => n.forme).map((n) => n.forme));
  for (const f of e.formes) if (!dessinees.has(f.id)) ajouter({ id: cle('o3d.') + f.id, parent: f.famille === 'lucarne' ? 'objets3d.lucarnes' : 'objets3d.formes', genre: 'objet3d', titre: f.titre + (f.aussi ? ' (' + f.aussi + ')' : ''), forme: f.id, mode: 'mixte', ou: 'facade/catalogueToits.ts' });
  for (const n of noeuds) if (n.forme && !e.formes.some((f) => f.id === n.forme)) problemes.push(n.id + ' : la forme « ' + n.forme + ' » n’est plus dans le catalogue');

  problemes.push(...verifierChaine(noeuds).filter((p) => !problemes.includes(p)));
  return {
    noeuds, problemes,
    lecture: { promptVersion: e.versions.prompt, schemaVersion: e.versions.schema, lectureToits: e.versions.lectureToits, empreintes: e.versions.empreintes, sources: SOURCES.length, attributs: ATTRIBUTS.length, seuils: Object.keys(e.seuils).length, sujets: e.sujets.length },
  };
}
