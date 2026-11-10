// Les graphiques du tableau de bord de la consommation, en SVG dessine par la page (13.3).
//
// Aucune bibliotheque : le fichier livre est unique et son budget compte. Les couleurs passent par
// les jetons (`--serie-1`… par modele, `--accent` pour une serie seule) poses en classes : rien
// n'est en dur, et le theme sombre a ses propres pas, choisis et valides pour son fond. Chaque
// couleur a son nom a cote (legende, etiquette directe, infobulle) : elle ne porte jamais seule
// l'information. Les valeurs restent lisibles sans survol, dans le tableau sous chaque graphique.

import { useEffect, useRef, useState } from 'react';
import { couleurSerie, nomModele, valeurA, type Mesure, type Pas, type SerieTemps } from '../../model/consommation.js';
import { compact, dollars, graduations, intervalle, tokens } from './format.js';

/** La largeur disponible, suivie au redimensionnement. */
function useLargeur(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [largeur, setLargeur] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => setLargeur(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largeur];
}

/** La classe de couleur d'une serie : son jeton, ou l'encre secondaire pour « autres modeles ». */
export function classeSerie(serie: string): string {
  const n = couleurSerie(serie);
  return n ? 'consSerie' + n : 'consSerieAutre';
}

/** La legende : une pastille et un nom par serie, toujours presente des deux series. */
export function Legende({ series }: { series: string[] }) {
  return (
    <ul className="consLegende" aria-label="Légende">
      {series.map((s) => (
        <li key={s}><svg width="12" height="12" aria-hidden="true"><rect className={classeSerie(s)} x="0" y="0" width="12" height="12" rx="3" /></svg>{nomModele(s)}</li>
      ))}
    </ul>
  );
}

const valeur = (x: number, mesure: Mesure) => (mesure === 'tokens' ? tokens(x) + ' tokens' : dollars(x));

/**
 * Tokens ou dollars dans le temps, en aires empilees par modele. Un pointeur ou les fleches du
 * clavier choisissent un intervalle : la ligne verticale s'y pose et l'infobulle donne chaque modele.
 */
