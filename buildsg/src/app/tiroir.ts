// Le tiroir des resultats (spec-ihm-zones §4.6 et §7.1, app/).
//
// Ce que le moteur calcule — chiffrage, coupe, implantation, chantier, cotes, PLU, resume — se lit
// dans un tiroir sous le plan, pleine largeur, repliable en trois hauteurs memorisees localement :
// replie (la barre d'onglets seule), mi-hauteur, plein. C'est l'option A de la spec : la boucle
// reglage → chiffrage se voit d'un seul regard, l'inspecteur a droite et le tiroir en bas.
//
// La barre d'onglets (zones/Resultats.tsx) et les panneaux (zones/resultats/) sont des zones React
// qui lisent l'onglet actif dans l'etat. Ce service tient la liste des onglets, refait le chiffrage
// a l'ouverture d'un onglet de terrasse, et pose la hauteur sur son conteneur. Les onglets d'une terrasse n'existent que quand une terrasse est
// selectionnee (decision 4 de la spec) : la terrasse courante, elle, survit a la selection d'un
// parasol pour que l'inspecteur et la 3D gardent leur contexte, mais les resultats sont ceux de
// ce qu'on a sous la main — sinon un plan a une terrasse montrerait son chiffrage en permanence.

import type { EtatApp } from '../core/state.js';
import type { ObjetPlan } from '../model/types.js';
import type { Magasin } from './magasin.js';
import { classePour, toucherSeul } from './classe.js';
import { reliefDe } from '../model/relief.js';

export type HauteurTiroir = 'replie' | 'mi' | 'plein';

export interface Onglet {
  id: string;
  libelle: string;
  /** L'identifiant du panneau (zones/resultats/Panneaux.tsx). */
  panneau: string;
  /** `terrasse` : n'existe qu'avec une terrasse selectionnee ; `piscine`, qu'avec une piscine selectionnee. */
  groupe: 'terrasse' | 'piscine' | 'plan';
  /** Un onglet du plan qui n'a de sens qu'avec une donnee du projet : `relief`, quand la parcelle en porte un. */
  requiert?: 'relief';
}

export const ONGLETS: Onglet[] = [
  { id: 'bom', libelle: 'Nomenclature', panneau: 'panelBom', groupe: 'terrasse' },
  { id: 'coupe', libelle: 'Coupe', panneau: 'panelCoupe', groupe: 'terrasse' },
  { id: 'implantation', libelle: 'Implantation', panneau: 'panelImplantation', groupe: 'terrasse' },
  { id: 'chantier', libelle: 'Chantier', panneau: 'panelChantier', groupe: 'terrasse' },
  { id: 'methode', libelle: 'Méthode', panneau: 'panelMethode', groupe: 'terrasse' },
  { id: 'noteCalcul', libelle: 'Note de calcul', panneau: 'panelNoteCalcul', groupe: 'piscine' },
  { id: 'mesure', libelle: 'Cotes', panneau: 'panelMesure', groupe: 'plan' },
  // Le profil du sol suit les cotes : c'est d'une cote qu'on prend sa ligne (MD/spec-relief.md §5.4).
  { id: 'profil', libelle: 'Profil', panneau: 'panelProfil', groupe: 'plan', requiert: 'relief' },
  { id: 'plu', libelle: 'PLU', panneau: 'panelPlu', groupe: 'plan' },
  { id: 'resume', libelle: 'Résumé', panneau: 'panelResume', groupe: 'plan' }
];

/**
 * Les onglets qui se montrent : ceux d'une terrasse ou d'une piscine seulement quand l'une est
 * selectionnee ; ceux qui demandent un relief seulement quand la parcelle en porte un.
 */
export function ongletsVisibles(terrasseSelectionnee: boolean, piscineSelectionnee = false, relief = false): Onglet[] {
  return ONGLETS.filter(o => {
    if (o.requiert === 'relief' && !relief) return false;
    return o.groupe === 'plan' || (o.groupe === 'terrasse' ? terrasseSelectionnee : piscineSelectionnee);
  });
}

export const HAUTEURS: HauteurTiroir[] = ['replie', 'mi', 'plein'];
const CLE_LOCALE = 'plan.tiroir';

