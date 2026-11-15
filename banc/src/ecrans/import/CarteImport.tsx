// La carte de l'import Panoramax (demande du proprietaire, 15 novembre 2026 : « voir plus loin graphiquement avec les rues ») : un fond
// de plan de l'IGN (Plan IGN v2 et ses noms de rues, ou la photo aerienne), les parcelles du cadastre en transparence, le rayon de
// recherche autour de la parcelle, et chaque photo a sa place avec le sens ou regardent ses vues. Elle se zoome et se deplace (molette,
// pincement, glisser, boutons). La geometrie est dans carte.ts ; ici, le dessin et les gestes.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ToucheReact, type PointerEvent as PointeurReact, type RefObject } from 'react';
import { barreEchelle, empriseVue, glisser, metresEnLocal, metresParPixel, pincer, placementLocal, secteur, texteEchelle, tuiles, urlTuile, versEcran, versLocal, zoomerAutour, zoomPourRayon, type Emprise, type Fond, type P, type Taille, type VueCarte } from '../../carte.js';
import { CHAMP_VUE, distanceM, type PhotoRue, type VueAExtraire } from '../../panoramax.js';
import { centre, type Ll, type Parcelle } from '../../parcelles.js';
import { Icone } from '../../ui/Icones.js';

/** Ce qu'on voit au moins autour de la parcelle, meme avec un petit rayon : la rue et les voisines (70 m avant, de bord a bord). */
const PORTEE_MIN_M = 110;
/**
 * La longueur d'un secteur de vue, en pixels de l'ecran : assez pour lire sa direction, assez peu pour ne pas couvrir la rue. De loin
 * (tout un rayon de 300 m), les photos d'une rue se touchent : les secteurs raccourcissent.
 */
const longueurSecteur = (zoom: number) => Math.max(14, Math.min(30, 14 + (zoom - 16) * 8));
const FONDS: { valeur: Fond; libelle: string }[] = [{ valeur: 'plan', libelle: 'Plan' }, { valeur: 'photo', libelle: 'Photo aérienne' }, { valeur: 'aucun', libelle: 'Sans fond' }];
const CLE_FOND = 'banc.import.fond';

function fondGarde(): Fond {
  try { const f = localStorage.getItem(CLE_FOND); return f === 'photo' || f === 'aucun' ? f : 'plan'; } catch { return 'plan'; }
}

/** La taille du cadre de la carte, suivie quand la fenetre change. */
function useTaille(): [(e: HTMLDivElement | null) => void, Taille, RefObject<HTMLDivElement | null>] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [taille, setTaille] = useState<Taille>({ l: 0, h: 0 });
  const observateur = useRef<ResizeObserver | null>(null);
  const poser = useCallback((e: HTMLDivElement | null) => {
    observateur.current?.disconnect();
    ref.current = e;
    if (!e) return;
    const lire = () => setTaille((t) => (t.l === e.clientWidth && t.h === e.clientHeight ? t : { l: e.clientWidth, h: e.clientHeight }));
    lire();
    if (typeof ResizeObserver !== 'undefined') { observateur.current = new ResizeObserver(lire); observateur.current.observe(e); }
  }, []);
  return [poser, taille, ref];
}

export interface PropsCarte {
  adresse: Ll;
  parcelles: readonly Parcelle[];
  parcelle: Parcelle | null;
  photos: readonly PhotoRue[];
  choix: ReadonlySet<string>;
  vuesDe: (p: PhotoRue) => VueAExtraire[];
  /** Le rayon de la derniere recherche, en metres (autour des bords de la parcelle, ou de l'adresse sans parcelle). */
  rayon: number;
  /** La photo montree dans l'apercu (survolee ou epinglee), mise en valeur. */
  montree: string | null;
  epinglee: string | null;
  /** Change a chaque nouvelle recherche : la carte se recadre sur la parcelle et son rayon. */
  cadrage: number;
  /** Ce que le cadastre a a dire de la vue (tronque, trop loin, en panne) ; null quand tout est lu. */
  avisCadastre: string | null;
  onParcelle: (p: Parcelle) => void;
  onSurvol: (id: string | null) => void;
  onPhoto: (id: string) => void;
  onBasculer: (id: string) => void;
  /** La vue a change (apres un court repos) : de quoi lire les parcelles de ce qui est montre. */
  onEmprise: (e: Emprise) => void;
}

