// Le schema d'un document de projet, et le chemin d'une version a la suivante (RELEASE.md §3).
//
// ---------------------------------------------------------------------------------------------
// Pourquoi un document n'est pas ecrit, d'office, au schema le plus recent
// ---------------------------------------------------------------------------------------------
//
// `schema_version` est le seul contrat de forme entre Plan et ce qui stocke ses projets : la
// plateforme refuse a l'ecriture un numero qu'elle ne connait pas (`422
// UNSUPPORTED_SCHEMA_VERSION`), et une version plus ancienne de Plan refuse d'ouvrir un fichier
// plus recent qu'elle. Ecrire `2` sur un plan qui n'a ni releve ni toit, c'est donc se faire
// refuser pour une forme que le document n'utilise pas — c'est exactement ce qui empechait la
// demonstration de s'ouvrir sur une plateforme restee a `[1]`.
//
// La regle est donc : un document est ecrit au **plus petit schema qui le decrit**, sauf si le
// projet a ete mis a jour expres (`plancher`) — on ne redescend jamais un projet que quelqu'un a
// choisi de monter.
//
// ---------------------------------------------------------------------------------------------
// Les migrations
// ---------------------------------------------------------------------------------------------
//
// Une migration fait passer un document **brut** d'un schema au suivant ; elles s'appliquent a la
// lecture, en chaine, avant la normalisation. Le programme ne manipule ainsi jamais qu'une forme,
// la derniere. Mettre un projet « a jour » ne transforme plus rien en memoire : c'est declarer, a
// l'ecriture, qu'il est desormais de la forme courante.

import { SCHEMA_VERSION } from './version.js';
import { aPlat } from './champsFonction.js';
// La migration 2 -> 3 lit sa copie figee (model/fige/toitSchema3.ts) : l'algorithme d'aujourd'hui peut changer sans elle.
import { toitBdTopoSchema3, COUCHE_BATIMENT_BDTOPO } from './fige/toitSchema3.js';
import type { ObjetAPlat, PtBrut } from './types.js';

/** Un document de projet, tel qu'il est lu ou ecrit : la forme de `projet.json`. */
export interface DocumentBrut {
  objects: ObjetAPlat[];
  measures?: unknown[];
}

export interface Migration {
  /** Le schema de depart ; la migration rend un document au schema `de + 1`. */
  de: number;
  /** Ce que la version d'arrivee apporte, en une phrase : le dialogue de mise a jour la montre. */
  apporte: string;
  migrer: (d: DocumentBrut) => DocumentBrut;
}

