// L'onglet Couleurs de l'ecran de la palette : la liste des jetons, une ligne par jeton, a gauche,
// et l'apercu collant a droite. Regler une couleur et voir son effet se font sans defiler.
//
// La liste se filtre (toutes, modifiees, contraste insuffisant) et se cherche par nom ou par role ;
// chaque ligne porte le reglage de chaque theme montre et son etat ecrit en toutes lettres. L'apercu
// montre, par theme, les commandes de l'atelier ou la planche d'ambiance. Au doigt, il s'ouvre en
// feuille depuis le bouton « Aperçu ».

import { useContext, useEffect, useState } from 'react';
import { FAMILLES_JETONS, JETONS, ROLES_JETONS, type NomJeton } from '../../styles/jetons.js';
import type { Couleurs } from '../../styles/paletteServeur.js';
import { JETONS_ORDONNES, NOMS_THEMES, Palette, Themes, fr, type Theme } from './commun.js';
import { EnSituation, PlancheAmbiance, ReglageCouleur } from './vues.js';
import type { Defaut } from './edition.js';
import { Icone } from '../icones.js';

export type FiltreJetons = 'toutes' | 'modifiees' | 'contraste';
const FILTRES: { id: FiltreJetons; libelle: string }[] = [
  { id: 'toutes', libelle: 'Toutes' },
  { id: 'modifiees', libelle: 'Modifiées' },
  { id: 'contraste', libelle: 'Contraste insuffisant' }
];

/** L'etat d'une ligne, du plus grave au plus doux : un contraste qui tombe, un reglage non enregistre, un ecart a l'origine. */
function etatDe(nom: NomJeton, couleurs: Couleurs, reference: Couleurs, pire: Map<NomJeton, Defaut>): { classe: string; texte: string; titre?: string } | null {
  const d = pire.get(nom);
  if (d) return { classe: 'ko', texte: 'contraste ' + fr(d.ratio), titre: 'Contraste insuffisant : --' + d.texte + ' sur --' + d.fond + ' (' + NOMS_THEMES[d.theme].toLowerCase() + '), minimum ' + fr(d.min) };
  const themes: Theme[] = ['clair', 'sombre'];
  if (themes.some(t => couleurs[t][nom] !== reference[t][nom])) return { classe: 'nonEnregistree', texte: 'non enregistrée' };
  if (themes.some(t => couleurs[t][nom] !== JETONS[t][nom])) return { classe: 'modifiee', texte: 'modifiée' };
  return null;
}

