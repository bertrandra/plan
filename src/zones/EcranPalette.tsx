// L'ecran de la palette de l'admin (`?admin&ecran=palette`), a cote de celui des controleurs.
//
// Un ecran a part, sur toute la page, qui montre les couleurs de l'interface : d'abord une planche
// d'ambiance (ce que la palette evoque), puis sa structure famille par famille (chaque jeton, son
// role, ses deux valeurs), les contrastes que le test exige, les couleurs en situation sur de vraies
// commandes, et les formes. Il ne modifie rien : il lit `styles/jetons.ts`, la source que la feuille
// de style et son test confrontent.
//
// Pour montrer un theme quel que soit celui du systeme, chaque panneau pose lui-meme les variables
// CSS de son theme (`--ink`, `--paper`…) depuis `JETONS` : tout ce qu'il contient les lit par
// `var()`, comme l'atelier. Les deux themes se regardent ainsi cote a cote, au pixel pres.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { JETONS, FAMILLES_JETONS, ROLES_JETONS, PAIRES_CONTRASTE, contraste, type NomJeton } from '../styles/jetons.js';

type Theme = 'clair' | 'sombre';
type Choix = Theme | 'deux';

const NOMS_THEMES: Record<Theme, string> = { clair: 'Clair', sombre: 'Sombre' };
const JETONS_ORDONNES = Object.keys(ROLES_JETONS) as NomJeton[];

/** Les variables CSS d'un theme, posees sur son panneau. */
function variablesDe(theme: Theme): CSSProperties {
  const v: Record<string, string> = {};
  for (const nom of JETONS_ORDONNES) v['--' + nom] = JETONS[theme][nom];
  return v as CSSProperties;
}

const fr = (n: number) => n.toFixed(2).replace('.', ',');

export function EcranPalette() {
  const [choix, setChoix] = useState<Choix>('deux');
  const themes: Theme[] = choix === 'deux' ? ['clair', 'sombre'] : [choix];
  return (
    <div className="palEcran">
      <header className="palEntete">
        <div>
          <h1 className="palTitre">Palette de l’interface</h1>
          <p className="palSous">
            {JETONS_ORDONNES.length} jetons de couleur en {FAMILLES_JETONS.length} familles, deux thèmes. Source : <code>src/styles/jetons.ts</code>, déclarée
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
          <a className="palLien" href="?admin">Admin des démos</a>
        </div>
      </header>

      <Section titre="Planche d’ambiance" idee="Ce que la palette évoque avant d’être un tableau de valeurs : un atelier de menuisier, du papier, de l’encre, un jardin.">
        <Themes themes={themes}>{() => <PlancheAmbiance />}</Themes>
      </Section>

      <Section titre="Structure" idee="Chaque jeton, famille par famille : son rôle, et sa valeur dans chaque thème. La pastille est peinte par la variable CSS, comme dans l’atelier.">
        <Structure />
      </Section>

      <Section titre="Contrastes" idee="Les paires qui portent du texte, et le rapport WCAG que le test exige : 4,5 pour la lecture, 3 pour les grands chiffres et les bordures.">
        <Contrastes />
      </Section>

      <Section titre="En situation" idee="Les mêmes jetons sur de vraies commandes de l’atelier : panneau, champ, boutons, alerte, notification.">
        <Themes themes={themes}>{() => <EnSituation />}</Themes>
      </Section>

      <Section titre="Formes" idee="Les rayons et les ombres qui accompagnent les couleurs.">
        <Themes themes={themes}>{() => <Formes />}</Themes>
      </Section>
    </div>
  );
}

function Section({ titre, idee, children }: { titre: string; idee: string; children: ReactNode }) {
  return (
    <section className="palSection" aria-label={titre}>
      <h2 className="palSectionTitre">{titre}</h2>
      <p className="palIdee">{idee}</p>
      {children}
    </section>
  );
}

/** Un panneau par theme montre, chacun portant ses propres variables. */
function Themes({ themes, children }: { themes: Theme[]; children: () => ReactNode }) {
  return (
    <div className={'palThemes' + (themes.length > 1 ? ' palThemes--deux' : '')}>
      {themes.map(t => (
        <div key={t} className="palTheme" data-theme-montre={t} style={variablesDe(t)}>
          <span className="palThemeNom">{NOMS_THEMES[t]}</span>
          {children()}
        </div>
      ))}
    </div>
  );
}

/** Une etiquette de jeton : son nom de variable, en petit, sur la tuile. */
const Jeton = ({ nom }: { nom: NomJeton }) => <code className="palJeton">--{nom}</code>;

/**
 * La planche d'ambiance : des tuiles composees avec les seuls jetons. Le bois est l'accent en
 * lames, le papier et l'encre portent un titre serif, le jardin est la couleur « enregistre », la
 * brique celle des alertes, le ciel celui de la Vue 3D, la chambre noire celle du releve.
 */
