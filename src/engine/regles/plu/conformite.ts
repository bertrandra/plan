// Les regles du PLU : le projet controle contre les faits que la personne a valides (lot L4 de la lecture IA elargie, MD/architecture.md
// §5.2.4). Pures et synchrones, comme les regles des toits : elles ne lisent que le plan, les faits valides et les seuils
// (regles/plu/reglages.json), et rendent des verdicts. Un verdict est un AVERTISSEMENT, jamais un blocage : rien ici n'est lu par un
// export, un calcul de quantite ou une commande — la conformite au PLU reste l'affaire du service urbanisme de la commune.
//
// Ce qui est controle, et sur quoi :
//   - les ouvrages du projet : ce qui n'est pas pose sur le terrain par le cadastre ou l'IGN (un batiment, une annexe dessines ; une
//     pergola, un carport). L'existant n'est pas le projet : il ne compte que dans l'emprise au sol et les espaces verts ;
//   - les hauteurs (egout, faitage ou point le plus haut, annexes), les reculs depuis la voie et les limites separatives (les cotes de
//     la parcelle que la cloture designe « sur rue » sont la voie), l'emprise au sol et la part d'espaces verts de la parcelle, la pente
//     et la couverture des toits, la hauteur de la cloture ;
//   - ce qui ne se mesure pas sur le plan (couleurs, haies, stationnement, une regle sans nombre) : « à vérifier », avec sa citation.
// Un fait qui porte une condition (« en limite séparative », « annexes de moins de 20 m² ») s'applique sans que la regle sache la lire :
// son verdict le dit, et la personne juge.

import { dist, pointInPolygon, shoelace } from '../../../geometry/basic.js';
import { au } from '../../../util/tableaux.js';
import { aireCommune } from '../../../geometry/polygon.js';
import { calculerPergola } from '../../abri/pergola.js';
import { solDuProjet } from '../../sol.js';
import { coteRegle, hauteurTotale, reglageDuCote } from '../../../model/cloture.js';
import { estAbri, estBati, estPoseSurLeTerrain, estTerrain, occupeLeSol, parcelleDuProjet } from '../../../model/fonctions.js';
import { ANNEXE, MASSIF, ouvrage } from '../../../model/ouvrages/index.js';
import { hauteurAuPointLePlusHaut, penteDuToit } from '../../../model/volumesToit.js';
import { elevationParDefaut } from '../../../model/defaults.js';
import { faitsValides, GRANDEURS_PLU, valeurLisible, type FaitPlu, type ReglementPlu } from '../../../regles/plu/faits.js';
import { REGLAGES_PLU, type ReglagesPlu } from '../../../regles/plu/reglages.js';
import type { ObjetAPoints, ObjetPlan, PtBrut } from '../../../model/types.js';

/** `ecart` : le projet depasse le fait ; `a-verifier` : la regle ne se mesure pas sur le plan, ou il manque de quoi la mesurer. */
export type EtatVerdictPlu = 'conforme' | 'ecart' | 'a-verifier';

export interface VerdictPlu {
  /** L'identifiant du fait (`ReglementPlu.faits[].id`). */
  fait: string;
  /** L'objet du plan concerne ; null pour un verdict de la parcelle (emprise, espaces verts) ou d'un fait non mesurable. */
  objet: string | null;
  etat: EtatVerdictPlu;
  /** La mesure du projet, dans l'unite du fait ; null quand il n'y en a pas. */
  mesure: number | null;
  /** La phrase de l'ecran, au vouvoiement, avec la mesure et la valeur du fait. */
  message: string;
}

export interface ConformitePlu {
  verdicts: VerdictPlu[];
  ecarts: number;
  aVerifier: number;
  conformes: number;
  /** Le zonage enregistre sur la parcelle ne nomme plus la zone dont le reglement a ete lu (le PLU a ete interroge de nouveau). */
  zoneChangee: boolean;
}

const fr = (v: number, d = 2): string => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const nom = (o: ObjetPlan): string => o.name || ouvrage(o.fonction).libelle;
const avecCondition = (f: FaitPlu, phrase: string): string => (f.condition ? phrase + ' La règle vaut « ' + f.condition + ' » : vérifiez qu’elle s’applique à cet ouvrage.' : phrase);

