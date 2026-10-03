// Le selecteur de couleur avance de la palette (zones/EcranPalette.tsx), a cote du selecteur du
// systeme et du code `#RRGGBB`.
//
// Une fenetre flottante, ancree au reglage qui l'ouvre : une zone saturation x valeur a glisser
// (ou a parcourir aux fleches), la barre de teinte, les champs TSL et RVB, l'avant et l'apres, les
// contrastes ou la couleur intervient, et le nuancier du theme pour reprendre une autre couleur.
// Chaque geste s'applique aussitot, comme le selecteur du systeme : les apercus suivent. Echap ou un
// clic dehors la ferme ; « Revenir » rend la couleur qu'elle avait a l'ouverture.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PAIRES_CONTRASTE, ROLES_JETONS, contraste, type NomJeton } from '../styles/jetons.js';
import { hexVersRvb, hexVersTsl, hexVersTsv, rvbVersHex, tslVersHex, tsvVersHex, type Tsv } from '../styles/conversions.js';
import { Icone } from './icones.js';

export interface PropsSelecteurCouleur {
  nom: NomJeton;
  /** Le libelle du theme, pour le titre : « clair », « sombre ». */
  theme: string;
  valeur: string;
  origine: string;
  /** Les couleurs du theme en cours, pour les contrastes et le nuancier. */
  couleursTheme: Record<NomJeton, string>;
  regler: (hex: string) => void;
  fermer: () => void;
  /** L'element qui a ouvert le selecteur : il y est ancre, et le focus y revient. */
  ancre: HTMLElement | null;
}

const LARGEUR = 300;
const fr = (n: number) => n.toFixed(2).replace('.', ',');
const arrondi = (n: number) => Math.round(n);

/** La position de la fenetre : sous l'ancre, ramenee dans l'ecran ; en feuille au bas de l'ecran sur telephone. */
function position(ancre: HTMLElement | null, hauteur: number): CSSProperties {
  if (typeof window === 'undefined' || !ancre) return {};
  if (window.innerWidth < 600) return { position: 'fixed', left: 8, right: 8, bottom: 8 };
  const r = ancre.getBoundingClientRect();
  const H = window.innerHeight, W = window.innerWidth;
  const left = Math.max(8, Math.min(r.left, W - LARGEUR - 8));
  if (r.bottom + 6 + hauteur <= H - 8) return { position: 'fixed', left, top: r.bottom + 6, width: LARGEUR };
  if (r.top - 6 - hauteur >= 8) return { position: 'fixed', left, top: r.top - 6 - hauteur, width: LARGEUR };
  // Ni dessous ni dessus : sur le cote, pour ne jamais couvrir le reglage qui l'a ouvert.
  const cote = r.right + 8 + LARGEUR <= W - 8 ? r.right + 8 : Math.max(8, r.left - 8 - LARGEUR);
  return { position: 'fixed', left: cote, top: Math.max(8, Math.min(r.top + r.height / 2 - hauteur / 2, H - hauteur - 8)), width: LARGEUR };
}

