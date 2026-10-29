// Admin › Calibrer la detection : la frise des etapes d'un cas rejoue (MD/spec-facade-calage-audit.md §7.3), chacune avec sa
// vignette et son etat, et l'etape ouverte en grand avec ses calques, son contrat et sa mesure contre la verite. Tout vient du rejeu
// de l'orchestrateur (facade/releve/enchainement.ts) et de ses images (facade/releve/imagesEtapes.ts) : l'ecran ne calcule rien, il
// change les images en adresses et dessine.

import { useCallback, useState } from 'react';
import { etapeFacade, LIBELLES_ETAT, type IdEtape } from '../model/etapeFacade.js';
import { etapeDe, reperesDe, type Enchainement } from '../facade/releve/enchainement.js';
import type { ImagesEtapes } from '../facade/releve/imagesEtapes.js';
import type { CasStocke } from '../facade/corpusReel.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Image, P2 } from '../facade/vision/homographie.js';
import { GABARIT_RECTANGLE, contourDuGabarit, type GabaritMur } from '../facade/gabaritMur.js';
import { COMMANDE_ETAPE } from './composants/BarreProgressionFacade.js';
import { AjusterMur } from './releve/AjusterMur.js';
import { VueFacade3d } from './VueFacade3d.js';
import type { Carreaux } from '../regles/facades/observations.js';
import { enteteDuRun } from '../facade/releve/enchainement.js';

/** Un point du quadrilatere (haut gauche, haut droit, bas droit, bas gauche) a (s, t) en parts de sa largeur et de sa hauteur. */
function dansLeQuad(q: readonly P2[], s: number, t: number): P2 {
  const [a, b, c, d] = q as [P2, P2, P2, P2];
  const haut = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, bas = { x: d.x + (c.x - d.x) * s, y: d.y + (c.y - d.y) * s };
  return { x: haut.x + (bas.x - haut.x) * t, y: haut.y + (bas.y - haut.y) * t };
}

/** Les traits de la division du vitrage lue par Claude, dans la boite : vantaux et carreaux, imposte (decision 15 ; la 3D viendra en F8). */
function traitsDesCarreaux(q: readonly P2[], c: Carreaux): [P2, P2][] {
  const traits: [P2, P2][] = [];
  const imp = c.imposte && c.imposte !== 'aucune' ? c.imposte : null, t0 = imp ? imp.hauteur : 0;
  const colonnes = (c.vantaux ?? 1) * (c.colonnes ?? 1), rangees = c.rangees ?? 1;
  for (let i = 1; i < colonnes; i++) traits.push([dansLeQuad(q, i / colonnes, t0), dansLeQuad(q, i / colonnes, 1)]);
  for (let j = 1; j < rangees; j++) { const t = t0 + ((1 - t0) * j) / rangees; traits.push([dansLeQuad(q, 0, t), dansLeQuad(q, 1, t)]); }
  if (imp) {
    traits.push([dansLeQuad(q, 0, t0), dansLeQuad(q, 1, t0)]);
    const ci = imp.colonnes ?? 1, ri = imp.rangees ?? 1;
    for (let i = 1; i < ci; i++) traits.push([dansLeQuad(q, i / ci, 0), dansLeQuad(q, i / ci, t0)]);
    for (let j = 1; j < ri; j++) traits.push([dansLeQuad(q, 0, (t0 * j) / ri), dansLeQuad(q, 1, (t0 * j) / ri)]);
  }
  return traits;
}

const MOTS_PETITS_BOIS = { aucun: 'sans petits bois', fins: 'petits bois fins', epais: 'petits bois épais' } as const;

/** La division du vitrage en clair : « 2 vantaux de 1 × 3 carreaux, petits bois fins, imposte de 4 × 1, vitrage clair ». */
function carreauxEnClair(c: Carreaux | null): string {
  if (!c) return 'carreaux non lus';
  const morceaux = [
    (c.vantaux ? c.vantaux + (c.vantaux > 1 ? ' vantaux' : ' vantail') : 'vantaux non dits') + (c.colonnes && c.rangees ? ' de ' + c.colonnes + ' × ' + c.rangees + ' carreaux' : ''),
    ...(c.petitsBois ? [MOTS_PETITS_BOIS[c.petitsBois]] : []),
    c.imposte === 'aucune' ? 'sans imposte' : c.imposte ? 'imposte ' + (c.imposte.colonnes ?? '?') + ' × ' + (c.imposte.rangees ?? '?') + ' (' + Math.round(c.imposte.hauteur * 100) + ' % de la baie)' : '',
    c.vitrage ? 'vitrage ' + c.vitrage : '',
  ];
  return morceaux.filter(Boolean).join(', ');
}