/**
 * Les gestes de la carte : la molette et le pincement zooment sous le curseur ou les doigts, glisser deplace, le clavier aussi. Rend ce
 * qu'il faut poser sur le cadre, et `aGlisse` : un glisser n'est pas un toucher, ce qui est sous le doigt ne se choisit pas au lacher.
 */
function useGestes(cadre: RefObject<HTMLDivElement | null>, taille: Taille, vue: VueCarte, setVue: (f: VueCarte | ((v: VueCarte) => VueCarte)) => void, cadrer: () => VueCarte) {
  // La taille et la vue se lisent dans des references : l'ecouteur de la molette ne se repose pas a chaque image.
  const tailleRef = useRef(taille); tailleRef.current = taille;
  const vueRef = useRef(vue); vueRef.current = vue;
  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    // Hors de React : son ecouteur de molette est passif, il ne peut pas retenir le defilement de la page.
    const molette = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = e.getBoundingClientRect();
      const dz = Math.max(-0.6, Math.min(0.6, -ev.deltaY * (ev.deltaMode === 1 ? 0.06 : 0.0025)));
      setVue((v) => zoomerAutour(v, { x: ev.clientX - r.left, y: ev.clientY - r.top }, tailleRef.current, dz));
    };
    e.addEventListener('wheel', molette, { passive: false });
    return () => e.removeEventListener('wheel', molette);
  }, [cadre, setVue]);

  const pointeurs = useRef(new Map<number, P>());
  const depart = useRef<{ vue: VueCarte; a: P; milieu: P; ecart: number } | null>(null);
  const aGlisse = useRef(false);
  const ou = (ev: PointeurReact): P => { const r = (cadre.current as HTMLDivElement).getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  // A chaque doigt pose ou leve, le geste repart de la vue du moment : passer de deux doigts a un ne fait pas sauter la carte.
  const repartir = () => {
    const l = [...pointeurs.current.values()], a = l[0], b = l[1];
    if (!a) { depart.current = null; return; }
    depart.current = { vue: vueRef.current, a, milieu: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a, ecart: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0 };
  };
  const onPointerDown = (ev: PointeurReact) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (!pointeurs.current.size) aGlisse.current = false;
    pointeurs.current.set(ev.pointerId, ou(ev));
    repartir();
  };
  const onPointerMove = (ev: PointeurReact) => {
    if (!pointeurs.current.has(ev.pointerId) || !depart.current) return;
    pointeurs.current.set(ev.pointerId, ou(ev));
    const l = [...pointeurs.current.values()], a = l[0] as P, b = l[1], d = depart.current;
    if (b) {
      aGlisse.current = true;
      setVue(pincer(d.vue, tailleRef.current, d.milieu, d.ecart, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(b.x - a.x, b.y - a.y)));
      return;
    }
    const dx = a.x - d.a.x, dy = a.y - d.a.y;
    if (!aGlisse.current && Math.hypot(dx, dy) < 5) return;
    // Le pointeur est retenu des que le glisser commence : le lacher hors de la carte le termine quand meme.
    if (!aGlisse.current) { aGlisse.current = true; try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* pointeur deja parti */ } }
    setVue(glisser(d.vue, dx, dy));
  };
  const lever = (ev: PointeurReact) => { pointeurs.current.delete(ev.pointerId); repartir(); };
  const milieu = (): P => ({ x: tailleRef.current.l / 2, y: tailleRef.current.h / 2 });
  const zoomer = (dz: number) => setVue((v) => zoomerAutour(v, milieu(), tailleRef.current, dz));
  const onKeyDown = (ev: ToucheReact) => {
    // Les touches de la carte seulement quand c'est elle qui a le clavier : un point de photo garde Entree et Espace.
    if (ev.target !== ev.currentTarget) return;
    const pas = 80;
    if (ev.key === '+' || ev.key === '=') zoomer(1);
    else if (ev.key === '-') zoomer(-1);
    else if (ev.key === 'ArrowLeft') setVue((v) => glisser(v, pas, 0));
    else if (ev.key === 'ArrowRight') setVue((v) => glisser(v, -pas, 0));
    else if (ev.key === 'ArrowUp') setVue((v) => glisser(v, 0, pas));
    else if (ev.key === 'ArrowDown') setVue((v) => glisser(v, 0, -pas));
    else if (ev.key === '0') setVue(cadrer());
    else return;
    ev.preventDefault();
  };
  return { aGlisse, zoomer, cadre: { onPointerDown, onPointerMove, onPointerUp: lever, onPointerCancel: lever, onKeyDown } };
}

