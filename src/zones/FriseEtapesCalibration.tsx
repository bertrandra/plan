// Admin › Calibrer la detection : la frise des etapes d'un cas rejoue (MD/spec-facade-calage-audit.md §7.3), les quatorze (E1 a E14),
// chacune avec sa vignette et son etat, et l'etape ouverte en grand : « etape -> actions -> avant/apres » (decision du proprietaire,
// 7 novembre 2026). Ses actions typees (Code, Claude, Manuel, Mesure ; zones/composants/ActionsEtape.tsx, le meme composant que
// l'audit), ses calques, les gestes qui lui appartiennent (passes par l'editeur), son contrat. Tout vient du rejeu de l'orchestrateur
// (facade/releve/enchainement.ts) et de ses images (facade/releve/imagesEtapes.ts) : l'ecran ne calcule rien, il change les images en
// adresses et dessine.

import { RelireOuvertures } from './releve/RelireOuvertures.js';
import { sontRelues } from '../model/auditParcelle.js';
import type { OuvertureFacade } from '../model/types.js';
import { useCallback, useState, type ReactNode } from 'react';
import { ETAPES_FACADE, etapeFacade, FAMILLES_CLAUDE, LIBELLES_ETAT, type CleImageEtape, type ElementAction, type EtatAffiche, type FamilleClaude, type IdEtape } from '../model/etapeFacade.js';
import { ActionsEtape, ElementsAction, PastilleFamille, type ImageDeLAction } from './composants/ActionsEtape.js';
import { etapeDe, objectifDeLaPhoto, reperesDe, type Enchainement } from '../facade/releve/enchainement.js';
import type { BilanPhotoRedressement } from '../model/auditParcelle.js';
import type { ImagesEtapes } from '../facade/releve/imagesEtapes.js';
import type { CasStocke } from '../facade/corpusReel.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Image, P2 } from '../facade/vision/homographie.js';
import { GABARIT_RECTANGLE, contourDuGabarit, type GabaritMur } from '../facade/gabaritMur.js';
import { COMMANDE_CONFIRMER_MUR, COMMANDE_ETAPE } from './composants/BarreProgressionFacade.js';
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

/** L'E8 (la lecture de Claude) : les boites de Claude (trait plein : cochees, retrouvees ; tirets : seules), et au toucher leur vitrage. */
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

/** Les etapes de la frise : les quatorze, E2 (les photos) et E14 (le bilan, que la calibration montre sans l'ecrire) comprises. */
const ETAPES_FRISE: readonly IdEtape[] = ETAPES_FACADE.map((e) => e.id);

const MOTS_COINS = { trouves: 'coins trouvés sur la photo', devines: 'coins prédits par la prise de vue, à vérifier', main: 'coins posés à la main', reperes: 'coins lus après vos repères' } as const;
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

/** La vignette d'une etape dans la frise : son image principale, quand elle en a une (une adresse : E2 montre la premiere photo). */
function vignette(id: IdEtape, im: ImagesEtapes | null, photos: readonly string[], url: (img: Image) => string): string | null {
  if (id === 'prises' || id === 'objectif' || id === 'coins') return photos[0] ?? null;
  const i = imageDeLaVignette(id, im);
  return i ? url(i) : null;
}

function imageDeLaVignette(id: IdEtape, im: ImagesEtapes | null): Image | null {
  if (!im) return null;
  if (id === 'validation') return im.texture?.image ?? im.facade?.image ?? null;
  if (id === 'redressement') return im.vues.find((v) => v)?.image ?? null;
  if (id === 'assemblage') return im.assemblage?.image ?? null;
  if (id === 'ouvertures') return im.facade?.image ?? im.pose?.image ?? null;
  if (id === 'calage' || id === 'silhouette' || id === 'diagnostic') return im.pose?.image ?? null;
  if (id === 'lectureIa') return im.ia ? im.pose?.image ?? null : null;
  if (id === 'texture') return im.texture?.image ?? null;
  return null;
}