/** L'E7 en mode « IA » : les boites de Claude (trait plein : cochees, retrouvees ; tirets : seules), et au toucher leur vitrage. */
function BoitesIa({ boites, l, rayon }: { boites: NonNullable<ImagesEtapes['ia']>['boites']; l: number; rayon: number }) {
  const [choisie, setChoisie] = useState<number | null>(null);
  const b = choisie !== null ? boites[choisie] : undefined;
  return <>
    {boites.map((x, k) => x.quad.length === 4 && <polygon key={'ia' + k} className={'calBoiteIa' + (x.cochee ? ' cochee' : ' seule') + (k === choisie ? ' choisie' : '')} points={points(x.quad)} vectorEffect="non-scaling-stroke"
      role="button" tabIndex={0} aria-label={`Boîte de Claude ${k + 1} : ${x.ia.type}, ${x.cochee ? 'cochée, retrouvée par la détection' : 'seule, décochée'}`}
      onClick={() => setChoisie(k === choisie ? null : k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setChoisie(k === choisie ? null : k); }} />)}
    {b?.ia.carreaux && b.quad.length === 4 && traitsDesCarreaux(b.quad, b.ia.carreaux).map(([p, q], k) => <line key={'c' + k} className="calCarreau" x1={p.x} y1={p.y} x2={q.x} y2={q.y} vectorEffect="non-scaling-stroke" />)}
    {b && <text className="calTexteIa" x={Math.min(l - 4, (b.quad[0]?.x ?? 0))} y={Math.max(rayon * 3, (b.quad[0]?.y ?? 0) - rayon)} fontSize={rayon * 2.2}>{carreauxEnClair(b.ia.carreaux)}</text>}
  </>;
}

/** Les etapes de la frise : ce que le rejeu illustre (E0 et E1, l'entree, sont dans l'editeur ; E9 n'est pas de la calibration). */
const ETAPES_FRISE: readonly IdEtape[] = ['preparation', 'redressement', 'assemblage', 'calage', 'silhouette', 'diagnostic', 'texture', 'ouvertures', 'toit'];

const MOTS_MODE = { cache: 'cachée (elle ne se montre que si elle échoue)', resume: 'en une ligne', valider: 'un point d’arrêt : la personne confirme' } as const;
const points = (l: readonly P2[]) => l.map((p) => p.x + ',' + p.y).join(' ');
const metres = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const note = (v: number) => v.toFixed(2).replace('.', ',');

/** Une image et ses calques, dans le repere de ses pixels. */
function Calques({ url, l, h, libelle, children }: { url: string; l: number; h: number; libelle: string; children?: React.ReactNode }) {
  return (
    <svg className="calEtape large" viewBox={`0 0 ${l} ${h}`} role="img" aria-label={libelle}>
      <image href={url} x={0} y={0} width={l} height={h} />
      {children}
    </svg>
  );
}

/** La vignette d'une etape dans la frise : son image principale, quand elle en a une. */
function vignette(id: IdEtape, im: ImagesEtapes | null): Image | null {
  if (!im) return null;
  if (id === 'redressement') return im.vues.find((v) => v)?.image ?? null;
  if (id === 'assemblage') return im.assemblage?.image ?? null;
  if (id === 'calage' || id === 'silhouette' || id === 'diagnostic' || id === 'ouvertures') return im.pose?.image ?? null;
  if (id === 'texture') return im.texture?.image ?? null;
  return null;
}

/**
 * L'option manuelle de l'E4 sur l'assemblage (MD/spec-facade-calage-audit.md §4 ter.2) : les deux bouts, l'egout et le sol a tirer
 * (zones/releve/AjusterMur.tsx, le seul composant de ce geste), puis le mur pose sur chaque photo et le cas rejoue depuis le calage.
 */
