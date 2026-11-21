// « Quelle formalite pour ce projet ? » : aucune, une declaration prealable ou un permis de construire, d'apres les regles
// NATIONALES du code de l'urbanisme et ce que le plan sait du projet. Pure et synchrone, comme la conformite au PLU
// (conformite.ts) : elle ne lit que le plan et ses seuils (regles/plu/reglages.json, `formalite.*`), et rend une INDICATION avec ses
// raisons, jamais une autorisation. Aucun export ne la lit : le cerfa garde son propre regime (export/cerfa13703.ts).
//
// Ce qui compte, et d'ou cela vient :
//   - l'emprise au sol creee par les abris (pergolas, carports : engine/abri/pergola.ts, l'emprise du toit) et par les terrasses
//     SURELEVEES du projet (conformite.ts, `terrassesSurelevees`) ; une terrasse de plain-pied n'en cree pas (R*421-2) ;
//   - les seuils : pas de formalite jusqu'a 5 m², declaration prealable jusqu'a 20 m², permis au-dela ; 40 m² pour une extension
//     accolee en zone urbaine d'un PLU (R*421-9, R*421-14, R*421-17) ;
//   - le secteur protege, connu par les servitudes du PLU (engine/piscine/calcul.ts, `estSecteurProtege`) : declaration prealable
//     des le premier metre carre (R*421-11) ;
//   - les bassins : le regime que la piscine calcule deja (engine/piscine/calcul.ts), repris tel quel.
// Ce que Plan ne sait pas trancher se rend « à vérifier en mairie », avec la question a poser : une terrasse de plain-pied en
// secteur protege, une extension accolee de 20 a 40 m² quand la zone n'est pas connue ou en secteur protege, des ouvrages qui ne
// passent un seuil que comptes ensemble. Le seuil d'une terrasse surelevee (0,60 m) est un usage, pas un texte : sa raison le dit.

import { shoelace } from '../../../geometry/basic.js';
import { au } from '../../../util/tableaux.js';
import { calculerPergola, libelleAbri } from '../../abri/pergola.js';
import { calculerPiscine, estSecteurProtege, LIBELLE_REGIME } from '../../piscine/calcul.js';
import { solDuProjet } from '../../sol.js';
import { estAbri, estBati, estExistant, estPiscine, estPoseSurLeTerrain, estTerrasse, parcelleDuProjet } from '../../../model/fonctions.js';
import { REGLAGES_PLU, type ReglagesPlu } from '../../../regles/plu/reglages.js';
import { ouvragesDuProjet, terrassesSurelevees } from './conformite.js';
import type { ObjetPlan } from '../../../model/types.js';

/** `a-verifier` : les regles nationales ne suffisent pas a trancher avec ce que le plan sait ; la mairie le dit. */
export type Formalite = 'aucune' | 'declaration' | 'permis' | 'a-verifier';

export const LIBELLE_FORMALITE: Record<Formalite, string> = {
  aucune: 'Aucune formalité',
  declaration: 'Déclaration préalable',
  permis: 'Permis de construire',
  'a-verifier': 'À vérifier en mairie',
};

export interface RaisonFormalite {
  /** Stable, pour les tests et les cles de liste : `emprise`, `terrasse.<cle>`, `piscine.<cle>`, `ensemble`… */
  cle: string;
  /** Ce que cette raison demande a elle seule. */
  formalite: Formalite;
  /** L'objet du plan concerne, quand il y en a un seul. */
  objet: string | null;
  /** La phrase de l'ecran, au vouvoiement. */
  texte: string;
}

export interface IndicationFormalite {
  /** La plus exigeante des raisons (un permis l'emporte sur un doute, un doute sur une declaration). */
  formalite: Formalite;
  raisons: RaisonFormalite[];
  /** Ce qui ne change pas la reponse mais la borne : PLU non interroge, batiment dessine, surface totale de la maison. */
  reserves: string[];
  /** L'emprise au sol creee par les abris et les terrasses surelevees du projet, en m². */
  emprise: number;
  /** `null` : le PLU de la parcelle n'a pas ete interroge, Plan ne sait pas. */
  secteurProtege: boolean | null;
  /** Le nombre d'ouvrages du projet que l'indication a regardes (abris, terrasses, bassins). */
  ouvrages: number;
}

const RANG: Record<Formalite, number> = { aucune: 0, declaration: 1, 'a-verifier': 2, permis: 3 };
const fr = (v: number, d = 1): string => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const entier = (v: number): string => String(v).replace('.', ',');

/**
 * La formalite qu'appelle une emprise au sol creee. `adossee` : l'ouvrage est accole a la maison (une extension) ; `zoneUrbaine` :
 * la parcelle est en zone U d'un PLU (`null` : inconnu). Les bornes sont celles des textes : « inférieure ou égale ».
 */