export function SelecteurCouleur({ nom, theme, valeur, origine, couleursTheme, regler, fermer, ancre }: PropsSelecteurCouleur) {
  const [initiale] = useState(valeur);
  // La teinte vit a part : sur un gris (saturation nulle), la deduire de la couleur la perdrait.
  const [tsv, setTsv] = useState<Tsv>(() => hexVersTsv(valeur));
  const boite = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });

  // La couleur a change ailleurs (code, selecteur du systeme, nuancier) : on s'y recale.
  useEffect(() => {
    if (tsvVersHex(tsv) !== valeur) setTsv(t => { const n = hexVersTsv(valeur); return n.s === 0 ? { ...n, t: t.t } : n; });
  }, [valeur, tsv]);

  useLayoutEffect(() => {
    const placer = () => setStyle(position(ancre, boite.current?.offsetHeight ?? 420));
    placer();
    window.addEventListener('resize', placer);
    window.addEventListener('scroll', placer, true);
    return () => { window.removeEventListener('resize', placer); window.removeEventListener('scroll', placer, true); };
  }, [ancre]);

  // Echap ferme, un clic dehors aussi ; le focus va a la zone a l'ouverture et revient a l'ancre.
  useEffect(() => {
    zone.current?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); fermer(); } };
    const clic = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (boite.current && !boite.current.contains(cible) && !(ancre && ancre.contains(cible))) fermer();
    };
    document.addEventListener('keydown', touche);
    document.addEventListener('pointerdown', clic, true);
    return () => {
      document.removeEventListener('keydown', touche);
      document.removeEventListener('pointerdown', clic, true);
      ancre?.focus();
    };
  }, [fermer, ancre]);

  const poserTsv = (n: Tsv) => { setTsv(n); regler(tsvVersHex(n)); };
  const poserHex = (hex: string) => { setTsv(t => { const n = hexVersTsv(hex); return n.s === 0 ? { ...n, t: t.t } : n; }); regler(hex); };

  /** Un point de la zone saturation x valeur, sous le pointeur. */
  const viser = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100));
    const v = Math.min(100, Math.max(0, (1 - (e.clientY - r.top) / r.height) * 100));
    poserTsv({ ...tsv, s, v });
  };
  const flechesZone = (e: React.KeyboardEvent) => {
    const pas = e.shiftKey ? 10 : 1;
    const d = { ArrowRight: [pas, 0], ArrowLeft: [-pas, 0], ArrowUp: [0, pas], ArrowDown: [0, -pas] }[e.key];
    if (!d) return;
    e.preventDefault();
    poserTsv({ ...tsv, s: Math.min(100, Math.max(0, tsv.s + (d[0] ?? 0))), v: Math.min(100, Math.max(0, tsv.v + (d[1] ?? 0))) });
  };

  const hex = tsvVersHex(tsv);
  const rvb = hexVersRvb(hex);
  const tsl = hexVersTsl(hex);
  const couleurs = { ...couleursTheme, [nom]: hex };
  const paires = PAIRES_CONTRASTE.filter(([texte, fond]) => texte === nom || fond === nom);

  return (
    <div ref={boite} className="selCouleur" role="dialog" aria-label={'Sélecteur avancé : --' + nom + ', thème ' + theme} style={style}>
      <div className="selEntete">
        <span className="selTitre"><code>--{nom}</code> · {theme}</span>
        <button type="button" className="selFermer" aria-label="Fermer le sélecteur" title="Fermer (Échap)" onClick={fermer}><Icone nom="fermer" taille={16} /></button>
      </div>

      <div ref={zone} className="selZone" tabIndex={0} role="group"
        aria-label={'Saturation ' + arrondi(tsv.s) + ' %, valeur ' + arrondi(tsv.v) + ' % — flèches pour ajuster, Maj pour aller plus vite'}
        style={{ background: 'linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(' + tsv.t + ', 100%, 50%))' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); viser(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) viser(e); }}
        onKeyDown={flechesZone}>
        <span className="selCurseur" aria-hidden="true" style={{ left: tsv.s + '%', top: (100 - tsv.v) + '%', background: hex }} />
      </div>

      <label className="selLigne">
        <span className="selEtiquette">Teinte</span>
        <input type="range" className="selTeinte" min={0} max={359} step={1} value={arrondi(tsv.t) % 360} aria-label="Teinte"
          onChange={(e) => poserTsv({ ...tsv, t: Number(e.target.value) })} />
        <span className="selValeur">{arrondi(tsv.t)}°</span>
      </label>

      <div className="selChamps" role="group" aria-label="Teinte, saturation, luminosité">
        <span className="selEtiquette">TSL</span>
        {([['t', 'Teinte', 359], ['s', 'Saturation', 100], ['l', 'Luminosité', 100]] as const).map(([k, nomChamp, max]) => (
          <input key={k} type="number" className="selNombre" min={0} max={max} value={arrondi(tsl[k])} aria-label={nomChamp + (k === 't' ? ' (degrés)' : ' (%)')}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) poserHex(tslVersHex({ ...tsl, [k]: n })); }} />
        ))}
      </div>
      <div className="selChamps" role="group" aria-label="Rouge, vert, bleu">
        <span className="selEtiquette">RVB</span>
        {([['r', 'Rouge'], ['v', 'Vert'], ['b', 'Bleu']] as const).map(([k, nomChamp]) => (
          <input key={k} type="number" className="selNombre" min={0} max={255} value={rvb[k]} aria-label={nomChamp + ' (0 à 255)'}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) poserHex(rvbVersHex({ ...rvb, [k]: n })); }} />
        ))}
      </div>

      <div className="selAvantApres">
        <span className="selTemoin" style={{ background: initiale }} title={'À l’ouverture : ' + initiale}><span>Avant</span><code>{initiale}</code></span>
        <span className="selTemoin" style={{ background: hex }} title={'Maintenant : ' + hex}><span>Après</span><code>{hex}</code></span>
      </div>

      {paires.length > 0 && (
        <ul className="selContrastes" aria-label="Contrastes où cette couleur intervient">
          {paires.map(([texte, fond, min]) => {
            const r = contraste(couleurs[texte], couleurs[fond]);
            return (
              <li key={texte + '/' + fond}>
                <span className="palApercu" style={{ color: couleurs[texte], background: couleurs[fond] }}>Aa</span>
                <code>--{texte === nom ? fond : texte}</code>
                <span className="palRatio">{fr(r)}</span>
                <span className={r >= min ? 'palVerdict' : 'palVerdict palVerdict--non'}>{r >= min ? 'conforme' : 'insuffisant'}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="selNuancier" role="group" aria-label="Reprendre une couleur du thème">
        {(Object.keys(couleursTheme) as NomJeton[]).map(n => (
          <button key={n} type="button" className="selNuance" style={{ background: couleursTheme[n] }}
            title={'--' + n + ' (' + ROLES_JETONS[n].role + ') : ' + couleursTheme[n]} aria-label={'Reprendre --' + n + ', ' + couleursTheme[n]}
            onClick={() => poserHex(couleursTheme[n])} />
        ))}
      </div>

      <div className="selActions">
        <button type="button" className="secondary small" onClick={() => poserHex(initiale)} disabled={hex === initiale}>Revenir</button>
        <button type="button" className="secondary small" onClick={() => poserHex(origine)} disabled={hex === origine}>Origine</button>
        <button type="button" className="small" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}
