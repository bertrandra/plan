// L'ecran de la palette (`?palette`), derriere la porte de l'admin comme celui des controleurs.
//
// Un ecran a part, sur toute la page, en quatre onglets :
//   - Couleurs : la liste des jetons, une ligne par jeton (son role, ses valeurs, son etat), a
//     filtrer et a chercher, avec a cote un apercu colle (commandes en situation ou planche
//     d'ambiance) qui suit chaque reglage sans qu'on ait a defiler ;
//   - Contrastes : les paires exigees, leur rapport et leur verdict ;
//   - CSS : les variables telles que la feuille les declare, a copier, puis les memes jetons en
//     situation sur de vraies commandes, et les rayons et ombres ;
//   - Typo : les polices, leur role et l'echelle des tailles.
// Chaque couleur se regle par theme (selecteur du systeme, selecteur avance, code `#RRGGBB`). La
// palette ainsi reglee s'enregistre sur le serveur apres recapitulatif (`admin/palette`, un fichier
// JSON que chaque page de Plan applique au demarrage, app/paletteServeur.ts), s'exporte et s'importe
// en JSON, ou part d'un des modeles. Les valeurs d'origine restent celles de `styles/jetons.ts`.
//
// Le dossier ecranPalette/ porte le reste : l'etat et les gestes (edition.ts), la barre (barre.tsx),
// la liste et l'apercu (liste.tsx), les autres vues (vues.tsx), ce qu'elles partagent (commun.tsx) et le selecteur avance.

import { useState } from 'react';
import { FAMILLES_JETONS, type NomJeton } from '../styles/jetons.js';
import { useEditionPalette, type OptionsEdition } from './ecranPalette/edition.js';
import { BarrePalette } from './ecranPalette/barre.js';
import { CodeCss, Contrastes, EnSituation, Formes, Typographie } from './ecranPalette/vues.js';
import { Apercu, ListeJetons } from './ecranPalette/liste.js';
import type { Couleurs } from '../styles/paletteServeur.js';
import type { Defaut } from './ecranPalette/edition.js';
import { JETONS_ORDONNES, NOMS_THEMES, ONGLETS, ORDRE_POLICES, Palette, Section, Themes, ongletDeLAdresse, type Choix, type Onglet, type Theme } from './ecranPalette/commun.js';

export { texteCss } from './ecranPalette/vues.js';
export { ongletDeLAdresse } from './ecranPalette/commun.js';

/** Ce que l'ecran recoit : la palette du serveur, et de quoi l'enregistrer. */
export interface PropsEcranPalette extends OptionsEdition {
  retour?: string;
}

/** L'onglet courant, lu dans l'adresse (`#contrastes`, `#css`, `#typo`) et ecrit dedans sans entree d'historique. */
function useOnglet(): [Onglet, (o: Onglet) => void] {
  const [onglet, setOnglet] = useState<Onglet>(() => typeof location !== 'undefined' ? ongletDeLAdresse(location.hash) : 'couleurs');
  const choisir = (o: Onglet) => {
    setOnglet(o);
    try { history.replaceState(null, '', o === 'couleurs' ? location.pathname + location.search : '#' + o); } catch { /* sans historique : l'onglet change quand meme */ }
  };
  return [onglet, choisir];
}

export function EcranPalette({ retour = '?admin', ...options }: PropsEcranPalette) {
  const [choix, setChoix] = useState<Choix>('deux');
  const [onglet, choisirOnglet] = useOnglet();
  const [seulementDefauts, setSeulementDefauts] = useState(false);
  const e = useEditionPalette(options);
  const themes: Theme[] = choix === 'deux' ? ['clair', 'sombre'] : [choix];
  /** L'alerte de contraste mene aux paires en defaut : l'onglet Contrastes, le tableau filtre. */
  const allerAuxContrastes = () => {
    choisirOnglet('contrastes');
    setSeulementDefauts(true);
    requestAnimationFrame(() => document.getElementById('palContrastes')?.scrollIntoView({ block: 'start' }));
  };
  return (
    <Palette.Provider value={e.couleurs}>
    <div className="palEcran">
      <header className="palEntete">
        <div>
          <a className="ecranRetour" href={retour}><span aria-hidden="true">←</span> Retour au plan</a>
          <h1 className="palTitre">Palette de l’interface</h1>
          <p className="palSous">
            {JETONS_ORDONNES.length} jetons de couleur en {FAMILLES_JETONS.length} familles, {ORDRE_POLICES.length} polices, deux thèmes. Source : <code>src/styles/jetons.ts</code>, déclarée
            dans <code>src/styles/app.css</code> ; un test vérifie que les deux concordent et que les contrastes tiennent.
          </p>
        </div>
        <div className="palActions">
          <div className="segmente" role="radiogroup" aria-label="Thème montré">
            {(['deux', 'clair', 'sombre'] as Choix[]).map(c => (
              <button key={c} type="button" role="radio" aria-checked={choix === c} className={choix === c ? 'actif' : ''} onClick={() => setChoix(c)}>
                {c === 'deux' ? 'Les deux' : NOMS_THEMES[c]}
              </button>
            ))}
          </div>
          <a className="palLien" href="?admin&ecran=controleurs">Contrôleurs de l’écran</a>
        </div>
      </header>

      <BarrePalette e={e} allerAuxContrastes={allerAuxContrastes} />

      <Volets themes={themes} regler={e.regler} reference={e.reference} defauts={e.defauts} onglet={onglet} choisir={choisirOnglet} contrastes={{ seulementDefauts, basculer: setSeulementDefauts }} />
    </div>
    </Palette.Provider>
  );
}