/** Le fond : les tuiles de l'IGN qui couvrent la vue. Dit a la carte celles qui arrivent et celles qui manquent. */
function FondDeCarte({ fond, vue, taille, onTuile }: { fond: Exclude<Fond, 'aucun'>; vue: VueCarte; taille: Taille; onTuile: (ok: boolean) => void }) {
  return (
    <div className="carte-tuiles" aria-hidden="true">
      {tuiles(vue, taille).map((t) => {
        // Au pixel entier : des tuiles posees sur des demi-pixels laissent un filet entre elles.
        const g = Math.round(t.gauche), h = Math.round(t.haut);
        return <img key={`${fond}-${t.z}-${t.x}-${t.y}`} src={urlTuile(fond, t.z, t.x, t.y)} alt="" draggable={false}
          style={{ left: g, top: h, width: Math.round(t.gauche + t.cote) - g, height: Math.round(t.haut + t.cote) - h }}
          onLoad={() => onTuile(true)} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; onTuile(false); }} />;
      })}
    </div>
  );
}

const champDe = (p: PhotoRue) => (p.panoramique ? CHAMP_VUE : Math.min(120, p.champ));

/** Les photos : un point chacune, et un secteur par vue a importer (75 degres pour un 360, le champ de l'objectif pour une photo plate). */
function PointsPhotos({ photos, choix, vuesDe, vue, taille, montree, epinglee, aGlisse, onSurvol, onPhoto, onBasculer }: Pick<PropsCarte, 'photos' | 'choix' | 'vuesDe' | 'montree' | 'epinglee' | 'onSurvol' | 'onPhoto' | 'onBasculer'> & { vue: VueCarte; taille: Taille; aGlisse: RefObject<boolean> }) {
  const doigt = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const dehors = (q: P) => q.x < -40 || q.y < -40 || q.x > taille.l + 40 || q.y > taille.h + 40;
  const libelle = (p: PhotoRue, n: number) => `Photo à ${p.distance} m, ${p.panoramique ? `panoramique 360°, ${n} vue${n > 1 ? 's' : ''}` : (p.vise ? 'tournée vers la parcelle' : 'de côté')}${p.date ? `, du ${p.date.slice(0, 10)}` : ''}, ${choix.has(p.id) ? 'choisie' : 'non choisie'}. Entrée pour garder son aperçu, Espace pour ${choix.has(p.id) ? 'la décocher' : 'la cocher'}.`;
  const longueur = longueurSecteur(vue.zoom), petit = vue.zoom < 17;
  const enValeur = photos.find((x) => x.id === montree);
  const posValeur = enValeur ? versEcran(enValeur, vue, taille) : null;
  return (
    <>
      {photos.map((p) => {
        const q = versEcran(p, vue, taille);
        if (dehors(q)) return null;
        const vues = vuesDe(p), coche = choix.has(p.id);
        return (
          <g key={p.id} transform={`translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`} role="button" tabIndex={0} aria-pressed={coche} aria-label={libelle(p, vues.length)}
            className={'point-photo' + (coche ? ' choisie' : '') + (p.id === epinglee ? ' epinglee' : '')}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onSurvol(p.id); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') onSurvol(null); }}
            onFocus={() => onSurvol(p.id)} onBlur={() => onSurvol(null)}
            onClick={() => { if (!aGlisse.current) onPhoto(p.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onPhoto(p.id); } else if (e.key === ' ') { e.preventDefault(); onBasculer(p.id); } }}>
            {vues.map((v, k) => <path key={k} className="secteur" d={secteur({ x: 0, y: 0 }, v.cap, champDe(p), longueur)} />)}
            {/* La cible du geste : 44 px au doigt, plus large que le point qu'on voit. */}
            <circle className="cible" r={doigt ? 22 : 13} />
            <circle className="point" r={(p.panoramique ? 6.5 : 5) - (petit ? 1.5 : 0)} />
          </g>
        );
      })}
      {/* La photo montree, redessinee par-dessus les autres sans changer leur ordre : un point qui changerait de place sous la souris
          perdrait son survol. */}
      {enValeur && posValeur && !dehors(posValeur) && (
        <g className={'point-photo valeur' + (choix.has(enValeur.id) ? ' choisie' : '')} transform={`translate(${posValeur.x.toFixed(1)} ${posValeur.y.toFixed(1)})`} aria-hidden="true">
          {vuesDe(enValeur).map((v, k) => <path key={k} className="secteur" d={secteur({ x: 0, y: 0 }, v.cap, champDe(enValeur), Math.max(30, longueur * 1.6))} />)}
          <circle className="anneau" r={12} />
          <circle className="point" r={enValeur.panoramique ? 7.5 : 6} />
        </g>
      )}
    </>
  );
}

