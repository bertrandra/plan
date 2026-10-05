// Sections « Cloture » et « Portails et portillons » de l'inspecteur, sur la parcelle du projet
// (MD/spec-cloture.md §3).
//
// Un cote par ligne, un acces par ligne ; puis les champs de ce qu'on regle : « tous les cotes »
// ou un cote, un acces. Ce choix est un reglage d'affichage (il ne touche pas au projet), range ici
// dans le module comme `designerFacade` pour le releve : l'inspecteur se redessine a chaque ecriture
// et retrouve ce qu'il reglait.
//
// Toute ecriture passe par `clotureDe(obj, true)` : la structure n'est posee sur la parcelle qu'a
// la premiere ecriture, et les anciens champs suivent (`synchroniserAnciensChamps`), pour qu'un
// projet seulement consulte garde sa forme d'avant.

import { enPoints } from '../../model/formes.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import {
  clotureDe, synchroniserAnciensChamps, reglageDuCote, coteRegle, reglerCote, retirerCote, changerType,
  longueurDuCote, coteValide, nouveauPortail, coteDAcces, accolerPortillon, alertesAcces, alertesHauteur,
  resumeReglage, resumeAcces, hauteurTotale,
  LIBELLES_TYPE_CLOTURE, LIBELLES_PAREMENT, LIBELLES_ESSENCE, LIBELLES_FORME_PORTAIL,
  LIBELLES_OUVERTURE_PORTAIL, LIBELLES_REMPLISSAGE, LIBELLES_MATERIAU_PORTAIL, COULEUR_PAR_MATERIAU,
  DEFAUTS_PAR_TYPE, COULEUR_CLOTURE_DEFAUT,
} from '../../model/cloture.js';
import type {
  Cloture, ReglageCloture, CoteCloture, Portail, TypeCloture, ParementMur, EssenceHaie,
  FormePortail, OuverturePortail, RemplissagePortail, MateriauPortail, ObjetPlan,
} from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

/** La parcelle du projet, celle qui porte la cloture - pas une parcelle voisine (objet.ts). */
const estParcellePrincipale = (c: ContexteChamps) => !!c.parcelle && c.parcelle.key === c.obj.key;

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const effets: Effet[] = ['rendu', 'scene3d'];

/** Ce que les champs de la section Cloture reglent : tous les cotes (`null`) ou un cote. */
let coteEnCours: number | null = null;
/** L'acces que les champs de la section Portails reglent : son indice dans `portails`. */
let accesEnCours = 0;

/** Pour les tests : revenir a l'etat initial du choix. */
export function reinitialiserChoixCloture(): void {
  coteEnCours = null;
  accesEnCours = 0;
}

function options<K extends string>(libelles: Record<K, string>): { valeur: string; libelle: string }[] {
  return (Object.keys(libelles) as K[]).map(k => ({ valeur: k, libelle: libelles[k] }));
}

/** La cloture a ecrire : posee sur la parcelle, anciens champs synchronises apres l'ecriture. */
function ecrire(c: ContexteChamps, f: (cl: Cloture) => void): void {
  const cl = clotureDe(c.obj, true);
  f(cl);
  synchroniserAnciensChamps(c.obj);
}

function pts(o: ObjetPlan) {
  return enPoints(o).pts;
}

/** Le reglage en cours : celui du cote choisi s'il est regle a part, sinon le defaut. */
function reglageEnCours(cl: Cloture): ReglageCloture {
  if (coteEnCours !== null) {
    const c = coteRegle(cl, coteEnCours);
    if (c) return c;
    coteEnCours = null;
  }
  return cl.defaut;
}

/** L'orientation et la longueur d'un cote, pour les libelles. */
function libelleCote(o: ObjetPlan, i: number): string {
  const p = pts(o);
  const f = facadesDuContour(p, 0).find(x => x.cote === i);
  const nom = enPoints(o).segmentNames?.[i];
  const orientation = f ? f.orientation : '';
  return `Côté ${i + 1}${nom && !/^C[oô]t[eé] \d+$/.test(nom) ? ` « ${nom} »` : ''}${orientation ? ` — ${orientation.toLowerCase()}` : ''}, ${fr(longueurDuCote(p, i))} m`;
}

