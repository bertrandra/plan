// Le tiroir des resultats (spec-ihm-zones §4.6 et §7.1, app/).
//
// Ce que le moteur calcule — chiffrage, coupe, implantation, chantier, cotes, PLU, resume — se lit
// dans un tiroir sous le plan, pleine largeur, repliable en trois hauteurs memorisees localement :
// replie (la barre d'onglets seule), mi-hauteur, plein. C'est l'option A de la spec : la boucle
// reglage → chiffrage se voit d'un seul regard, l'inspecteur a droite et le tiroir en bas.
//
// La barre d'onglets est une zone React (zones/Resultats.tsx) ; les panneaux, eux, restent du
// balisage que `ui/` remplit — tables du BOM, coupe, implantation. Ce service tient la liste des
// onglets, montre le panneau choisi, rafraichit ce qui doit l'etre a l'ouverture, et pose la
// hauteur sur son conteneur. Les onglets d'une terrasse n'existent que quand une terrasse est
// selectionnee (decision 4 de la spec) : la terrasse courante, elle, survit a la selection d'un
// parasol pour que l'inspecteur et la 3D gardent leur contexte, mais les resultats sont ceux de
// ce qu'on a sous la main — sinon un plan a une terrasse montrerait son chiffrage en permanence.

import type { EtatApp } from '../core/state.js';
import type { ObjetPlan } from '../model/types.js';
import type { Magasin } from './magasin.js';

export type HauteurTiroir = 'replie' | 'mi' | 'plein';

export interface Onglet {
  id: string;
  libelle: string;
  /** Le panneau d'index.html que l'onglet montre. */
  panneau: string;
  /** `terrasse` : n'existe qu'avec une terrasse selectionnee. */
  groupe: 'terrasse' | 'plan';
}

export const ONGLETS: Onglet[] = [
  { id: 'bom', libelle: 'BOM', panneau: 'panelBom', groupe: 'terrasse' },
  { id: 'coupe', libelle: 'Plan de coupe', panneau: 'panelCoupe', groupe: 'terrasse' },
  { id: 'implantation', libelle: 'Implantation', panneau: 'panelImplantation', groupe: 'terrasse' },
  { id: 'chantier', libelle: 'Chantier', panneau: 'panelChantier', groupe: 'terrasse' },
  { id: 'methode', libelle: 'Méthode', panneau: 'panelMethode', groupe: 'terrasse' },
  { id: 'mesure', libelle: 'Cotes', panneau: 'panelMesure', groupe: 'plan' },
  { id: 'plu', libelle: 'PLU', panneau: 'panelPlu', groupe: 'plan' },
  { id: 'resume', libelle: 'Résumé', panneau: 'panelResume', groupe: 'plan' }
];

/** Les onglets qui se montrent : ceux d'une terrasse seulement quand une terrasse est selectionnee. */
export function ongletsVisibles(terrasseSelectionnee: boolean): Onglet[] {
  return ONGLETS.filter(o => o.groupe !== 'terrasse' || terrasseSelectionnee);
}

export const HAUTEURS: HauteurTiroir[] = ['replie', 'mi', 'plein'];
const CLE_LOCALE = 'plan.tiroir';

/** Ce que le tiroir doit pouvoir declencher a l'ouverture d'un onglet. */
export interface ContexteTiroir {
  rebuildMeasurePanel: () => void;
  renderMeasureResults: () => void;
  renderPanneauPlu: () => void;
  /** Les panneaux de la terrasse courante : chiffrage, coupe, implantation, chantier, methode. */
  refreshTerrasseView: () => void;
  /** La selection quand c'est une terrasse ; ce qui decide des onglets. */
  terrasseSelectionnee: () => ObjetPlan | undefined;
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

function hauteurMemorisee(): HauteurTiroir {
  try {
    const v = localStorage.getItem(CLE_LOCALE);
    return HAUTEURS.includes(v as HauteurTiroir) ? (v as HauteurTiroir) : 'mi';
  } catch { return 'mi'; }
}

export function creerTiroir(etat: EtatApp, ctx: ContexteTiroir, magasin: Magasin): Tiroir {
  const terrasseSelectionnee = () => !!ctx.terrasseSelectionnee();
  const estOngletTerrasse = (id: string) => ONGLETS.some(o => o.id === id && o.groupe === 'terrasse');

  function montrer(id: string): void {
    ONGLETS.forEach(o => {
      const el = document.getElementById(o.panneau);
      if (el) el.style.display = o.id === id ? '' : 'none';
    });
  }

  function rafraichir(id: string): void {
    if (id === 'mesure') { ctx.rebuildMeasurePanel(); ctx.renderMeasureResults(); }
    else if (id === 'plu') ctx.renderPanneauPlu();
    else if (estOngletTerrasse(id)) ctx.refreshTerrasseView();
  }

  function definirHauteur(h: HauteurTiroir): void {
    magasin.definirTiroir(h);
    const zone = document.getElementById('zoneResultats');
    if (zone) zone.dataset.hauteur = h;
    try { localStorage.setItem(CLE_LOCALE, h); } catch { /* stockage indisponible : la hauteur ne survit pas */ }
  }

  function activer(id: string, ouvrir = true): void {
    // Un onglet de terrasse sans terrasse selectionnee : les cotes, l'onglet du plan le plus proche.
    if (estOngletTerrasse(id) && !terrasseSelectionnee()) id = 'mesure';
    etat.panelTab = id;
    montrer(id);
    rafraichir(id);
    if (ouvrir && magasin.store.getState().tiroir === 'replie') definirHauteur('mi');
    magasin.notifier();
  }

  definirHauteur(hauteurMemorisee());

  return {
    onglets: () => ongletsVisibles(terrasseSelectionnee()),
    activer,
    definirHauteur,
    synchroniser(contexteChange) {
      if (!estOngletTerrasse(etat.panelTab)) return;
      if (!terrasseSelectionnee()) activer('mesure', false);
      else if (contexteChange) ctx.refreshTerrasseView();
    }
  };
}
