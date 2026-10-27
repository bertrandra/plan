// Ce que le demarrage recoit (app/boot.ts) : le projet initial, ou la graine de la vitrine et du mode audit.

import { chargerProjetInitial } from '../../io/api.js';
import { demanderPremierPas } from '../premierPas.js';
import type { ObjetBrut, Mesure } from '../../model/types.js';
import type { ProjetResume } from '../../io/api.js';
import { aPlat } from '../../model/champsFonction.js';

// Le jeu de demonstration (model/demo.ts, et son projet de 300 Ko) se lit a la demande (AD-10) : la premiere visite, la
// vitrine, la decouverte des controleurs. Un projet du serveur s'ouvre sans lui.
const demonstration = () => import('../../model/demo.js');

// ================= Persistance : projets via api.php (fichiers JSON cote serveur) =================
// Si api.php est absent ou injoignable (fichier ouvert en local, hebergement sans backend
// deploye...), l'appli reste 100% fonctionnelle avec le jeu de donnees de demonstration.
//
// Le depot des projets vit dans io/api.ts. Cette enveloppe lui fournit les deux choses qu'il ne peut
// pas aller chercher lui-meme : le jeu de demonstration, et l'ecran qui demande par quoi commencer
// quand il n'y a aucun plan a ouvrir. Les deux viennent de couches plus hautes que la sienne.
export async function loadInitialProject(){
  // En developpement, `?temoin` ouvre le plan de demonstration d'origine, celui dont les golden
  // files sont captures (tests/fixtures/golden/EMPREINTES.md) ; le fichier livre ne le propose pas.
  const temoin = import.meta.env.DEV && new URLSearchParams(location.search).has('temoin');
  return chargerProjetInitial(async () => {
    const d = await demonstration();
    // La graine est un document, champs a plat (model/champsFonction.ts) : la demonstration s'enregistre telle quelle.
    return { objets: temoin ? d.DEMO_TEMOIN_OBJECTS.map(aPlat) : [...d.DEMO_OBJETS_FICHIER], mesures: d.DEMO_MEASURES };
  }, demanderPremierPas);
}

/**
 * La graine du mode audit (app/audit/) : un plan vide, sans depot. La parcelle de depart arrive
 * avec la premiere position (le GPS, ou l'adresse de `depart`).
 */
export function graineAudit(){
  return graineDe({ objects: [], measures: [] });
}

/**
 * La graine de la vitrine (app/vitrine.ts) : le plan de demonstration, sans rien demander a
 * personne — ni plateforme, ni stockage du navigateur. La forme est celle que rend
 * `chargerProjetInitial` quand aucune API ne repond.
 */
export async function graineVitrine(demo?: { objects: ObjetBrut[]; measures: Mesure[] } | null){
  // Une demo de l'admin (`?mode=demo&file=<id>`, app/vitrine.ts), sinon la demonstration integree.
  if (demo) return graineDe(demo);
  const m = await demonstration();
  return graineDe({ objects: [...m.DEMO_OBJETS_FICHIER], measures: m.DEMO_MEASURES });
}

/** Une graine sans depot, sur ces objets et ces mesures (copies). */
function graineDe(d: { objects: unknown[]; measures: unknown[] }){
  return {
    apiAvailable: false,
    list: [] as ProjetResume[],
    objects: JSON.parse(JSON.stringify(d.objects)) as ObjetBrut[],
    measures: JSON.parse(JSON.stringify(d.measures)) as Mesure[],
    meta: null as ProjetResume | null,
    schemaVersion: null as number | null,
    ouvrirAdresse: false
  } satisfies GraineDemarrage;
}

/** Ce que `boot()` recoit : le derive de la fonction qui le produit, pas une forme ecrite a part. */
export type GraineDemarrage = Awaited<ReturnType<typeof loadInitialProject>>;