/** La distance d'un point a un segment. */
function distanceSegment(p: PtBrut, a: PtBrut, b: PtBrut): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** La plus petite distance d'une emprise a un cote de la parcelle (sommets de l'une contre cotes de l'autre, dans les deux sens). */
function distanceAuCote(emprise: readonly PtBrut[], a: PtBrut, b: PtBrut): number {
  let d = Infinity;
  for (const p of emprise) d = Math.min(d, distanceSegment(p, a, b));
  for (let i = 0; i < emprise.length; i++) {
    const p = au(emprise, i), q = au(emprise, (i + 1) % emprise.length);
    d = Math.min(d, distanceSegment(a, p, q), distanceSegment(b, p, q));
  }
  return d;
}

/** Les ouvrages du projet : ni le terrain, ni ce que le cadastre ou l'IGN ont pose ; du bati ou un abri, en polygone. */
export function ouvragesDuProjet(objets: readonly ObjetPlan[]): ObjetAPoints[] {
  return objets.filter((o): o is ObjetAPoints => !estTerrain(o) && !estPoseSurLeTerrain(o) && !o.voisinage && o.type === 'polygon' && (estBati(o) || estAbri(o)));
}

/** La hauteur a l'egout d'un ouvrage du projet (un abri n'en a pas : null). */
const egoutDe = (o: ObjetPlan): number | null => (estAbri(o) ? null : o.elevation ?? elevationParDefaut(o.fonction || ''));

/** Le point le plus haut d'un ouvrage du projet : celui de son toit, ou la hauteur reglementaire d'un abri. */
function sommetDe(o: ObjetPlan, objets: readonly ObjetPlan[]): number {
  if (estAbri(o)) return calculerPergola(o, solDuProjet(objets))?.hauteurReglementaire ?? (o.elevation ?? 0);
  return hauteurAuPointLePlusHaut(o);
}

/**
 * La conformite du projet aux faits VALIDES de ce reglement. Sans reglement, ou sans fait valide, aucun verdict : les faits proposes
 * ne controlent rien tant que la personne ne les a pas compares au texte.
 */
