// Ce que partagent les vues de l'ecran de la palette (zones/EcranPalette.tsx) : les themes, les
// onglets, le contexte de la palette en cours d'edition, et les cadres communs (section, panneau par
// theme, etiquette de jeton).

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { ROLES_JETONS, type NomJeton, type NomPolice } from '../../styles/jetons.js';
import { couleursParDefaut, type Couleurs } from '../../styles/paletteServeur.js';

export type Theme = 'clair' | 'sombre';

export type Choix = Theme | 'deux';

export type Onglet = 'couleurs' | 'contrastes' | 'css' | 'typo';

export const NOMS_THEMES: Record<Theme, string> = { clair: 'Clair', sombre: 'Sombre' };

export const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: 'couleurs', libelle: 'Couleurs' },
  { id: 'contrastes', libelle: 'Contrastes' },
  { id: 'css', libelle: 'CSS' },
  { id: 'typo', libelle: 'Typo' }
];

export const JETONS_ORDONNES = Object.keys(ROLES_JETONS) as NomJeton[];

export const ORDRE_POLICES: NomPolice[] = ['serif', 'sans', 'mono'];

/** La palette en cours d'edition : toutes les vues la lisent, aucune ne lit `JETONS` directement. */
export const Palette = createContext<Couleurs>(couleursParDefaut());

/** Les variables CSS d'un theme, posees sur son panneau. */
export function variablesDe(couleurs: Couleurs, theme: Theme): CSSProperties {
  const v: Record<string, string> = {};
  for (const nom of JETONS_ORDONNES) v['--' + nom] = couleurs[theme][nom];
  return v as CSSProperties;
}

export const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export const fr = (n: number) => n.toFixed(2).replace('.', ',');

/** L'onglet demande par l'adresse (`#contrastes`, `#css`, `#typo`), sinon les couleurs ; `#palette`, l'ancien nom, y mene aussi. */
export function ongletDeLAdresse(hash: string): Onglet {
  const h = hash.replace(/^#/, '');
  return ONGLETS.some(o => o.id === h) ? h as Onglet : 'couleurs';
}

export function Section({ titre, idee, children, id }: { titre: string; idee: string; children: ReactNode; id?: string }) {
  return (
    <section className="palSection" aria-label={titre} id={id}>
      <h2 className="palSectionTitre">{titre}</h2>
      <p className="palIdee">{idee}</p>
      {children}
    </section>
  );
}

/** Un panneau par theme montre, chacun portant ses propres variables. */
export function Themes({ themes, children }: { themes: Theme[]; children: () => ReactNode }) {
  const couleurs = useContext(Palette);
  return (
    <div className={'palThemes' + (themes.length > 1 ? ' palThemes--deux' : '')}>
      {themes.map(t => (
        <div key={t} className="palTheme" data-theme-montre={t} style={variablesDe(couleurs, t)}>
          <span className="palThemeNom">{NOMS_THEMES[t]}</span>
          {children()}
        </div>
      ))}
    </div>
  );
}

/** Une etiquette de jeton : son nom de variable, en petit, sur la tuile. */
export const Jeton = ({ nom }: { nom: NomJeton }) => <code className="palJeton">--{nom}</code>;