function PlancheAmbiance() {
  return (
    <div className="palPlanche">
      <div className="palTuile palTuile--papier">
        <span className="palMot">Bois, papier, encre</span>
        <span className="palPhrase">Un outil de travail chaleureux, précis, sans éclat inutile.</span>
        <span className="palJetons"><Jeton nom="paper" /> <Jeton nom="ink" /> <Jeton nom="ink-soft" /></span>
      </div>
      <div className="palTuile palTuile--bois" aria-label="Lames de terrasse en bois">
        <span className="palLames" aria-hidden="true" />
        <span className="palJetons palJetons--surAccent"><Jeton nom="accent" /> <Jeton nom="accent-light" /></span>
      </div>
      <div className="palTuile palTuile--jardin">
        <span className="palArbre" aria-hidden="true" />
        <span className="palLegende">Jardin</span>
        <span className="palJetons"><Jeton nom="ok" /></span>
      </div>
      <div className="palTuile palTuile--brique">
        <span className="palBriques" aria-hidden="true" />
        <span className="palLegende palLegende--danger">Brique</span>
        <span className="palJetons"><Jeton nom="alerte" /> <Jeton nom="danger" /></span>
      </div>
      <div className="palTuile palTuile--ciel">
        <span className="palSoleil" aria-hidden="true" />
        <span className="palLegende">Ciel de la Vue 3D</span>
        <span className="palJetons"><Jeton nom="fond-3d" /></span>
      </div>
      <div className="palTuile palTuile--chambre">
        <span className="palViseur" aria-hidden="true" />
        <span className="palLegende palLegende--camera">Chambre noire</span>
        <span className="palJetons palJetons--camera"><Jeton nom="camera-bg" /> <Jeton nom="camera-ok" /></span>
      </div>
      <div className="palTuile palTuile--plan">
        <span className="palTrame" aria-hidden="true" />
        <span className="palLegende">Canevas du plan</span>
        <span className="palJetons"><Jeton nom="stage-bg" /> <Jeton nom="stage-trame" /></span>
      </div>
      <div className="palTuile palTuile--mots">
        {['chaleureux', 'artisanal', 'précis', 'calme', 'lisible', 'durable'].map(m => <span key={m} className="palPastille">{m}</span>)}
      </div>
    </div>
  );
}

/** La structure : une rangee par famille, une carte par jeton. */
function Structure() {
  return (
    <div className="palFamilles">
      {FAMILLES_JETONS.map(f => (
        <div key={f.id} className="palFamille">
          <h3 className="palFamilleTitre">{f.titre}</h3>
          <p className="palFamilleIdee">{f.idee}</p>
          <ul className="palNuancier">
            {JETONS_ORDONNES.filter(n => ROLES_JETONS[n].famille === f.id).map(n => (
              <li key={n} className="palCarte">
                <span className="palEchantillons" aria-hidden="true">
                  <span className="palEchantillon" style={{ background: JETONS.clair[n] }} />
                  <span className="palEchantillon" style={{ background: JETONS.sombre[n] }} />
                </span>
                <code className="palNom">--{n}</code>
                <span className="palRole">{ROLES_JETONS[n].role}</span>
                <span className="palValeurs">
                  <span title="Thème clair">{JETONS.clair[n]}</span>
                  <span title="Thème sombre">{JETONS.sombre[n]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Les contrastes : un apercu par theme, le rapport, le minimum, et le verdict ecrit en toutes lettres. */
function Contrastes() {
  return (
    <div className="palTableau">
      <table className="attrTable palContrastes">
        <thead>
          <tr><th>Texte</th><th>Fond</th><th>Clair</th><th>Sombre</th><th>Minimum</th></tr>
        </thead>
        <tbody>
          {PAIRES_CONTRASTE.map(([texte, fond, min]) => (
            <tr key={texte + '/' + fond}>
              <td><code>--{texte}</code></td>
              <td><code>--{fond}</code></td>
              {(['clair', 'sombre'] as Theme[]).map(t => {
                const r = contraste(JETONS[t][texte], JETONS[t][fond]);
                const ok = r >= min;
                return (
                  <td key={t}>
                    <span className="palApercu" style={{ color: JETONS[t][texte], background: JETONS[t][fond] }}>Aa</span>
                    <span className="palRatio">{fr(r)}</span>
                    <span className={ok ? 'palVerdict' : 'palVerdict palVerdict--non'}>{ok ? 'conforme' : 'insuffisant'}</span>
                  </td>
                );
              })}
              <td className="palRatio">{fr(min)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Les jetons sur de vraies commandes : les classes de l'atelier, pas des imitations. */
function EnSituation() {
  return (
    <div className="palSituation">
      <div className="palPanneau">
        <p className="palPanneauTitre">Terrasse — 35,01 m²</p>
        <label className="palChamp"><span>Entraxe des solives</span><input type="text" defaultValue="65" aria-label="Entraxe des solives" /><span className="unite">cm</span></label>
        <p className="hint">Les deux coins de ce côté sont figés.</p>
        <div className="palBoutons">
          <button type="button">Créer</button>
          <button type="button" className="secondary">Annuler</button>
          <button type="button" className="secondary small" disabled>Grisé</button>
        </div>
        <div className="segmente palSegmente" role="group" aria-label="Exemple de commande segmentée">
          <button type="button" className="actif">Objet</button><button type="button">Géométrie</button><button type="button">Construction</button>
        </div>
        <p className="palEtat palEtat--ok">● Enregistré</p>
        <p className="palEtat palEtat--danger">▲ La terrasse sort de la parcelle.</p>
      </div>
      <div className="palToast" role="status">Projet enregistré.</div>
    </div>
  );
}

const RAYONS = ['r-champ', 'r-bouton', 'r-tuile', 'r-panneau', 'r-feuille'];
const OMBRES = ['ombre', 'ombre-flottante', 'ombre-menu', 'ombre-forte'];

function Formes() {
  return (
    <div className="palFormes">
      {RAYONS.map(r => <div key={r} className="palForme" style={{ borderRadius: 'var(--' + r + ')' }}><code>--{r}</code></div>)}
      {OMBRES.map(o => <div key={o} className="palForme palForme--ombre" style={{ boxShadow: 'var(--' + o + ')' }}><code>--{o}</code></div>)}
    </div>
  );
}