function CalageALaMain({ image, url, coins, gabarit, caler }: { image: Image; url: string; coins: readonly P2[]; gabarit: GabaritMur; caler: (coins: P2[]) => void }) {
  const [depart, setDepart] = useState(0);
  const [ajuste, setAjuste] = useState<P2[] | null>(null);
  const charger = useCallback(async () => image, [image]);
  return <>
    <h4 className="calTitre3">À la main : tirer les bouts, l’égout et le sol</h4>
    <AjusterMur key={depart} charger={charger} reperes={null} url={url} mur={coins} gabarit={gabarit} changer={(m) => setAjuste(m.coins)} />
    <div className="calLigne">
      <button type="button" className="secondary small" data-controle="calibration.retablirCalage" onClick={() => { setAjuste(null); setDepart((d) => d + 1); }}>Revenir au mur retenu</button>
      <button type="button" className="small" data-controle="calibration.appliquerCalage" disabled={!ajuste} onClick={() => { if (ajuste) caler(ajuste); }}>Appliquer le calage et rejouer</button>
    </div>
  </>;
}

interface PropsFrise {
  rejeu: Enchainement | null;
  images: ImagesEtapes | null;
  ouverte: IdEtape | null;
  url: (img: Image) => string;
  commandes: Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'> | null;
}

/** La frise : une vignette par etape, son etat en mot et en forme ; la toucher l'ouvre (la commande `facade.etape`). */
export function FriseEtapes({ rejeu, images, ouverte, url, commandes }: PropsFrise) {
  const utilisable = !!commandes && !commandes.effacee(COMMANDE_ETAPE) && commandes.etat(COMMANDE_ETAPE).utilisable;
  return (
    <ol className="calFrise" aria-label="Les étapes du cas">
      {ETAPES_FRISE.map((id) => {
        const def = etapeFacade(id), e = rejeu ? etapeDe(rejeu, id) : null, im = vignette(id, images);
        const contenu = <>
          {im ? <img src={url(im)} alt="" /> : <span className="calFriseVide" aria-hidden="true" />}
          <span className="calFriseNom">{def.numero} · {def.nom}</span>
          <span className={'calFriseEtat ' + (e?.etat ?? 'a-venir')}>{LIBELLES_ETAT[e?.etat ?? 'a-venir']}</span>
        </>;
        return (
          <li key={id} className={id === ouverte ? 'ouverte' : ''}>
            {utilisable
              ? <button type="button" data-commande={COMMANDE_ETAPE} data-etape={id} aria-pressed={id === ouverte} aria-label={`${def.numero} ${def.nom} : ${LIBELLES_ETAT[e?.etat ?? 'a-venir']}`}
                onClick={(ev) => { commandes?.executer(COMMANDE_ETAPE, ev.currentTarget); }}>{contenu}</button>
              : <div className="calFriseFixe">{contenu}</div>}
          </li>
        );
      })}
    </ol>
  );
}

interface PropsEtape {
  id: IdEtape;
  rejeu: Enchainement;
  images: ImagesEtapes;
  cas: CasStocke;
  dims: Readonly<Record<number, { l: number; h: number }>>;
  url: (img: Image) => string;
  occupe: boolean;
  rejouerDepuis: (id: IdEtape) => void;
  caler: (coins: P2[]) => void;
}