/** Les parcelles en transparence, et le rayon de recherche : un halo autour de la parcelle choisie (ou de l'adresse), cerne d'un trait. */
function Cadastre({ contours, parcelle, placement, halo, taille, aGlisse, onParcelle }: { contours: { p: Parcelle; points: string }[]; parcelle: Parcelle | null; placement: { k: number; dx: number; dy: number }; halo: number; taille: Taille; aGlisse: RefObject<boolean>; onParcelle: (p: Parcelle) => void }) {
  const transformation = `translate(${placement.dx.toFixed(2)} ${placement.dy.toFixed(2)}) scale(${placement.k})`;
  const choisie = contours.find((c) => c.p.idu === parcelle?.idu) ?? null;
  // Deux pixels et demi a l'ecran, quel que soit le zoom.
  const trait = 2.5 / placement.k;
  return (
    <>
      <defs>
        {/* L'anneau du rayon : le contour de la parcelle epaissi du rayon de chaque cote, moins le meme un peu moins epais. */}
        <mask id="carte-anneau" maskUnits="userSpaceOnUse" x={0} y={0} width={taille.l} height={taille.h}>
          <g transform={transformation} strokeLinejoin="round">
            {choisie ? <>
              <polygon points={choisie.points} fill="#fff" stroke="#fff" strokeWidth={2 * halo + trait} />
              <polygon points={choisie.points} fill="#000" stroke="#000" strokeWidth={Math.max(0, 2 * halo - trait)} />
            </> : <>
              <circle r={halo + trait / 2} fill="#fff" />
              <circle r={Math.max(0, halo - trait / 2)} fill="#000" />
            </>}
          </g>
        </mask>
      </defs>
      <g transform={transformation}>
        <g className="rayon-halo" strokeLinejoin="round">
          {choisie ? <polygon points={choisie.points} strokeWidth={2 * halo} /> : <circle r={halo} />}
        </g>
        {contours.map(({ p, points }) => (
          <polygon key={p.idu} points={points} className={p.idu === parcelle?.idu ? 'parcelle choisie' : 'parcelle'} onClick={() => { if (!aGlisse.current) onParcelle(p); }}>
            <title>{`Parcelle ${p.section} ${p.numero}${p.contenance ? ` · ${p.contenance} m²` : ''}`}</title>
          </polygon>
        ))}
      </g>
      <rect className="rayon-anneau" x={0} y={0} width={taille.l} height={taille.h} mask="url(#carte-anneau)" />
    </>
  );
}