export function ListeJetons({ themes, regler, reference, defauts, ouvrirApercu }: {
  themes: Theme[]; regler: (theme: Theme, nom: NomJeton, valeur: string) => void;
  reference: Couleurs; defauts: Defaut[]; ouvrirApercu: () => void;
}) {
  const couleurs = useContext(Palette);
  const [filtre, setFiltre] = useState<FiltreJetons>('toutes');
  const [cherche, setCherche] = useState('');
  // Pour chaque jeton en cause, sa pire paire : c'est elle que la ligne affiche.
  const pire = new Map<NomJeton, Defaut>();
  for (const d of defauts) for (const n of [d.texte, d.fond]) { const p = pire.get(n); if (!p || d.ratio < p.ratio) pire.set(n, d); }
  const modifiee = (n: NomJeton) => (['clair', 'sombre'] as Theme[]).some(t => couleurs[t][n] !== JETONS[t][n] || couleurs[t][n] !== reference[t][n]);
  const garde = (n: NomJeton) => (filtre === 'toutes' || (filtre === 'modifiees' ? modifiee(n) : pire.has(n)))
    && (!cherche.trim() || ('--' + n + ' ' + ROLES_JETONS[n].role).toLowerCase().includes(cherche.trim().toLowerCase()));
  const compte: Record<FiltreJetons, number> = { toutes: JETONS_ORDONNES.length, modifiees: JETONS_ORDONNES.filter(modifiee).length, contraste: pire.size };
  const montres = JETONS_ORDONNES.filter(garde);
  return (
    <div className="palListeBloc">
      <div className="palFiltres">
        <div className="palFiltresBoutons" role="group" aria-label="Filtrer les couleurs">
          {FILTRES.map(f => (
            <button key={f.id} type="button" className="palFiltre" aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}>
              {f.libelle} <span className="palFiltreCompte">{compte[f.id]}</span>
            </button>
          ))}
        </div>
        <input type="search" className="palCherche" placeholder="Chercher un jeton ou un rôle" aria-label="Chercher un jeton ou un rôle"
          value={cherche} onChange={(e) => setCherche(e.target.value)} />
        <button type="button" className="secondary small palOuvrirApercu" onClick={ouvrirApercu}><Icone nom="oeil" taille={16} /> Aperçu</button>
      </div>
      {montres.length === 0 && (
        <p className="palVide">{filtre === 'modifiees' ? 'Aucune couleur modifiée : la palette est celle d’origine et du serveur.' : filtre === 'contraste' ? 'Tous les contrastes tiennent.' : 'Aucun jeton ne correspond à « ' + cherche + ' ».'}</p>
      )}
      {FAMILLES_JETONS.map(f => {
        const lignes = montres.filter(n => ROLES_JETONS[n].famille === f.id);
        if (!lignes.length) return null;
        return (
          <section key={f.id} className="palListe" aria-label={f.titre}>
            <header className="palListeEntete">
              <span className="palListeFamille">{f.titre}</span>
              {themes.map(t => <span key={t} className="palListeTheme">{NOMS_THEMES[t]}</span>)}
              <span />
            </header>
            {lignes.map(n => {
              const etat = etatDe(n, couleurs, reference, pire);
              return (
                <div key={n} className="palLigneJeton" data-jeton={n} data-themes={themes.length}>
                  <span className="palLigneNom"><code>--{n}</code><small>{ROLES_JETONS[n].role}</small></span>
                  {themes.map(t => <ReglageCouleur key={t} nom={n} theme={t} valeur={couleurs[t][n]} regler={regler} />)}
                  <span className={'palLigneEtat' + (etat ? ' palLigneEtat--' + etat.classe : '')} title={etat?.titre}>{etat?.texte ?? ''}</span>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/**
 * L'apercu : les commandes de l'atelier ou la planche d'ambiance, peintes par la palette en cours,
 * pour chaque theme montre. Colle au haut de l'ecran pendant qu'on fait defiler la liste ; au doigt,
 * une feuille qu'on ferme.
 */
export function Apercu({ themes, ouvert, fermer }: { themes: Theme[]; ouvert: boolean; fermer: () => void }) {
  const [vue, setVue] = useState<'situation' | 'planche'>('situation');
  // En feuille, Echap la ferme comme les autres feuilles de Plan.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [ouvert, fermer]);
  return (
    <aside className={'palVueApercu' + (ouvert ? ' palVueApercu--ouvert' : '')} aria-label="Aperçu de la palette">
      <div className="palVueApercuEntete">
        <span className="palVueApercuTitre">Aperçu</span>
        <div className="segmente" role="radiogroup" aria-label="Ce que montre l’aperçu">
          {(['situation', 'planche'] as const).map(v => (
            <button key={v} type="button" role="radio" aria-checked={vue === v} className={vue === v ? 'actif' : ''} onClick={() => setVue(v)}>
              {v === 'situation' ? 'Commandes' : 'Planche'}
            </button>
          ))}
        </div>
        <button type="button" className="palVueApercuFermer" aria-label="Fermer l’aperçu" onClick={fermer}><Icone nom="fermer" taille={16} /></button>
      </div>
      <Themes themes={themes}>{() => vue === 'situation' ? <EnSituation /> : <PlancheAmbiance />}</Themes>
    </aside>
  );
}
