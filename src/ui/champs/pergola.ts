// Les sections de l'inspecteur pour une pergola (ui/champs/).
//
// Les reglages, dans l'inspecteur, en trois groupes comme ceux d'une terrasse, dans l'ordre ou l'on decide (audit de
// l'inspecteur, decision B2 ; un seul bloc de dix-sept lignes jusque-la) : la forme et le toit (matiere, toit, hauteur, pente,
// mur, debord), la structure (poteaux, poutres, puis contrefiches, chevrons et longueurs achetables, du mode expert), les
// couleurs. Puis « Metrage et chiffrage », ce que le moteur en tire
// (engine/abri/pergola.ts) : pour chaque section, les pieces qu'on y taille, les metres lineaires, les
// barres a acheter et leur cout, debitees dans les longueurs achetables comme les lames d'une
// terrasse ; et « Prix », les prix unitaires. Ces deux dernieres sections sont des resultats : elles se
// montrent dans l'onglet de l'abri du tiroir. Les reglages ne sont ecrits dans l'objet que lorsqu'on les touche :
// `pergolaDe` comble le reste a la lecture.

import {
  calculerPergola, chiffrerPergola, libelleAbri, clePrixPergola, LIBELLE_MATERIAU, LIBELLE_ROLE, LIBELLE_TOIT_PERGOLA, libelleSection,
  longueursPergola, MATERIAUX, materiauPergolaInconnu, metrageParSection, pergolaDe, prixMlDe, prixMlSaisi, SECTIONS_CONTREFICHE, toitPergolaInconnu,
  type MetrageSection, type ReglagesPergola, type RolePiece
} from '../../engine/abri/pergola.js';
import { solDuProjet } from '../../engine/sol.js';
import { euros } from '../chiffrage.js';
import { noteDeCalcul } from '../../engine/abri/noteCalcul.js';
import { sectionNoteCalcul } from './noteCalcul.js';
import type { MateriauPergola, ObjetPlan, Pergola, ToitPergola } from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';
import { nomDuCote } from '../nomCote.js';

const EFFETS: Effet[] = ['rendu', 'scene3d', 'inspecteur'];

const reglages = (c: ContexteChamps): ReglagesPergola => pergolaDe(c.obj);
/** Ecrit un reglage dans l'objet, en creant `pergola` au premier reglage touche. */
function poser<K extends keyof Pergola>(c: ContexteChamps, cle: K, v: Pergola[K]): void {
  c.obj.pergola = { ...(c.obj.pergola || {}), [cle]: v };
}

const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
/** L'option d'un mot hors catalogue, pour qu'une liste le montre tel quel au lieu du repli. */
const inconnu = (mot: string | null, libelle: (mot: string) => string) => (mot === null ? [] : [{ valeur: mot, libelle: libelle(mot) }]);
const toitEst = (...t: ToitPergola[]) => (c: ContexteChamps) => t.includes(reglages(c).toit);
const enBois = (c: ContexteChamps) => reglages(c).materiau === 'bois';
const cotes = (c: ContexteChamps) => c.obj.type === 'polygon' ? c.obj.pts.map((_, i) => ({ valeur: String(i), libelle: nomDuCote(c.obj.segmentNames?.[i], i) })) : [];

type CleSection = 'sectionPoteau' | 'sectionPoutre' | 'sectionContrefiche' | 'sectionChevron';
function choixSection(cle: CleSection, libelle: string, liste: (c: ContexteChamps) => string[], aide: string, visible?: (c: ContexteChamps) => boolean): Champ {
  return {
    type: 'choix', cle, libelle, aide, effets: EFFETS, ...(visible ? { visible } : {}),
    // La section en place reste proposee, meme hors de la liste (un ancien fichier).
    options: (c) => { const v = reglages(c)[cle], l = liste(c); return (l.includes(v) ? l : [v, ...l]).map(s => ({ valeur: s, libelle: libelleSection(s) })); },
    lire: (c) => reglages(c)[cle], ecrire: (c, v) => poser(c, cle, v)
  };
}