/** Les calques d'une etape : ce que l'automatique a vu, ce qui a ete retenu. */
function CalquesDeLEtape({ id, images: im, cas, dims, url, caler }: Omit<PropsEtape, 'rejeu' | 'occupe' | 'rejouerDepuis'>) {
  const g = cas.gabarit ?? GABARIT_RECTANGLE;
  if (id === 'preparation') {
    const L = cas.largeurM, H = cas.hauteurM, haut = Math.max(...g.map((p) => p.v)) * H;
    const contour = contourDuGabarit(g).map((q) => ({ x: q.u * L, y: haut - q.v * H }));
    return <figure><svg className="calEtape" viewBox={`${-0.05 * L} ${-0.05 * haut} ${1.1 * L} ${1.1 * haut}`} role="img" aria-label="Le gabarit du mur, en mètres">
      <polygon className="calCalage" points={points(contour)} vectorEffect="non-scaling-stroke" />
    </svg><figcaption>Le gabarit du plan et du LiDAR : {metres(L)} m de large, {metres(H)} m à l’égout, {metres(haut)} m au plus haut.</figcaption></figure>;
  }
  if (id === 'redressement') return <ul className="calGrille" aria-label="Chaque photo, ses repères, et sa vue redressée entière">
    {cas.images.map((u, k) => { const d = dims[k], r = reperesDe(cas.photos[k]), v = im.vues[k]; return <li key={k}><figure>
      {d ? <Calques url={u} l={d.l} h={d.h} libelle={'Photo ' + (k + 1) + (r ? ' et ses repères' : '')}>{r && <polygon className="calReperes" points={points(r)} vectorEffect="non-scaling-stroke" />}</Calques> : <img className="calEtape" src={u} alt={'Photo ' + (k + 1)} />}
      {v ? <Calques url={url(v.image)} l={v.image.largeur} h={v.image.hauteur} libelle={'Photo ' + (k + 1) + ' redressée entière, et le gabarit posé par ses coins'}>{v.silhouette && <polyline className="calMurLigne silhouette" points={points(v.silhouette)} vectorEffect="non-scaling-stroke" />}</Calques> : <p className="calNote">Elle ne se redresse pas : posez quatre repères.</p>}
      <figcaption>Photo {k + 1} : {r ? 'redressée par vos quatre repères' : 'redressée par ses points de fuite'}, entière, sans coupe ni échelle.</figcaption>
    </figure></li>; })}
  </ul>;
  if (id === 'assemblage') return im.assemblage ? <Calques url={url(im.assemblage.image)} l={im.assemblage.image.largeur} h={im.assemblage.image.hauteur} libelle="L’assemblage des photos redressées" /> : <p className="calNote">Aucune photo ne s’assemble.</p>;
  if (id === 'calage') {
    const mur = im.assemblage?.mur, c = mur?.calage, aretes = c?.aretes;
    const retenue = c ? { aretes: 'la pose des arêtes', 'mieux-expliquee': 'une autre pose des arêtes, qui explique mieux la photo', 'plan-seul': 'la pose du plan seul, supposée (aucune n’explique la photo)' }[c.retenue] : '';
    return <>
      {im.assemblage && mur && c && <figure><Calques url={url(im.assemblage.image)} l={im.assemblage.image.largeur} h={im.assemblage.image.hauteur} libelle="Le mur cherché sur l’assemblage (traits), la pose des arêtes écartée (tirets) et le mur retenu (contour)">
        {aretes && <rect className="calMurAretes" x={aretes.x0} y={aretes.y0} width={aretes.x1 - aretes.x0} height={aretes.y1 - aretes.y0} vectorEffect="non-scaling-stroke" />}
        {[mur.y0, mur.y1].map((y, k) => <line key={'h' + k} className="calMurLigne" x1={mur.x0} x2={mur.x1} y1={y} y2={y} vectorEffect="non-scaling-stroke" />)}
        {[mur.x0, mur.x1].map((x, k) => <line key={'v' + k} className="calMurBout" x1={x} x2={x} y1={mur.y0} y2={mur.y1} vectorEffect="non-scaling-stroke" />)}
        {im.pose && <polygon className="calCalage" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />}
        {c.colombage?.zones.map((z, k) => <rect key={'z' + k} className="calColombage" x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} vectorEffect="non-scaling-stroke" />)}
        {c.colombage?.ecartees.map((z, k) => <rect key={'e' + k} className="calMurEcarte" x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} vectorEffect="non-scaling-stroke" />)}
        {im.ia?.pose && <rect className="calMurIa" x={im.ia.pose.x0} y={im.ia.pose.y0} width={im.ia.pose.x1 - im.ia.pose.x0} height={im.ia.pose.y1 - im.ia.pose.y0} vectorEffect="non-scaling-stroke" />}
        {im.ia?.pointes.map((p, k) => <circle key={'p' + k} className="calPointeIa" cx={p.x} cy={p.y} r={0.008 * (im.assemblage?.image.largeur ?? 1000)} vectorEffect="non-scaling-stroke" />)}
        {im.ia?.etendues.map((x, k) => <line key={'t' + k} className={'calEtendueIa ' + x.quoi} x1={x.x0} x2={x.x1} y1={x.y} y2={x.y} vectorEffect="non-scaling-stroke" />)}
      </Calques><figcaption>
        Traits : le mur cherché, {retenue}, score d’explication sans le toit {note(c.explication.score)} (angles {note(c.explication.angles[0])} et {note(c.explication.angles[1])}, égout {note(c.explication.egout)}, sol {note(c.explication.sol)} ; seuils {note(c.seuils.score)} et {note(c.seuils.angle)} par angle).
        {aretes && <> Tirets : la pose des arêtes, écartée (score {note(aretes.score)}).</>} Contour : le mur retenu, le gabarit posé entre ses coins.
        {im.ia && <> Trait sombre : la pose des deux angles de Claude{c.ia ? `, score ${note(c.ia.score)}${c.ia.retenue ? ', retenue' : ''}` : ''} ; ronds : ses pointes ; traits sous le mur : ses appentis, ses autres volumes, ce qui cache le mur.</>}
        {c.colombage && <> Voile : les zones de colombage que Claude voit ; tirets : {c.colombage.ecartees.length ? `${c.colombage.ecartees.length} pose${c.colombage.ecartees.length > 1 ? 's' : ''} des arêtes écartée${c.colombage.ecartees.length > 1 ? 's' : ''}, qui sui${c.colombage.ecartees.length > 1 ? 'vent' : 't'} les bois` : 'aucune pose écartée'}.</>}
      </figcaption></figure>}
      {im.pose && <CalageALaMain key={url(im.pose.image)} image={im.pose.image} url={url(im.pose.image)} coins={im.pose.coins} gabarit={g} caler={caler} />}
    </>;
  }
  if (id === 'silhouette') return im.pose ? <figure><Calques url={url(im.pose.image)} l={im.pose.image.largeur} h={im.pose.image.hauteur} libelle="Le haut du mur lu sur l’image, et le gabarit posé">
    <polygon className="calCalage" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />
    {im.pose.silhouette && <polyline className="calSilhouetteLue" points={points(im.pose.silhouette)} vectorEffect="non-scaling-stroke" />}
  </Calques><figcaption>Contour : le gabarit du plan posé sur le mur retenu. Trait épais : le haut du mur lu à la teinte, entre les mêmes bouts.</figcaption></figure> : null;
  if (id === 'ouvertures') return im.pose ? <figure><Calques url={url(im.pose.image)} l={im.pose.image.largeur} h={im.pose.image.hauteur} libelle="La façade et les ouvertures proposées">
    <polygon className="calMurLigne silhouette" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />
    {im.pose.proposees.map((q, k) => <polygon key={'p' + k} className="calPropose" points={points(q)} vectorEffect="non-scaling-stroke" />)}
    {im.pose.devinees.map((q, k) => <polygon key={'d' + k} className="calDevinee" points={points(q)} vectorEffect="non-scaling-stroke" />)}
    {im.ia && <BoitesIa boites={im.ia.boites} l={im.pose.image.largeur} rayon={0.008 * im.pose.image.largeur} />}
  </Calques><figcaption>Trait plein : les ouvertures trouvées ; pointillé : celles que la structure devine.{im.ia ? ' Trait sombre : les boîtes de Claude, pleines quand la détection les retrouve (cochées), en tirets quand elles sont seules (décochées) ; touchez-en une pour voir la division de son vitrage.' : ''}</figcaption></figure> : null;
  if (id === 'texture' && im.texture) {
    const t = im.texture;
    const surSilhouette = (img: Image, cle: string, libelle: string) => <svg className="calEtape large" viewBox={`0 0 ${t.l} ${t.h}`} role="img" aria-label={libelle}>
      <defs><clipPath id={cle}><polygon points={points(t.contour)} /></clipPath></defs>
      <image href={url(img)} x={0} y={0} width={t.l} height={t.h} preserveAspectRatio="none" clipPath={`url(#${cle})`} />
      <polygon className="calMurLigne silhouette" points={points(t.contour)} vectorEffect="non-scaling-stroke" />
    </svg>;
    return <>
      <ul className="calGrille deux" aria-label="La texture posée sur la façade">
        <li><figure>{surSilhouette(t.image, 'calSurFacade', 'La façade collée sur sa silhouette, telle que photographiée')}<figcaption>La texture, collée sur la silhouette du mur : ce que la 3D pose.</figcaption></figure></li>
        {t.sansOmbres && <li><figure>{surSilhouette(t.sansOmbres, 'calSansOmbres', 'La façade collée sur sa silhouette, sans les ombres de la photo')}<figcaption>Sans les ombres de la photo : la 3D pose les siennes.</figcaption></figure></li>}
      </ul>
      <VueFacade3d texture={url(t.image)} largeurM={cas.largeurM} hauteurM={cas.hauteurM} hauteurTextureM={t.h} gabarit={g} />
    </>;
  }
  if (id === 'diagnostic') return <>
    {im.pose && im.forme && <figure><Calques url={url(im.pose.image)} l={im.pose.image.largeur} h={im.pose.image.hauteur} libelle="Le haut lu, le gabarit du plan, les tronçons de corps et le gabarit de chaque proposition">
      <polygon className="calCalage" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />
      {im.pose.silhouette && <polyline className="calSilhouetteLue" points={points(im.pose.silhouette)} vectorEffect="non-scaling-stroke" />}
      {im.forme.propositions.map((q, k) => <polygon key={'q' + k} className="calGabaritPropose" points={points(q.contour)} vectorEffect="non-scaling-stroke" />)}
      {im.forme.troncons.map((t, k) => <line key={'t' + k} className={'calTroncon c' + (t.corps % 4)} x1={t.x0} x2={t.x1} y1={t.y} y2={t.y} vectorEffect="non-scaling-stroke" />)}
    </Calques><figcaption>
      Contour : le gabarit du plan (le toit calculé). Trait épais : le haut lu sur l’image. Traits sous le mur : les tronçons, un par corps (de gauche à droite : {im.forme.troncons.map((t) => `corps ${t.corps + 1}`).join(', ') || 'aucun'}).
      {im.forme.propositions.length ? <> Tirets : le gabarit de chaque proposition ({im.forme.propositions.map((q) => `corps ${q.corps + 1}${q.gain === null ? ', Claude seul' : `, gain ${Math.round(q.gain * 100)} %`}`).join(' ; ')}), toujours à confirmer dans l’audit.</> : ' Aucune proposition.'}
    </figcaption></figure>}
    <ToitVrai cas={cas} />
  </>;
  if (id === 'toit') return <ToitVrai cas={cas} />;
  return null;
}

