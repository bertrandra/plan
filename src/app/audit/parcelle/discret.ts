// Le mode discret de l'audit (MD/spec-facade-calage-audit.md §4 ter.3, decision 18) : ce que l'audit montre de l'enchainement d'une
// facade. Il lit les etats que l'orchestrateur a calcules (facade/releve/enchainement.ts) et le mode d'audit de chaque etape (le
// contrat, model/etapeFacade.ts) ; il ne calcule rien de la facade. La calibration lit les memes etats et montre tout.
//
// - Une etape cachee (`cache` : E0, E2, E3, E5, E6) ne se montre que si elle echoue ou doute : elle passe alors en resume, avec son
//   option manuelle. Une etape cachee qui a reussi ne s'ouvre pas.
// - Une etape en resume (`resume` : E4, E7) tient en une ligne quand elle a reussi (« Mur posé »), et demande un geste sinon.
// - Les points de validation (V1 a V4) s'ouvrent toujours depuis la barre ; V4, la facade, se valide sous la barre (lot F5).

import { etapeFacade, type EtatAffiche, type IdEtape, type SegmentFacade } from '../../../model/etapeFacade.js';

/** Une etape telle que l'audit la lit : son etat et ce qu'elle a donne (`MesureFacade.etapes`). */
interface EtapeLue { id: IdEtape; etat: EtatAffiche; resume: string }

/** Une ligne sous la barre de la facade : l'etape, ce qu'elle a donne, et le geste de repli quand elle doute. */
export interface LigneDiscrete {
  id: IdEtape;
  etat: EtatAffiche;
  texte: string;
  /** Le geste de repli (le contrat de l'etape) ; null : rien a faire, l'etape a reussi. */
  option: string | null;
  /** Le geste se fait sur une photo : poser quatre reperes, tirer les angles, l'egout et le sol (E2 a E4). */
  surLaPhoto: boolean;
}

const DOUTE: readonly EtatAffiche[] = ['echec', 'a-confirmer'];
/** Les etapes dont le geste de repli se fait sur une photo de la facade (les reperes, le mur a la main). */
const SUR_LA_PHOTO: readonly IdEtape[] = ['redressement', 'assemblage', 'calage'];
/** Ce qu'une etape en resume dit d'elle quand elle a reussi : une ligne, et son resultat. */
const REUSSIE: Partial<Record<IdEtape, string>> = { calage: 'Mur posé', ouvertures: 'Ouvertures' };

/** Une etape doute-t-elle (en echec, ou a confirmer) ? */
const doute = (etat: EtatAffiche): boolean => DOUTE.includes(etat);

/**
 * Les lignes que l'audit montre sous la barre d'une facade, dans l'ordre de l'enchainement : chaque etape qui doute (cachee ou non),
 * avec son option manuelle, et une ligne par etape en resume qui a reussi. Rien pour une etape cachee qui a reussi, a venir ou sautee.
 */
export function lignesDiscretes(etapes: readonly EtapeLue[]): LigneDiscrete[] {
  const out: LigneDiscrete[] = [];
  for (const e of etapes) {
    const def = etapeFacade(e.id);
    if (doute(e.etat)) {
      out.push({ id: e.id, etat: e.etat, texte: def.nom + ' : ' + e.resume, option: def.optionManuelle, surLaPhoto: SUR_LA_PHOTO.includes(e.id) });
      continue;
    }
    const reussie = REUSSIE[e.id];
    if (e.etat === 'ok' && def.modeAudit === 'resume' && reussie) out.push({ id: e.id, etat: e.etat, texte: reussie + ' : ' + e.resume, option: null, surLaPhoto: false });
  }
  return out;
}

/** Un segment de la barre s'ouvre-t-il dans l'audit ? Ses points de validation, et ce qui doute ; une etape cachee qui a reussi, non. */
export function ouvrableDansLAudit(s: SegmentFacade, etat: EtatAffiche): boolean {
  return s.validation !== null || doute(etat);
}

/** La ligne d'une etape ouverte depuis la barre : son resultat, et son geste de repli (un point de validation le propose toujours). */
export function ligneOuverte(etapes: readonly EtapeLue[], id: IdEtape): LigneDiscrete {
  const e = etapes.find((x) => x.id === id), def = etapeFacade(id);
  const etat = e?.etat ?? 'a-venir';
  const texte = def.nom + ' : ' + (e?.resume ?? 'pas encore calculée.');
  const geste = doute(etat) || def.validation !== null;
  return { id, etat, texte, option: geste ? def.optionManuelle : null, surLaPhoto: geste && SUR_LA_PHOTO.includes(id) };
}
