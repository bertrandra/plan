// Ce que la Vue 3D et la visionneuse partagent dans leurs panneaux : l'entete des reglages, les
// lignes du soleil, la barre de l'heure et la liste des points de vue.
//
// Les deux vues ont chacune leur soleil (spec §6.4) : les memes lignes, sur deux etats separes, avec
// les identifiants de chaque vue (`IdsSoleil`), que la feuille de style et la liste de fumee retrouvent.

import { useStore } from 'zustand';
import { Icone } from '../icones.js';
import type { Magasin } from '../../app/magasin.js';
import type { ObjetPlan } from '../../model/types.js';
import type { ReglagesSoleil as ServiceSoleil } from '../../app/ecouteurs/soleil.js';
import type { ReglagesVue3d } from '../../app/ecouteurs/vue3d.js';
import type { ReglagesVisionneuse } from '../../app/ecouteurs/visionneuse.js';

/** Ce que les deux panneaux demandent au programme. */
export interface ServiceVues3d {
  reglages: ReglagesVue3d;
  visionneuse: ReglagesVisionneuse;
  soleil3d: ServiceSoleil;
  soleilGlb: ServiceSoleil;
  allerAuPointDeVue: (vp: ObjetPlan) => void;
  allerAuPointDeVueGlb: (vp: ObjetPlan) => void;
  libelleLieu: () => string;
  formatHeure: (minutes: number) => string;
  /** La scene suit la taille de son hote (plein page, redimensionnement). */
  redimensionner3d: () => void;
  redimensionnerGlb: () => void;
}

/**
 * Les identifiants des commandes du soleil d'une vue, ecrits en toutes lettres : la liste de fumee
 * et `tests/unit/zones/identifiants.test.ts` les cherchent tels quels.
 */
export interface IdsSoleil { vue: 'vue3d' | 'visionneuse'; date: string; semaine: string; heure: string; heureTexte: string; intensite: string; intensiteTexte: string; appoint: string; info?: string }

/** L'entete des reglages : sur telephone et tablette, c'est l'entete d'une feuille qu'on ferme. */
export function EnteteReglages({ vue, titre, idLieu, lieu, magasin }: { vue: 'vue3d' | 'visionneuse'; titre: string; idLieu: string; lieu: string; magasin: Magasin }) {
  return (
    <div className="enteteFeuille enteteStatique">
      <div className="enteteFeuilleLigne">
        <div className="enteteFeuilleTitres"><h2 className="titreFeuille">{titre}</h2><span id={idLieu} className="sousTitreFeuille">{lieu}</span></div>
        <button type="button" data-controle={vue + '.fermerReglages'} className="boutonIcone fermerFeuille" aria-label="Fermer" onClick={() => magasin.definirFeuille(null)}>
          <Icone nom="fermer" taille={20} />
        </button>
      </div>
    </div>
  );
}

/** La date et le curseur « semaine » : chaque cran decale la date de sept jours. */
export function LigneDate({ ids, soleil, avecEtiquette }: { ids: IdsSoleil; soleil: ServiceSoleil; avecEtiquette?: boolean }) {
  return (
    <div className="controls ligneReglage">
      {avecEtiquette && <span className="etiquetteReglage" title="Position reelle du soleil (leve a l'Est, couche a l'Ouest) pour la date et l'heure choisies, au lieu indique">
        <Icone nom="soleil" taille={20} /> Soleil</span>}
      <label htmlFor={ids.date} className="petitLibelle">Date</label>
      <input type="date" id={ids.date} data-controle={ids.vue + '.date'} value={soleil.etat.dateStr} onChange={(e) => soleil.date(e.target.value)} />
      <input type="range" id={ids.semaine} data-controle={ids.vue + '.semaine'} min={0} max={52} step={1} value={soleil.etat.semaineAffichee} aria-label="Semaine de l'année"
        title="Semaine de l'annee - avance/recule de 7 jours a chaque cran" style={{ width: 110 }}
        onChange={(e) => soleil.semaine(parseInt(e.target.value, 10))} />
    </div>
  );
}