/** Ce que le tiroir doit pouvoir declencher a l'ouverture d'un onglet. */
export interface ContexteTiroir {
  /** Les panneaux de la terrasse courante : chiffrage, coupe, implantation, chantier, methode. */
  refreshTerrasseView: () => void;
  /** La selection quand c'est une terrasse ; ce qui decide des onglets. */
  terrasseSelectionnee: () => ObjetPlan | undefined;
  /** La selection quand c'est une piscine : l'onglet Note de calcul la suit. */
  piscineSelectionnee: () => ObjetPlan | undefined;
}

export interface Tiroir {
  onglets(): Onglet[];
  /** Montre un onglet et rafraichit ce qu'il doit ; `ouvrir` deplie un tiroir replie. */
  activer(id: string, ouvrir?: boolean): void;
  definirHauteur(h: HauteurTiroir): void;
  /**
   * A appeler apres chaque rendu, avec `contexteChange` quand la terrasse courante a change : un
   * onglet de terrasse ouvert se refait pour elle, ou se replie sur Cotes quand plus aucune
   * terrasse n'est selectionnee.
   */
  synchroniser(contexteChange: boolean): void;
}

/**
 * La hauteur memorisee, sinon celle par defaut : replie sur tablette, ou le plan est plein ecran et
 * le tiroir replie montre deja les chiffres cles (maquette Tablette, 2.1.1) ; mi-hauteur ailleurs.
 */
function hauteurMemorisee(): HauteurTiroir {
  const defaut: HauteurTiroir = typeof window !== 'undefined' && classePour(window.innerWidth, toucherSeul()) === 'moyen' ? 'replie' : 'mi';
  try {
    const v = localStorage.getItem(CLE_LOCALE);
    return HAUTEURS.includes(v as HauteurTiroir) ? (v as HauteurTiroir) : defaut;
  } catch { return defaut; }
}

export function creerTiroir(etat: EtatApp, ctx: ContexteTiroir, magasin: Magasin): Tiroir {
  const terrasseSelectionnee = () => !!ctx.terrasseSelectionnee();
  const piscineSelectionnee = () => !!ctx.piscineSelectionnee();
  const estOngletTerrasse = (id: string) => ONGLETS.some(o => o.id === id && o.groupe === 'terrasse');
  const estOngletPiscine = (id: string) => ONGLETS.some(o => o.id === id && o.groupe === 'piscine');
  const estOngletRelief = (id: string) => ONGLETS.some(o => o.id === id && o.requiert === 'relief');
  const reliefPresent = () => !!reliefDe(etat.objects);


  function definirHauteur(h: HauteurTiroir): void {
    magasin.definirTiroir(h);
    const zone = document.getElementById('zoneResultats');
    if (zone) zone.dataset.hauteur = h;
    try { localStorage.setItem(CLE_LOCALE, h); } catch { /* stockage indisponible : la hauteur ne survit pas */ }
  }

  function activer(id: string, ouvrir = true): void {
    // Un onglet de terrasse sans terrasse selectionnee : les cotes, l'onglet du plan le plus proche.
    if ((estOngletTerrasse(id) && !terrasseSelectionnee()) || (estOngletPiscine(id) && !piscineSelectionnee()) || (estOngletRelief(id) && !reliefPresent())) id = 'mesure';
    etat.panelTab = id;
    // Le chiffrage part dans le projet enregistre : il se refait a l'ouverture, pas au rendu.
    if (estOngletTerrasse(id)) ctx.refreshTerrasseView();
    if (ouvrir && magasin.store.getState().tiroir === 'replie') definirHauteur('mi');
    magasin.notifier();
  }

  definirHauteur(hauteurMemorisee());

  return {
    onglets: () => ongletsVisibles(terrasseSelectionnee(), piscineSelectionnee(), reliefPresent()),
    activer,
    definirHauteur,
    synchroniser(contexteChange) {
      // L'onglet d'une piscine se replie sur les cotes des que la piscine n'est plus selectionnee ;
      // celui du profil, des que le relief est supprime (ou defait par Ctrl+Z).
      if (estOngletPiscine(etat.panelTab)) { if (!piscineSelectionnee()) activer('mesure', false); return; }
      if (estOngletRelief(etat.panelTab)) { if (!reliefPresent()) activer('mesure', false); return; }
      if (!estOngletTerrasse(etat.panelTab)) return;
      if (!terrasseSelectionnee()) activer('mesure', false);
      else if (contexteChange) ctx.refreshTerrasseView();
    }
  };
}
