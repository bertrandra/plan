// Les briques communes des ecrans du banc : l'en-tete d'une etape (son numero, son titre, son aide repliee, ses gestes a droite), une
// section repliable, un etat vide qui dit quoi faire ensuite, des tuiles de chiffres et une jauge. Tous les ecrans les partagent : ils se
// ressemblent, et l'oeil trouve le geste principal au meme endroit.

import type { ReactNode } from 'react';
import { Icone, type NomIcone } from './Icones.js';

export function Page({ icone, numero, titre, aide, actions, children, large }: {
  icone: NomIcone; numero: string; titre: string; aide?: ReactNode; actions?: ReactNode; children: ReactNode; large?: boolean;
}) {
  return (
    <section className={large ? 'page page-large' : 'page'}>
      <header className="entete-page">
        <span className="pastille-etape"><Icone nom={icone} /></span>
        <div className="titres-page">
          <small>Étape {numero}</small>
          <h2>{titre}</h2>
        </div>
        {aide && (
          <details className="aide-page">
            <summary title="À quoi sert cette étape"><Icone nom="info" taille={18} /><span>Aide</span></summary>
            <div className="aide-page-texte">{aide}</div>
          </details>
        )}
        <span className="espace" />
        {actions && <div className="actions-page">{actions}</div>}
      </header>
      <div className="corps-page">{children}</div>
    </section>
  );
}

export function Section({ titre, compte, repliable, ouverte = true, actions, children }: {
  titre: string; compte?: ReactNode; repliable?: boolean; ouverte?: boolean; actions?: ReactNode; children: ReactNode;
}) {
  const tete = <><h3>{titre}{compte !== undefined && <span className="compte-section">{compte}</span>}</h3>{actions && <span className="actions-section">{actions}</span>}</>;
  if (repliable) return <details className="section" open={ouverte}><summary className="tete-section">{tete}</summary><div className="corps-section">{children}</div></details>;
  return <div className="section"><div className="tete-section">{tete}</div><div className="corps-section">{children}</div></div>;
}

/** Un etat vide : ce qui manque, et le geste qui y mene (souvent l'etape d'avant). */
export function Vide({ icone, titre, texte, action }: { icone: NomIcone; titre: string; texte?: ReactNode; action?: ReactNode }) {
  return (
    <div className="vide">
      <span className="icone-vide"><Icone nom={icone} taille={32} /></span>
      <strong>{titre}</strong>
      {texte && <p>{texte}</p>}
      {action}
    </div>
  );
}

export function Tuiles({ children }: { children: ReactNode }) {
  return <div className="tuiles">{children}</div>;
}

export function Tuile({ valeur, libelle, ton, detail }: { valeur: ReactNode; libelle: string; ton?: 'ok' | 'attention' | 'accent' | undefined; detail?: ReactNode }) {
  return (
    <div className={'tuile' + (ton ? ' ' + ton : '')}>
      <span className="valeur-tuile">{valeur}</span>
      <span className="libelle-tuile">{libelle}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

/** Une jauge : `valeur` sur `cible` (plafonnee a 100 %), pleine et verte quand la cible est atteinte. */
export function Jauge({ valeur, cible, titre }: { valeur: number; cible: number; titre?: string }) {
  const p = cible > 0 ? Math.min(1, valeur / cible) : 0;
  return <span className={'jauge' + (p >= 1 ? ' pleine' : valeur ? '' : ' nulle')} title={titre}><span style={{ width: `${p * 100}%` }} /></span>;
}

/** Un groupe de boutons exclusifs (un filtre), plus compact qu'une liste deroulante. */
export function Segments<T extends string>({ valeur, options, onChange, label }: { valeur: T; options: { valeur: T; libelle: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segments" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o.valeur} type="button" role="radio" aria-checked={o.valeur === valeur} className={o.valeur === valeur ? 'actif' : ''} onClick={() => onChange(o.valeur)}>{o.libelle}</button>)}
    </div>
  );
}
