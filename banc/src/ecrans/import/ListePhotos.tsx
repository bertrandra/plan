// La liste des photos proposees par l'import Panoramax, et la fenetre « Choisir les vues » d'un 360. Chaque carte dit la note de la
// photo (0 a 100, facadesVues.ts::noteDeVue) et si elle n'est qu'un doublon (meilleuresVues.ts) ; la liste se trie par note, par
// distance ou par date.

import { useEffect } from 'react';
import { aImporter, facadesEnDouble, noteDePhoto, ORDRES, texteDeLImport, VUES_PAR_BATIMENT, type Ordre, type VuesParBatiment } from '../../meilleuresVues.js';
import { basculerCap, capDuX, CHAMP_VUE, xDuCap, type PhotoRue, type VueAExtraire } from '../../panoramax.js';
import { Icone } from '../../ui/Icones.js';
import { Apercu, NOM_VUE, usePano } from './panoramiques.js';

export interface PropsListe {
  photos: PhotoRue[]; cochees: ReadonlySet<string>; enDoublon: ReadonlySet<string>; vuesDe: (p: PhotoRue) => VueAExtraire[];
  ouverte: string | null; setOuverte: (id: string | null) => void; montree: string | null; onSurvol: (id: string | null) => void; visant: boolean;
  ordre: Ordre; setOrdre: (o: Ordre) => void; parBatiment: VuesParBatiment; setParBatiment: (n: VuesParBatiment) => void;
  /** Les murs deja dans le banc ne se proposent plus coches (la regle par defaut) ; `mursDuBanc` : combien le banc en connait. */
  ecarterDejaLa: boolean; setEcarterDejaLa: (v: boolean) => void; mursDuBanc: number;
  /** Le regroupement par batiment a lieu (le tri des facades se fait) : ses reglages se montrent. */
  groupees: boolean;
  onBasculer: (id: string) => void; onCocher: (qui: 'facades' | 'doublons' | 'aucune') => void; onImporter: () => void;
}

