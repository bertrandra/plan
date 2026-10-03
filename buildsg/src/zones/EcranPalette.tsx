// L'ecran de la palette (`?palette`), derriere la porte de l'admin comme celui des controleurs.
//
// Un ecran a part, sur toute la page, en trois onglets :
//   - Palette : une planche d'ambiance (ce que la palette evoque), la structure des couleurs
//     famille par famille (chaque jeton, son role, ses deux valeurs) et les contrastes exiges ;
//   - CSS : les variables telles que la feuille les declare, a copier, puis les memes jetons en
//     situation sur de vraies commandes, et les rayons et ombres ;
//   - Typo : les polices, leur role et l'echelle des tailles.
// Les couleurs se reglent ici : chaque jeton a son selecteur et son code `#RRGGBB`, par theme. La
// palette ainsi reglee s'enregistre sur le serveur (`admin/palette`, un fichier JSON que chaque page
// de Plan applique au demarrage, app/paletteServeur.ts) et s'exporte en JSON. Les valeurs d'origine
// restent celles de `styles/jetons.ts`, que la feuille et son test confrontent.
//
// Pour montrer un theme quel que soit celui du systeme, chaque panneau pose lui-meme les variables
// CSS de son theme (`--ink`, `--paper`…) depuis la palette en cours : tout ce qu'il contient les lit par
// `var()`, comme l'atelier. Les deux themes se regardent ainsi cote a cote, au pixel pres.

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { JETONS, FAMILLES_JETONS, ROLES_JETONS, PAIRES_CONTRASTE, POLICES, RAYONS, ECHELLE_TEXTE, contraste, type NomJeton, type NomPolice } from '../styles/jetons.js';
import { couleursParDefaut, couleurValide, documentPalette, ecartsAuxOrigines, memesCouleurs, type Couleurs } from '../styles/paletteServeur.js';
import { telechargerTexte } from '../shell/download.js';

type Theme = 'clair' | 'sombre';
type Choix = Theme | 'deux';
export type Onglet = 'palette' | 'css' | 'typo';

const NOMS_THEMES: Record<Theme, string> = { clair: 'Clair', sombre: 'Sombre' };
const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: 'palette', libelle: 'Palette' },
  { id: 'css', libelle: 'CSS' },
  { id: 'typo', libelle: 'Typo' }
];
const JETONS_ORDONNES = Object.keys(ROLES_JETONS) as NomJeton[];
const ORDRE_POLICES: NomPolice[] = ['serif', 'sans', 'mono'];

/** La palette en cours d'edition : toutes les vues la lisent, aucune ne lit `JETONS` directement. */
const Palette = createContext<Couleurs>(couleursParDefaut());

/** Les variables CSS d'un theme, posees sur son panneau. */
function variablesDe(couleurs: Couleurs, theme: Theme): CSSProperties {
  const v: Record<string, string> = {};
  for (const nom of JETONS_ORDONNES) v['--' + nom] = couleurs[theme][nom];
  return v as CSSProperties;
}

/** Ce que l'ecran recoit : la palette du serveur, et de quoi l'enregistrer. */
export interface PropsEcranPalette {
  retour?: string;
  /** La palette lue sur le serveur ; `null` : aucune, ce sont les valeurs d'origine. */
  enregistree?: { couleurs: Couleurs; modifieLe: string | null } | null;
  /** Enregistre le document ; rend le message d'echec, ou `null` une fois fait. */
  enregistrer?: (document: ReturnType<typeof documentPalette>) => Promise<string | null>;
  /** Pose la palette sur la page elle-meme, une fois enregistree. */
  appliquer?: (couleurs: Couleurs) => void;
}

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

const fr = (n: number) => n.toFixed(2).replace('.', ',');