/**
 * Le projet porte-t-il pour ce reglage une valeur qui n'est pas celle par defaut ? Lue comme le moteur la lit (`pergolaDe`), avec
 * et sans la valeur ecrite : la valeur par defaut depend de la matiere et de l'ouvrage.
 */
const regle = (cle: keyof Pergola & keyof ReglagesPergola) => (c: ContexteChamps): boolean => {
  const p = c.obj.pergola;
  if (!p || p[cle] === undefined) return false;
  const sans: Pergola = { ...p };
  delete sans[cle];
  return JSON.stringify(pergolaDe({ ...c.obj, pergola: sans } as ObjetPlan)[cle]) !== JSON.stringify(reglages(c)[cle]);
};

/** Ce que les alertes de l'abri disent, calcule une fois par rendu : les pieces insuffisantes de la note, les avertissements du metrage. */
const diagnostics = new WeakMap<ContexteChamps, { insuffisants: Set<RolePiece>; avertissements: string[] }>();
function diagnostic(c: ContexteChamps) {
  let d = diagnostics.get(c);
  if (!d) {
    d = {
      insuffisants: new Set((noteDeCalcul(c.obj)?.verifs ?? []).filter(v => v.taux > 1).map(v => v.role)),
      avertissements: calculerPergola(c.obj, solDuProjet(c.objets))?.avertissements ?? []
    };
    diagnostics.set(c, d);
  }
  return d;
}
/** La note de calcul juge ces pieces insuffisantes : son alerte demande d'en changer la section ou l'entraxe. */
const insuffisant = (...roles: RolePiece[]) => (c: ContexteChamps) => roles.some(r => diagnostic(c).insuffisants.has(r));
/** Le metrage avertit a ce sujet (contrefiches trop longues, poutre plus longue que les longueurs achetables). */
const averti = (motif: RegExp) => (c: ContexteChamps) => diagnostic(c).avertissements.some(t => motif.test(t));
const ou = (...f: ((c: ContexteChamps) => boolean)[]) => (c: ContexteChamps) => f.some(x => x(c));

/**
 * Les reglages du mode expert (audit de l'inspecteur, decision B1) : ce qui regle la charpente plutot que l'ouvrage. Caches, ils
 * gardent leur valeur et le calcul la lit ; chacun reste montre tant que le projet en porte une valeur reglee, ou qu'une alerte
 * (note de calcul, metrage) demande d'y toucher.
 */
const AVANCES: Record<string, (c: ContexteChamps) => boolean> = {
  avecContrefiches: ou(regle('avecContrefiches'), insuffisant('contrefiche'), averti(/contrefiche/i)),
  longueurContrefiche: ou(regle('longueurContrefiche'), insuffisant('contrefiche'), averti(/contrefiche/i)),
  sectionContrefiche: ou(regle('sectionContrefiche'), insuffisant('contrefiche')),
  sectionChevron: ou(regle('sectionChevron'), insuffisant('chevron')),
  entraxeChevrons: ou(regle('entraxeChevrons'), insuffisant('chevron')),
  longueursBois: ou(regle('longueursBois'), averti(/longueur achetable/i))
};
const avances = (champs: Champ[]): Champ[] => champs.map(ch => { const resteMontre = AVANCES[ch.cle]; return resteMontre ? { ...ch, expert: true, resteMontre } : ch; });

/** Les trois groupes, par cle de reglage, dans l'ordre ou chacun se montre. */
const FORME = ['materiau', 'toit', 'hauteur', 'coteReference', 'pente', 'adossee', 'coteMur', 'debord'];
const STRUCTURE = ['sectionPoteau', 'entraxePoteaux', 'sectionPoutre', 'avecContrefiches', 'longueurContrefiche', 'sectionContrefiche', 'sectionChevron', 'entraxeChevrons', 'longueursBois'];
const COULEURS = ['couleurBois', 'couleurToile', 'couleurCouverture'];