/**
 * La chaine, dans l'ordre. `tests/unit/model/migrations.test.ts` verifie qu'elle mene sans trou de
 * 1 a `SCHEMA_VERSION` : un numero de schema monte sans sa migration ne compile pas en silence.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    de: 1,
    apporte: 'les relevés de façade (ouvertures, texture, hauteurs d’un mur en L) et la forme du toit',
    // Le schema 2 n'ajoute que deux champs facultatifs a un batiment : un document 1 est deja un
    // document 2 valide. La migration existe pour que la chaine soit complete, pas pour transformer.
    migrer: (d) => d
  },
  {
    de: 2,
    apporte: 'un toit pour chaque bâtiment importé de l’IGN, déduit de la BD TOPO et posé sur son contour réel (MD/spec-toit-ign.md)',
    migrer: (d) => ({ ...d, objects: d.objects.map(poserToitBdTopo) })
  },
  {
    de: 3,
    apporte: 'le relief du terrain lu à l’IGN, rangé sur la parcelle avec sa source et sa précision (MD/spec-relief.md)',
    // Le schema 4 n'ajoute qu'un champ facultatif a la parcelle : un document 3 est deja un
    // document 4 valide. La migration existe pour que la chaine soit complete.
    migrer: (d) => d
  },
  {
    de: 4,
    apporte: 'la piscine, la pergola, la clôture, les corps et volumes mesurés du toit, les fenêtres et le voisinage en 3D, et la calibration qui a produit un relevé de façade',
    // Ces champs s'ecrivaient deja au 4 (CHAMPS_DEPUIS) : un document 4 est un document 5 valide. Le 5 les distingue, pour
    // qu'un lecteur 4 refuse le fichier plutot que de les perdre.
    migrer: (d) => d
  },
  {
    de: 5,
    apporte: 'la forme retouchée à la main d’un objet de l’IGN, la hauteur à l’égout choisie d’un bâtiment et le soleil du projet (date et heure)',
    // Ces champs s'ecrivaient au 5 apres sa premiere livraison (CHAMPS_DEPUIS) : un document 5 est un document 6 valide. Le 6 les
    // distingue, pour qu'un lecteur 5 d'avant refuse le fichier plutot que de les perdre.
    migrer: (d) => d
  },
  {
    de: 6,
    apporte: 'la façade validée d’un relevé : ses dimensions, sa forme, son parement, la pose de sa texture, et ses ouvertures vérifiées (avec leurs carreaux)',
    // Ces champs sont facultatifs et n'existaient pas avant (lot F5) : un document 6 est un document 7 valide, relu a l'identique.
    // Le 7 les distingue, pour qu'un lecteur 6 refuse le fichier plutot que de les perdre a la premiere reecriture d'une facade. Un
    // releve d'avant garde aussi `calage.contourDecaleM`, que plus rien n'ecrit ni ne lit (l'ecart de largeur est dans
    // `dimensions.ecartPhoto`, ecrit a la validation) : il passe tel quel, sans etre converti.
    migrer: (d) => d
  },
  {
    de: 7,
    apporte: 'le règlement de la zone du PLU lu pour le projet : sa source, sa lecture par Claude, et ses règles proposées ou vérifiées par vous',
    // Un champ facultatif de la parcelle (`reglementPlu`, lot L4), qui n'existait pas avant : un document 7 est un document 8 valide.
    // Le 8 le distingue, pour qu'un lecteur 7 refuse le fichier plutot que de perdre des faits du PLU que la personne a verifies.
    migrer: (d) => d
  }
];

/**
 * Le schema a partir duquel chaque champ facultatif d'un objet s'ecrit : un lecteur plus ancien ne le connait pas et l'efface au
 * premier enregistrement. Les champs venus apres le relief s'ecrivent au 5 : un lecteur 4 refuse le fichier plutot que de les
 * perdre ; ceux venus apres la premiere livraison du 5 (retouche, egout choisi, soleil) s'ecrivent au 6. Un champ nouveau s'ajoute ici ; un schema a lui demande d'abord que la plateforme l'accepte.
 */
export const CHAMPS_DEPUIS: Readonly<Record<string, number>> = {
  facades: 2, toit: 2,
  relief: 4,
  piscine: 5, pergola: 5, cloture: 5, corpsToit: 5, volumesToit: 5, toitMesure: 5, fenetres3d: 5, voisinage3d: 5, ruesVoisinage: 5,
  retoucheMain: 6, egoutChoisi: 6, soleil: 6,
  reglementPlu: 8,
};

/**
 * Un batiment importe de la BD TOPO avant le schema 3 n'a pas de toit : il recoit celui que l'import
 * lui donnait le jour ou le schema 3 a ete fige (model/fige/toitSchema3.ts), et non celui d'aujourd'hui. L'altitude maximale du toit n'etait pas enregistree : la hauteur est
 * estimee (pente de tuile, regle 3) jusqu'a la prochaine actualisation, qui la lit.
 */
function poserToitBdTopo(o: ObjetAPlat): ObjetAPlat {
  const b = o.bdtopo as { couche?: unknown; altitudeToitM?: unknown; altitudeToitMaxM?: unknown; constructionLegere?: unknown } | null | undefined;
  const pts = (o as { pts?: unknown }).pts;
  if (o.toit || !b || b.couche !== COUCHE_BATIMENT_BDTOPO || o.type !== 'polygon' || !Array.isArray(pts) || pts.length < 3) return o;
  const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ...o,
    toit: toitBdTopoSchema3(pts as PtBrut[], {
      altitudeToitMinM: nombre(b.altitudeToitM),
      altitudeToitMaxM: nombre(b.altitudeToitMaxM),
      constructionLegere: b.constructionLegere === true
    })
  };
}