/** Les quatre onglets, Couleurs, Contrastes, CSS et Typo, et le volet de celui qui est choisi. */
function Volets({ themes, regler, reference, defauts, onglet, choisir, contrastes }: {
  themes: Theme[]; regler: (theme: Theme, nom: NomJeton, valeur: string) => void; reference: Couleurs; defauts: Defaut[];
  onglet: Onglet; choisir: (o: Onglet) => void; contrastes: { seulementDefauts: boolean; basculer: (v: boolean) => void };
}) {
  // L'apercu au doigt : une feuille ouverte depuis la liste ; au bureau il est toujours la.
  const [apercu, setApercu] = useState(false);
  const clavier = (e: React.KeyboardEvent) => {
    const i = ONGLETS.findIndex(o => o.id === onglet);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ONGLETS.length - 1 : -2;
    if (j === -2) return;
    e.preventDefault();
    const suivant = ONGLETS[(j + ONGLETS.length) % ONGLETS.length]?.id;
    if (!suivant) return;
    choisir(suivant);
    requestAnimationFrame(() => document.getElementById('palOnglet-' + suivant)?.focus());
  };
  return (
    <>
        <div className="palOnglets" role="tablist" aria-label="Volets de la palette" onKeyDown={clavier}>
          {ONGLETS.map(o => (
            <button key={o.id} id={'palOnglet-' + o.id} type="button" role="tab" aria-selected={onglet === o.id} aria-controls={'palVolet-' + o.id}
              tabIndex={onglet === o.id ? 0 : -1} className={'palOnglet' + (onglet === o.id ? ' actif' : '')} onClick={() => choisir(o.id)}>
              {o.libelle}
            </button>
          ))}
        </div>

        <div className="palVolet" role="tabpanel" id={'palVolet-' + onglet} aria-labelledby={'palOnglet-' + onglet}>
          {onglet === 'couleurs' && (
            <div className="palAtelier">
              <ListeJetons themes={themes} regler={regler} reference={reference} defauts={defauts} ouvrirApercu={() => setApercu(true)} />
              <Apercu themes={themes} ouvert={apercu} fermer={() => setApercu(false)} />
            </div>
          )}

          {onglet === 'contrastes' && (
            <Section id="palContrastes" titre="Contrastes" idee="Les paires qui portent du texte, et le rapport WCAG que le test exige : 4,5 pour la lecture, 3 pour les grands chiffres et les bordures.">
              <Contrastes seulementDefauts={contrastes.seulementDefauts} basculer={contrastes.basculer} />
            </Section>
          )}

          {onglet === 'css' && <>
            <Section titre="Variables" idee="Les jetons de la palette en cours, déclarés comme dans la feuille : le bloc clair sur :root, le bloc sombre sous prefers-color-scheme, puis les polices et les rayons.">
              <CodeCss />
            </Section>
            <Section titre="En situation" idee="Les mêmes jetons sur de vraies commandes de l’atelier : panneau, champ, boutons, alerte, notification.">
              <Themes themes={themes}>{() => <EnSituation />}</Themes>
            </Section>
            <Section titre="Formes" idee="Les rayons et les ombres qui accompagnent les couleurs.">
              <Themes themes={themes}>{() => <Formes />}</Themes>
            </Section>
          </>}

          {onglet === 'typo' && (
            <Section titre="Typographie" idee="Deux familles, deux rôles — le serif pour le document, le sans pour l’instrument — et le monospace pour ce qui se recopie. Des polices du système : rien n’est téléchargé.">
              <Themes themes={themes}>{() => <Typographie />}</Themes>
            </Section>
          )}
        </div>
    </>
  );
}