/** Tous les reglages d'un abri ; `sectionsPergola` les range en trois groupes. */
const CHAMPS_PERGOLA: Champ[] = avances([
    {
      type: 'choix', cle: 'materiau', libelle: 'Matériau', effets: EFFETS,
      aide: 'Bois : poteaux, poutres et contrefiches. Aluminium : profilés thermolaqués, sans contrefiches',
      // Un mot hors catalogue (fichier d'une version plus recente) reste dans le fichier et se calcule en bois
      // (pergolaDe) : la liste le montre tel quel, plutot que « Bois » pour un choix qui n'en est pas un.
      options: (c) => [
        ...(Object.keys(LIBELLE_MATERIAU) as MateriauPergola[]).map(m => ({ valeur: m, libelle: LIBELLE_MATERIAU[m] })),
        ...inconnu(materiauPergolaInconnu(c.obj), (m) => 'Matériau inconnu (« ' + m + ' »), calculé en bois'),
      ],
      lire: (c) => materiauPergolaInconnu(c.obj) ?? reglages(c).materiau,
      // Les sections, les longueurs vendues et la couleur sont propres a la matiere : elles
      // reprennent celles de la nouvelle. Les prix saisis restent, ranges par matiere.
      ecrire: (c, v) => {
        if (v === materiauPergolaInconnu(c.obj)) return; // le mot inconnu repris tel quel reste dans le fichier
        const p: Pergola = { ...(c.obj.pergola || {}), materiau: v as MateriauPergola };
        delete p.sectionPoteau; delete p.sectionPoutre; delete p.sectionChevron; delete p.longueursBois; delete p.couleurBois;
        c.obj.pergola = p;
      }
    },
    {
      type: 'choix', cle: 'toit', libelle: 'Toit', effets: EFFETS,
      aide: 'La couverture : une toile sur des chevrons, un toit à une seule pente (appentis) ou un toit à quatre pans',
      options: (c) => [
        ...(Object.keys(LIBELLE_TOIT_PERGOLA) as ToitPergola[]).map(t => ({ valeur: t, libelle: LIBELLE_TOIT_PERGOLA[t] })),
        ...inconnu(toitPergolaInconnu(c.obj), (t) => 'Toit inconnu (« ' + t + ' »), calculé en ' + LIBELLE_TOIT_PERGOLA[reglages(c).toit].toLowerCase()),
      ],
      lire: (c) => toitPergolaInconnu(c.obj) ?? reglages(c).toit,
      // La pente suit le toit tant qu'on ne l'a pas reglee : celle d'un appentis n'est pas celle de quatre pans.
      ecrire: (c, v) => { if (v === toitPergolaInconnu(c.obj)) return; const p: Pergola = { ...(c.obj.pergola || {}), toit: v as ToitPergola }; delete p.pente; c.obj.pergola = p; }
    },
    {
      type: 'nombre', cle: 'hauteur', libelle: 'Hauteur des poteaux', unite: 'm', pas: 0.05, min: 1.8, max: 4, decimales: 2, effets: EFFETS,
      aide: 'Du sol au-dessous des poutres ; en appentis, la hauteur du côté bas. Pour un carport, 2,20 m de passage libre au moins',
      lire: (c) => reglages(c).hauteur, ecrire: (c, v) => { if (!(v >= 1.8 && v <= 4)) return false; poser(c, 'hauteur', v); }
    },
    {
      type: 'choix', cle: 'coteReference', libelle: 'Côté de référence', effets: EFFETS,
      aide: 'Les chevrons lui sont perpendiculaires ; c\'est le côté bas d\'un appentis, et il oriente le faîtage d\'un toit à quatre pans',
      options: cotes,
      lire: (c) => String(reglages(c).coteReference), ecrire: (c, v) => poser(c, 'coteReference', parseInt(v, 10) || 0)
    },
    {
      type: 'nombre', cle: 'pente', libelle: 'Pente', unite: '°', pas: 1, min: 2, max: 45, decimales: 0, effets: EFFETS, visible: toitEst('appentis', 'quatre-pans'),
      aide: 'Inclinaison du toit par rapport à l’horizontale : plus elle est forte, mieux l’eau s’écoule et plus le toit monte',
      lire: (c) => reglages(c).pente, ecrire: (c, v) => { if (!(v >= 2 && v <= 45)) return false; poser(c, 'pente', v); }
    },
    {
      type: 'case', cle: 'adossee', libelle: 'Adossée à un mur', effets: EFFETS, visible: toitEst('toile', 'appentis'),
      aide: 'Pas de poteaux le long du mur : une lisse murale y porte le cadre, et le toit ne déborde pas de ce côté',
      lire: (c) => reglages(c).adossee, ecrire: (c, v) => poser(c, 'adossee', v)
    },
    {
      type: 'choix', cle: 'coteMur', libelle: 'Côté du mur', effets: EFFETS, visible: (c) => reglages(c).adossee,
      aide: 'En appentis, le mur est en haut de la pente : en face du côté de référence',
      options: cotes,
      lire: (c) => String(reglages(c).coteMur), ecrire: (c, v) => poser(c, 'coteMur', parseInt(v, 10) || 0)
    },
    {
      type: 'nombre', cle: 'debord', libelle: 'Débord du toit', unite: 'cm', pas: 5, min: 0, max: 100, decimales: 0, effets: EFFETS,
      aide: 'Au-delà du nu des poteaux : les poutres se prolongent d\'autant, et les chevrons avec elles',
      lire: (c) => Math.round(reglages(c).debord * 100), ecrire: (c, v) => { if (!(v >= 0 && v <= 100)) return false; poser(c, 'debord', v / 100); }
    },
    choixSection('sectionPoteau', 'Poteaux', (c) => MATERIAUX[reglages(c).materiau].poteaux, 'Section des poteaux, largeur × épaisseur'),
    {
      type: 'nombre', cle: 'entraxePoteaux', libelle: 'Entraxe maximal', unite: 'm', pas: 0.1, min: 1, max: 6, decimales: 1, effets: EFFETS,
      aide: 'Au-delà, un poteau intermédiaire coupe le côté en travées égales',
      lire: (c) => reglages(c).entraxePoteaux, ecrire: (c, v) => { if (!(v >= 1 && v <= 6)) return false; poser(c, 'entraxePoteaux', v); }
    },
    choixSection('sectionPoutre', 'Poutres du cadre', (c) => MATERIAUX[reglages(c).materiau].poutres, 'Section des poutres posées sur les poteaux, de la lisse murale, et du faîtage et des arêtiers d\'un toit à quatre pans'),
    {
      type: 'case', cle: 'avecContrefiches', libelle: 'Contrefiches', effets: EFFETS, visible: enBois,
      aide: 'Une contrefiche à 45° de chaque poteau vers chaque poutre qu\'il porte : elles contreventent la pergola',
      lire: (c) => reglages(c).avecContrefiches, ecrire: (c, v) => poser(c, 'avecContrefiches', v)
    },
    {
      type: 'nombre', cle: 'longueurContrefiche', libelle: 'Longueur', unite: 'm', pas: 0.05, min: 0.3, max: 1.5, decimales: 2, effets: EFFETS,
      aide: 'Longueur de chaque contrefiche, la pièce en biais entre un poteau et une poutre',
      visible: (c) => reglages(c).avecContrefiches,
      lire: (c) => reglages(c).longueurContrefiche, ecrire: (c, v) => { if (!(v >= 0.3 && v <= 1.5)) return false; poser(c, 'longueurContrefiche', v); }
    },
    choixSection('sectionContrefiche', 'Section des contrefiches', () => SECTIONS_CONTREFICHE, 'Section des contrefiches', (c) => reglages(c).avecContrefiches),
    choixSection('sectionChevron', 'Chevrons', (c) => MATERIAUX[reglages(c).materiau].chevrons, 'Section des chevrons, largeur × hauteur, posés sur chant'),
    {
      type: 'nombre', cle: 'entraxeChevrons', libelle: 'Entraxe des chevrons', unite: 'cm', pas: 5, min: 20, max: 150, decimales: 0, effets: EFFETS,
      aide: 'Distance entre deux chevrons, d’axe en axe : plus ils sont serrés, mieux le toit est porté, et plus il faut de pièces',
      lire: (c) => Math.round(reglages(c).entraxeChevrons * 100), ecrire: (c, v) => { if (!(v >= 20 && v <= 150)) return false; poser(c, 'entraxeChevrons', v / 100); }
    },
    { type: 'couleur', cle: 'couleurBois', libelle: 'Couleur de la structure', aide: 'Couleur des poteaux, des poutres et des chevrons en Vue 3D', effets: ['scene3d'], lire: (c) => reglages(c).couleurBois, ecrire: (c, v) => poser(c, 'couleurBois', v) },
    { type: 'couleur', cle: 'couleurToile', libelle: 'Couleur de la toile', aide: 'Couleur de la toile en Vue 3D', effets: ['scene3d'], visible: toitEst('toile'), lire: (c) => reglages(c).couleurToile, ecrire: (c, v) => poser(c, 'couleurToile', v) },
    { type: 'couleur', cle: 'couleurCouverture', libelle: 'Couleur de la couverture', aide: 'Couleur du toit en Vue 3D', effets: ['scene3d'], visible: toitEst('appentis', 'quatre-pans'), lire: (c) => reglages(c).couleurCouverture, ecrire: (c, v) => poser(c, 'couleurCouverture', v) },
    {
      type: 'texte', cle: 'longueursBois', libelle: 'Longueurs achetables', placeholder: '6, 5, 4, 3', effets: ['inspecteur'],
      aide: 'Les longueurs vendues (bois ou profilés), en mètres : le métrage débite chaque section dedans',
      lire: (c) => longueursPergola(reglages(c)).join(', '), ecrire: (c, v) => poser(c, 'longueursBois', v)
    }
]);

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

