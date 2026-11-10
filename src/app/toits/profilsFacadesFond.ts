// Le choix des profils de facades en tache de fond (MD/spec-facades-calage-detection.md §15.2, plan
// de la vague 3, G12).
//
// Chaque batiment porte le profil de facades retenu pour lui (`profilFacades`) et la version de la
// lecture qui l'a choisi (regles/facades/reglages.ts, VERSION_LECTURE_FACADES, ou entre l'empreinte de
// regles/facades/reglages.json). Un batiment sans marque, ou marque d'une version plus ancienne, voit
// son profil rechoisi ici, par lots, sans bloquer l'interface : une pause entre deux lots rend la main
// au navigateur. Le choix ne lit pas le reseau (les attributs BD TOPO sont deja dans le plan) ; seuls
// les batiments dont le profil change se redessinent.
//
// Comme pour les toits, la parcelle du projet et les batiments verifies sur place ne sont jamais
// rechoisis (plan de la vague 3, §1 ; F§15.4) : un profil ne s'applique qu'au voisinage et aux
// batiments non verifies, et les releves de la parcelle l'emportent toujours sur l'automatique.
//
// Sans autre profil que le defaut dans le fichier livre, rien ne tourne et rien ne s'ecrit : un projet
// s'ouvre et s'enregistre a l'identique.
//
// Les ecritures ne passent pas par l'historique (Ctrl+Z ne defait pas un choix de profil), mais
// marquent le projet a enregistrer : la marque evite de rechoisir a la reouverture.

import { contexteProfilsFacades, profilFacadesDuBatiment } from '../../facade/regles/facades/profils.js';
import { PROFILS_FACADES, PROFIL_FACADES_DEFAUT, VERSION_LECTURE_FACADES, type ProfilFacades } from '../../regles/facades/reglages.js';
import { ecrivainPeut } from '../../model/protections.js';
import { surParcelleDuProjet } from '../../model/fonctions.js';
import type { ObjetPlan } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';
import { toucher } from '../../core/controleurObjets.js';
import { estOuvrage, BATIMENT } from '../../model/ouvrages/index.js';

/** Combien de batiments par lot : le choix est rapide, la mitoyennete parcourt les voisins proches. */
export const LOT_PROFILS_FACADES = 100;

/** Ce batiment voit-il son profil de facades (re)choisi a cette version ? */
export function profilARechoisir(o: ObjetPlan, version: number = VERSION_LECTURE_FACADES): boolean {
  if (!estOuvrage(o, BATIMENT) || o.type !== 'polygon' || !Array.isArray(o.pts) || o.pts.length < 3) return false;
  // Le projet garde le profil par defaut ; un batiment verifie sur place, le sien (model/protections.ts).
  if (surParcelleDuProjet(o) || !ecrivainPeut(o, 'faits', 'facades')) return false;
  return o.batiment?.profilFacades?.version !== version;
}

/** Ce qu'un passage a fait : les batiments dont le profil a change (a redessiner), et combien sont marques. */
export interface BilanProfilsFacades { changes: string[]; marques: number }

/**
 * Rechoisit le profil d'au plus `max` batiments a rechoisir, et les marque de la version. Exportee pour
 * les tests, qui l'essaient sur un fichier de profils d'essai.
 */
export function rechoisirProfilsFacades(objets: readonly ObjetPlan[], options: { profils?: readonly ProfilFacades[]; version?: number; max?: number } = {}): BilanProfilsFacades {
  const profils = options.profils ?? PROFILS_FACADES, version = options.version ?? VERSION_LECTURE_FACADES;
  const bilan: BilanProfilsFacades = { changes: [], marques: 0 };
  const lot = objets.filter((o) => profilARechoisir(o, version)).slice(0, options.max ?? Infinity);
  if (!lot.length) return bilan;
  const ctx = contexteProfilsFacades(objets, profils);
  for (const o of lot) {
    const avant = o.batiment?.profilFacades?.id ?? PROFIL_FACADES_DEFAUT;
    const { id } = profilFacadesDuBatiment(o, ctx, profils);
    champsBatiment(o).profilFacades = { id, version };
    toucher(o);
    bilan.marques++;
    if (id !== avant) bilan.changes.push(o.key);
  }
  return bilan;
}

export interface ContexteProfilsFacadesFond {
  /** Les objets du plan courant : relus a chaque lot (une annulation remplace le tableau). */
  objets: () => ObjetPlan[];
  /** Un plan en lecture seule n'enregistrera pas ce qu'on choisirait : rien ne se lance. */
  lectureSeule: () => boolean;
  /** Un lot vient d'etre ecrit : redessiner les batiments dont le profil a change, marquer a enregistrer. */
  apresLot: (bilan: BilanProfilsFacades) => void;
  /** Rend la main au navigateur entre deux lots ; remplacable dans les tests. */
  pause?: () => Promise<void>;
  /** Les profils ; ceux du fichier livre par defaut (les tests passent un fichier d'essai). */
  profils?: readonly ProfilFacades[];
  version?: number;
}

export interface ProfilsFacadesFond {
  /** (Re)lance le choix sur le plan courant ; rend une promesse tenue quand il n'y a plus rien a choisir. */
  relancer: () => Promise<void>;
  arreter: () => void;
  enCours: () => boolean;
}

const pauseNavigateur = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export function creerProfilsFacadesFond(ctx: ContexteProfilsFacadesFond): ProfilsFacadesFond {
  const profils = ctx.profils ?? PROFILS_FACADES, version = ctx.version ?? VERSION_LECTURE_FACADES;
  let passe = 0, actif = false;
  const relancer = async (): Promise<void> => {
    // Sans profil, tous les batiments ont le defaut : rien a choisir, rien a ecrire.
    if (!profils.length || ctx.lectureSeule()) return;
    const ici = ++passe;
    actif = true;
    try {
      for (;;) {
        await (ctx.pause ?? pauseNavigateur)();
        if (ici !== passe || ctx.lectureSeule()) return;
        const bilan = rechoisirProfilsFacades(ctx.objets(), { profils, version, max: LOT_PROFILS_FACADES });
        if (!bilan.marques) return;
        ctx.apresLot(bilan);
      }
    } finally {
      if (ici === passe) actif = false;
    }
  };
  return { relancer, arreter: () => { passe++; actif = false; }, enCours: () => actif };
}
