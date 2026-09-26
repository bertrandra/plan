// Les commandes de navigation posees sur le canevas lui-meme (spec-ihm-zones §4.4, spec-ihm-mobile §6.4).
//
// Des boutons qu'on actionne en regardant le plan, pas en fouillant un panneau : la grille, le
// cadrage sur la selection et, sur telephone et tablette, la fleche Nord. Leur etat — grille
// visible, cadrage possible — se lit dans le magasin.
//
// S'y ajoutent, sur telephone et tablette, deux affichages qui remplacent la barre d'etat : la
// pastille d'echelle (et la position du doigt pendant un glisser), et le bandeau d'un pointage en
// cours — Cote ou Aligner — qui dit quoi toucher et permet d'en sortir (Annuler, Terminer, ou
// Echap), ce qu'aucun geste ne permettait avant.

import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Pointage } from '../interaction/outilMesure.js';
import { Icone } from './icones.js';
import { niceStep } from '../util/format.js';

/** Le pointage en cours de l'outil de cotation ou d'alignement, et le moyen d'en sortir. */
export interface ServicePointage {
  courant(): Pointage | null;
  /** Arrete le pointage : la cote en cours garde ce qui est deja designe. */
  arreter(): void;
}

export interface PropsSurimpression { magasin: Magasin; commandes: RegistreCommandes; pointage: ServicePointage }

const metres = (v: number) => (Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function consigne(p: Pointage): string {
  if (p.purpose === 'align') return 'Désignez le côté cible sur le plan : l\'objet pivotera pour lui devenir parallèle.';
  if (p.mode === 'ref') return 'Désignez le côté de référence de la cote sur le plan.';
  return 'Désignez les coins à coter, puis « Terminer ».';
}

export function Surimpression({ magasin, commandes, pointage }: PropsSurimpression) {
  useStore(magasin.store, (s) => s.version);
  const classe = useStore(magasin.store, (s) => s.classe);
  const pointeur = useStore(magasin.store, (s) => s.pointeur);
  const etat = magasin.store.getState().etat;
  const grille = etat.grilleVisible;
  const cadrable = !!etat.selectedKey;
  const p = pointage.courant();

  // Echap arrete un pointage en cours, sur toutes les classes (spec-ihm-mobile §2.3, D3).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !pointage.courant()) return;
      if (document.querySelector('.dialogueVoile')) return;
      e.preventDefault();
      pointage.arreter();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [pointage]);

  // Pendant un pointage, la feuille de selection s'efface : le bandeau prend sa place en bas.
  useEffect(() => { document.documentElement.toggleAttribute('data-pointage', !!p); }, [p]);

  const bandeau = p && (
    <div className="bandeauMode" role="status">
      <span className="consigneMode">{consigne(p)}</span>
      <button type="button" className={p.mode === 'target' ? '' : 'secondary'} onClick={() => pointage.arreter()}>
        {p.mode === 'target' ? 'Terminer' : 'Annuler'}
      </button>
    </div>
  );

  if (classe === 'large') {
    return (
      <>
        <button type="button" id="gridBtn" className={grille ? '' : 'off'} aria-pressed={grille}
          title={(grille ? 'Masquer' : 'Afficher') + ' la grille du plan'}
          onClick={() => { commandes.executer('affichage.grille'); }}><Icone nom="grille" taille={18} /></button>
        {cadrable && (
          <button type="button" id="fitBtn" title="Ajuster la vue à l'objet sélectionné"
            onClick={() => { commandes.executer('vue.ajuster'); }}><Icone nom="ajuster" taille={16} /> Ajuster à la sélection</button>
        )}
        {bandeau}
      </>
    );
  }

  // Une echelle graphique plutot qu'un rapport : « 1:100 » depend de la densite de l'ecran, un
  // trait de 5 m reste vrai sur tous. Le trait vise 48 px et tombe sur une longueur ronde.
  const pasEchelle = niceStep(48 / etat.scene.scale);
  return (
    <>
      <div className="groupeFlottant" role="group" aria-label="Vue du plan">
        <button type="button" id="fitBtn" disabled={!cadrable} aria-label="Ajuster la vue à la sélection" title="Ajuster la vue à la sélection"
          onClick={() => { commandes.executer('vue.ajuster'); }}><Icone nom="ajuster" taille={20} /></button>
        <button type="button" id="gridBtn" className={grille ? 'actif' : ''} aria-pressed={grille} aria-label="Grille du plan"
          onClick={() => { commandes.executer('affichage.grille'); }}><Icone nom="grille" taille={20} /></button>
        <button type="button" className={etat.showNorth ? 'actif' : ''} aria-pressed={etat.showNorth} aria-label="Flèche Nord"
          data-commande="affichage.nord" onClick={() => { commandes.executer('affichage.nord'); }}><Icone nom="nord" taille={20} /></button>
      </div>
      <div className="pastilleEchelle" aria-live="off" title={'1 m = ' + Math.round(etat.scene.scale) + ' px'}>
        {pointeur
          ? 'x ' + metres(pointeur.x) + ' · y ' + metres(pointeur.y) + ' m'
          : <>Échelle <span className="barreEchelle" style={{ width: Math.round(pasEchelle * etat.scene.scale) + 'px' }} aria-hidden="true" /> {pasEchelle.toLocaleString('fr-FR')} m</>}
      </div>
      {bandeau}
    </>
  );
}