/**
 * L'option manuelle de l'E7 sur l'assemblage (MD/spec-facade-calage-audit.md §4 ter.2) : les deux bouts, l'egout et le sol a tirer
 * (zones/releve/AjusterMur.tsx, le seul composant de ce geste), puis le mur pose sur chaque photo et le cas rejoue depuis le calage.
 */
function CalageALaMain({ image, url, coins, gabarit, rapport, caler }: { image: Image; url: string; coins: readonly P2[]; gabarit: GabaritMur; rapport: number | null; caler: (coins: P2[]) => void }) {
  const [depart, setDepart] = useState(0);
  const [ajuste, setAjuste] = useState<P2[] | null>(null);
  const charger = useCallback(async () => image, [image]);
  return <>
    <h4 className="calTitre3">À la main : tirer les bouts, l’égout et le sol</h4>
    <AjusterMur key={depart} charger={charger} reperes={null} url={url} mur={coins} gabarit={gabarit} rapport={rapport} changer={(m) => setAjuste(m.coins)} />
    <div className="calLigne">
      <button type="button" className="secondary small" data-controle="calibration.retablirCalage" onClick={() => { setAjuste(null); setDepart((d) => d + 1); }}>Revenir au mur retenu</button>
      <button type="button" className="small" data-controle="calibration.appliquerCalage" disabled={!ajuste} onClick={() => { if (ajuste) caler(ajuste); }}>Appliquer le calage et rejouer</button>
    </div>
  </>;
}

interface PropsFrise {
  rejeu: Enchainement | null;
  images: ImagesEtapes | null;
  /** Les photos du cas (leurs adresses) : la vignette des etapes qui les lisent telles quelles. */
  photos: readonly string[];
  ouverte: IdEtape | null;
  url: (img: Image) => string;
  commandes: Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'> | null;
}

