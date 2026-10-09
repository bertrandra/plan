// Section « Fenêtres (3D) » de l'inspecteur, sur un batiment du projet (MD/spec-toit-ign.md §6.3).
//
// Les fenetres que la 3D dessine sur un batiment sans releve de facade : une dimension pour toutes
// (la disposition automatique s'en sert), ou une liste reglee une par une — chaque fenetre se
// deplace et se taille sur son mur. Un mur photographie garde les ouvertures de son releve. Ces
// champs ecrivent le projet (Ctrl+Z, « projet modifie ») : la 3D et l'export GLB en dependent.

import { enPoints } from '../../model/formes.js';
import { volumesDuBatiment } from '../../facade/profil.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import { ouverturesAutomatiques, mursAOuvrir } from '../../facade/ouvertures.js';
import { fenetres3dDe, reglerFenetres3d, nouvelleFenetre } from '../../model/fenetres3d.js';
import { estBatiment } from '../../model/fonctions.js';
import type { Fenetre3d, Fenetres3d, ObjetPlan } from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

const effets: Effet[] = ['scene3d'];
const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** La fenetre que les champs de la liste reglent : son indice. Un reglage d'affichage, comme `accesEnCours` de la cloture. */
let fenetreEnCours = 0;

/** Pour les tests : revenir a l'etat initial du choix. */
export function reinitialiserChoixFenetre(): void {
  fenetreEnCours = 0;
}

const pts = (o: ObjetPlan) => enPoints(o).pts;
const r = (c: ContexteChamps) => fenetres3dDe(c.obj);
const ecrire = (c: ContexteChamps, f: (x: Fenetres3d) => void) => reglerFenetres3d(c.obj, f);
const cotesReleves = (o: ObjetPlan) => (o.facades ?? []).map((x) => x.cote);
const hauteur = (c: ContexteChamps) => c.elevationOf(c.obj);

/** La disposition automatique du batiment, aux dimensions communes en cours. */
function automatiques(c: ContexteChamps): Fenetre3d[] {
  const h = hauteur(c), p = pts(c.obj);
  const x = r(c);
  const etages = (c.obj.bdtopo as { nombreEtages?: unknown } | null | undefined)?.nombreEtages;
  return ouverturesAutomatiques(p, volumesDuBatiment(p, h, c.obj.facades), h, { largeur: x.largeur, hauteur: x.hauteur, appui: x.appui, entraxe: x.entraxe, cotesReleves: cotesReleves(c.obj), etages: typeof etages === 'number' ? etages : null });
}

function libelleCote(c: ContexteChamps, i: number): string {
  const f = facadesDuContour(pts(c.obj), 0).find((x) => x.cote === i);
  return `Côté ${i + 1}${f ? ` — ${f.orientation.toLowerCase()}, ${fr(f.largeur)} m` : ''}`;
}

