// Les sections de l'inspecteur pour une pergola (ui/champs/).
//
// Deux sections : « Pergola », les reglages (toit, hauteur, sections, entraxes, couleurs), et
// « Metrage par section », ce que le moteur en tire (engine/pergola.ts) : pour chaque section de
// bois, les pieces qu'on y taille, les metres lineaires et les barres a acheter, debitees dans les
// longueurs achetables comme les lames d'une terrasse. Les reglages ne sont ecrits dans l'objet que
// lorsqu'on les touche : `pergolaDe` comble le reste a la lecture.

import {
  calculerPergola, LIBELLE_ROLE, LIBELLE_TOIT_PERGOLA, libelleSection, longueursPergola, metrageParSection, pergolaDe,
  SECTIONS_CHEVRON, SECTIONS_CONTREFICHE, SECTIONS_POTEAU, SECTIONS_POUTRE, type MetrageSection, type ReglagesPergola, type RolePiece
} from '../../engine/pergola.js';
import type { Pergola, ToitPergola } from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

const EFFETS: Effet[] = ['rendu', 'scene3d', 'inspecteur'];

const reglages = (c: ContexteChamps): ReglagesPergola => pergolaDe(c.obj);
/** Ecrit un reglage dans l'objet, en creant `pergola` au premier reglage touche. */
function poser<K extends keyof Pergola>(c: ContexteChamps, cle: K, v: Pergola[K]): void {
  c.obj.pergola = { ...(c.obj.pergola || {}), [cle]: v };
}

const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
const options = (liste: string[]) => () => liste.map(s => ({ valeur: s, libelle: libelleSection(s) }));
const toitEst = (...t: ToitPergola[]) => (c: ContexteChamps) => t.includes(reglages(c).toit);

function choixSection(cle: 'sectionPoteau' | 'sectionPoutre' | 'sectionContrefiche' | 'sectionChevron', libelle: string, liste: string[], aide: string, visible?: (c: ContexteChamps) => boolean): Champ {
  return {
    type: 'choix', cle, libelle, aide, effets: EFFETS, ...(visible ? { visible } : {}),
    // La section en place reste proposee, meme hors de la liste (un ancien fichier).
    options: (c) => { const v = reglages(c)[cle]; return options(liste.includes(v) ? liste : [v, ...liste])(); },
    lire: (c) => reglages(c)[cle], ecrire: (c, v) => poser(c, cle, v)
  };
}

const sectionPergola: Section = {
  id: 'pergola', titre: 'Pergola',
  explication: 'Le contour est le nu extérieur des poteaux : un poteau à chaque coin, des poteaux intermédiaires selon l\'entraxe, une poutre sur chaque côté.',
  champs: [
    {
      type: 'choix', cle: 'toit', libelle: 'Toit', effets: EFFETS,
      options: () => (Object.keys(LIBELLE_TOIT_PERGOLA) as ToitPergola[]).map(t => ({ valeur: t, libelle: LIBELLE_TOIT_PERGOLA[t] })),
      lire: (c) => reglages(c).toit,
      // La pente suit le toit tant qu'on ne l'a pas reglee : celle d'un appentis n'est pas celle de quatre pans.
      ecrire: (c, v) => { const p: Pergola = { ...(c.obj.pergola || {}), toit: v as ToitPergola }; delete p.pente; c.obj.pergola = p; }
    },
    {
      type: 'nombre', cle: 'hauteur', libelle: 'Hauteur des poteaux', unite: 'm', pas: 0.05, min: 1.8, max: 4, decimales: 2, effets: EFFETS,
      aide: 'Du sol au-dessous des poutres ; en appentis, la hauteur du côté bas',
      lire: (c) => reglages(c).hauteur, ecrire: (c, v) => { if (!(v >= 1.8 && v <= 4)) return false; poser(c, 'hauteur', v); }
    },
    {
      type: 'choix', cle: 'coteReference', libelle: 'Côté de référence', effets: EFFETS,
      aide: 'Les chevrons lui sont perpendiculaires ; c\'est le côté bas d\'un appentis, et il oriente le faîtage d\'un toit à quatre pans',
      options: (c) => c.obj.type === 'polygon' ? c.obj.pts.map((_, i) => ({ valeur: String(i), libelle: c.obj.segmentNames?.[i] || ('Côté ' + (i + 1)) })) : [],
      lire: (c) => String(reglages(c).coteReference), ecrire: (c, v) => poser(c, 'coteReference', parseInt(v, 10) || 0)
    },
    {
      type: 'nombre', cle: 'pente', libelle: 'Pente', unite: '°', pas: 1, min: 2, max: 45, decimales: 0, effets: EFFETS, visible: toitEst('appentis', 'quatre-pans'),
      lire: (c) => reglages(c).pente, ecrire: (c, v) => { if (!(v >= 2 && v <= 45)) return false; poser(c, 'pente', v); }
    },
    choixSection('sectionPoteau', 'Poteaux', SECTIONS_POTEAU, 'Section des poteaux, largeur × épaisseur'),
    {
      type: 'nombre', cle: 'entraxePoteaux', libelle: 'Entraxe maximal', unite: 'm', pas: 0.1, min: 1, max: 6, decimales: 1, effets: EFFETS,
      aide: 'Au-delà, un poteau intermédiaire coupe le côté en travées égales',
      lire: (c) => reglages(c).entraxePoteaux, ecrire: (c, v) => { if (!(v >= 1 && v <= 6)) return false; poser(c, 'entraxePoteaux', v); }
    },
    choixSection('sectionPoutre', 'Poutres du cadre', SECTIONS_POUTRE, 'Section des poutres posées sur les poteaux, et du faîtage et des arêtiers d\'un toit à quatre pans'),
    {
      type: 'case', cle: 'avecContrefiches', libelle: 'Contrefiches', effets: EFFETS,
      aide: 'Une contrefiche à 45° de chaque poteau vers chaque poutre qu\'il porte : elles contreventent la pergola',
      lire: (c) => reglages(c).avecContrefiches, ecrire: (c, v) => poser(c, 'avecContrefiches', v)
    },
    {
      type: 'nombre', cle: 'longueurContrefiche', libelle: 'Longueur', unite: 'm', pas: 0.05, min: 0.3, max: 1.5, decimales: 2, effets: EFFETS,
      visible: (c) => reglages(c).avecContrefiches,
      lire: (c) => reglages(c).longueurContrefiche, ecrire: (c, v) => { if (!(v >= 0.3 && v <= 1.5)) return false; poser(c, 'longueurContrefiche', v); }
    },
    choixSection('sectionContrefiche', 'Section des contrefiches', SECTIONS_CONTREFICHE, 'Section des contrefiches', (c) => reglages(c).avecContrefiches),
    choixSection('sectionChevron', 'Chevrons', SECTIONS_CHEVRON, 'Section des chevrons, largeur × hauteur, posés sur chant'),
    {
      type: 'nombre', cle: 'entraxeChevrons', libelle: 'Entraxe des chevrons', unite: 'cm', pas: 5, min: 20, max: 150, decimales: 0, effets: EFFETS,
      lire: (c) => Math.round(reglages(c).entraxeChevrons * 100), ecrire: (c, v) => { if (!(v >= 20 && v <= 150)) return false; poser(c, 'entraxeChevrons', v / 100); }
    },
    { type: 'couleur', cle: 'couleurBois', libelle: 'Couleur du bois', effets: ['scene3d'], lire: (c) => reglages(c).couleurBois, ecrire: (c, v) => poser(c, 'couleurBois', v) },
    { type: 'couleur', cle: 'couleurToile', libelle: 'Couleur de la toile', effets: ['scene3d'], visible: toitEst('toile'), lire: (c) => reglages(c).couleurToile, ecrire: (c, v) => poser(c, 'couleurToile', v) },
    { type: 'couleur', cle: 'couleurCouverture', libelle: 'Couleur de la couverture', effets: ['scene3d'], visible: toitEst('appentis', 'quatre-pans'), lire: (c) => reglages(c).couleurCouverture, ecrire: (c, v) => poser(c, 'couleurCouverture', v) },
    {
      type: 'texte', cle: 'longueursBois', libelle: 'Longueurs achetables', placeholder: '6, 5, 4, 3, 2.5', effets: ['inspecteur'],
      aide: 'Les longueurs de bois vendues, en mètres : le métrage débite chaque section dedans',
      lire: (c) => longueursPergola(reglages(c)).join(', '), ecrire: (c, v) => poser(c, 'longueursBois', v)
    }
  ]
};

