// Admin › Calibrer la detection : la frise des etapes d'un cas rejoue (MD/spec-facade-calage-audit.md §7.3), chacune avec sa
// vignette et son etat, et l'etape ouverte en grand avec ses calques, son contrat et sa mesure contre la verite. Tout vient du rejeu
// de l'orchestrateur (facade/releve/enchainement.ts) et de ses images (facade/releve/imagesEtapes.ts) : l'ecran ne calcule rien, il
// change les images en adresses et dessine.

import { etapeFacade, LIBELLES_ETAT, type IdEtape } from '../model/etapeFacade.js';
import { etapeDe, reperesDe, type Enchainement } from '../facade/releve/enchainement.js';
import type { ImagesEtapes } from '../facade/releve/imagesEtapes.js';
import type { CasStocke } from '../facade/corpusReel.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Image, P2 } from '../facade/vision/homographie.js';
import { GABARIT_RECTANGLE, contourDuGabarit } from '../facade/gabaritMur.js';
import { COMMANDE_ETAPE } from './composants/BarreProgressionFacade.js';
import { CalageSilhouette } from './CalageSilhouette.js';
import { VueFacade3d } from './VueFacade3d.js';

/** Les etapes de la frise : ce que le rejeu illustre (E0 et E1, l'entree, sont dans l'editeur ; E9 n'est pas de la calibration). */
const ETAPES_FRISE: readonly IdEtape[] = ['preparation', 'redressement', 'assemblage', 'calage', 'silhouette', 'diagnostic', 'texture', 'ouvertures', 'toit'];

const MOTS_MODE = { cache: 'cachée (elle ne se montre que si elle échoue)', resume: 'en une ligne', valider: 'un point d’arrêt : la personne confirme' } as const;
const points = (l: readonly P2[]) => l.map((p) => p.x + ',' + p.y).join(' ');
const metres = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

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
  if (id === 'calage' || id === 'silhouette' || id === 'ouvertures') return im.pose?.image ?? null;
  if (id === 'texture') return im.texture?.image ?? null;
  return null;
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
  if (id === 'calage') return <>
    {im.assemblage && <figure><Calques url={url(im.assemblage.image)} l={im.assemblage.image.largeur} h={im.assemblage.image.hauteur} libelle="Le mur cherché sur l’assemblage (traits) et le mur retenu (contour)">
      {[im.assemblage.mur.y0, im.assemblage.mur.y1].map((y, k) => <line key={'h' + k} className="calMurLigne" x1={im.assemblage?.mur.x0} x2={im.assemblage?.mur.x1} y1={y} y2={y} vectorEffect="non-scaling-stroke" />)}
      {[im.assemblage.mur.x0, im.assemblage.mur.x1].map((x, k) => <line key={'v' + k} className="calMurBout" x1={x} x2={x} y1={im.assemblage?.mur.y0} y2={im.assemblage?.mur.y1} vectorEffect="non-scaling-stroke" />)}
      {im.pose && <polygon className="calCalage" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />}
    </Calques><figcaption>Traits : le mur cherché sur l’assemblage (égout et sol pleins, bouts en tirets). Contour : le mur retenu, le gabarit posé entre ses coins.</figcaption></figure>}
    {im.pose && <CalageSilhouette key={url(im.pose.image)} url={url(im.pose.image)} largeur={im.pose.image.largeur} hauteur={im.pose.image.hauteur} coins={im.pose.coins} gabarit={g} largeurM={cas.largeurM} hauteurM={cas.hauteurM} appliquer={caler} />}
  </>;
  if (id === 'silhouette') return im.pose ? <figure><Calques url={url(im.pose.image)} l={im.pose.image.largeur} h={im.pose.image.hauteur} libelle="Le haut du mur lu sur l’image, et le gabarit posé">
    <polygon className="calCalage" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />
    {im.pose.silhouette && <polyline className="calSilhouetteLue" points={points(im.pose.silhouette)} vectorEffect="non-scaling-stroke" />}
  </Calques><figcaption>Contour : le gabarit du plan posé sur le mur retenu. Trait épais : le haut du mur lu à la teinte, entre les mêmes bouts.</figcaption></figure> : null;
  if (id === 'ouvertures') return im.pose ? <figure><Calques url={url(im.pose.image)} l={im.pose.image.largeur} h={im.pose.image.hauteur} libelle="La façade et les ouvertures proposées">
    <polygon className="calMurLigne silhouette" points={points(im.pose.contour)} vectorEffect="non-scaling-stroke" />
    {im.pose.proposees.map((q, k) => <polygon key={'p' + k} className="calPropose" points={points(q)} vectorEffect="non-scaling-stroke" />)}
    {im.pose.devinees.map((q, k) => <polygon key={'d' + k} className="calDevinee" points={points(q)} vectorEffect="non-scaling-stroke" />)}
  </Calques><figcaption>Trait plein : les ouvertures trouvées ; pointillé : celles que la structure devine.</figcaption></figure> : null;
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
  if (id === 'diagnostic' || id === 'toit') return <ToitVrai cas={cas} />;
  return null;
}

/** La vraie forme du toit du cas, corps par corps : la verite du diagnostic (F4), dite des maintenant. */
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
      <p className="calNote">Chaîne des façades, version {p.rejeu.versions.chaine} ; objectifs {p.rejeu.versions.objectifs}.</p>
    </section>
  );
}