export function AiresEmpilees({ serie, mesure, pas }: { serie: SerieTemps; mesure: Mesure; pas: Pas }) {
  const [ref, largeur] = useLargeur();
  const [actif, setActif] = useState<number | null>(null);
  const n = serie.cles.length;
  const max = Math.max(0, ...serie.totaux);
  const etroit = largeur < 520;
  const hauteur = etroit ? 220 : 260;
  // Les etiquettes directes, a droite, demandent de la place : au telephone, la legende suffit.
  const marge = { haut: 12, droite: etroit ? 12 : 128, bas: 28, gauche: 56 };
  const l = largeur - marge.gauche - marge.droite;
  const h = hauteur - marge.haut - marge.bas;
  const ticks = graduations(max);
  const haut = ticks[ticks.length - 1] ?? 0;
  const x = (i: number) => marge.gauche + (n <= 1 ? l / 2 : (i * l) / (n - 1));
  const y = (v: number) => marge.haut + h - (haut > 0 ? (v / haut) * h : 0);

  // Les couches, de bas en haut, dans l'ordre fixe des modeles.
  const cumul = serie.cles.map(() => 0);
  const couches = serie.series.map((s) => {
    const bas = [...cumul];
    serie.cles.forEach((_, i) => { cumul[i] = (cumul[i] ?? 0) + valeurA(serie, s, i); });
    return { s, bas, haut: [...cumul] };
  });
  // Un seul intervalle ne fait pas d'aire : une colonne de 24 px, comme une barre.
  const xs = (i: number, cote: -1 | 1) => (n <= 1 ? x(i) + cote * 12 : x(i));
  const aire = (bas: number[], hautC: number[]) => {
    const dessus = hautC.map((v, i) => (n <= 1 ? `${xs(i, -1)},${y(v)} ${xs(i, 1)},${y(v)}` : `${x(i)},${y(v)}`)).join(' ');
    const dessous = [...bas].reverse().map((v, j) => { const i = bas.length - 1 - j; return n <= 1 ? `${xs(i, 1)},${y(v)} ${xs(i, -1)},${y(v)}` : `${x(i)},${y(v)}`; }).join(' ');
    return 'M' + dessus + ' L' + dessous + ' Z';
  };
  const ligne = (v: number[]) => 'M' + v.map((w, i) => (n <= 1 ? `${xs(i, -1)},${y(w)} ${xs(i, 1)},${y(w)}` : `${x(i)},${y(w)}`)).join(' L');

  // Six etiquettes d'abscisse au plus, reparties.
  const pasEtiquette = Math.max(1, Math.ceil(n / (etroit ? 4 : 7)));
  const etiquettes = serie.cles.map((c, i) => ({ c, i })).filter(({ i }) => i % pasEtiquette === 0);

  // Les etiquettes directes, au bout de chaque couche assez epaisse pour les porter sans chevaucher.
  const directes = etroit ? [] : couches.map((c) => ({ s: c.s, ym: (y(c.bas[n - 1] ?? 0) + y(c.haut[n - 1] ?? 0)) / 2, epaisseur: y(c.bas[n - 1] ?? 0) - y(c.haut[n - 1] ?? 0) }))
    .filter((d) => d.epaisseur >= 14);

  const choisir = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - marge.gauche) / l) * (n - 1));
    setActif(Math.min(n - 1, Math.max(0, i)));
  };
  const surTouche = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActif((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setActif(null);
  };

  if (!(max > 0)) return <div ref={ref} className="consVide">Aucun appel sur cette période et ces filtres.</div>;
  const info = actif === null ? null : {
    x: x(actif),
    titre: intervalle(serie.cles[actif] ?? '', pas),
    lignes: serie.series.map((s) => ({ s, v: valeurA(serie, s, actif) })).reverse(),
    total: serie.totaux[actif] ?? 0,
    gauche: x(actif) > largeur / 2
  };
  return (
    <div ref={ref} className="consGraphe">
      <Legende series={serie.series} />
      <svg width={largeur} height={hauteur} role="img" tabIndex={0} className="consSvg"
        aria-label={(mesure === 'tokens' ? 'Tokens' : 'Coût en dollars') + ' par ' + pas + ' et par modèle. Flèches gauche et droite pour lire chaque ' + pas + '.'}
        onPointerMove={(e) => choisir(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => choisir(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActif(null); }}
        onFocus={() => setActif((a) => a ?? n - 1)} onBlur={() => setActif(null)} onKeyDown={surTouche}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="consGrille" x1={marge.gauche} x2={marge.gauche + l} y1={y(t)} y2={y(t)} />
            <text className="consAxe" x={marge.gauche - 6} y={y(t)} dy="0.32em" textAnchor="end">{compact(t, mesure)}</text>
          </g>
        ))}
        {etiquettes.map(({ c, i }) => (
          <text key={c} className="consAxe" x={x(i)} y={hauteur - 8} textAnchor={n <= 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{intervalle(c, pas, true)}</text>
        ))}
        {couches.map((c) => (
          <g key={c.s} className={classeSerie(c.s)}>
            <path className="consAire" d={aire(c.bas, c.haut)} />
            <path className="consTrait" d={ligne(c.haut)} />
          </g>
        ))}
        {directes.map((d) => (
          <g key={d.s}>
            <rect className={classeSerie(d.s)} x={marge.gauche + l + 8} y={d.ym - 4} width="8" height="8" rx="2" />
            <text className="consEtiquette" x={marge.gauche + l + 20} y={d.ym} dy="0.32em">{nomModele(d.s).replace(/^Claude /, '')}</text>
          </g>
        ))}
        {actif !== null && <line className="consReticule" x1={x(actif)} x2={x(actif)} y1={marge.haut} y2={marge.haut + h} />}
        {actif !== null && couches.map((c) => (
          <circle key={c.s} className={'consPoint ' + classeSerie(c.s)} cx={x(actif)} cy={y(c.haut[actif] ?? 0)} r="4" />
        ))}
      </svg>
      {info && (
        <div className={'consInfobulle' + (info.gauche ? ' aGauche' : '')} style={{ left: info.x }} role="status">
          <div className="consInfobulleTitre">{info.titre}</div>
          {info.lignes.map((r) => (
            <div key={r.s} className="consInfobulleLigne">
              <svg width="12" height="4" aria-hidden="true"><rect className={classeSerie(r.s)} width="12" height="3" rx="1.5" /></svg>
              <strong>{valeur(r.v, mesure)}</strong><span>{nomModele(r.s)}</span>
            </div>
          ))}
          {info.lignes.length > 1 && <div className="consInfobulleLigne consInfobulleTotal"><strong>{valeur(info.total, mesure)}</strong><span>au total</span></div>}
        </div>
      )}
    </div>
  );
}