/** Le metrage et le chiffrage, une ligne par section : la liste depend de la pergola, la section aussi. */
export function sectionMetragePergola(c: ContexteChamps): Section {
  const calc = calculerPergola(c.obj, solDuProjet(c.objets));
  const champs: Champ[] = [];
  if (calc) {
    const metrage = metrageParSection(calc);
    const chiffrage = chiffrerPergola(calc, metrage);
    metrage.forEach((m, i) => champs.push({
      type: 'lecture', cle: 'metrage-' + m.section, libelle: libelleSection(m.section),
      valeur: () => pieces(m) + ' · ' + fr(m.ml) + ' ml · acheter ' + achats(m) + ' (' + fr(m.debit.achatMl) + ' ml, chute ' + fr(m.debit.chuteMl) + ' m) · ' + euros(chiffrage.sections[i]?.montant ?? 0)
    }));
    const toile = calc.reglages.toit === 'toile';
    champs.push({
      type: 'lecture', cle: 'metrage-couverture', libelle: toile ? 'Toile' : 'Couverture',
      valeur: () => fr(calc.surfaceCouverture) + ' m²' + (toile ? '' : ', pente comprise') + ' · ' + euros(chiffrage.couverture.montant)
    });
    champs.push({
      type: 'lecture', cle: 'metrage-total', libelle: 'Total fourniture',
      valeur: () => euros(chiffrage.total) + ' TTC, hors pose et quincaillerie'
    });
    // Le relief lu (MD/spec-relief.md §6) : les poteaux d'aval sont plus longs, et la hauteur
    // reglementaire se mesure depuis le point bas du terrain naturel.
    const solSous = calc.sol;
    if (solSous) champs.push({
      type: 'lecture', cle: 'metrage-sol', libelle: 'Sol en pente',
      valeur: () => 'poutres de niveau sur le point haut (+' + fr(solSous.zHaut) + ' m) ; sol de ' + fr(solSous.zBas) + ' à ' + fr(solSous.zHaut) + ' m ; hauteur réglementaire ' + fr(calc.hauteurReglementaire) + ' m depuis le point bas'
    });
    calc.avertissements.forEach((t, i) => champs.push({ type: 'alerte', cle: 'metrage-alerte-' + i, libelle: '', nom: 'Alerte : ' + t, texte: () => t }));
  } else {
    champs.push({ type: 'alerte', cle: 'metrage-vide', libelle: '', nom: 'Alerte : contour inutilisable', texte: () => 'Le contour doit avoir au moins trois coins et une surface pour calculer la pergola.' });
  }
  return {
    id: 'metragePergola', titre: 'Métrage et chiffrage',
    explication: 'Pièces regroupées par section, débitées dans les longueurs achetables, sans aboutage ; les barres sont comptées entières, chutes comprises.',
    champs
  };
}