/** L'onglet demande par l'adresse (`#css`, `#typo`), sinon la palette. */
export function ongletDeLAdresse(hash: string): Onglet {
  const h = hash.replace(/^#/, '');
  return ONGLETS.some(o => o.id === h) ? h as Onglet : 'palette';
}

export function EcranPalette({ retour = '?admin', enregistree = null, enregistrer, appliquer }: PropsEcranPalette) {
  const [choix, setChoix] = useState<Choix>('deux');
  /** La reference : la palette du serveur (ou l'origine), celle a laquelle on compare. */
  const [reference, setReference] = useState<Couleurs>(() => enregistree?.couleurs ?? couleursParDefaut());
  const [modifieLe, setModifieLe] = useState<string | null>(enregistree?.modifieLe ?? null);
  const [couleurs, setCouleurs] = useState<Couleurs>(reference);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const modifiee = !memesCouleurs(couleurs, reference);
  const surServeur = !!enregistree || !!modifieLe;
  const regler = (theme: Theme, nom: NomJeton, valeur: string) => {
    setCouleurs(c => ({ ...c, [theme]: { ...c[theme], [nom]: valeur } }));
    setMessage(null);
  };
  const faibles = PAIRES_CONTRASTE.flatMap(([texte, fond, min]) => (['clair', 'sombre'] as Theme[]).filter(t => contraste(couleurs[t][texte], couleurs[t][fond]) < min)).length;
  async function enregistrerSurServeur(): Promise<void> {
    if (!enregistrer) return;
    setEnCours(true);
    const doc = documentPalette(couleurs);
    const refus = await enregistrer(doc);
    setEnCours(false);
    if (refus) { setMessage({ texte: refus, erreur: true }); return; }
    setReference(couleurs);
    setModifieLe(doc.modifieLe);
    appliquer?.(couleurs);
    setMessage({ texte: 'Palette enregistrée sur le serveur : chaque page de Plan l’appliquera à son ouverture.', erreur: false });
  }
  const exporter = () => {
    telechargerTexte('plan-palette.json', JSON.stringify(documentPalette(couleurs), null, 2) + '\n');
    setMessage({ texte: 'Palette exportée : plan-palette.json.', erreur: false });
  };
  const ecarts = ecartsAuxOrigines(couleurs).length;
  const [onglet, setOnglet] = useState<Onglet>(() => typeof location !== 'undefined' ? ongletDeLAdresse(location.hash) : 'palette');
  const themes: Theme[] = choix === 'deux' ? ['clair', 'sombre'] : [choix];
  const choisir = (o: Onglet) => {
    setOnglet(o);
    // L'onglet se retrouve au rechargement et se partage par son adresse, sans entree d'historique.
    try { history.replaceState(null, '', o === 'palette' ? location.pathname + location.search : '#' + o); } catch { /* sans historique : l'onglet change quand meme */ }
  };
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
    <Palette.Provider value={couleurs}>
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

      <div className="palBarre" role="region" aria-label="Enregistrer la palette">
        <p className="palEtatPalette" aria-live="polite">
          {surServeur ? 'Palette du serveur' + (modifieLe ? ', enregistrée le ' + date(modifieLe) : '') : 'Aucune palette sur le serveur : couleurs d’origine.'}
          {' · '}{ecarts ? ecarts + ' couleur' + (ecarts > 1 ? 's' : '') + ' différente' + (ecarts > 1 ? 's' : '') + ' de l’origine' : 'identique à l’origine'}
          {modifiee && <strong className="palNonEnregistre"> · modifications non enregistrées</strong>}
          {faibles > 0 && <span className="palAlerteContraste"> · ▲ {faibles} contraste{faibles > 1 ? 's' : ''} insuffisant{faibles > 1 ? 's' : ''}</span>}
        </p>
        <div className="palBarreActions">
          {enregistrer && <button type="button" onClick={() => { void enregistrerSurServeur(); }} disabled={!modifiee || enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer sur le serveur'}</button>}
          <button type="button" className="secondary" onClick={exporter}>Exporter le JSON</button>
          <button type="button" className="secondary" onClick={() => { setCouleurs(reference); setMessage(null); }} disabled={!modifiee}>Annuler les modifications</button>
          <button type="button" className="secondary" onClick={() => { setCouleurs(couleursParDefaut()); setMessage(null); }} disabled={ecarts === 0}>Couleurs d’origine</button>
        </div>
        {message && <p className={message.erreur ? 'palMessage palMessage--erreur' : 'palMessage'} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}
      </div>

      <div className="palOnglets" role="tablist" aria-label="Volets de la palette" onKeyDown={clavier}>
        {ONGLETS.map(o => (
          <button key={o.id} id={'palOnglet-' + o.id} type="button" role="tab" aria-selected={onglet === o.id} aria-controls={'palVolet-' + o.id}
            tabIndex={onglet === o.id ? 0 : -1} className={'palOnglet' + (onglet === o.id ? ' actif' : '')} onClick={() => choisir(o.id)}>
            {o.libelle}
          </button>
        ))}
      </div>

      <div className="palVolet" role="tabpanel" id={'palVolet-' + onglet} aria-labelledby={'palOnglet-' + onglet}>
        {onglet === 'palette' && <>
          <Section titre="Planche d’ambiance" idee="Ce que la palette évoque avant d’être un tableau de valeurs : un atelier de menuisier, du papier, de l’encre, un jardin.">
            <Themes themes={themes}>{() => <PlancheAmbiance />}</Themes>
          </Section>
          <Section titre="Couleurs" idee="Chaque jeton, famille par famille : son rôle, et sa valeur dans chaque thème — à régler au sélecteur ou par son code. Les aperçus, les contrastes et le CSS suivent aussitôt.">
            <Structure regler={regler} />
          </Section>
          <Section titre="Contrastes" idee="Les paires qui portent du texte, et le rapport WCAG que le test exige : 4,5 pour la lecture, 3 pour les grands chiffres et les bordures.">
            <Contrastes />
          </Section>
        </>}

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
    </div>
    </Palette.Provider>
  );
}

/** Les declarations CSS des jetons, en texte, telles que `app.css` les porte. */
export function texteCss(couleurs: Couleurs = couleursParDefaut()): string {
  const ligne = (nom: string, v: string, retrait: string) => retrait + '--' + nom + ': ' + v + ';';
  const clair = [
    ':root {',
    '  /* Couleurs */',
    ...JETONS_ORDONNES.map(n => ligne(n, couleurs.clair[n], '  ')),
    '  /* Polices */',
    ...ORDRE_POLICES.map(n => ligne(n, POLICES[n].pile, '  ')),
    '  /* Rayons */',
    ...Object.entries(RAYONS).map(([n, v]) => ligne(n, v, '  ')),
    '}'
  ];
  const sombre = [
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    ...JETONS_ORDONNES.filter(n => couleurs.sombre[n] !== couleurs.clair[n]).map(n => ligne(n, couleurs.sombre[n], '    ')),
    '  }',
    '}'
  ];
  return [...clair, '', ...sombre].join('\n');
}

function CodeCss() {
  const [copie, setCopie] = useState<'' | 'fait' | 'echec'>('');
  const texte = texteCss(useContext(Palette));
  const copier = () => {
    void navigator.clipboard?.writeText(texte).then(() => setCopie('fait'), () => setCopie('echec'));
  };
  return (
    <div className="palCode">
      <div className="palCodeBarre">
        <span className="palCodeNom">jetons.css</span>
        <button type="button" className="secondary small" onClick={copier}>Copier</button>
        <span className="palCodeEtat" role="status">{copie === 'fait' ? 'Copié.' : copie === 'echec' ? 'Copie impossible : sélectionnez le texte.' : ''}</span>
      </div>
      <pre className="palCodeTexte"><code>{texte}</code></pre>
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
      <div className="palTuile palTuile--polices" aria-label="Les trois polices">
        <span className="palTrio" aria-hidden="true">
          <span style={{ fontFamily: 'var(--serif)' }}>Aa</span>
          <span style={{ fontFamily: 'var(--sans)' }}>Aa</span>
          <span style={{ fontFamily: 'var(--mono)' }}>Aa</span>
        </span>
        <span className="palJetons"><code className="palJeton">--serif</code> <code className="palJeton">--sans</code> <code className="palJeton">--mono</code></span>
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

/** Les couleurs : une rangee par famille, une carte par jeton, un reglage par theme. */
function Structure({ regler }: { regler: (theme: Theme, nom: NomJeton, valeur: string) => void }) {
  const couleurs = useContext(Palette);
  return (
    <div className="palFamilles">
      {FAMILLES_JETONS.map(f => (
        <div key={f.id} className="palFamille">
          <h3 className="palFamilleTitre">{f.titre}</h3>
          <p className="palFamilleIdee">{f.idee}</p>
          <ul className="palNuancier">
            {JETONS_ORDONNES.filter(n => ROLES_JETONS[n].famille === f.id).map(n => (
              <li key={n} className="palCarte" data-jeton={n}>
                <span className="palEchantillons" aria-hidden="true">
                  <span className="palEchantillon" style={{ background: couleurs.clair[n] }} />
                  <span className="palEchantillon" style={{ background: couleurs.sombre[n] }} />
                </span>
                <code className="palNom">--{n}</code>
                <span className="palRole">{ROLES_JETONS[n].role}</span>
                {(['clair', 'sombre'] as Theme[]).map(t => (
                  <ReglageCouleur key={t} nom={n} theme={t} valeur={couleurs[t][n]} regler={regler} />
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Le reglage d'une couleur dans un theme : le selecteur du systeme et le code `#RRGGBB`. Le code se
 * saisit en brouillon et ne s'applique que valide ; invalide, il est signale et la couleur ne
 * bouge pas. Un point marque la couleur qui differe de l'origine, et la remet a l'origine.
 */
function ReglageCouleur({ nom, theme, valeur, regler }: { nom: NomJeton; theme: Theme; valeur: string; regler: (theme: Theme, nom: NomJeton, valeur: string) => void }) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const normal = (v: string) => (v.startsWith('#') ? v : '#' + v).toUpperCase();
  const invalide = brouillon !== null && !couleurValide(normal(brouillon));
  // Un brouillon valide qui ne correspond plus a la couleur a ete depasse (annuler, origine,
  // selecteur) : c'est la couleur qui se montre. Un brouillon invalide reste, signale.
  const texte = brouillon !== null && (invalide || normal(brouillon) === valeur) ? brouillon : valeur;
  const origine = JETONS[theme][nom];
  const libelle = '--' + nom + ', thème ' + NOMS_THEMES[theme].toLowerCase();
  const saisir = (v: string) => {
    setBrouillon(v);
    const hex = normal(v);
    if (couleurValide(hex)) regler(theme, nom, hex);
  };
  return (
    <span className="palReglage" data-theme={theme}>
      <span className="palReglageTheme">{NOMS_THEMES[theme]}</span>
      <input type="color" className="palSelecteur" value={valeur.toLowerCase()} aria-label={'Couleur ' + libelle}
        onChange={(e) => { setBrouillon(null); regler(theme, nom, e.target.value.toUpperCase()); }} />
      <input type="text" className={'palCodeCouleur' + (invalide ? ' invalide' : '')} value={texte} maxLength={7} spellCheck={false}
        aria-label={'Code ' + libelle} aria-invalid={invalide || undefined} title={invalide ? 'Un code de couleur s’écrit #RRGGBB' : undefined}
        onChange={(e) => saisir(e.target.value.trim())} onBlur={() => setBrouillon(null)} />
      {valeur !== origine
        ? <button type="button" className="palOrigine" title={'Revenir à l’origine : ' + origine} aria-label={'Revenir à l’origine pour ' + libelle} onClick={() => { setBrouillon(null); regler(theme, nom, origine); }}>↺</button>
        : <span className="palOrigine palOrigine--vide" aria-hidden="true" />}
    </span>
  );
}

/** Les contrastes : un apercu par theme, le rapport, le minimum, et le verdict ecrit en toutes lettres. */
function Contrastes() {
  const couleurs = useContext(Palette);
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
                const r = contraste(couleurs[t][texte], couleurs[t][fond]);
                const ok = r >= min;
                return (
                  <td key={t}>
                    <span className="palApercu" style={{ color: couleurs[t][texte], background: couleurs[t][fond] }}>Aa</span>
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

/** Les polices : une carte par famille (specimen, pile, role, usages), puis l'echelle des tailles. */
function Typographie() {
  return (
    <div className="palTypo">
      <div className="palPolices">
        {ORDRE_POLICES.map(n => {
          const p = POLICES[n];
          const famille = { fontFamily: 'var(--' + n + ')' };
          return (
            <div key={n} className="palPolice">
              <span className="palSpecimen" style={famille}>Aa</span>
              <div className="palPoliceTexte">
                <p className="palPoliceNom">{p.nom}</p>
                <code className="palPile">--{n}: {p.pile}</code>
                <p className="palPoliceRole">{p.role}</p>
                <p className="palAlphabet" style={famille}>ABCDEFGHIJ abcdefghij àéèêçœ 0123456789 € m² ×</p>
                <ul className="palUsages" style={famille}>{p.usages.map(u => <li key={u}>{u}</li>)}</ul>
              </div>
            </div>
          );
        })}
      </div>
      <div className="palEchelle">
        {ECHELLE_TEXTE.map(e => (
          <div key={e.taille} className="palEchelleLigne">
            <code className="palEchelleTaille">{e.taille}</code>
            <span className="palEchelleUsage">{e.usage}</span>
            <span className={'palEchelleExemple' + (e.capitales ? ' palEchelleExemple--capitales' : '')}
              style={{ fontSize: e.taille, fontFamily: 'var(--' + e.police + ')' }}>{e.exemple}</span>
          </div>
        ))}
        <div className="palEchelleLigne">
          <code className="palEchelleTaille">tabular-nums</code>
          <span className="palEchelleUsage">Chiffres en colonne</span>
          <span className="palChiffres"><span>1 295,00 €</span><span>508,75 €</span><span>37 u</span></span>
        </div>
      </div>
    </div>
  );
}

const OMBRES = ['ombre', 'ombre-flottante', 'ombre-menu', 'ombre-forte'];

function Formes() {
  return (
    <div className="palFormes">
      {Object.keys(RAYONS).map(r => <div key={r} className="palForme" style={{ borderRadius: 'var(--' + r + ')' }}><code>--{r}</code></div>)}
      {OMBRES.map(o => <div key={o} className="palForme palForme--ombre" style={{ boxShadow: 'var(--' + o + ')' }}><code>--{o}</code></div>)}
    </div>
  );
}