export function conformitePlu(objets: readonly ObjetPlan[], reglement: ReglementPlu | null | undefined, reglages: ReglagesPlu = REGLAGES_PLU): ConformitePlu {
  const parcelle = parcelleDuProjet([...objets]);
  const faits = faitsValides(reglement);
  const verdicts: VerdictPlu[] = [];
  const zones = (parcelle?.plu?.zones ?? []).map((z) => z.libelle);
  const zoneChangee = !!reglement && zones.length > 0 && !zones.includes(reglement.zone);
  const ouvrages = ouvragesDuProjet(objets);
  const tolH = reglages['plu.toleranceHauteurM'], tolD = reglages['plu.toleranceDistanceM'], tolP = reglages['plu.tolerancePart'], tolA = reglages['plu.toleranceAngleDeg'];
  const pousser = (f: FaitPlu, objet: string | null, etat: EtatVerdictPlu, mesure: number | null, message: string) => verdicts.push({ fait: f.id, objet, etat, mesure, message });
  const aVerifier = (f: FaitPlu, pourquoi: string) => pousser(f, null, 'a-verifier', null, pourquoi);
  /** Un maximum (ou un minimum) compare a une mesure, objet par objet. */
  const comparer = (f: FaitPlu, o: ObjetPlan | null, mesure: number, sens: 'max' | 'min', tol: number, quoi: string, unite: string) => {
    const seuil = f.valeur as number;
    const ok = sens === 'max' ? mesure <= seuil + tol : mesure >= seuil - tol;
    const sujet = o ? nom(o) + ' : ' : '';
    pousser(f, o?.key ?? null, ok ? 'conforme' : 'ecart', mesure, ok
      ? sujet + quoi + ' ' + fr(mesure) + unite + ', ' + (sens === 'max' ? 'au plus ' : 'au moins ') + valeurLisible(f) + ' (' + f.article + ').'
      : avecCondition(f, sujet + quoi + ' ' + fr(mesure) + unite + (sens === 'max' ? ' dépasse ' : ' n’atteint pas ') + valeurLisible(f) + ' (' + f.article + ').'));
  };

  // Les cotes de la parcelle, et ceux que la cloture designe sur rue.
  const contour = parcelle && parcelle.type === 'polygon' ? parcelle.pts : null;
  const cotes = contour ? contour.map((a, i) => ({ a, b: au(contour, (i + 1) % contour.length), limite: parcelle?.cloture ? coteRegle(parcelle.cloture, i)?.limite : undefined })) : [];
  const surRue = cotes.filter((c) => c.limite === 'rue');
  const separatifs = surRue.length ? cotes.filter((c) => c.limite !== 'rue') : cotes;

  for (const f of faits) {
    const def = GRANDEURS_PLU[f.grandeur];
    if (def.nombre && f.valeur === null) { aVerifier(f, 'La règle ne donne pas de nombre que Plan puisse mesurer : relisez-la (' + f.article + ').'); continue; }
    switch (f.grandeur) {
      case 'hauteur-egout-max':
        for (const o of ouvrages) { const e = egoutDe(o); if (e !== null) comparer(f, o, e, 'max', tolH, 'hauteur à l’égout', ' m'); }
        break;
      case 'hauteur-faitage-max':
        for (const o of ouvrages) if (!estAbri(o)) comparer(f, o, sommetDe(o, objets), 'max', tolH, 'hauteur au faîtage', ' m');
        break;
      case 'hauteur-absolue-max':
        for (const o of ouvrages) comparer(f, o, sommetDe(o, objets), 'max', tolH, 'hauteur au point le plus haut', ' m');
        break;
      case 'hauteur-annexe-max':
        for (const o of ouvrages) if (estAbri(o) || ouvrage(o.fonction) === ANNEXE) comparer(f, o, sommetDe(o, objets), 'max', tolH, 'hauteur au point le plus haut', ' m');
        break;
      case 'recul-voie-min':
      case 'recul-limites-min': {
        if (!contour) { aVerifier(f, 'La parcelle n’a pas de contour : le recul ne se mesure pas.'); break; }
        const voie = f.grandeur === 'recul-voie-min';
        if (voie && !surRue.length) { if (ouvrages.length) aVerifier(f, 'Désignez le côté sur rue dans la clôture de la parcelle (« Limite : rue ») pour mesurer le recul depuis la voie.'); break; }
        const limites = voie ? surRue : separatifs;
        for (const o of ouvrages) {
          const d = Math.min(...limites.map((c) => distanceAuCote(o.pts, c.a, c.b)));
          // Un ouvrage qui deborde de la parcelle est sur la limite : son recul est nul.
          const dedans = o.pts.every((p) => pointInPolygon(p, contour));
          comparer(f, o, dedans ? d : 0, 'min', tolD, voie ? 'recul depuis la voie' : 'recul des limites séparatives', ' m');
        }
        break;
      }
      case 'emprise-max':
      case 'espaces-verts-min': {
        if (!contour) { aVerifier(f, 'La parcelle n’a pas de contour : la part ne se mesure pas.'); break; }
        const aire = shoelace(contour);
        if (!(aire > 0)) break;
        // La part de chaque objet DANS la parcelle : un batiment de l'IGN deborde souvent sur la voisine (un ilot de centre ancien en
        // couvre plusieurs), et le compter entier donnait des emprises de 290 % (fumee, point 120, Rennes). Un cercle compte en polygone.
        const contourDe = (o: ObjetPlan): PtBrut[] => (o.type === 'circle'
          ? Array.from({ length: 32 }, (_, k) => ({ x: o.center.x + o.r * Math.cos((k * Math.PI) / 16), y: o.center.y + o.r * Math.sin((k * Math.PI) / 16) }))
          : o.pts);
        const surLaParcelle = (o: ObjetPlan) => o !== parcelle && !estTerrain(o) && (o.type === 'polygon' || o.type === 'circle');
        const surface = (o: ObjetPlan) => aireCommune(contourDe(o), contour);
        if (f.grandeur === 'emprise-max') {
          const emprise = objets.filter((o) => surLaParcelle(o) && (estBati(o) || estAbri(o))).reduce((s, o) => s + surface(o), 0);
          comparer(f, null, (100 * emprise) / aire, 'max', 100 * tolP, 'Emprise au sol du bâti et des abris dans la parcelle (existant compris)', ' %');
        } else {
          const occupee = objets.filter((o) => surLaParcelle(o) && occupeLeSol(o) && ouvrage(o.fonction) !== MASSIF).reduce((s, o) => s + surface(o), 0);
          comparer(f, null, Math.max(0, (100 * (aire - occupee)) / aire), 'min', 100 * tolP, 'Part de la parcelle qu’aucun objet du plan n’occupe (estimation des espaces verts)', ' %');
        }
        break;
      }
      case 'pente-toit-min':
      case 'pente-toit-max':
        for (const o of ouvrages) {
          const toit = o.batiment?.toit;
          if (estAbri(o)) continue;
          if (!toit) { pousser(f, o.key, 'a-verifier', null, nom(o) + ' : son toit n’est pas décrit, la pente ne se mesure pas (' + f.article + ').'); continue; }
          const pente = penteDuToit(o.pts, toit);
          if (pente === 0) { pousser(f, o.key, 'a-verifier', 0, nom(o) + ' : toit plat ; vérifiez que le règlement l’admet (' + f.article + ').'); continue; }
          comparer(f, o, pente, f.grandeur === 'pente-toit-min' ? 'min' : 'max', tolA, 'pente du toit', '°');
        }
        break;
      case 'materiaux-toit':
        for (const o of ouvrages) {
          if (estAbri(o)) continue;
          const c = o.batiment?.toit?.couverture;
          if (!c) { pousser(f, o.key, 'a-verifier', null, nom(o) + ' : choisissez sa couverture dans l’inspecteur pour la comparer aux matériaux admis (' + valeurLisible(f) + ', ' + f.article + ').'); continue; }
          const admis = (f.termes as readonly string[]).includes(c) || (c !== 'tuile' && c.startsWith('tuile') && f.termes.includes('tuile')) || (c === 'ardoise-losange' && f.termes.includes('ardoise'));
          const tuileVague = c === 'tuile' && f.termes.some((t) => t.startsWith('tuile-'));
          pousser(f, o.key, admis ? 'conforme' : tuileVague ? 'a-verifier' : 'ecart', null, admis
            ? nom(o) + ' : couverture « ' + c + ' », admise (' + f.article + ').'
            : tuileVague ? nom(o) + ' : « tuile » sans précision ; le règlement admet ' + valeurLisible(f) + ' (' + f.article + ').'
              : avecCondition(f, nom(o) + ' : couverture « ' + c + ' », hors des matériaux admis (' + valeurLisible(f) + ', ' + f.article + ').'));
        }
        break;
      case 'cloture-voie-hauteur-max':
      case 'cloture-limites-hauteur-max': {
        const cl = parcelle?.cloture;
        if (!cl?.active || !contour) break;
        const voie = f.grandeur === 'cloture-voie-hauteur-max';
        const designes = cotes.map((c, i) => ({ ...c, i })).filter((c) => (voie ? c.limite === 'rue' : c.limite === 'separative'));
        if (!designes.length) { aVerifier(f, 'Désignez les côtés de la clôture (« Limite : rue » ou « séparative ») pour comparer leur hauteur (' + f.article + ').'); break; }
        for (const c of designes) comparer(f, parcelle ?? null, hauteurTotale(reglageDuCote(cl, c.i)), 'max', tolH, 'clôture du côté ' + (c.i + 1) + ', hauteur', ' m');
        break;
      }
      default:
        aVerifier(f, 'À vérifier par vous : la règle ne se mesure pas sur le plan (' + f.article + ').');
    }
  }
  return {
    verdicts, zoneChangee,
    ecarts: verdicts.filter((v) => v.etat === 'ecart').length,
    aVerifier: verdicts.filter((v) => v.etat === 'a-verifier').length,
    conformes: verdicts.filter((v) => v.etat === 'conforme').length,
  };
}