/** `'4 poteaux, 8 contrefiches'`. */
function pieces(m: MetrageSection): string {
  return (Object.entries(m.roles) as [RolePiece, number][])
    .map(([r, n]) => n + ' ' + LIBELLE_ROLE[r][n > 1 ? 1 : 0]).join(', ');
}

/** `'4 × 3 m + 2 × 2,5 m'`, des plus longues aux plus courtes. */
function achats(m: MetrageSection): string {
  return Object.entries(m.debit.achats).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
    .map(([L, n]) => n + ' × ' + fr(parseFloat(L), parseFloat(L) % 1 ? 1 : 0) + ' m').join(' + ');
}

/** Le metrage, une ligne par section de bois : la liste depend de la pergola, la section aussi. */
export function sectionMetragePergola(c: ContexteChamps): Section {
  const calc = calculerPergola(c.obj);
  const champs: Champ[] = [];
  if (calc) {
    metrageParSection(calc).forEach(m => champs.push({
      type: 'lecture', cle: 'metrage-' + m.section, libelle: libelleSection(m.section),
      valeur: () => pieces(m) + ' · ' + fr(m.ml) + ' ml · acheter ' + achats(m) + ' (' + fr(m.debit.achatMl) + ' ml, chute ' + fr(m.debit.chuteMl) + ' m)'
    }));
    const toile = calc.reglages.toit === 'toile';
    champs.push({ type: 'lecture', cle: 'metrage-couverture', libelle: toile ? 'Toile' : 'Couverture', valeur: () => fr(calc.surfaceCouverture) + ' m²' + (toile ? '' : ', pente comprise') });
    calc.avertissements.forEach((t, i) => champs.push({ type: 'alerte', cle: 'metrage-alerte-' + i, libelle: '', nom: 'Alerte : ' + t, texte: () => t }));
  } else {
    champs.push({ type: 'alerte', cle: 'metrage-vide', libelle: '', nom: 'Alerte : contour inutilisable', texte: () => 'Le contour doit avoir au moins trois coins et une surface pour calculer la pergola.' });
  }
  return {
    id: 'metragePergola', titre: 'Métrage par section',
    explication: 'Pièces regroupées par section de bois, débitées dans les longueurs achetables, sans aboutage.',
    champs
  };
}

/** Les sections propres a une pergola, dans l'ordre. */
export function sectionsPergola(c: ContexteChamps): Section[] {
  return [sectionPergola, sectionMetragePergola(c)];
}