/** La section « Fenêtres (3D) » d'un batiment du projet ; `null` pour une maison du voisinage, ou sans mur a ouvrir. */
export function sectionFenetres3d(c: ContexteChamps): Section | null {
  const o = c.obj;
  if (o.type !== 'polygon' || !estBatiment(o) || o.voisinage) return null;
  if (!mursAOuvrir(pts(o), hauteur(c), cotesReleves(o)).length) return null;
  const toutes = (cc: ContexteChamps) => r(cc).mode === 'toutes';
  const uneParUne = (cc: ContexteChamps) => r(cc).mode === 'uneParUne';
  const liste = (cc: ContexteChamps): Fenetre3d[] => r(cc).liste ?? [];
  const enCours = (cc: ContexteChamps): Fenetre3d | undefined => {
    const l = liste(cc);
    if (fenetreEnCours >= l.length) fenetreEnCours = Math.max(0, l.length - 1);
    return l[fenetreEnCours];
  };
  const une = (cc: ContexteChamps) => uneParUne(cc) && !!enCours(cc);
  const ecrireFenetre = (cc: ContexteChamps, f: (w: Fenetre3d) => void) => ecrire(cc, (x) => { const w = x.liste?.[fenetreEnCours]; if (w) f(w); });
  const largeurDuMur = (cc: ContexteChamps, cote: number) => facadesDuContour(pts(cc.obj), 0).find((x) => x.cote === cote)?.largeur ?? 0;
  const dimensionCommune = (cle: 'largeur' | 'hauteur' | 'appui' | 'entraxe', libelle: string, min: number, max: number, aide?: string): Champ => ({
    type: 'nombre', cle, libelle, unite: 'm', pas: 0.1, min, max, decimales: 2, visible: toutes, effets, ...(aide ? { aide } : {}),
    lire: (cc) => r(cc)[cle],
    ecrire: (cc, v) => { if (!(v >= min && v <= max)) return false; ecrire(cc, (x) => { x[cle] = v; }); },
  });

  const champs: Champ[] = [
    {
      type: 'choix', cle: 'mode', libelle: 'Réglage', effets: ['inspecteur', ...effets],
      aide: 'Une dimension pour toutes les fenêtres, disposées automatiquement ; ou chaque fenêtre à sa place et à sa taille',
      options: () => [{ valeur: 'toutes', libelle: 'Toutes pareilles' }, { valeur: 'uneParUne', libelle: 'Une par une' }],
      lire: (cc) => r(cc).mode,
      ecrire: (cc, v) => ecrire(cc, (x) => {
        x.mode = v === 'uneParUne' ? 'uneParUne' : 'toutes';
        // La liste part de la disposition automatique, pour deplacer et tailler ce qui est deja la.
        if (x.mode === 'uneParUne' && !x.liste) x.liste = automatiques(cc);
      }),
    },
    dimensionCommune('largeur', 'Largeur', 0.4, 3),
    dimensionCommune('hauteur', 'Hauteur', 0.4, 2.5),
    dimensionCommune('appui', 'Hauteur d’appui', 0, 2, 'Du plancher du niveau au bas de la fenêtre'),
    dimensionCommune('entraxe', 'Entraxe', 1, 8, 'La distance entre deux fenêtres : plus il est petit, plus elles sont nombreuses'),
    { type: 'couleur', cle: 'couleur', libelle: 'Couleur des vitres', effets, lire: (cc) => r(cc).couleur ?? '#6F8AA6', ecrire: (cc, v) => ecrire(cc, (x) => { x.couleur = v; }) },
    {
      type: 'bouton', cle: 'ajouter', libelle: '', nom: 'Ajouter une fenêtre', texte: () => 'Ajouter une fenêtre', visible: uneParUne,
      explication: 'Sur le mur de la fenêtre en cours, à sa droite ; sinon sur le plus long mur.',
      agit: 'projet',
      executer: (cc) => {
        ecrire(cc, (x) => {
          const l = x.liste ?? (x.liste = []);
          const ref = l[fenetreEnCours];
          const murs = mursAOuvrir(pts(cc.obj), hauteur(cc), cotesReleves(cc.obj));
          const plusLong = murs.reduce((m, f) => (m && m.largeur >= f.largeur ? m : f), murs[0]);
          const cote = ref ? ref.cote : plusLong?.cote ?? 0;
          const L = largeurDuMur(cc, cote);
          const xNeuf = ref ? Math.min(L - x.largeur, ref.x + ref.l + 0.4) : Math.max(0, (L - x.largeur) / 2);
          l.push(nouvelleFenetre(x, cote, Math.max(0, xNeuf)));
          fenetreEnCours = l.length - 1;
        });
        cc.render();
      },
    },
    {
      type: 'bouton', cle: 'automatique', libelle: '', nom: 'Revenir à la disposition automatique', texte: () => 'Revenir à la disposition automatique', visible: uneParUne,
      aide: 'Remplace la liste par la disposition automatique aux dimensions communes (Ctrl+Z pour revenir)',
      agit: 'projet',
      executer: (cc) => { ecrire(cc, (x) => { x.liste = automatiques(cc); }); fenetreEnCours = 0; cc.render(); },
    },
  ];

  liste(c).forEach((w, i) => {
    champs.push({
      type: 'ligne', cle: 'fenetre' + i, libelle: w.type === 'porte' ? 'Porte' : 'Fenêtre', visible: uneParUne,
      surbrillance: (cc) => cc.etat.highlight.type === 'segment' && cc.etat.highlight.index === w.cote,
      champs: [
        { type: 'lecture', cle: 'resume', libelle: `Côté ${w.cote + 1}`, valeur: (cc) => { const x = liste(cc)[i]; return x ? `à ${fr(x.x)} m, ${fr(x.l)} × ${fr(x.h)} m` : ''; } },
        { type: 'bouton', cle: 'regler', libelle: 'Régler', texte: () => 'Régler', agit: 'interface', executer: (cc) => { fenetreEnCours = i; cc.render(); } },
        { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', aide: 'Retirer cette ouverture (Ctrl+Z pour revenir)', agit: 'projet', executer: (cc) => { ecrire(cc, (x) => { x.liste?.splice(i, 1); }); if (fenetreEnCours >= i && fenetreEnCours > 0) fenetreEnCours--; cc.render(); } },
      ],
    });
  });

  champs.push(
    {
      type: 'choix', cle: 'enCours', libelle: 'Fenêtre en cours', visible: (cc) => uneParUne(cc) && liste(cc).length > 1, sale: false, effets: ['inspecteur'],
      aide: 'Ce que les champs ci-dessous modifient',
      options: (cc) => liste(cc).map((w, i) => ({ valeur: String(i), libelle: `${w.type === 'porte' ? 'Porte' : 'Fenêtre'} ${i + 1} — côté ${w.cote + 1}, à ${fr(w.x)} m` })),
      lire: () => String(fenetreEnCours),
      ecrire: (_cc, v) => { fenetreEnCours = Number(v) || 0; },
    },
    { type: 'choix', cle: 'type', libelle: 'Type', visible: une, effets: ['inspecteur', ...effets], options: () => [{ valeur: 'fenetre', libelle: 'Fenêtre' }, { valeur: 'porte', libelle: 'Porte' }], lire: (cc) => (enCours(cc)?.type === 'porte' ? 'porte' : 'fenetre'), ecrire: (cc, v) => ecrireFenetre(cc, (w) => { w.type = v === 'porte' ? 'porte' : 'fenetre'; if (w.type === 'porte') w.y = 0; }) },
    { type: 'choix', cle: 'cote', libelle: 'Mur', visible: une, effets: ['inspecteur', ...effets], options: (cc) => mursAOuvrir(pts(cc.obj), hauteur(cc), cotesReleves(cc.obj)).map((f) => ({ valeur: String(f.cote), libelle: libelleCote(cc, f.cote) })), lire: (cc) => String(enCours(cc)?.cote ?? 0), ecrire: (cc, v) => ecrireFenetre(cc, (w) => { const cote = Number(v); w.cote = cote; w.x = Math.max(0, Math.min(w.x, largeurDuMur(cc, cote) - w.l)); }) },
    { type: 'nombre', cle: 'x', libelle: 'Position', unite: 'm', pas: 0.1, min: 0, decimales: 2, visible: une, aide: 'Depuis le bord gauche du mur, vu de dehors', note: (cc) => { const w = enCours(cc); return w ? `mur de ${fr(largeurDuMur(cc, w.cote))} m` : ''; }, effets, lire: (cc) => enCours(cc)?.x ?? 0, ecrire: (cc, v) => { if (!(v >= 0)) return false; ecrireFenetre(cc, (w) => { w.x = Math.min(v, Math.max(0, largeurDuMur(cc, w.cote) - w.l)); }); } },
    { type: 'nombre', cle: 'y', libelle: 'Hauteur d’appui', unite: 'm', pas: 0.1, min: 0, max: 30, decimales: 2, visible: (cc) => une(cc) && enCours(cc)?.type !== 'porte', aide: 'Du pied du mur au bas de la fenêtre', effets, lire: (cc) => enCours(cc)?.y ?? 0, ecrire: (cc, v) => { if (!(v >= 0)) return false; ecrireFenetre(cc, (w) => { w.y = v; }); } },
    { type: 'nombre', cle: 'l', libelle: 'Largeur', unite: 'm', pas: 0.1, min: 0.3, max: 6, decimales: 2, visible: une, effets, lire: (cc) => enCours(cc)?.l ?? 0, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireFenetre(cc, (w) => { w.l = v; }); } },
    { type: 'nombre', cle: 'h', libelle: 'Hauteur', unite: 'm', pas: 0.1, min: 0.3, max: 4, decimales: 2, visible: une, effets, lire: (cc) => enCours(cc)?.h ?? 0, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireFenetre(cc, (w) => { w.h = v; }); } },
  );

  return {
    id: 'fenetres3d', titre: 'Fenêtres (3D)', repliee: true, champs,
    explication: 'Les fenêtres dessinées dans la Vue 3D sur les murs sans relevé de façade. Un mur photographié garde les ouvertures de son relevé.',
  };
}