/** La vraie forme du toit du cas, corps par corps : la verite du diagnostic de forme (E5 bis) et du toit (E8). */
function ToitVrai({ cas }: { cas: CasStocke }) {
  if (!cas.toitVrai?.length) return <p className="calNote">Ce cas ne porte pas la vraie forme de son toit.</p>;
  return <ul className="calListe" aria-label="La vraie forme du toit, corps par corps">
    {cas.toitVrai.map((c, k) => <li key={k}>{c.nom} : {c.forme}{c.pignons?.length ? `, ${c.pignons.length} pignon${c.pignons.length > 1 ? 's' : ''} (${c.pignons.map((p) => `de ${metres(p.debut)} à ${metres(p.fin)} m, faîtage à ${metres(p.faitage)} m`).join(' ; ')})` : ''}{c.egoutM !== undefined ? `, égout à ${metres(c.egoutM)} m` : ''}.</li>)}
  </ul>;
}

/** L'etape ouverte en grand : son etat, ce qu'elle a donne, sa mesure contre la verite, ses calques, son contrat et le rejeu depuis elle. */
export function EtapeOuverte(p: PropsEtape) {
  const def = etapeFacade(p.id), e = etapeDe(p.rejeu, p.id);
  return (
    <section className={'calEtapeOuverte ' + e.etat} aria-label={'Étape ' + def.numero + ', ' + def.nom}>
      <h3 className="calTitre2">{def.numero} · {def.nom} <span className={'calFriseEtat ' + e.etat}>{LIBELLES_ETAT[e.etat]}</span></h3>
      <p className="calResume">{e.resume}</p>
      {e.verite && <p className={'calVerite' + (e.verite.juste ? ' juste' : ' faux')}>{e.verite.texte}</p>}
      <CalquesDeLEtape {...p} />
      <dl className="calContrat">
        <dt>Entrant</dt><dd>{def.entrant}</dd>
        <dt>Automatique</dt><dd>{def.action}</dd>
        <dt>Objectif</dt><dd>{def.objectif}</dd>
        <dt>Sortant</dt><dd>{def.sortant}</dd>
        {def.optionManuelle && <><dt>À la main</dt><dd>{def.optionManuelle}</dd></>}
        <dt>Dans l’audit</dt><dd>{MOTS_MODE[def.modeAudit]}{def.validation ? ' (' + def.validation + ')' : ''}</dd>
      </dl>
      <div className="calLigne">
        <button type="button" className="secondary" data-controle="calibration.rejouerDepuis" disabled={p.occupe || !!def.lot} onClick={() => p.rejouerDepuis(p.id)}>Rejouer depuis cette étape</button>
      </div>
      <p className="calNote">Chaîne des façades, version {p.rejeu.versions.chaine} ; objectifs {p.rejeu.versions.objectifs}{p.rejeu.sorties.ia ? ` ; IA : ${enteteDuRun(p.rejeu.sorties.ia.run)}, règles ${p.rejeu.versions.ia ?? ''}` : ' ; mode déterministe'}.</p>
    </section>
  );
}