// ---------------------------------------------------------------------------------------------
// Section Cloture

export function sectionCloture(c: ContexteChamps): Section {
  const o = c.obj;
  const n = pts(o).length;
  const actif = (cc: ContexteChamps) => clotureDe(cc.obj).active;
  const r = (cc: ContexteChamps) => reglageEnCours(clotureDe(cc.obj));
  const surCote = (cc: ContexteChamps) => actif(cc) && coteEnCours !== null && !!coteRegle(clotureDe(cc.obj), coteEnCours);
  const type = (cc: ContexteChamps, ...t: TypeCloture[]) => actif(cc) && t.includes(r(cc).type);
  const avecSoubassement = (cc: ContexteChamps) => type(cc, 'palissade', 'grillage', 'haie') && !!r(cc).soubassement;
  /** Ecrit sur le reglage en cours, cree pour un cote qui n'en a pas encore. */
  const ecrireReglage = (cc: ContexteChamps, f: (r: ReglageCloture) => void) => ecrire(cc, (cl) => f(coteEnCours !== null ? reglerCote(cl, coteEnCours) : cl.defaut));
  const ecrireCote = (cc: ContexteChamps, f: (c: CoteCloture) => void) => ecrire(cc, (cl) => { if (coteEnCours !== null) f(reglerCote(cl, coteEnCours)); });

  const champs: Champ[] = [
    { type: 'case', cle: 'active', libelle: 'Clôture autour de la parcelle', effets: ['inspecteur', ...effets], lire: (cc) => clotureDe(cc.obj).active, ecrire: (cc, v) => ecrire(cc, (cl) => { cl.active = v; }) },
    { type: 'nombre', cle: 'hauteurMaxRue', libelle: 'Hauteur maximale sur rue', unite: 'm', pas: 0.1, min: 0, decimales: 2, visible: actif, aide: 'D’après le règlement du PLU ; 0 pour ne pas contrôler', effets: ['inspecteur'], lire: (cc) => clotureDe(cc.obj).hauteurMaxRue ?? 0, ecrire: (cc, v) => ecrire(cc, (cl) => { if (v > 0) cl.hauteurMaxRue = v; else delete cl.hauteurMaxRue; }) },
    { type: 'nombre', cle: 'hauteurMaxSeparative', libelle: 'Hauteur maximale en limite séparative', unite: 'm', pas: 0.1, min: 0, decimales: 2, visible: actif, aide: 'D’après le règlement du PLU ; 0 pour ne pas contrôler', effets: ['inspecteur'], lire: (cc) => clotureDe(cc.obj).hauteurMaxSeparative ?? 0, ecrire: (cc, v) => ecrire(cc, (cl) => { if (v > 0) cl.hauteurMaxSeparative = v; else delete cl.hauteurMaxSeparative; }) },
  ];

  for (let i = 0; i < n; i++) {
    champs.push({
      type: 'ligne', cle: 'cote' + i, libelle: `Côté ${i + 1}`, visible: actif,
      surbrillance: (cc) => cc.etat.highlight.type === 'segment' && cc.etat.highlight.index === i,
      champs: [
        {
          type: 'lecture', cle: 'resume', libelle: libelleCote(o, i),
          valeur: (cc) => {
            const cl = clotureDe(cc.obj);
            const propre = coteRegle(cl, i);
            const bouts = [resumeReglage(reglageDuCote(cl, i))];
            if (propre?.limite) bouts.push(propre.limite === 'rue' ? 'sur rue' : 'limite séparative');
            if (propre?.mitoyenne) bouts.push('mitoyen');
            if (!propre) bouts.push('comme le défaut');
            return bouts.join(' · ');
          },
        },
        {
          type: 'bouton', cle: 'regler', libelle: 'Régler', texte: () => 'Régler',
          aide: 'Donner à ce côté son propre réglage, copié du réglage par défaut',
          agit: 'projet',
          executer: (cc) => { ecrire(cc, (cl) => { reglerCote(cl, i); }); coteEnCours = i; cc.render(); },
        },
        {
          type: 'bouton', cle: 'retirer', libelle: 'Comme le défaut', texte: () => 'Comme le défaut',
          visible: (cc) => !!coteRegle(clotureDe(cc.obj), i),
          aide: 'Retirer le réglage propre de ce côté : il suit à nouveau le réglage par défaut',
          agit: 'projet',
          executer: (cc) => { ecrire(cc, (cl) => { retirerCote(cl, i); }); if (coteEnCours === i) coteEnCours = null; cc.render(); },
        },
      ],
    });
  }

  champs.push(
    {
      type: 'choix', cle: 'enCours', libelle: 'Réglage en cours', visible: actif, sale: false, effets: ['inspecteur'],
      aide: 'Ce que les champs ci-dessous modifient',
      options: (cc) => [{ valeur: '', libelle: 'Tous les côtés (réglage par défaut)' }, ...clotureDe(cc.obj).cotes.filter(x => coteValide(pts(cc.obj), x.cote)).map(x => ({ valeur: String(x.cote), libelle: libelleCote(cc.obj, x.cote) }))],
      lire: (cc) => (coteEnCours !== null && coteRegle(clotureDe(cc.obj), coteEnCours) ? String(coteEnCours) : ''),
      ecrire: (_cc, v) => { coteEnCours = v === '' ? null : Number(v); },
    },
    { type: 'choix', cle: 'type', libelle: 'Type', visible: actif, effets: ['inspecteur', ...effets], options: () => options(LIBELLES_TYPE_CLOTURE), lire: (cc) => r(cc).type, ecrire: (cc, v) => ecrireReglage(cc, (x) => changerType(x, v as TypeCloture)) },
    { type: 'choix', cle: 'limite', libelle: 'Limite', visible: surCote, effets: ['inspecteur', 'rendu'], options: () => [{ valeur: '', libelle: 'Non précisée' }, { valeur: 'rue', libelle: 'Sur rue' }, { valeur: 'separative', libelle: 'Séparative (voisin)' }], lire: (cc) => (coteEnCours !== null && coteRegle(clotureDe(cc.obj), coteEnCours)?.limite) || '', ecrire: (cc, v) => ecrireCote(cc, (x) => { if (v === 'rue' || v === 'separative') x.limite = v; else delete x.limite; }) },
    { type: 'case', cle: 'mitoyenne', libelle: 'Mitoyenne', visible: surCote, effets: ['inspecteur'], aide: 'Clôture partagée avec le voisin', lire: (cc) => !!(coteEnCours !== null && coteRegle(clotureDe(cc.obj), coteEnCours)?.mitoyenne), ecrire: (cc, v) => ecrireCote(cc, (x) => { if (v) x.mitoyenne = true; else delete x.mitoyenne; }) },
    { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', unite: 'm', pas: 0.1, min: 0.1, max: 6, decimales: 2, visible: (cc) => type(cc, 'palissade', 'grillage', 'haie', 'mur'), note: (cc) => (r(cc).soubassement ? `hors soubassement · ${fr(hauteurTotale(r(cc)))} m en tout` : ''), effets, lire: (cc) => r(cc).hauteur, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireReglage(cc, (x) => { x.hauteur = v; }); } },
    { type: 'couleur', cle: 'couleur', libelle: 'Couleur', visible: (cc) => type(cc, 'palissade', 'grillage', 'haie', 'mur'), effets, lire: (cc) => r(cc).couleur || DEFAUTS_PAR_TYPE[r(cc).type].couleur || COULEUR_CLOTURE_DEFAUT, ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.couleur = v; }) },
    { type: 'texture', cle: 'texture', libelle: 'Texture', visible: (cc) => type(cc, 'palissade', 'grillage', 'haie', 'mur'), effets: ['inspecteur', ...effets], lire: (cc) => r(cc).texture, ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.texture = v; }) },
    { type: 'choix', cle: 'lames', libelle: 'Lames', visible: (cc) => type(cc, 'palissade'), effets, options: () => [{ valeur: 'verticales', libelle: 'Verticales' }, { valeur: 'horizontales', libelle: 'Horizontales' }], lire: (cc) => r(cc).lames || 'verticales', ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.lames = v === 'horizontales' ? 'horizontales' : 'verticales'; }) },
    { type: 'choix', cle: 'grillage', libelle: 'Grillage', visible: (cc) => type(cc, 'grillage'), effets, options: () => [{ valeur: 'rigide', libelle: 'Rigide (panneaux)' }, { valeur: 'souple', libelle: 'Souple (rouleau)' }], lire: (cc) => r(cc).grillage || 'rigide', ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.grillage = v === 'souple' ? 'souple' : 'rigide'; }) },
    { type: 'case', cle: 'occultante', libelle: 'Occultante', visible: (cc) => type(cc, 'palissade', 'grillage'), aide: 'Brise-vue : on ne voit pas au travers', effets, lire: (cc) => !!r(cc).occultante, ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.occultante = v; }) },
    { type: 'choix', cle: 'essence', libelle: 'Essence', visible: (cc) => type(cc, 'haie'), effets: ['inspecteur', ...effets], options: () => options(LIBELLES_ESSENCE), lire: (cc) => r(cc).essence || 'laurier', ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.essence = v as EssenceHaie; }) },
    { type: 'nombre', cle: 'epaisseur', libelle: 'Épaisseur', unite: 'm', pas: 0.05, min: 0.05, max: 3, decimales: 2, visible: (cc) => type(cc, 'haie', 'mur'), effets, lire: (cc) => r(cc).epaisseur ?? DEFAUTS_PAR_TYPE[r(cc).type].epaisseur ?? 0.2, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireReglage(cc, (x) => { x.epaisseur = v; }); } },
    { type: 'case', cle: 'taillee', libelle: 'Taillée', visible: (cc) => type(cc, 'haie'), aide: 'Haie taillée au carré, plutôt que libre', effets, lire: (cc) => r(cc).taillee !== false, ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.taillee = v; }) },
    { type: 'choix', cle: 'parement', libelle: 'Parement', visible: (cc) => type(cc, 'mur'), effets: ['inspecteur', ...effets], options: () => options(LIBELLES_PAREMENT), lire: (cc) => r(cc).parement || 'enduit', ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.parement = v as ParementMur; }) },
    { type: 'case', cle: 'couvertine', libelle: 'Couvertine', visible: (cc) => type(cc, 'mur'), aide: 'Chaperon ou couvertine qui déborde du mur', effets, lire: (cc) => !!r(cc).couvertine, ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.couvertine = v; }) },
    { type: 'case', cle: 'soubassement', libelle: 'Soubassement', visible: (cc) => type(cc, 'palissade', 'grillage', 'haie'), aide: 'Un muret maçonné sous la clôture', effets: ['inspecteur', ...effets], lire: (cc) => !!r(cc).soubassement, ecrire: (cc, v) => ecrireReglage(cc, (x) => { x.soubassement = v ? (x.soubassement || { hauteur: 0.5, parement: 'enduit', couleur: DEFAUTS_PAR_TYPE.mur.couleur || COULEUR_CLOTURE_DEFAUT, texture: null }) : null; }) },
    { type: 'nombre', cle: 'soubassementHauteur', libelle: 'Hauteur du soubassement', unite: 'm', pas: 0.05, min: 0.05, max: 3, decimales: 2, visible: avecSoubassement, effets, lire: (cc) => r(cc).soubassement?.hauteur ?? 0.5, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireReglage(cc, (x) => { if (x.soubassement) x.soubassement.hauteur = v; }); } },
    { type: 'choix', cle: 'soubassementParement', libelle: 'Parement du soubassement', visible: avecSoubassement, effets, options: () => options(LIBELLES_PAREMENT), lire: (cc) => r(cc).soubassement?.parement || 'enduit', ecrire: (cc, v) => ecrireReglage(cc, (x) => { if (x.soubassement) x.soubassement.parement = v as ParementMur; }) },
    { type: 'couleur', cle: 'soubassementCouleur', libelle: 'Couleur du soubassement', visible: avecSoubassement, effets, lire: (cc) => r(cc).soubassement?.couleur || DEFAUTS_PAR_TYPE.mur.couleur || COULEUR_CLOTURE_DEFAUT, ecrire: (cc, v) => ecrireReglage(cc, (x) => { if (x.soubassement) x.soubassement.couleur = v; }) },
    { type: 'texture', cle: 'soubassementTexture', libelle: 'Texture du soubassement', visible: avecSoubassement, effets: ['inspecteur', ...effets], lire: (cc) => r(cc).soubassement?.texture, ecrire: (cc, v) => ecrireReglage(cc, (x) => { if (x.soubassement) x.soubassement.texture = v; }) },
    { type: 'alerte', cle: 'alerteHauteur', libelle: '', nom: 'Hauteur au-delà du PLU', visible: (cc) => actif(cc) && alertesHauteur(clotureDe(cc.obj), pts(cc.obj).length).length > 0, texte: (cc) => alertesHauteur(clotureDe(cc.obj), pts(cc.obj).length).join(' ') },
  );
  return { id: 'cloture', titre: 'Clôture', champs };
}

