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

export function Voile({ magasin }: { magasin: Magasin }) {
  const feuille = useStore(magasin.store, (s) => s.feuille);
  const classe = useStore(magasin.store, (s) => s.classe);
  const origine = useRef<HTMLElement | null>(null);

  // Le focus entre dans la feuille a l'ouverture, et revient au bouton d'origine a la fermeture.
  useEffect(() => {
    if (!feuille) {
      if (origine.current && document.contains(origine.current)) origine.current.focus();
      origine.current = null;
      return;
    }
    if (!origine.current) origine.current = document.activeElement as HTMLElement | null;
    const hote = document.getElementById(HOTE_DE_FEUILLE[feuille]);
    const cible = hote?.querySelector<HTMLElement>('.fermerFeuille');
    // Apres le rendu de la zone, qui vient de recevoir son entete.
    requestAnimationFrame(() => cible?.focus({ preventScroll: true }));
  }, [feuille]);

  // Echap ferme la feuille — sauf quand un menu ou un dialogue ouvert par-dessus s'en occupe.
  useEffect(() => {
    if (!feuille) return;
    const surTouche = (e: KeyboardEvent) => {
      if (magasin.store.getState().classe !== 'compact') return;
      if (document.querySelector('.dialogueVoile')) return;
      if (e.key === 'Escape' && !e.defaultPrevented) { magasin.definirFeuille(null); return; }
      // Le focus reste dans la feuille : Tab au dernier element revient au premier, et l'inverse.
      if (e.key !== 'Tab') return;
      const hote = document.getElementById(HOTE_DE_FEUILLE[feuille]);
      if (!hote) return;
      const focusables = [...hote.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const premier = focusables[0]!, dernier = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      else if (!hote.contains(document.activeElement)) { e.preventDefault(); premier.focus(); }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [feuille, magasin]);

  if (classe !== 'compact' || !feuille) return null;
  return <div className="voileFeuille" aria-hidden="true" onClick={() => magasin.definirFeuille(null)} />;
}