/**
 * Des barres horizontales, une par categorie, pour une seule mesure : une seule couleur (l'accent),
 * puisqu'il n'y a qu'une serie ; la valeur au bout de chaque barre.
 */
export function Barres({ lignes, libelle = 'Répartition du coût' }: { lignes: { nom: string; valeur: number; texte: string }[]; libelle?: string }) {
  const [ref, largeur] = useLargeur();
  const max = Math.max(0, ...lignes.map((l) => l.valeur));
  const etroit = largeur < 520;
  const gauche = etroit ? 84 : 110;
  const droite = etroit ? 110 : 160;
  const pasY = 32;
  const l = Math.max(40, largeur - gauche - droite);
  const hauteur = lignes.length * pasY + 4;
  return (
    <div ref={ref} className="consGraphe">
      <svg width={largeur} height={hauteur} role="img" aria-label={libelle}>
        {lignes.map((b, i) => {
          const w = max > 0 ? Math.max(b.valeur > 0 ? 2 : 0, (b.valeur / max) * l) : 0;
          const yb = i * pasY + 8;
          return (
            <g key={b.nom}>
              <text className="consAxe consAxeCategorie" x={gauche - 8} y={yb + 8} dy="0.32em" textAnchor="end">{b.nom}</text>
              <line className="consGrille" x1={gauche} x2={gauche} y1={yb - 4} y2={yb + 20} />
              {/* Bout arrondi de 4 px, base carree contre l'axe. */}
              {w > 0 && <path className="consBarre" d={w > 4 ? `M${gauche},${yb} h${w - 4} a4,4 0 0 1 4,4 v8 a4,4 0 0 1 -4,4 h${-(w - 4)} Z` : `M${gauche},${yb} h${w} v16 h${-w} Z`}><title>{b.nom + ' : ' + b.texte}</title></path>}
              <text className="consEtiquette" x={gauche + w + 6} y={yb + 8} dy="0.32em">{b.texte}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Une jauge de plafond : la part consommee, en accent, sur une piste de la meme famille ; au-dela de
 * 80 %, la couleur d'alerte, toujours avec le mot (la couleur ne parle jamais seule).
 */
export function Jauge({ part, libelle }: { part: number; libelle: string }) {
  const p = Math.max(0, Math.min(1, part));
  const alerte = part >= 0.8;
  return (
    <span className="consJauge">
      <svg width="96" height="8" role="img" aria-label={libelle}>
        <rect className="consJaugePiste" width="96" height="8" rx="4" />
        {p > 0 && <rect className={alerte ? 'consJaugeAlerte' : 'consJaugeRemplie'} width={Math.max(8, 96 * p)} height="8" rx="4" />}
      </svg>
      <span className={alerte ? 'consMotAlerte' : undefined}>{libelle}{alerte ? ' · alerte' : ''}</span>
    </span>
  );
}
