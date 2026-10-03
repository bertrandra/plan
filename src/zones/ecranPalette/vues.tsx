// Les vues de l'ecran de la palette : la planche d'ambiance, les couleurs a regler, les contrastes,
// le CSS, les couleurs en situation, la typographie et les formes. Toutes lisent la palette en cours
// par le contexte `Palette` (commun.tsx), jamais `JETONS` directement.

import { useCallback, useContext, useRef, useState } from 'react';
import { JETONS, PAIRES_CONTRASTE, POLICES, RAYONS, ECHELLE_TEXTE, contraste, type NomJeton } from '../../styles/jetons.js';
import { couleursParDefaut, couleurValide, type Couleurs } from '../../styles/paletteServeur.js';
import { SelecteurCouleur } from './SelecteurCouleur.js';
import { Icone } from '../icones.js';
import { JETONS_ORDONNES, Jeton, NOMS_THEMES, ORDRE_POLICES, Palette, fr, type Theme } from './commun.js';

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

export function CodeCss() {
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

/**
 * La planche d'ambiance : des tuiles composees avec les seuls jetons. Le bois est l'accent en
 * lames, le papier et l'encre portent un titre serif, le jardin est la couleur « enregistre », la
 * brique celle des alertes, le ciel celui de la Vue 3D, la chambre noire celle du releve.
 */
export function PlancheAmbiance() {
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

/**
 * Le reglage d'une couleur dans un theme : le selecteur du systeme, le selecteur avance
 * (zones/SelecteurCouleur.tsx) et le code `#RRGGBB`. Le code se saisit en brouillon et ne
 * s'applique que valide ; invalide, il est signale et la couleur ne bouge pas. Un bouton marque la
 * couleur qui differe de l'origine, et la remet a l'origine.
 */
export function ReglageCouleur({ nom, theme, valeur, regler }: { nom: NomJeton; theme: Theme; valeur: string; regler: (theme: Theme, nom: NomJeton, valeur: string) => void }) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const [avance, setAvance] = useState(false);
  const boutonAvance = useRef<HTMLButtonElement>(null);
  const couleursTheme = useContext(Palette)[theme];
  const normal = (v: string) => (v.startsWith('#') ? v : '#' + v).toUpperCase();
  const invalide = brouillon !== null && !couleurValide(normal(brouillon));
  // Un brouillon valide qui ne correspond plus a la couleur a ete depasse (annuler, origine,
  // selecteur) : c'est la couleur qui se montre. Un brouillon invalide reste, signale.
  const texte = brouillon !== null && (invalide || normal(brouillon) === valeur) ? brouillon : valeur;
  const origine = JETONS[theme][nom];
  const libelle = '--' + nom + ', thème ' + NOMS_THEMES[theme].toLowerCase();
  const fermerAvance = useCallback(() => setAvance(false), []);
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
      <button ref={boutonAvance} type="button" className="palAvance" aria-label={'Sélecteur avancé pour ' + libelle} title="Sélecteur avancé : teinte, saturation, TSL, RVB, contrastes"
        aria-expanded={avance} aria-haspopup="dialog" onClick={() => setAvance(o => !o)}><Icone nom="reglages" taille={16} /></button>
      <input type="text" className={'palCodeCouleur' + (invalide ? ' invalide' : '')} value={texte} maxLength={7} spellCheck={false}
        aria-label={'Code ' + libelle} aria-invalid={invalide || undefined} title={invalide ? 'Un code de couleur s’écrit #RRGGBB' : undefined}
        onChange={(e) => saisir(e.target.value.trim())} onBlur={() => setBrouillon(null)} />
      {valeur !== origine
        ? <button type="button" className="palOrigine" title={'Revenir à l’origine : ' + origine} aria-label={'Revenir à l’origine pour ' + libelle} onClick={() => { setBrouillon(null); regler(theme, nom, origine); }}><Icone nom="annuler" taille={14} /></button>
        : <span className="palOrigine palOrigine--vide" aria-hidden="true" />}
      {avance && (
        <SelecteurCouleur nom={nom} theme={NOMS_THEMES[theme].toLowerCase()} valeur={valeur} origine={origine} couleursTheme={couleursTheme}
          ancre={boutonAvance.current} regler={(hex) => { setBrouillon(null); regler(theme, nom, hex); }} fermer={fermerAvance} />
      )}
    </span>
  );
}

/** Les contrastes : un apercu par theme, le rapport, le minimum, et le verdict ecrit en toutes lettres. */
export function Contrastes({ seulementDefauts = false, basculer }: { seulementDefauts?: boolean; basculer?: (v: boolean) => void }) {
  const couleurs = useContext(Palette);
  const enDefaut = ([texte, fond, min]: (typeof PAIRES_CONTRASTE)[number]) =>
    (['clair', 'sombre'] as Theme[]).some(t => contraste(couleurs[t][texte], couleurs[t][fond]) < min);
  const paires = seulementDefauts ? PAIRES_CONTRASTE.filter(enDefaut) : PAIRES_CONTRASTE;
  return (
    <div className="palTableau">
      {basculer && (
        <label className="palFiltreContraste">
          <input type="checkbox" checked={seulementDefauts} onChange={(e) => basculer(e.target.checked)} />
          Seulement les paires insuffisantes ({PAIRES_CONTRASTE.filter(enDefaut).length} sur {PAIRES_CONTRASTE.length})
        </label>
      )}
      <table className="attrTable palContrastes">
        <thead>
          <tr><th>Texte</th><th>Fond</th><th>Clair</th><th>Sombre</th><th>Minimum</th></tr>
        </thead>
        <tbody>
          {paires.map(([texte, fond, min]) => (
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
export function EnSituation() {
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
export function Typographie() {
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

export function Formes() {
  return (
    <div className="palFormes">
      {Object.keys(RAYONS).map(r => <div key={r} className="palForme" style={{ borderRadius: 'var(--' + r + ')' }}><code>--{r}</code></div>)}
      {OMBRES.map(o => <div key={o} className="palForme palForme--ombre" style={{ boxShadow: 'var(--' + o + ')' }}><code>--{o}</code></div>)}
    </div>
  );
}