/** La frise : une vignette par etape, son etat en mot et en forme ; la toucher l'ouvre (la commande `facade.etape`). */
export function FriseEtapes({ rejeu, images, photos, ouverte, url, commandes }: PropsFrise) {
  const utilisable = !!commandes && !commandes.effacee(COMMANDE_ETAPE) && commandes.etat(COMMANDE_ETAPE).utilisable;
  return (
    <ol className="calFrise" aria-label="Les étapes du cas">
      {ETAPES_FRISE.map((id) => {
        const def = etapeFacade(id), e = rejeu ? etapeDe(rejeu, id) : null, im = vignette(id, images, photos, url);
        const contenu = <>
          {im ? <img src={im} alt="" /> : <span className="calFriseVide" aria-hidden="true" />}
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
  /** Le dernier rejeu ; null avant le premier (l'etape montre alors son contrat et ses gestes, ceux des photos). */
  rejeu: Enchainement | null;
  images: ImagesEtapes | null;
  cas: CasStocke;
  dims: Readonly<Record<number, { l: number; h: number }>>;
  url: (img: Image) => string;
  occupe: boolean;
  rejouerDepuis: (id: IdEtape) => void;
  caler: (coins: P2[]) => void;
  /** V3 : les ouvertures que la personne garde de la detection, ecrites comme sa relecture du cas (le meme geste que dans l'audit). */
  relire?: (gardees: OuvertureFacade[]) => void;
  /** Le registre de l'ecran : « Confirmer le mur » (V1) passe par la commande `facade.confirmerMur`, comme dans l'audit. */
  commandes?: Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'> | null;
  /** Les gestes que l'editeur range dans cette etape (les photos, les reperes, le panneau de Claude, l'annotation de la verite). */
  corps?: ReactNode;
  /** Ce que l'ecran ajoute sous un element de Claude (les choix de la personne) ; absent : en lecture. */
  choixElement?: (x: ElementAction) => ReactNode;
  /** Ce que l'ecran ajoute sous une action de Claude (le forcage pour l'etape) ; absent : rien. */
  gesteAction?: Parameters<typeof ActionsEtape>[0]['geste'];
  /** Le forcage de Claude pour cette etape (ou partout, a l'E8), sous ses actions ; absent : rien. */
  forcage?: ReactNode;
}

/**
 * « Confirmer le mur » (V1) : le meme geste que dans l'audit, par la meme commande ; le mur que la chaine a pose devient « confirme par
 * vous », et le doute qu'il passait aux etapes suivantes tombe. Confirme, le bouton retire la confirmation.
 */
function ConfirmerLeMur({ commandes, etat }: { commandes: Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'>; etat: EtatAffiche }) {
  if (etat !== 'a-confirmer' && etat !== 'confirme') return null;
  if (commandes.effacee(COMMANDE_CONFIRMER_MUR)) return null;
  const e = commandes.etat(COMMANDE_CONFIRMER_MUR);
  return <div className="calLigne"><button type="button" className={etat === 'confirme' ? 'secondary small' : 'small'} data-commande={COMMANDE_CONFIRMER_MUR} disabled={!e.utilisable} title={'message' in e ? e.message : undefined}
    onClick={(ev) => commandes.executer(COMMANDE_CONFIRMER_MUR, ev.currentTarget)}>{etat === 'confirme' ? 'Retirer la confirmation du mur' : 'Confirmer le mur'}</button></div>;
}

/**
 * V3 dans la calibration (decision du proprietaire, 3 novembre 2026) : le meme regard que dans l'audit, sur le releve que le rejeu a fait
 * (RelireOuvertures) ; « Garder ces ouvertures » l'ecrit comme la relecture du cas. Ce n'est pas la verite du cas (son annotation, plus
 * bas) : « J'ai relu les ouvertures » ne vaut pas regard.
 */
function RelectureDuCas({ rejeu, cas, relire }: { rejeu: Enchainement; cas: CasStocke; relire: (gardees: OuvertureFacade[]) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const r = rejeu.sorties.audit?.mesure?.releve;
  if (!r) return null;
  const relues = cas.ouverturesRelues && sontRelues(cas.ouverturesRelues, r.ouvertures) ? cas.ouverturesRelues.ouvertures : undefined;
  return ouvert
    ? <RelireOuvertures key={r.releveLe} releve={r} depart={relues} aujourdhui={new Date().toISOString().slice(0, 10)} garder={(o) => { setOuvert(false); relire(o); }} annuler={() => setOuvert(false)} />
    : <div className="calLigne"><button type="button" className={relues ? 'secondary small' : 'small'} data-controle="calibration.relireOuvertures" onClick={() => setOuvert(true)}>Relire les ouvertures</button></div>;
}

/**
 * L'objectif d'une photo tel que la chaine l'a pris (le bilan de l'E3 du dernier rejeu) : « Avec EXIF », ou « Sans EXIF » et son
 * avertissement (un mot, une bordure d'alerte, le texte entier en infobulle et pour le lecteur d'ecran).
 */
function MentionObjectif({ bilan, parReperes, complet = false }: { bilan: BilanPhotoRedressement | undefined; parReperes: boolean; complet?: boolean }) {
  const d = bilan ? objectifDeLaPhoto(bilan, parReperes) : null;
  if (!d) return null;
  return <small className={'calObjectif' + (d.alerte ? ' alerte' : '')} data-objectif={bilan?.objectif?.source} title={d.texte}>{complet ? d.texte : <>{d.court}<span className="texteMasque">{d.texte.slice(d.court.length)}</span></>}</small>;
}

/** Les calques d'une etape : ce que l'automatique a vu, ce qui a ete retenu. */
function CalquesDeLEtape(p: Omit<PropsEtape, 'occupe' | 'rejouerDepuis' | 'rejeu' | 'images'> & { rejeu: Enchainement; images: ImagesEtapes }) {
  const { id, images: im, cas, dims, url, caler } = p;
  const g = cas.gabarit ?? GABARIT_RECTANGLE;
  if (id === 'preparation') {
    const L = cas.largeurM, H = cas.hauteurM, haut = Math.max(...g.map((p) => p.v)) * H;
    const contour = contourDuGabarit(g).map((q) => ({ x: q.u * L, y: haut - q.v * H }));
    return <figure><svg className="calEtape" viewBox={`${-0.05 * L} ${-0.05 * haut} ${1.1 * L} ${1.1 * haut}`} role="img" aria-label="Le gabarit du mur, en mètres">
      <polygon className="calCalage" points={points(contour)} vectorEffect="non-scaling-stroke" />
    </svg><figcaption>Le gabarit du plan et du LiDAR : {metres(L)} m de large, {metres(H)} m à l’égout, {metres(haut)} m au plus haut.</figcaption></figure>;
  }
  // Les vignettes « avec / sans EXIF » sont a l'E3 (decision du proprietaire, 7 novembre 2026) : chaque photo, et l'objectif que la chaine a pris.
  if (id === 'objectif') return <>
    <ul className="calVignettes" aria-label="Les photos et leur objectif">
      {cas.images.map((u, k) => <li key={k}><img className="calVignetteFixe" src={u} alt={'Photo ' + (k + 1)} /><MentionObjectif bilan={p.rejeu.sorties.audit?.redressement.photos.find((b) => b.rang === k)} parReperes={!!reperesDe(cas.photos[k])} /></li>)}
    </ul>
    <ul className="calListe" aria-label="Le champ de chaque photo">
      {cas.images.map((_, k) => <li key={k}>Photo {k + 1} : <MentionObjectif bilan={p.rejeu.sorties.audit?.redressement.photos.find((b) => b.rang === k)} parReperes={!!reperesDe(cas.photos[k])} complet /></li>)}
    </ul>
  </>;
  if (id === 'coins') return <ul className="calGrille" aria-label="Chaque photo et les coins du mur retenus">
    {cas.images.map((u, k) => { const d = dims[k], c = p.rejeu.sorties.calage?.photos[k]; return <li key={k}><figure>
      {d ? <Calques url={u} l={d.l} h={d.h} libelle={'Photo ' + (k + 1) + ' et les coins du mur retenus'}>{c?.coins.length === 4 && <polygon className="calCalage" points={points(c.coins)} vectorEffect="non-scaling-stroke" />}</Calques> : <img className="calEtape" src={u} alt={'Photo ' + (k + 1)} />}
      <figcaption>Photo {k + 1} : {c?.origine ? MOTS_COINS[c.origine] : 'pas de coins'}.</figcaption>
    </figure></li>; })}
  </ul>;
  if (id === 'redressement') return <ul className="calGrille" aria-label="Chaque photo, ses repères, et sa vue redressée entière">
    {cas.images.map((u, k) => { const d = dims[k], r = reperesDe(cas.photos[k]), v = im.vues[k]; return <li key={k}><figure>
      {d ? <Calques url={u} l={d.l} h={d.h} libelle={'Photo ' + (k + 1) + (r ? ' et ses repères' : '')}>{r && <polygon className="calReperes" points={points(r)} vectorEffect="non-scaling-stroke" />}</Calques> : <img className="calEtape" src={u} alt={'Photo ' + (k + 1)} />}
      {v ? <Calques url={url(v.image)} l={v.image.largeur} h={v.image.hauteur} libelle={'Photo ' + (k + 1) + ' redressée entière, et le gabarit posé par ses coins'}>{v.silhouette && <polyline className="calMurLigne silhouette" points={points(v.silhouette)} vectorEffect="non-scaling-stroke" />}</Calques> : <p className="calNote">Elle ne se redresse pas : posez quatre repères.</p>}
      <figcaption>Photo {k + 1}{r ? ', avec vos quatre repères' : ''} : tournée de face comme l’assemblage la prend ({r ? 'par vos repères' : 'par ses points de fuite, sinon par le mur retenu'}), entière, sans coupe ni échelle.
        {' '}<MentionObjectif bilan={p.rejeu.sorties.audit?.redressement.photos.find((b) => b.rang === k)} parReperes={!!r} /></figcaption>
    </figure></li>; })}
  </ul>;
  if (id === 'assemblage') return im.assemblage ? <Calques url={url(im.assemblage.image)} l={im.assemblage.image.largeur} h={im.assemblage.image.hauteur} libelle="L’assemblage des photos redressées" /> : <p className="calNote">Aucune photo ne s’assemble.</p>;
  if (id === 'calage') {
    // Le mur que la chaine a pose (celui de l'audit), et ce que sa silhouette explique de l'image ; la pose de Claude se montre a l'E8.
    const ex = p.rejeu.sorties.calage?.explication, pose = im.pose;
    return <>
      {pose && <figure><Calques url={url(pose.image)} l={pose.image.largeur} h={pose.image.hauteur} libelle="Le mur retenu sur l’image prise pour la suite (contour), comme dans l’audit, et la pose des deux angles de Claude">
        <polygon className="calCalage" points={points(pose.contour)} vectorEffect="non-scaling-stroke" />
        {im.ia?.pose && <rect className="calMurIa" x={im.ia.pose.x0} y={im.ia.pose.y0} width={im.ia.pose.x1 - im.ia.pose.x0} height={im.ia.pose.y1 - im.ia.pose.y0} vectorEffect="non-scaling-stroke" />}
      </Calques><figcaption>
        Contour : le mur retenu par la chaîne de l’audit (coins posés à la main, sinon trouvés sur les photos, sinon prédits), le gabarit posé entre ses coins.{im.ia?.pose ? ' Tirets (couleur des angles de Claude) : la pose de ses deux angles, à côté du calcul, jamais candidate.' : ''}
        {ex && <> Score d’explication par la silhouette {note(ex.score)} (angles {note(ex.angles[0])} et {note(ex.angles[1])}, égout {note(ex.egout)}, sol {note(ex.sol)}).</>}
      </figcaption></figure>}
      {pose && <CalageALaMain key={url(pose.image)} image={pose.image} url={url(pose.image)} coins={pose.coins} gabarit={g} rapport={cas.largeurM > 0 ? cas.hauteurM / cas.largeurM : null} caler={caler} />}
      {pose && p.commandes && <ConfirmerLeMur commandes={p.commandes} etat={etapeDe(p.rejeu, 'calage').etat} />}
    </>;
  }
  // La lecture de Claude rejouee : la pose de ses deux angles et ses points sur l'image prise pour la suite, ses boites sur la facade.
  if (id === 'lectureIa') {
    const pose = im.pose, f = im.facade;
    if (!im.ia) return <p className="calNote">Mode déterministe : aucune réponse de Claude à rejouer. « Rappeler Claude » en enregistre une.</p>;
    return <>
      <LectureParFamille rejeu={p.rejeu} choixElement={p.choixElement} />
      {pose && <figure><Calques url={url(pose.image)} l={pose.image.largeur} h={pose.image.hauteur} libelle="Le mur retenu et la pose des deux angles de Claude">
        <polygon className="calCalage" points={points(pose.contour)} vectorEffect="non-scaling-stroke" />
        {im.ia.pose && <rect className="calMurIa" x={im.ia.pose.x0} y={im.ia.pose.y0} width={im.ia.pose.x1 - im.ia.pose.x0} height={im.ia.pose.y1 - im.ia.pose.y0} vectorEffect="non-scaling-stroke" />}
        {im.ia.pointes.map((q, k) => <circle key={'p' + k} className="calPointeIa" cx={q.x} cy={q.y} r={0.008 * pose.image.largeur} vectorEffect="non-scaling-stroke" />)}
        {im.ia.etendues.map((x, k) => <line key={'t' + k} className={'calEtendueIa ' + x.quoi} x1={x.x0} x2={x.x1} y1={x.y} y2={x.y} vectorEffect="non-scaling-stroke" />)}
      </Calques><figcaption>Contour : le mur retenu. Trait sombre : la pose des deux angles de Claude, mesurée sans rien changer ; ronds : ses pointes ; traits sous le mur : ses appentis, ses autres volumes, ce qui cache le mur.</figcaption></figure>}
      {f && im.ia.boites.length > 0 && <figure><Calques url={url(f.image)} l={f.l} h={f.h} libelle="Les boîtes de Claude sur la façade lue par la détection">
        <polygon className="calMurLigne silhouette" points={points(f.contour)} vectorEffect="non-scaling-stroke" />
        <BoitesIa boites={im.ia.boites} l={f.l} rayon={0.008 * f.l} />
      </Calques><figcaption>Les boîtes de Claude : pleines quand la détection les retrouve (cochées), en tirets quand elles sont seules (décochées) ; touchez-en une pour voir la division de son vitrage.</figcaption></figure>}
    </>;
  }
  const poseS = im.pose;
  if (id === 'silhouette') return poseS ? <figure><Calques url={url(poseS.image)} l={poseS.image.largeur} h={poseS.image.hauteur} libelle="Le haut du mur lu sur l’image, et le gabarit posé">
    <polygon className="calCalage" points={points(poseS.contour)} vectorEffect="non-scaling-stroke" />
    {poseS.masques.map((q, k) => <polygon key={'m' + k} className="calMasqueVegetation" points={points(q)} vectorEffect="non-scaling-stroke" />)}
    {poseS.silhouette && <polyline className="calSilhouetteLue" points={points(poseS.silhouette)} vectorEffect="non-scaling-stroke" />}
    {im.ia?.pointes.map((q, k) => <circle key={'p' + k} className="calPointeIa" cx={q.x} cy={q.y} r={0.008 * poseS.image.largeur} vectorEffect="non-scaling-stroke" />)}
    {im.ia?.etendues.filter((x) => x.quoi !== 'cache').map((x, k) => <line key={'t' + k} className={'calEtendueIa ' + x.quoi} x1={x.x0} x2={x.x1} y1={x.y} y2={x.y} vectorEffect="non-scaling-stroke" />)}
  </Calques><figcaption>Contour : le gabarit du plan posé sur le mur retenu. Trait épais : le haut du mur lu à la teinte, entre les mêmes bouts.{im.ia ? ' Ronds et traits de couleur : les pointes, les appentis et les autres volumes que Claude lit, à côté du calcul.' : ''}{poseS.masques.length ? ' Bandes hachurées : le haut caché par la végétation, non lu ; le gabarit y est gardé.' : ''}</figcaption></figure> : null;
  // La facade que lit la detection, entiere (pignons compris, rien n'est coupe a l'egout), fusionnee quand plusieurs vues se fondent,
  // en metres : la silhouette, seule zone ou la detection cherche, et les ouvertures dessus.
  if (id === 'ouvertures') { const f = im.facade; return f ? <figure><Calques url={url(f.image)} l={f.l} h={f.h} libelle="La façade entière lue par la détection, sa silhouette et les ouvertures proposées">
    <polygon className="calMurLigne silhouette" points={points(f.contour)} vectorEffect="non-scaling-stroke" />
    {f.proposees.map((q, k) => <polygon key={'p' + k} className="calPropose" points={points(q)} vectorEffect="non-scaling-stroke" />)}
    {f.devinees.map((q, k) => <polygon key={'d' + k} className="calDevinee" points={points(q)} vectorEffect="non-scaling-stroke" />)}
    {im.ia && <BoitesIa boites={im.ia.boites} l={f.l} rayon={0.008 * f.l} />}
  </Calques><figcaption>La façade redressée entière{p.rejeu.sorties.analyse?.fusion ? ', fusionnée de ses vues' : ''}, telle que la lit la détection. Contour : la silhouette du mur (le gabarit du plan et du LiDAR, pignons compris), seule zone où les ouvertures se cherchent. Trait plein : les ouvertures trouvées ; pointillé : celles que la structure devine.{im.ia ? ' Couleur des boîtes de Claude, à côté du calcul : pleines quand la détection les retrouve, en tirets quand elles sont seules (touchez-en une pour son vitrage).' : ''}</figcaption></figure> : null; }
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
  if (id === 'validation' && p.rejeu.sorties.facade) { const b = p.rejeu.sorties.facade; return <p className="calNote">Le bilan que l’audit écrirait à la validation (V4) : {b.ouvertures.length} ouverture{b.ouvertures.length > 1 ? 's' : ''}. La calibration n’écrit pas de façade.</p>; }
  return null;
}

/** La vraie forme du toit du cas, corps par corps : la verite du diagnostic de forme (E10) et du toit (E13). */
function ToitVrai({ cas }: { cas: CasStocke }) {
  if (!cas.toitVrai?.length) return <p className="calNote">Ce cas ne porte pas la vraie forme de son toit.</p>;
  return <ul className="calListe" aria-label="La vraie forme du toit, corps par corps">
    {cas.toitVrai.map((c, k) => <li key={k}>{c.nom} : {c.forme}{c.pignons?.length ? `, ${c.pignons.length} pignon${c.pignons.length > 1 ? 's' : ''} (${c.pignons.map((p) => `de ${metres(p.debut)} à ${metres(p.fin)} m, faîtage à ${metres(p.faitage)} m`).join(' ; ')})` : ''}{c.egoutM !== undefined ? `, égout à ${metres(c.egoutM)} m` : ''}.</li>)}
  </ul>;
}

/**
 * Les images d'une etape en adresses, pour l'avant et l'apres de ses actions : celles que le rejeu a deja faites (`ImagesEtapes`), les
 * photos du cas telles quelles. Aucune n'est calculee pour la montrer.
 */
function imagesDesActions(im: ImagesEtapes | null, photos: readonly string[], url: (img: Image) => string): ImageDeLAction {
  return (cle: CleImageEtape) => {
    const de = (i: Image | null | undefined, libelle: string) => (i ? { url: url(i), libelle } : null);
    if (cle === 'photos') return photos[0] ? { url: photos[0], libelle: 'La première photo du mur' } : null;
    if (!im) return null;
    if (cle === 'vues') return de(im.vues.find((v) => v)?.image, 'Une photo redressée entière');
    if (cle === 'assemblage') return de(im.assemblage?.image, 'L’assemblage des photos redressées');
    if (cle === 'facade') return de(im.facade?.image, 'La façade que lit la détection');
    if (cle === 'texture') return de(im.texture?.image, 'La texture calée sur le mur');
    // La pose, la forme et la lecture de Claude se dessinent sur l'image prise pour la suite : leurs calques sont dans le corps de l'etape.
    return de(im.pose?.image, cle === 'pose' ? 'Le mur retenu sur l’image prise pour la suite' : cle === 'forme' ? 'L’image où se lit la forme' : 'L’image que Claude a lue');
  };
}

/**
 * L'E8 : tout ce que Claude a lu, famille par famille, chaque element dans la couleur de sa famille, et l'etape qui le montre et celles
 * qui le consomment (FAMILLES_CLAUDE). Les elements sont ceux que les actions Claude des etapes rendent : rien n'est relu ici.
 */
function LectureParFamille({ rejeu, choixElement }: { rejeu: Enchainement; choixElement?: ((x: ElementAction) => ReactNode) | undefined }) {
  const elements = rejeu.etapes.flatMap((e) => e.actions).filter((a) => a.type === 'claude').flatMap((a) => a.elements ?? []).filter((x) => x.famille);
  if (!elements.length) return null;
  const familles = (Object.keys(FAMILLES_CLAUDE) as FamilleClaude[]).filter((f) => elements.some((x) => x.famille === f));
  return <section className="calLectureFamilles" aria-label="Ce que Claude a lu, famille par famille">
    <h4 className="calTitre3">Ce que Claude a lu, famille par famille</h4>
    {familles.map((f) => <div key={f} className={'calFamille famille-' + f}>
      <p className="calNote"><PastilleFamille famille={f} /> Montrée à l’{etapeFacade(FAMILLES_CLAUDE[f].montreeA).numero}{FAMILLES_CLAUDE[f].consommePar.length ? ', consommée par ' + FAMILLES_CLAUDE[f].consommePar.map((id) => etapeFacade(id).numero).join(', ') : ', consommée par aucune étape (une lecture)'}.</p>
      <ElementsAction elements={elements.filter((x) => x.famille === f)} extra={choixElement ? (x) => choixElement(x) : undefined} />
    </div>)}
  </section>;
}

/**
 * L'etape ouverte en grand : son etat, ce qu'elle a donne, ses actions (chacune avec son type, son avant et son apres), ses calques, les
 * gestes qui lui appartiennent, son contrat et le rejeu depuis elle.
 */
export function EtapeOuverte(p: PropsEtape) {
  const def = etapeFacade(p.id), e = p.rejeu ? etapeDe(p.rejeu, p.id) : null, etat = e?.etat ?? 'a-venir';
  return (
    <section className={'calEtapeOuverte ' + etat} aria-label={'Étape ' + def.numero + ', ' + def.nom}>
      <h3 className="calTitre2">{def.numero} · {def.nom} <span className={'calFriseEtat ' + etat}>{LIBELLES_ETAT[etat]}</span></h3>
      <p className="calResume">{e?.resume ?? 'Pas encore calculée : « Rejouer » déroule le cas.'}</p>
      {e?.verite && <p className={'calVerite' + (e.verite.juste ? ' juste' : ' faux')}>{e.verite.texte}</p>}
      {e && <ActionsEtape actions={e.actions} libelle={'Les actions de l’' + def.numero} image={imagesDesActions(p.images, p.cas.images, p.url)}
        {...(p.choixElement ? { extra: (x) => (x.famille ? p.choixElement?.(x) : null) } : {})} {...(p.gesteAction ? { geste: p.gesteAction } : {})} />}
      {p.forcage}
      {p.rejeu && p.images && <CalquesDeLEtape {...p} rejeu={p.rejeu} images={p.images} />}
      {p.corps}
      <dl className="calContrat">
        <dt>Entrant</dt><dd>{def.entrant}</dd>
        <dt>Automatique</dt><dd>{def.action}</dd>
        <dt>Objectif</dt><dd>{def.objectif}</dd>
        <dt>Sortant</dt><dd>{def.sortant}</dd>
        {def.optionManuelle && <><dt>À la main</dt><dd>{def.optionManuelle}</dd></>}
        <dt>Dans l’audit</dt><dd>{MOTS_MODE[def.modeAudit]}{def.validation ? ' (' + def.validation + ')' : ''}</dd>
      </dl>
      {p.id === 'ouvertures' && p.relire && p.rejeu && <RelectureDuCas rejeu={p.rejeu} cas={p.cas} relire={p.relire} />}
      {p.rejeu && <div className="calLigne">
        <button type="button" className="secondary" data-controle="calibration.rejouerDepuis" disabled={p.occupe} onClick={() => p.rejouerDepuis(p.id)}>Rejouer depuis cette étape</button>
      </div>}
      {p.rejeu && <p className="calNote">Chaîne des façades, version {p.rejeu.versions.chaine} ; objectifs {p.rejeu.versions.objectifs}{p.rejeu.sorties.ia ? ` ; IA : ${enteteDuRun(p.rejeu.sorties.ia.run)}, règles ${p.rejeu.versions.ia ?? ''}` : ' ; mode déterministe'}.</p>}
    </section>
  );
}