export function CarteImport(props: PropsCarte) {
  const { adresse, parcelles, parcelle, photos, rayon, cadrage, avisCadastre, onParcelle, onEmprise } = props;
  const [poser, taille, cadre] = useTaille();
  const [vue, setVue] = useState<VueCarte>({ lat: adresse.lat, lon: adresse.lon, zoom: 18 });
  const [fond, setFond] = useState<Fond>(fondGarde);
  // Les tuiles du fond recues et refusees : sans aucune recue, on dit que la carte n'a que ses parcelles.
  const [recues, setRecues] = useState({ fond, ok: 0, ko: 0 });

  // Le cadrage : la parcelle (ou l'adresse) au milieu, son rayon de recherche entier dans la carte.
  const cadrer = useCallback((): VueCarte => {
    const c = parcelle ? centre(parcelle) : adresse;
    const etendue = parcelle ? Math.max(...parcelle.contour.map((q) => distanceM(c, q))) : 0;
    return { lat: c.lat, lon: c.lon, zoom: zoomPourRayon(c.lat, Math.max(PORTEE_MIN_M, rayon + etendue), taille) };
  }, [parcelle, adresse, rayon, taille]);
  const cadree = useRef<number | null>(null);
  useEffect(() => {
    // Une fois par recherche, quand la carte a sa taille : pas a chaque parcelle touchee (on la regarde deja).
    if (!taille.l || cadree.current === cadrage) return;
    cadree.current = cadrage;
    setVue(cadrer());
  }, [cadrage, taille.l, cadrer]);
  // La vue au repos : on previent qui lit le cadastre.
  useEffect(() => {
    if (!taille.l || cadree.current === null) return;
    const t = setTimeout(() => onEmprise(empriseVue(vue, taille)), 450);
    return () => clearTimeout(t);
  }, [vue, taille, onEmprise]);
  const gestes = useGestes(cadre, taille, vue, setVue, cadrer);

  const choisirFond = (f: Fond) => {
    setFond(f); setRecues({ fond: f, ok: 0, ko: 0 });
    try { localStorage.setItem(CLE_FOND, f); } catch { /* preference non gardee, sans gravite */ }
  };
  // Les parcelles se projettent une fois, autour de l'adresse ; un deplacement ou un zoom ne change que leur transformation.
  const contours = useMemo(() => parcelles.map((p) => ({ p, points: p.contour.map((q) => { const l = versLocal(q, adresse); return `${l.x.toFixed(1)},${l.y.toFixed(1)}`; }).join(' ') })), [parcelles, adresse]);
  const barre = barreEchelle(metresParPixel(vue.lat, vue.zoom));
  const posAdresse = versEcran(adresse, vue, taille);
  const fondEnPanne = fond !== 'aucun' && recues.fond === fond && recues.ko > 0 && recues.ok === 0;
  const avis = [fondEnPanne ? 'Le fond de carte de l’IGN ne se charge pas : la carte reste utilisable avec les parcelles seules.' : null, avisCadastre].filter((a): a is string => !!a);

  return (
    <div className={`carte-import fond-${fond}${fondEnPanne ? ' fond-absent' : ''}${vue.zoom < 17.2 ? ' loin' : ''}`}>
      <div className="carte-cadre" ref={poser} tabIndex={0} role="application" aria-label="Carte des photos autour de la parcelle. Flèches pour la déplacer, plus et moins pour zoomer, zéro pour recentrer." {...gestes.cadre}>
        {fond !== 'aucun' && taille.l > 0 && <FondDeCarte fond={fond} vue={vue} taille={taille} onTuile={(ok) => setRecues((r) => (r.fond === fond ? { ...r, ok: r.ok + (ok ? 1 : 0), ko: r.ko + (ok ? 0 : 1) } : r))} />}
        {taille.l > 0 && (
          <svg className="carte-dessin" width={taille.l} height={taille.h} viewBox={`0 0 ${taille.l} ${taille.h}`}>
            <Cadastre contours={contours} parcelle={parcelle} placement={placementLocal(adresse, vue, taille)} halo={metresEnLocal(rayon, adresse.lat)} taille={taille} aGlisse={gestes.aGlisse} onParcelle={onParcelle} />
            <g className="adresse-carte" transform={`translate(${posAdresse.x.toFixed(1)} ${posAdresse.y.toFixed(1)})`}>
              <circle r={5} /><title>L’adresse cherchée</title>
            </g>
            <PointsPhotos {...props} vue={vue} taille={taille} aGlisse={gestes.aGlisse} />
          </svg>
        )}
        {/* Les commandes ne font pas glisser la carte : leur appui s'arrete a elles. */}
        <div className="carte-fonds" role="radiogroup" aria-label="Fond de carte" onPointerDown={(e) => e.stopPropagation()}>
          {FONDS.map((f) => <button key={f.valeur} type="button" role="radio" aria-checked={f.valeur === fond} className={f.valeur === fond ? 'actif' : ''} onClick={() => choisirFond(f.valeur)}>{f.libelle}</button>)}
        </div>
        <div className="carte-zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Zoomer" title="Zoomer (+)" onClick={() => gestes.zoomer(1)}>+</button>
          <button type="button" aria-label="Dézoomer" title="Dézoomer (−)" onClick={() => gestes.zoomer(-1)}>−</button>
          <button type="button" aria-label="Recentrer sur la parcelle et son rayon" title="Recentrer sur la parcelle et son rayon (0)" onClick={() => setVue(cadrer())}><Icone nom="point" taille={18} /></button>
        </div>
        {avis.length > 0 && <div className="carte-avis" role="status">{avis.map((a) => <p key={a}>{a}</p>)}</div>}
        <div className="carte-pied" aria-hidden="true">
          <span className="carte-echelle" style={{ width: barre.px }}>{texteEchelle(barre.metres)}</span>
          <span className="carte-credit">© IGN{photos.length ? ' · photos Panoramax' : ''}</span>
        </div>
      </div>
      <p className="carte-legende">
        <span><i className="pastille-carte rayon" /> {rayon} m autour de {parcelle ? 'la parcelle' : 'l’adresse'}</span>
        <span><i className="pastille-carte choisie" /> photo choisie et ses vues</span>
        <span><i className="pastille-carte" /> photo non choisie</span>
        <span><i className="pastille-carte adresse" /> adresse</span>
      </p>
    </div>
  );
}