/** Les reglages de la liste : l'ordre, et combien de vues garder par batiment. */
function ReglagesDeLaListe({ ordre, setOrdre, parBatiment, setParBatiment, groupees, ecarterDejaLa, setEcarterDejaLa, mursDuBanc }: Pick<PropsListe, 'ordre' | 'setOrdre' | 'parBatiment' | 'setParBatiment' | 'groupees' | 'ecarterDejaLa' | 'setEcarterDejaLa' | 'mursDuBanc'>) {
  return (
    <>
      <label>Tri
        <select value={ordre} onChange={(e) => setOrdre(e.target.value as Ordre)}>{ORDRES.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}</select>
      </label>
      {groupees && (
        <label title="Un même bâtiment revient dans plusieurs photos : sa façade n’est proposée qu’une fois, par sa meilleure vue ; les autres sont marquées « doublon ». Les différents côtés d’une maison sont des façades différentes.">Vues par bâtiment
          <select value={String(parBatiment)} onChange={(e) => setParBatiment(e.target.value === 'toutes' ? 'toutes' : (Number(e.target.value) as VuesParBatiment))}>{VUES_PAR_BATIMENT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</select>
        </label>
      )}
      {groupees && mursDuBanc > 0 && (
        <label className="case" title="Le banc a déjà une image de ces murs (le même bâtiment vu par le même côté) : leurs vues restent visibles, marquées « déjà dans le banc », sans être proposées cochées. Décochée, elles se proposent comme les autres."><input type="checkbox" checked={ecarterDejaLa} onChange={(e) => setEcarterDejaLa(e.target.checked)} /> Sans les murs déjà dans le banc</label>
      )}
    </>
  );
}

/** Ce que la carte d'une photo dit sous son image : sa distance, ses vues, sa date, sa note, et « doublon ». */
function Legende({ p, vues, visant, doublon }: { p: PhotoRue; vues: VueAExtraire[]; visant: boolean; doublon: boolean }) {
  const note = noteDePhoto(vues), utiles = aImporter(vues), n = utiles.length, cachee = n > 0 && utiles.every((v) => v.cachee);
  return (
    <span>{visant ? `${p.distance} m · ` : ''}{p.panoramique ? `360° · ${n} vue(s)` : !visant ? 'photo' : (p.vise ? 'vers la parcelle' : 'de côté')} · {p.date?.slice(0, 10) ?? '—'}
      {note !== null && <i className="note-vue" title="Note de la vue, de 0 à 100 : distance à la façade, façade vue de face, part du cadre qu’elle remplit, date de la photo.">note {note}</i>}
      {cachee && <i className="marque-cachee" title="Lu dans l’aperçu : une haie, des arbres ou une clôture cachent la façade de chaque vue à importer.">façade cachée</i>}
      {doublon && (vues.every((v) => v.dejaLa)
        ? <i className="marque-doublon deja-la" title="Le banc a déjà une image de ce mur (ce bâtiment vu par ce côté) : elle n’est pas proposée cochée.">déjà dans le banc</i>
        : <i className="marque-doublon" title="D’autres photos montrent mieux ce bâtiment : elle n’est pas proposée cochée.">doublon</i>)}
    </span>
  );
}

export function ListePhotos(props: PropsListe) {
  const { photos, cochees, enDoublon, vuesDe, ouverte, setOuverte, montree, onSurvol, visant, onBasculer, onCocher, onImporter } = props;
  const choisies = photos.filter((p) => cochees.has(p.id)), aLImport = choisies.flatMap((p) => aImporter(vuesDe(p))), enDouble = facadesEnDouble(aLImport);
  return (
    <>
      <div className="barre-choix">
        <button type="button" onClick={() => onCocher('facades')} title="Chaque façade une fois : les doublons restent décochés">Tout cocher</button>
        {enDoublon.size > 0 && <button type="button" onClick={() => onCocher('doublons')} title="Cocher aussi les photos qui ne montrent que des façades déjà proposées ailleurs">Avec les doublons ({enDoublon.size})</button>}
        <button type="button" onClick={() => onCocher('aucune')}>Tout décocher</button>
        <ReglagesDeLaListe {...props} />
        <button type="button" className="principal" disabled={!aLImport.length} onClick={onImporter}>{texteDeLImport(aLImport, choisies.length)}</button>
        {enDouble > 0 && <span className="en-double" role="status" title="Deux vues cochées montrent la même façade (un doublon coché, ou des vues choisies à la main). L’import reste possible.">{enDouble} bâtiment{enDouble > 1 ? 's' : ''} en double</span>}
      </div>
      <p className="aide">Un panoramique 360 se montre en entier, la rue au milieu : les cadres orange sont les vues qui seront importées{enDoublon.size > 0 ? ', les cadres gris en pointillé les doublons (un bâtiment déjà mieux vu ailleurs)' : ''}. « Choisir les vues » pour regarder ailleurs (à gauche, à droite, vers une maison).</p>
      <ul className="mosaique grande">
        {photos.map((p) => {
          const vues = vuesDe(p), doublon = enDoublon.has(p.id);
          return (
            <li key={p.id} className={'carte' + (cochees.has(p.id) ? ' choisie' : '') + (p.id === montree ? ' montree' : '') + (doublon ? ' doublon' : '')}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') onSurvol(p.id); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') onSurvol(null); }}>
              <label>
                <input type="checkbox" checked={cochees.has(p.id)} onChange={() => onBasculer(p.id)} />
                {p.panoramique && p.sd ? <Panorama p={p} vues={vues} visant={visant} /> : p.vignette ? <img src={p.vignette} alt="" loading="lazy" /> : <div className="sans-image" />}
                <Legende p={p} vues={vues} visant={visant} doublon={doublon} />
              </label>
              {p.panoramique && <button type="button" className={ouverte === p.id ? 'onglet actif' : 'onglet'} onClick={() => setOuverte(ouverte === p.id ? null : p.id)}>Choisir les vues</button>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** La fenetre « Choisir les vues » du 360 ouvert, d'un panoramique propose a l'autre. */
export function FenetreDesVues({ p, panoramiques, vuesDe, visant, setCaps, onCocher, setOuverte }: {
  p: PhotoRue | null; panoramiques: PhotoRue[]; vuesDe: (p: PhotoRue) => VueAExtraire[]; visant: boolean;
  setCaps: (f: (m: Map<string, number[]>) => Map<string, number[]>) => void; onCocher: (id: string) => void; setOuverte: (id: string | null) => void;
}) {
  if (!p) return null;
  return (
    <ChoixDesVues p={p} vues={aImporter(vuesDe(p))} visant={visant} onCaps={(l) => { setCaps((m) => new Map(m).set(p.id, l)); onCocher(p.id); }}
      onVisee={() => setCaps((m) => { const t = new Map(m); t.delete(p.id); return t; })} onFermer={() => setOuverte(null)}
      rang={panoramiques.findIndex((x) => x.id === p.id)} total={panoramiques.length}
      onAutre={(k) => { const q = panoramiques[k]; if (q) setOuverte(q.id); }} />
  );
}

/** Les bandes d'une vue dans le panoramique (en fractions de la largeur) : deux quand elle passe le bord. */
function bandes(cap: number, azimut: number): { g: number; l: number }[] {
  const l = CHAMP_VUE / 360, g = xDuCap(cap, azimut) - l / 2;
  if (g < 0) return [{ g: 0, l: l + g }, { g: 1 + g, l: -g }];
  if (g + l > 1) return [{ g, l: 1 - g }, { g: 0, l: g + l - 1 }];
  return [{ g, l }];
}

/** Le panoramique entier (sa version reduite), la rue au milieu, avec les vues a importer et la direction de la parcelle. */
function Panorama({ p, vues, visant, onClic }: { p: PhotoRue; vues: VueAExtraire[]; visant: boolean; onClic?: (cap: number) => void }) {
  const az = p.azimut ?? 0;
  return (
    <div className={onClic ? 'pano actif' : 'pano'} onClick={onClic ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onClic(capDuX((e.clientX - r.left) / r.width, az)); } : undefined}>
      {/* En CORS : l'apercu relit la meme image par fetch, et une copie en cache sans en-tete CORS le ferait echouer. */}
      <img src={p.sd ?? ''} alt="" loading="lazy" draggable={false} crossOrigin="anonymous" />
      {vues.flatMap((v, i) => bandes(v.cap, az).map((b, k) => <span key={i + '-' + k} className={v.doublon ? 'pano-vue doublon' : 'pano-vue'} style={{ left: `${b.g * 100}%`, width: `${b.l * 100}%` }} />))}
      {visant && <span className="pano-cible" style={{ left: `${xDuCap(p.cap, az) * 100}%` }} title="Vers la parcelle" />}
      <span className="pano-rue" title="Axe de la rue (sens de la prise de vue)" />
    </div>
  );
}

/**
 * Le choix des vues d'un 360 (demande du proprietaire, 12 novembre 2026) : toucher le panoramique ajoute une vue a ce cap, ou retire
 * celle qui y est ; chaque vue s'ajuste de 5 degres et se montre telle qu'elle sera importee.
 */
function ChoixDesVues({ p, vues, visant, onCaps, onVisee, onFermer, rang, total, onAutre }: { p: PhotoRue; vues: VueAExtraire[]; visant: boolean; onCaps: (caps: number[]) => void; onVisee: () => void; onFermer: () => void; rang: number; total: number; onAutre: (k: number) => void }) {
  // Le meme panoramique reduit que l'apercu de la carte : deja lu au survol, il s'ouvre sans attendre.
  const { pano, erreur } = usePano(p);
  const caps = vues.map((v) => v.cap);
  const az = p.azimut ?? 0;
  const regler = (k: number, d: number) => onCaps(caps.map((c, i) => (i === k ? ((c + d) % 360 + 360) % 360 : c)));
  // Une fenetre au-dessus de la liste (demande du proprietaire : il fallait descendre tout en bas pour voir le resultat) ; Echap ferme,
  // les fleches passent d'un 360 a l'autre.
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
      else if (e.key === 'ArrowRight' && rang < total - 1) onAutre(rang + 1);
      else if (e.key === 'ArrowLeft' && rang > 0) onAutre(rang - 1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', t);
    return () => document.removeEventListener('keydown', t);
  }, [onFermer, onAutre, rang, total]);
  return (
    <div className="voile-dialogue" onClick={onFermer}>
    <div className="panneau choix-vues dialogue" role="dialog" aria-modal="true" aria-label="Vues du panoramique" onClick={(e) => e.stopPropagation()}>
      <header className="tete-dialogue">
        <button type="button" className="discret" disabled={rang <= 0} onClick={() => onAutre(rang - 1)} aria-label="360 précédent (←)" title="360 précédent (←)"><Icone nom="precedent" /></button>
        <strong>360 {rang + 1} / {total}</strong>
        <button type="button" className="discret" disabled={rang >= total - 1} onClick={() => onAutre(rang + 1)} aria-label="360 suivant (→)" title="360 suivant (→)"><Icone nom="suivant" /></button>
        <small>{visant ? `${p.distance} m · ` : ''}{p.date?.slice(0, 10) ?? '—'} · {vues.length} vue(s)</small>
        <span className="espace" />
        <button type="button" className="principal" onClick={onFermer}><Icone nom="valider" /> Terminé</button>
      </header>
      <div className="rang">
        <button type="button" onClick={() => onCaps([((az - 90) % 360 + 360) % 360, (az + 90) % 360])}>Gauche et droite</button>
        {visant && <button type="button" onClick={() => onCaps([Math.round(p.cap)])}>Vers la parcelle</button>}
        <button type="button" onClick={onVisee}>Comme la visée</button>
        <button type="button" onClick={() => onCaps([])}>Aucune</button>
      </div>
      <p className="aide">Touchez le panoramique pour ajouter une vue à cet endroit (75° de champ), touchez une vue pour la retirer. La rue est au milieu (trait blanc){visant ? ', la parcelle sous le trait rouge' : ''}.</p>
      <Panorama p={p} vues={vues} visant={visant} onClic={(cap) => onCaps(basculerCap(caps, cap))} />
      {erreur && <p className="etat">Aperçu impossible : {erreur}</p>}
      <ul className="apercus">
        {vues.map((v, k) => (
          <li key={k}>
            <Apercu pano={pano} azimut={az} cap={v.cap} />
            <div className="rang">
              <button type="button" aria-label="Tourner à gauche de 5°" onClick={() => regler(k, -5)}>◀</button>
              <span>{NOM_VUE[v.vue]} · {Math.round(v.cap)}°</span>
              <button type="button" aria-label="Tourner à droite de 5°" onClick={() => regler(k, 5)}>▶</button>
              <button type="button" className="discret" aria-label="Retirer cette vue" onClick={() => onCaps(caps.filter((_, i) => i !== k))}>✕</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