/** Les prix unitaires : un par section en place, et celui de la toile ou de la couverture. */
export function sectionPrixPergola(c: ContexteChamps): Section {
  const calc = calculerPergola(c.obj, solDuProjet(c.objets));
  const champs: Champ[] = [];
  if (calc) {
    metrageParSection(calc).forEach(m => champs.push({
      type: 'nombre', cle: 'prix-' + m.section, libelle: libelleSection(m.section), unite: '€/ml', pas: 1, min: 0, decimales: 2, effets: ['inspecteur'],
      note: (cx) => prixMlSaisi(reglages(cx), m.section) ? 'saisi' : 'prix indicatif',
      lire: (cx) => prixMlDe(reglages(cx), m.section),
      ecrire: (cx, v) => { if (!(v >= 0)) return false; poser(cx, 'prixMl', { ...reglages(cx).prixMl, [clePrixPergola(reglages(cx), m.section)]: v }); }
    }));
    const toile = calc.reglages.toit === 'toile';
    champs.push(toile
      ? { type: 'nombre', cle: 'prixToile', libelle: 'Toile', unite: '€/m²', pas: 1, min: 0, decimales: 2, effets: ['inspecteur'], lire: (cx) => reglages(cx).prixToile, ecrire: (cx, v) => { if (!(v >= 0)) return false; poser(cx, 'prixToile', v); } }
      : { type: 'nombre', cle: 'prixCouverture', libelle: 'Couverture', unite: '€/m²', pas: 1, min: 0, decimales: 2, effets: ['inspecteur'], lire: (cx) => reglages(cx).prixCouverture, ecrire: (cx, v) => { if (!(v >= 0)) return false; poser(cx, 'prixCouverture', v); } });
  }
  return {
    id: 'prixPergola', titre: 'Prix', repliee: true,
    explication: 'Prix de fourniture TTC. Les valeurs indicatives sont des ordres de grandeur de négoce : remplacez-les par le devis de votre fournisseur.',
    champs
  };
}