export function formaliteDeLEmprise(emprise: number, o: { adossee: boolean; zoneUrbaine: boolean | null; secteurProtege: boolean }, reglages: ReglagesPlu = REGLAGES_PLU): Formalite {
  const sans = reglages['formalite.empriseSansFormaliteM2'], dp = reglages['formalite.empriseDeclarationM2'], extension = reglages['formalite.empriseExtensionZoneUrbaineM2'];
  if (!(emprise > 0)) return 'aucune';
  if (emprise <= dp) return !o.secteurProtege && emprise <= sans ? 'aucune' : 'declaration';
  if (o.adossee && emprise <= extension) {
    // Le seuil de 40 m² ne vaut qu'en zone urbaine d'un PLU ; en secteur protege ou sans zone connue, Plan ne tranche pas.
    if (o.secteurProtege || o.zoneUrbaine === null) return 'a-verifier';
    return o.zoneUrbaine ? 'declaration' : 'permis';
  }
  return 'permis';
}

/** La formalite d'urbanisme du projet, d'apres les regles nationales : une indication, avec ses raisons et ses reserves. */
export function formaliteDuProjet(objets: readonly ObjetPlan[], reglages: ReglagesPlu = REGLAGES_PLU): IndicationFormalite {
  const tous = [...objets];
  const parcelle = parcelleDuProjet(tous);
  const plu = parcelle?.plu;
  const protege = estSecteurProtege(plu);
  // Une zone U du PLU (typezone du Geoportail de l'urbanisme) ; sans zonage, ou sans zone rendue, Plan ne sait pas.
  const zoneUrbaine = plu?.zones.length ? plu.zones.some((z) => z.typezone === 'U') : null;
  const sol = solDuProjet(tous);
  const sans = reglages['formalite.empriseSansFormaliteM2'], dp = reglages['formalite.empriseDeclarationM2'], extension = reglages['formalite.empriseExtensionZoneUrbaineM2'];
  const seuilTerrasse = reglages['plu.terrasseSureleveeM'];
  const duProjet = (o: ObjetPlan) => !estExistant(o) && !estPoseSurLeTerrain(o) && !o.voisinage;
  const raisons: RaisonFormalite[] = [];
  const reserves: string[] = [];
  const contexte = (adossee: boolean) => ({ adossee, zoneUrbaine, secteurProtege: protege });

  // Ce qui cree de l'emprise : les abris, et les terrasses surelevees du projet.
  const abris = tous.filter((o) => estAbri(o) && duProjet(o)).flatMap((o) => {
    const calc = calculerPergola(o, sol);
    return calc ? [{ objet: o, nom: o.name || libelleAbri(o), emprise: shoelace(calc.emprise), adossee: calc.reglages.adossee }] : [];
  });
  const hautes = terrassesSurelevees(objets, reglages).filter((t) => t.duProjet)
    .map((t) => ({ objet: t.objet, nom: t.objet.name || 'Terrasse', emprise: shoelace(t.objet.pts), adossee: false, hauteur: t.hauteur }));
  const hautesCles = new Set(hautes.map((t) => t.objet.key));
  const plainPied = tous.filter((o) => estTerrasse(o) && o.type === 'polygon' && duProjet(o) && !hautesCles.has(o.key));
  const creent = [...abris, ...hautes];
  const emprise = creent.reduce((s, c) => s + c.emprise, 0);
  const adossee = creent.some((c) => c.adossee);

  for (const t of hautes) {
    raisons.push({ cle: 'terrasse.' + t.objet.key, objet: t.objet.key, formalite: formaliteDeLEmprise(t.emprise, contexte(false), reglages),
      texte: '« ' + t.nom + ' » est une terrasse surélevée (dessus à ' + fr(t.hauteur, 2) + ' m du sol, plus de ' + fr(seuilTerrasse, 2) + ' m) : elle crée en général de l’emprise au sol, ici '
        + fr(t.emprise) + ' m². Aucun texte national ne fixe cette hauteur : confirmez-la auprès de la mairie.' });
  }
  if (creent.length) {
    const ensemble = formaliteDeLEmprise(emprise, contexte(adossee), reglages);
    // Les seuils valent par construction : des ouvrages qui ne passent un seuil que comptes ensemble sont un doute, pas un permis.
    const separement = creent.map((c) => formaliteDeLEmprise(c.emprise, contexte(c.adossee), reglages)).reduce((m, f) => (RANG[f] > RANG[m] ? f : m), 'aucune' as Formalite);
    const tranche = emprise <= sans ? 'jusqu’à ' + entier(sans) + ' m², aucune formalité hors secteur protégé'
      : emprise <= dp ? 'de ' + entier(sans) + ' à ' + entier(dp) + ' m², déclaration préalable'
        : adossee && emprise <= extension ? 'de ' + entier(dp) + ' à ' + entier(extension) + ' m² pour une extension accolée à la maison, déclaration préalable en zone urbaine d’un PLU, permis de construire ailleurs'
          : 'au-delà de ' + entier(adossee ? extension : dp) + ' m², permis de construire';
    raisons.push({ cle: 'emprise', objet: creent.length === 1 ? au(creent, 0).objet.key : null, formalite: separement,
      texte: 'Emprise au sol créée : ' + fr(emprise) + ' m² (' + creent.map((c) => c.nom + ' ' + fr(c.emprise) + ' m²').join(', ') + ') ; ' + tranche + '.' });
    if (ensemble !== separement) {
      raisons.push({ cle: 'ensemble', objet: null, formalite: 'a-verifier',
        texte: 'Pris un par un, ces ouvrages restent sous un seuil que leur total dépasse : demandez à la mairie s’ils se comptent ensemble.' });
    }
    if (protege && emprise <= dp) {
      raisons.push({ cle: 'protege.emprise', objet: null, formalite: 'declaration',
        texte: 'La parcelle est en secteur protégé (servitudes du PLU) : une déclaration préalable est demandée dès le premier mètre carré, et l’architecte des Bâtiments de France est consulté.' });
    }
    if (adossee && emprise > dp && emprise <= extension) {
      if (protege || zoneUrbaine === null) {
        raisons.push({ cle: 'extension', objet: null, formalite: 'a-verifier',
          texte: protege ? 'Extension accolée de plus de ' + entier(dp) + ' m² en secteur protégé : Plan ne sait pas si le seuil de ' + entier(extension) + ' m² s’y applique, demandez à la mairie.'
            : 'Le seuil de ' + entier(extension) + ' m² ne vaut qu’en zone urbaine d’un PLU, et la zone de la parcelle n’est pas connue : interrogez le PLU (Résultats › PLU) ou demandez à la mairie.' });
      } else if (zoneUrbaine) {
        reserves.push('Entre ' + entier(dp) + ' et ' + entier(extension) + ' m², un permis de construire reste demandé si les travaux portent la surface totale de la maison au-delà de 150 m² : Plan ne connaît pas cette surface.');
      }
    }
  }

  // Les terrasses de plain-pied : rien, sauf en secteur protege ou Plan ne tranche pas.
  if (plainPied.length) {
    const noms = plainPied.map((o) => '« ' + (o.name || 'Terrasse') + ' »').join(', ');
    raisons.push({ cle: 'plainPied', objet: plainPied.length === 1 ? au(plainPied, 0).key : null, formalite: protege ? 'a-verifier' : 'aucune',
      texte: protege
        ? noms + ' : une terrasse de plain-pied est dispensée de formalité hors secteur protégé ; la parcelle y est, et une déclaration préalable peut être demandée : à vérifier en mairie.'
        : noms + ' : une terrasse de plain-pied (dessus à ' + fr(seuilTerrasse, 2) + ' m du sol au plus) ne crée pas d’emprise au sol, aucune formalité.' });
  }

  // Les bassins : le regime que la piscine calcule deja, avec son secteur protege.
  const bassins = tous.filter((o) => estPiscine(o) && duProjet(o)).flatMap((o) => { const c = calculerPiscine(o, tous); return c ? [{ o, c }] : []; });
  for (const { o, c } of bassins) {
    raisons.push({ cle: 'piscine.' + o.key, objet: o.key, formalite: c.regime,
      texte: '« ' + (o.name || 'Piscine') + ' » : bassin de ' + fr(c.surface) + ' m², ' + LIBELLE_REGIME[c.regime].toLowerCase() + '.' });
  }

  if (!plu) reserves.push('Le PLU de la parcelle n’a pas été interrogé : Plan ne sait pas si elle est en secteur protégé, où une déclaration préalable est demandée dès le premier mètre carré.');
  // Un batiment dessine a la main : Plan ne sait pas s'il existe deja ; il ne le compte pas, et le dit.
  const dessines = ouvragesDuProjet(objets).filter((o) => estBati(o) && !estAbri(o) && !estExistant(o));
  if (dessines.length) {
    reserves.push('Plan ne compte pas ' + dessines.map((o) => '« ' + (o.name || 'Bâtiment') + ' »').join(', ')
      + ' (bâti dessiné) : si c’est une construction nouvelle ou une extension, son emprise et sa surface de plancher décident aussi de la formalité.');
  }

  const formalite = raisons.reduce((m, r) => (RANG[r.formalite] > RANG[m] ? r.formalite : m), 'aucune' as Formalite);
  return { formalite, raisons, reserves, emprise, secteurProtege: plu ? protege : null, ouvrages: creent.length + plainPied.length + bassins.length };
}
