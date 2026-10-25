// Ce que le demarrage recoit (app/boot.ts) : le projet initial, ou la graine de la vitrine et du mode audit.

import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../../model/demo.js';
import { chargerProjetInitial } from '../../io/api.js';
import { demanderPremierPas } from '../premierPas.js';
import type { ObjetBrut, Mesure } from '../../model/types.js';
import type { ProjetResume } from '../../io/api.js';

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
  return chargerProjetInitial(temoin ? DEMO_TEMOIN_OBJECTS : DEMO_OBJECTS, DEMO_MEASURES, demanderPremierPas);
}

/**
 * La graine de la vitrine (app/vitrine.ts) : le plan de demonstration, sans rien demander a
 * personne — ni plateforme, ni stockage du navigateur. La forme est celle que rend
 * `chargerProjetInitial` quand aucune API ne repond.
 */
/**
 * La graine du mode audit (app/audit/) : un plan vide, sans depot. La parcelle de depart arrive
 * avec la premiere position (le GPS, ou l'adresse de `depart`).
 */
export function graineAudit(){
  return { ...graineVitrine(), objects: [] as ObjetBrut[], measures: [] as Mesure[] } satisfies GraineDemarrage;
}

export function graineVitrine(demo?: { objects: ObjetBrut[]; measures: Mesure[] } | null){
  return {
    apiAvailable: false,
    list: [] as ProjetResume[],
    // Une demo de l'admin (`?mode=demo&file=<id>`, app/vitrine.ts), sinon la demonstration integree.
    objects: JSON.parse(JSON.stringify(demo ? demo.objects : DEMO_OBJECTS)) as ObjetBrut[],
    measures: JSON.parse(JSON.stringify(demo ? demo.measures : DEMO_MEASURES)) as Mesure[],
    meta: null as ProjetResume | null,
    schemaVersion: null as number | null,
    ouvrirAdresse: false
  } satisfies GraineDemarrage;
}

/** Ce que `boot()` recoit : le derive de la fonction qui le produit, pas une forme ecrite a part. */
export type GraineDemarrage = Awaited<ReturnType<typeof loadInitialProject>>;