/**
 * Les sections propres a une pergola ou a un carport dans l'inspecteur, dans l'ordre : ses reglages en trois groupes (la forme et
 * le toit, la structure, les couleurs), puis sa note de calcul. Le metrage et les prix sont des resultats : ils se lisent et se
 * reglent dans l'onglet de l'abri du tiroir (zones/resultats/Abri.tsx), qui rend les deux sections ci-dessus.
 */
export function sectionsPergola(c: ContexteChamps): Section[] {
  const groupe = (cles: string[]) => cles.flatMap(cle => CHAMPS_PERGOLA.filter(ch => ch.cle === cle));
  return [
    {
      // Le titre suit l'ouvrage : « Pergola » ou « Carport », memes reglages. Ce qu'on vient regler : la section d'arrivee.
      id: 'pergola', titre: libelleAbri(c.obj) + ' · Forme et toit', principale: true,
      explication: 'Le contour est le nu extérieur des poteaux : un poteau à chaque coin, des poteaux intermédiaires selon l\'entraxe, une poutre sur chaque côté.',
      champs: groupe(FORME)
    },
    { id: 'pergolaStructure', titre: 'Structure', champs: groupe(STRUCTURE) },
    { id: 'pergolaCouleurs', titre: 'Couleurs', champs: groupe(COULEURS) },
    sectionNoteCalcul(c)
  ];
}