/** Les lumieres autres que le soleil : decochees, l'eclairage est entierement solaire. */
export function CaseAppoint({ ids, soleil }: { ids: IdsSoleil; soleil: ServiceSoleil }) {
  return (
    <label className="caseReglage" title="Lumieres autres que le soleil (l'appoint qui eclaire faiblement le cote a l'ombre, et l'ambiante generale) - decoche pour un eclairage entierement au soleil, jusqu'au noir complet une fois couche">
      <input type="checkbox" id={ids.appoint} data-controle={ids.vue + '.appoint'} checked={soleil.etat.lumiereAppoint} onChange={(e) => soleil.appoint(e.target.checked)} /> Lumière d'appoint
    </label>
  );
}

/** L'intensite du soleil, en pourcentage de l'eclairage physique de l'heure. */
export function LigneIntensite({ ids, soleil, children }: { ids: IdsSoleil; soleil: ServiceSoleil; children?: React.ReactNode }) {
  const pourcent = Math.round(soleil.etat.intensiteSoleil * 100);
  return (
    <div className="controls ligneReglage">
      <span className="etiquetteReglage" title="Multiplie l'intensite du soleil - 100 % = eclairage physique pour l'heure choisie ; au-dela, la scene est volontairement sureclairee pour mieux voir les details">
        <Icone nom="soleil" taille={20} /> Intensité</span>
      <input type="range" id={ids.intensite} data-controle={ids.vue + '.intensite'} min={25} max={300} step={5} value={pourcent} aria-label="Intensité du soleil" style={{ flex: 1, maxWidth: 160 }}
        onChange={(e) => soleil.intensite(parseInt(e.target.value, 10))} />
      <span id={ids.intensiteTexte} className="valeurReglage">{pourcent + ' %'}</span>
      {children}
    </div>
  );
}

/** Les reglages du soleil de la Vue 3D : la date, puis l'intensite et l'appoint. */
export function ReglagesSoleil({ ids, soleil }: { ids: IdsSoleil; soleil: ServiceSoleil }) {
  return (
    <>
      <LigneDate ids={ids} soleil={soleil} avecEtiquette />
      <LigneIntensite ids={ids} soleil={soleil}><CaseAppoint ids={ids} soleil={soleil} /></LigneIntensite>
    </>
  );
}

/** L'heure, toujours visible sous la scene : c'est le reglage qu'on fait glisser en regardant. */
export function BarreHeure({ ids, id, soleil, formatHeure, info }: { ids: IdsSoleil; id: string; soleil: ServiceSoleil; formatHeure: (m: number) => string; info?: string }) {
  return (
    <div id={id} className="controls barreSoleil">
      <span className="etiquetteReglage" title="Position reelle du soleil (leve a l'Est, couche a l'Ouest) pour la date et l'heure choisies, au lieu indique">Heure</span>
      <input type="range" id={ids.heure} data-controle={ids.vue + '.heure'} min={0} max={1439} step={5} value={soleil.etat.minutes} aria-label="Heure" style={{ flex: 1, maxWidth: 260 }}
        onChange={(e) => soleil.heure(parseInt(e.target.value, 10))} />
      <span id={ids.heureTexte} className="valeurReglage">{formatHeure(soleil.etat.minutes)}</span>
      {info !== undefined && <span id={ids.info} className="infoSoleil" title="Hauteur du soleil au-dessus de l'horizon et direction d'ou il vient, pour la date, l'heure et le lieu choisis">{info}</span>}
    </div>
  );
}

/**
 * Les points de vue du plan (objets de fonction « camera »), globaux au plan. La liste se remet a
 * vide apres usage : elle declenche un deplacement, elle n'affiche pas un choix courant — laisser le
 * point de vue selectionne ferait croire qu'on y est reste, alors que la camera a pu bouger.
 */
export function ListePointsDeVue({ vue, id, magasin, aller }: { vue: 'vue3d' | 'visionneuse'; id: string; magasin: Magasin; aller: (vp: ObjetPlan) => void }) {
  useStore(magasin.store, (s) => s.version);
  const vues = magasin.store.getState().etat.objects.filter(o => o.fonction === 'camera');
  return (
    <select id={id} data-controle={vue + '.pointDeVue'} aria-label="Aller à un point de vue enregistré" value="" disabled={vues.length === 0}
      onChange={(e) => { const vp = vues.find(v => v.key === e.target.value); if (vp) aller(vp); }}>
      <option value="">Aller a un point de vue enregistre…</option>
      {vues.map(v => <option key={v.key} value={v.key}>{v.name}</option>)}
    </select>
  );
}
