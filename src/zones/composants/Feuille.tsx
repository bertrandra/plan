// Les feuilles du telephone (MD/spec-ihm-mobile.md §5.5) : un panneau qui monte du bas.
//
// Une feuille n'est pas un conteneur nouveau : c'est une zone existante — palette, explorateur,
// inspecteur, tiroir, menus — que la feuille de style pose en bas de l'ecran quand
// `<html data-feuille>` la nomme. Ce module fournit ce que toutes partagent :
//
//   - `EnteteFeuille`, rendue par chaque zone en tete de son contenu sur telephone : la poignee,
//     qu'on glisse pour changer la hauteur (ou fermer), le titre, le bouton de fermeture ;
//   - `Voile`, la zone `#zoneFeuilles` : le voile derriere la feuille, qui la ferme au toucher,
//     Echap qui la ferme au clavier, et le focus qui entre dans la feuille puis revient au bouton
//     qui l'avait ouverte.
//
// Rien ici ne connait le contenu d'une feuille.

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { Icone } from '../icones.js';
import type { Feuille, HauteurFeuille, Magasin } from '../../app/magasin.js';

const ORDRE: HauteurFeuille[] = ['apercu', 'mi', 'plein'];
/** Le glisser minimal, en pixels, pour changer de hauteur : en dessous, c'est un toucher. */
const SEUIL_GLISSER = 36;

export interface PropsEntete {
  magasin: Magasin;
  titre: string;
  sousTitre?: string | undefined;
  /** Ce qui se pose a droite du titre, avant le bouton de fermeture. */
  actions?: React.ReactNode;
}

export function EnteteFeuille({ magasin, titre, sousTitre, actions }: PropsEntete) {
  const debut = useRef<{ y: number; id: number } | null>(null);
  const hauteur = useStore(magasin.store, (s) => s.hauteurFeuille);
  const fermer = () => magasin.definirFeuille(null);
  const monter = () => { const i = ORDRE.indexOf(hauteur); if (i < ORDRE.length - 1) magasin.definirHauteurFeuille(ORDRE[i + 1]!); };
  const descendre = () => { const i = ORDRE.indexOf(hauteur); if (i <= 0) fermer(); else magasin.definirHauteurFeuille(ORDRE[i - 1]!); };
  return (
    <div className="enteteFeuille">
      {/* La poignee se glisse au doigt ; au clavier, c'est un bouton qui fait passer d'une hauteur a
          l'autre (fleches haut et bas). */}
      <button type="button" className="poigneeFeuille" aria-label={'Hauteur de la feuille : ' + (hauteur === 'plein' ? 'plein écran' : hauteur === 'mi' ? 'mi-hauteur' : 'aperçu')}
        onPointerDown={(e) => { debut.current = { y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp={(e) => {
          const d = debut.current; debut.current = null;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (dy < -SEUIL_GLISSER) monter();
          else if (dy > SEUIL_GLISSER) descendre();
          else if (hauteur === 'plein') magasin.definirHauteurFeuille('mi');
          else monter();
        }}
        onPointerCancel={() => { debut.current = null; }}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); monter(); } if (e.key === 'ArrowDown') { e.preventDefault(); descendre(); } }}>
        <span aria-hidden="true" />
      </button>
      <div className="enteteFeuilleLigne">
        <div className="enteteFeuilleTitres">
          <h2 className="titreFeuille">{titre}</h2>
          {sousTitre && <span className="sousTitreFeuille">{sousTitre}</span>}
        </div>
        {actions}
        <button type="button" className="boutonIcone fermerFeuille" aria-label="Fermer" onClick={fermer}>
          <Icone nom="fermer" taille={20} />
        </button>
      </div>
    </div>
  );
}

/** Les conteneurs d'index.html qui portent chaque feuille : c'est la que le focus entre. */
export const HOTE_DE_FEUILLE: Record<Feuille, string> = {
  projet: 'projectBar', outils: 'zonePalette', objets: 'zoneExplorateur', proprietes: 'zoneInspecteur',
  resultats: 'zoneResultats', reglages3d: 'zoneReglages3d'
};

/** Le conteneur de la feuille ; les reglages sont ceux de la vue 3D ou de la visionneuse. */
function hote(feuille: Feuille, vue: string): HTMLElement | null {
  if (feuille === 'reglages3d' && vue === 'visionneuse') return document.getElementById('zoneReglagesGlb');
  return document.getElementById(HOTE_DE_FEUILLE[feuille]);
}

export function Voile({ magasin }: { magasin: Magasin }) {
  const feuille = useStore(magasin.store, (s) => s.feuille);
  const classe = useStore(magasin.store, (s) => s.classe);
  const vue = useStore(magasin.store, (s) => s.vue);
  const origine = useRef<HTMLElement | null>(null);

  // Les reglages 3D n'ont plus d'objet quand on revient au plan.
  useEffect(() => {
    if (vue === 'plan' && magasin.store.getState().feuille === 'reglages3d') magasin.definirFeuille(null);
  }, [vue, magasin]);

  // Le focus entre dans la feuille a l'ouverture, et revient au bouton d'origine a la fermeture.
  useEffect(() => {
    if (!feuille) {
      if (origine.current && document.contains(origine.current)) origine.current.focus();
      origine.current = null;
      return;
    }
    if (!origine.current) origine.current = document.activeElement as HTMLElement | null;
    const cible = hote(feuille, magasin.store.getState().vue)?.querySelector<HTMLElement>('.fermerFeuille');
    // Apres le rendu de la zone, qui vient de recevoir son entete.
    requestAnimationFrame(() => cible?.focus({ preventScroll: true }));
  }, [feuille, magasin]);

  // Echap ferme la feuille — sauf quand un menu ou un dialogue ouvert par-dessus s'en occupe.
  useEffect(() => {
    if (!feuille) return;
    const surTouche = (e: KeyboardEvent) => {
      if (magasin.store.getState().classe === 'large') return;
      if (document.querySelector('.dialogueVoile')) return;
      if (e.key === 'Escape' && !e.defaultPrevented) { magasin.definirFeuille(null); return; }
      // Le focus reste dans la feuille : Tab au dernier element revient au premier, et l'inverse.
      if (e.key !== 'Tab') return;
      const conteneur = hote(feuille, magasin.store.getState().vue);
      if (!conteneur) return;
      const focusables = [...conteneur.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const premier = focusables[0]!, dernier = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      else if (!conteneur.contains(document.activeElement)) { e.preventDefault(); premier.focus(); }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [feuille, magasin]);

  // Les boutons de fermeture des feuilles ecrites dans index.html (les reglages 3D) et les boutons
  // qui les ouvrent : du balisage statique, branche ici une fois.
  useEffect(() => {
    const surClic = (e: MouseEvent) => {
      const cible = e.target as Element | null;
      if (cible?.closest('[data-fermer-feuille]')) magasin.definirFeuille(null);
      else if (cible?.closest('#reglages3dBtn, #reglagesGlbBtn')) {
        magasin.definirFeuille(magasin.store.getState().feuille === 'reglages3d' ? null : 'reglages3d');
      }
    };
    document.addEventListener('click', surClic);
    return () => document.removeEventListener('click', surClic);
  }, [magasin]);

  if (!feuille || classe === 'large') return null;
  // Sur tablette, les panneaux deroulants (Projet, Reglages 3D) n'assombrissent pas le plan : le
  // voile est transparent, il ne sert qu'a fermer au toucher ailleurs.
  return <div className={'voileFeuille' + (classe === 'moyen' ? ' voileTransparent' : '')} aria-hidden="true" onClick={() => magasin.definirFeuille(null)} />;
}