// ---------------------------------------------------------------------------------------------
// Section Portails et portillons

export function sectionPortails(c: ContexteChamps): Section {
  const o = c.obj;
  const acces = (cc: ContexteChamps): Portail | undefined => {
    const liste = clotureDe(cc.obj).portails;
    if (accesEnCours >= liste.length) accesEnCours = Math.max(0, liste.length - 1);
    return liste[accesEnCours];
  };
  const actif = (cc: ContexteChamps) => clotureDe(cc.obj).active;
  const unAcces = (cc: ContexteChamps) => actif(cc) && !!acces(cc);
  const battant = (cc: ContexteChamps) => actif(cc) && acces(cc)?.ouverture !== undefined && acces(cc)?.ouverture !== 'coulissant';
  const avecPiliers = (cc: ContexteChamps) => actif(cc) && !!acces(cc)?.piliers;
  const ecrireAcces = (cc: ContexteChamps, f: (a: Portail) => void) => ecrire(cc, (cl) => { const a = cl.portails[accesEnCours]; if (a) f(a); });
  const ajouter = (nature: Portail['nature']) => (cc: ContexteChamps) => {
    ecrire(cc, (cl) => {
      const cote = coteDAcces(cl, pts(cc.obj));
      cl.portails.push(nouveauPortail(nature, cote, longueurDuCote(pts(cc.obj), cote)));
      accesEnCours = cl.portails.length - 1;
    });
    cc.render();
  };

  const champs: Champ[] = [
    { type: 'bouton', cle: 'ajouterPortail', libelle: '', nom: 'Ajouter un portail', texte: () => 'Ajouter un portail', visible: actif, explication: 'Sur le côté sur rue s’il y en a un, sinon sur le plus long.', agit: 'projet', executer: ajouter('portail') },
    { type: 'bouton', cle: 'ajouterPortillon', libelle: '', nom: 'Ajouter un portillon', texte: () => 'Ajouter un portillon', visible: actif, agit: 'projet', executer: ajouter('portillon') },
  ];

  clotureDe(o).portails.forEach((a, i) => {
    champs.push({
      type: 'ligne', cle: 'acces' + i, libelle: a.nature === 'portail' ? 'Portail' : 'Portillon', visible: actif,
      surbrillance: (cc) => cc.etat.highlight.type === 'segment' && cc.etat.highlight.index === a.cote,
      champs: [
        { type: 'lecture', cle: 'resume', libelle: `Côté ${a.cote + 1}`, valeur: (cc) => { const x = clotureDe(cc.obj).portails[i]; return x ? resumeAcces(x) : ''; } },
        { type: 'bouton', cle: 'regler', libelle: 'Régler', texte: () => 'Régler', agit: 'interface', executer: (cc) => { accesEnCours = i; cc.render(); } },
        { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', aide: 'Retirer cet accès (Ctrl+Z pour revenir)', agit: 'projet', executer: (cc) => { ecrire(cc, (cl) => { cl.portails.splice(i, 1); }); if (accesEnCours >= i && accesEnCours > 0) accesEnCours--; cc.render(); } },
      ],
    });
  });

  champs.push(
    {
      type: 'choix', cle: 'enCours', libelle: 'Accès en cours', visible: (cc) => actif(cc) && clotureDe(cc.obj).portails.length > 1, sale: false, effets: ['inspecteur'],
      aide: 'Ce que les champs ci-dessous modifient',
      options: (cc) => clotureDe(cc.obj).portails.map((a, i) => ({ valeur: String(i), libelle: `${a.nature === 'portail' ? 'Portail' : 'Portillon'} ${i + 1} — côté ${a.cote + 1}, à ${fr(a.x)} m` })),
      lire: () => String(accesEnCours),
      ecrire: (_cc, v) => { accesEnCours = Number(v) || 0; },
    },
    { type: 'choix', cle: 'cote', libelle: 'Côté', visible: unAcces, effets: ['inspecteur', ...effets], options: (cc) => pts(cc.obj).map((_, i) => ({ valeur: String(i), libelle: libelleCote(cc.obj, i) })), lire: (cc) => String(acces(cc)?.cote ?? 0), ecrire: (cc, v) => ecrireAcces(cc, (a) => { const cote = Number(v); if (coteValide(pts(cc.obj), cote)) { a.cote = cote; a.x = Math.max(0, Math.min(a.x, longueurDuCote(pts(cc.obj), cote) - a.largeur)); } }) },
    { type: 'nombre', cle: 'x', libelle: 'Position', unite: 'm', pas: 0.1, min: 0, decimales: 2, visible: unAcces, aide: 'Depuis le bord gauche du côté, vu de la rue', note: (cc) => { const a = acces(cc); return a ? `côté de ${fr(longueurDuCote(pts(cc.obj), a.cote))} m` : ''; }, effets, lire: (cc) => acces(cc)?.x ?? 0, ecrire: (cc, v) => { if (!(v >= 0)) return false; ecrireAcces(cc, (a) => { a.x = v; }); } },
    { type: 'nombre', cle: 'largeur', libelle: 'Largeur', unite: 'm', pas: 0.1, min: 0.5, max: 12, decimales: 2, visible: unAcces, effets, lire: (cc) => acces(cc)?.largeur ?? 0, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireAcces(cc, (a) => { a.largeur = v; }); } },
    { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', unite: 'm', pas: 0.1, min: 0.5, max: 4, decimales: 2, visible: unAcces, effets, lire: (cc) => acces(cc)?.hauteur ?? 0, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireAcces(cc, (a) => { a.hauteur = v; }); } },
    { type: 'choix', cle: 'ouverture', libelle: 'Ouverture', visible: unAcces, effets: ['inspecteur', ...effets], options: () => options(LIBELLES_OUVERTURE_PORTAIL), lire: (cc) => acces(cc)?.ouverture ?? 'battant-1', ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.ouverture = v as OuverturePortail; }) },
    { type: 'choix', cle: 'sens', libelle: 'Sens', visible: battant, effets: ['inspecteur', ...effets], options: () => [{ valeur: 'interieur', libelle: 'Vers l’intérieur' }, { valeur: 'exterieur', libelle: 'Vers l’extérieur' }], lire: (cc) => acces(cc)?.sens ?? 'interieur', ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.sens = v as Portail['sens']; }) },
    { type: 'choix', cle: 'petitVantail', libelle: 'Petit vantail', visible: (cc) => actif(cc) && acces(cc)?.ouverture === 'battant-2', aide: 'Deux battants inégaux : le petit fait un tiers de la largeur', effets, options: () => [{ valeur: 'aucun', libelle: 'Aucun (égaux)' }, { valeur: 'gauche', libelle: 'À gauche' }, { valeur: 'droite', libelle: 'À droite' }], lire: (cc) => acces(cc)?.petitVantail ?? 'aucun', ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.petitVantail = v as Portail['petitVantail']; }) },
    { type: 'choix', cle: 'refoulement', libelle: 'Refoulement', visible: (cc) => actif(cc) && acces(cc)?.ouverture === 'coulissant', aide: 'De quel côté le vantail se range, vu de la rue', effets: ['inspecteur', ...effets], options: () => [{ valeur: 'gauche', libelle: 'À gauche' }, { valeur: 'droite', libelle: 'À droite' }], lire: (cc) => acces(cc)?.refoulement ?? 'droite', ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.refoulement = v as Portail['refoulement']; }) },
    { type: 'choix', cle: 'forme', libelle: 'Forme', visible: unAcces, effets: ['inspecteur', ...effets], options: () => options(LIBELLES_FORME_PORTAIL), lire: (cc) => acces(cc)?.forme ?? 'droit', ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.forme = v as FormePortail; }) },
    { type: 'nombre', cle: 'fleche', libelle: 'Flèche', unite: 'm', pas: 0.05, min: 0, max: 1.5, decimales: 2, visible: (cc) => actif(cc) && !!acces(cc) && acces(cc)?.forme !== 'droit', aide: 'Hauteur de la courbe au-dessus de la hauteur du portail', effets, lire: (cc) => acces(cc)?.fleche ?? 0, ecrire: (cc, v) => { if (!(v >= 0)) return false; ecrireAcces(cc, (a) => { a.fleche = v; }); } },
    { type: 'choix', cle: 'remplissage', libelle: 'Remplissage', visible: unAcces, effets, options: () => options(LIBELLES_REMPLISSAGE), lire: (cc) => acces(cc)?.remplissage ?? 'plein', ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.remplissage = v as RemplissagePortail; }) },
    { type: 'choix', cle: 'materiau', libelle: 'Matériau', visible: unAcces, effets: ['inspecteur', ...effets], options: () => options(LIBELLES_MATERIAU_PORTAIL), lire: (cc) => acces(cc)?.materiau ?? 'aluminium', ecrire: (cc, v) => ecrireAcces(cc, (a) => { const m = v as MateriauPortail; if (a.couleur === COULEUR_PAR_MATERIAU[a.materiau]) a.couleur = COULEUR_PAR_MATERIAU[m]; a.materiau = m; }) },
    { type: 'couleur', cle: 'couleur', libelle: 'Couleur', visible: unAcces, effets, lire: (cc) => acces(cc)?.couleur ?? COULEUR_PAR_MATERIAU.aluminium, ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.couleur = v; }) },
    { type: 'texture', cle: 'texture', libelle: 'Texture', visible: unAcces, effets: ['inspecteur', ...effets], lire: (cc) => acces(cc)?.texture, ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.texture = v; }) },
    { type: 'case', cle: 'piliers', libelle: 'Piliers', visible: unAcces, aide: 'Un pilier de part et d’autre du passage', effets: ['inspecteur', ...effets], lire: (cc) => !!acces(cc)?.piliers, ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.piliers = v ? (a.piliers || { largeur: 0.3, hauteur: Math.max(a.hauteur + 0.2, 1.8), parement: 'enduit', chapeau: true }) : null; }) },
    { type: 'nombre', cle: 'pilierLargeur', libelle: 'Largeur des piliers', unite: 'm', pas: 0.05, min: 0.1, max: 1.5, decimales: 2, visible: avecPiliers, effets, lire: (cc) => acces(cc)?.piliers?.largeur ?? 0.3, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireAcces(cc, (a) => { if (a.piliers) a.piliers.largeur = v; }); } },
    { type: 'nombre', cle: 'pilierHauteur', libelle: 'Hauteur des piliers', unite: 'm', pas: 0.1, min: 0.3, max: 5, decimales: 2, visible: avecPiliers, effets, lire: (cc) => acces(cc)?.piliers?.hauteur ?? 1.8, ecrire: (cc, v) => { if (!(v > 0)) return false; ecrireAcces(cc, (a) => { if (a.piliers) a.piliers.hauteur = v; }); } },
    { type: 'choix', cle: 'pilierParement', libelle: 'Parement des piliers', visible: avecPiliers, effets, options: () => options(LIBELLES_PAREMENT), lire: (cc) => acces(cc)?.piliers?.parement ?? 'enduit', ecrire: (cc, v) => ecrireAcces(cc, (a) => { if (a.piliers) a.piliers.parement = v as ParementMur; }) },
    { type: 'couleur', cle: 'pilierCouleur', libelle: 'Couleur des piliers', visible: avecPiliers, effets, lire: (cc) => acces(cc)?.piliers?.couleur || DEFAUTS_PAR_TYPE.mur.couleur || COULEUR_CLOTURE_DEFAUT, ecrire: (cc, v) => ecrireAcces(cc, (a) => { if (a.piliers) a.piliers.couleur = v; }) },
    { type: 'case', cle: 'pilierChapeau', libelle: 'Chapeau de pilier', visible: avecPiliers, effets, lire: (cc) => !!acces(cc)?.piliers?.chapeau, ecrire: (cc, v) => ecrireAcces(cc, (a) => { if (a.piliers) a.piliers.chapeau = v; }) },
    { type: 'nombre', cle: 'retrait', libelle: 'Retrait', unite: 'm', pas: 0.5, min: 0, max: 15, decimales: 2, visible: unAcces, aide: 'Recul depuis l’alignement, pour garer une voiture hors de la chaussée', effets, lire: (cc) => acces(cc)?.retrait ?? 0, ecrire: (cc, v) => { if (!(v >= 0)) return false; ecrireAcces(cc, (a) => { a.retrait = v; }); } },
    { type: 'case', cle: 'motorise', libelle: 'Motorisé', visible: unAcces, effets: ['inspecteur'], lire: (cc) => !!acces(cc)?.motorise, ecrire: (cc, v) => ecrireAcces(cc, (a) => { a.motorise = v; }) },
    // Reglage d'affichage, comme « Filaire » : ni annulation, ni « projet modifie », mais range dans
    // l'acces pour etre retrouve a la reouverture.
    { type: 'case', cle: 'ouvert', libelle: 'Montrer ouvert', visible: unAcces, sale: false, aide: 'Vantaux ouverts sur le plan et en 3D', effets, lire: (cc) => !!acces(cc)?.ouvert, ecrire: (cc, v) => { const a = acces(cc); if (a) a.ouvert = v; } },
    { type: 'bouton', cle: 'accolerGauche', libelle: 'Accoler au portail', texte: () => 'À sa gauche', visible: (cc) => actif(cc) && acces(cc)?.nature === 'portillon', actif: (cc) => clotureDe(cc.obj).portails.some(a => a.nature === 'portail' && a.cote === acces(cc)?.cote), aide: 'Coller le portillon contre le portail le plus proche de ce côté, à sa gauche vu de la rue', agit: 'projet', executer: (cc) => { ecrireAcces(cc, (a) => { accolerPortillon(clotureDe(cc.obj), a, 'gauche'); }); cc.render(); } },
    { type: 'bouton', cle: 'accolerDroite', libelle: '', nom: 'Accoler au portail, à sa droite', texte: () => 'À sa droite', visible: (cc) => actif(cc) && acces(cc)?.nature === 'portillon', actif: (cc) => clotureDe(cc.obj).portails.some(a => a.nature === 'portail' && a.cote === acces(cc)?.cote), aide: 'Coller le portillon contre le portail le plus proche de ce côté, à sa droite vu de la rue', agit: 'projet', executer: (cc) => { ecrireAcces(cc, (a) => { accolerPortillon(clotureDe(cc.obj), a, 'droite'); }); cc.render(); } },
    { type: 'alerte', cle: 'alertes', libelle: '', nom: 'Alertes de l’accès', visible: (cc) => { const a = acces(cc); return unAcces(cc) && !!a && alertesAcces(clotureDe(cc.obj), a, longueurDuCote(pts(cc.obj), a.cote)).length > 0; }, texte: (cc) => { const a = acces(cc); return a ? alertesAcces(clotureDe(cc.obj), a, longueurDuCote(pts(cc.obj), a.cote)).join(' ') : ''; } },
  );
  return { id: 'portails', titre: 'Portails et portillons', repliee: !clotureDe(o).portails.length, champs };
}

/** Les deux sections, sur la parcelle du projet seulement. */
export function sectionsCloture(c: ContexteChamps): Section[] {
  if (!estParcellePrincipale(c)) return [];
  return [sectionCloture(c), sectionPortails(c)];
}