/**
 * Le plus petit schema qui decrit ces objets : le plus haut des champs poses (CHAMPS_DEPUIS : 6 pour la retouche, l'egout choisi et
 * le soleil, 5 pour les champs venus apres le relief ; 7 pour un releve qui porte sa Facade validee, `porteLaFacade`),
 * 4 pour le relief, 2 pour un releve ou un toit), 3 des qu'un toit est a croupes (un lecteur 2 le dessinerait en quatre pans sur l'enveloppe,
 * faux sur un L).
 */
export function schemaMinimal(objets: readonly ObjetAPlat[]): number {
  let s = 1;
  for (const objet of objets) {
    // Les objets de la memoire rangent ces champs dans leurs sous-objets : le schema se lit sur leur forme a plat.
    const o = aPlat(objet) as ObjetAPlat;
    const brut = o as Record<string, unknown>;
    for (const [champ, depuis] of Object.entries(CHAMPS_DEPUIS)) {
      const v = brut[champ];
      // Une liste vide de facades ne dit rien ; tout autre champ pose compte.
      if (v === undefined || v === null || (champ === 'facades' && (!Array.isArray(v) || !v.length))) continue;
      s = Math.max(s, depuis);
    }
    // Un releve qui garde la calibration de sa detection (etape 1.4) : un lecteur 4 l'effacerait.
    if (Array.isArray(brut.facades) && brut.facades.some((f) => !!f && typeof f === 'object' && 'calibration' in f)) s = Math.max(s, 5);
    // La Facade d'un releve valide (lot F5) : un lecteur 6 la perdrait a la premiere reecriture du mur.
    if (Array.isArray(brut.facades) && brut.facades.some(porteLaFacade)) s = Math.max(s, 7);
    // Un toit a croupes : un lecteur 2 le dessinerait en quatre pans sur l'enveloppe, faux sur un L.
    if (o.toit?.forme === 'croupes') s = Math.max(s, 3);
  }
  return s;
}

/** Les champs d'un releve venus avec la Facade (lot F5), et ceux d'une ouverture de la facade objet. */
const CHAMPS_FACADE_7: readonly string[] = ['dimensions', 'forme', 'surface', 'textureCalee'];
const CHAMPS_OUVERTURE_7: readonly string[] = ['id', 'verifieeLe'];

/** Un releve qui porte la Facade, ou une ouverture de la facade objet (identifiant, verification, carreaux) : schema 7. */
function porteLaFacade(f: unknown): boolean {
  if (!f || typeof f !== 'object') return false;
  const r = f as Record<string, unknown>;
  if (CHAMPS_FACADE_7.some((k) => r[k] !== undefined)) return true;
  return Array.isArray(r.ouvertures) && r.ouvertures.some((o) => {
    if (!o || typeof o !== 'object') return false;
    const ov = o as Record<string, unknown>;
    const d = ov.details as Record<string, unknown> | undefined;
    return CHAMPS_OUVERTURE_7.some((k) => ov[k] !== undefined) || (!!d && typeof d === 'object' && d.carreaux !== undefined);
  });
}

/** Le schema a ecrire : celui qui decrit le document, jamais sous celui ou le projet a ete monte. */
export function schemaAEcrire(objets: readonly ObjetAPlat[], plancher: number | null | undefined): number {
  return Math.min(SCHEMA_VERSION, Math.max(schemaMinimal(objets), plancher ?? 1));
}

/** Les schemas que ce programme sait lire : 1, puis chaque version ou une migration mene. */
export function schemasLisibles(): number[] {
  const v = new Set([1, ...MIGRATIONS.map((m) => m.de + 1)]);
  return [...v].filter((n) => n <= SCHEMA_VERSION).sort((a, b) => a - b);
}

/** Les migrations a appliquer pour lire un document de schema `de`. */
export function migrationsDepuis(de: number): Migration[] {
  return MIGRATIONS.filter((m) => m.de >= de && m.de < SCHEMA_VERSION);
}

/** Lit un document de schema `de` dans la forme courante. Un schema absent vaut 1. */
export function migrer<D extends DocumentBrut>(d: D, de: number | null | undefined): D {
  return migrationsDepuis(de ?? 1).reduce<DocumentBrut>((doc, m) => m.migrer(doc), d) as D;
}
