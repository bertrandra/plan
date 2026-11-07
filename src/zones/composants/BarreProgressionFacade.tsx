// La barre de progression de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 ter.5) : la meme pour l'audit et la
// calibration (decision 20). Elle lit les etats que l'orchestrateur calcule (facade/releve/enchainement.ts) et rien d'autre : aucun
// ecran ne calcule sa propre progression des etapes de la facade.
//
// Huit segments, chacun le pire etat de ses etapes ; chaque etat a une forme (coche, point d'exclamation, croix, tiret) et un mot,
// pas seulement une couleur. Un segment ouvrable est un bouton lie a la commande `facade.etape` (son etape dans `data-etape`) : la
// calibration les ouvre tous, l'audit seulement les points de validation et ce qui doute. Sous la barre, deux lignes : l'etape en
// cours (ou ouverte), et le resultat de la derniere etape finie. Au telephone, un fin ruban et « E7-E8 · Mur ». Les
// etapes et les segments se disent par les numeros des etapes (E1 a E14), la poignee que le proprietaire emploie.

import { SEGMENTS_FACADE, etapeFacade, etatDuSegment, libelleEtape, numerosDuSegment, LIBELLES_ETAT, type EtatAffiche, type IdEtape, type SegmentFacade } from '../../model/etapeFacade.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { EtapeCalculee } from '../../facade/releve/enchainement.js';
import { Icone, type NomIcone } from '../icones.js';

/** La commande qui ouvre une etape : declaree par l'ecran qui porte la barre. */
export const COMMANDE_ETAPE = 'facade.etape';
/** L'escalade d'une facade, a la demande : le bouton sous la barre (l'audit, la calibration), la meme commande des deux cotes. */
export const COMMANDE_ESCALADE = 'facade.escalader';
/** La validation d'une facade (V4, lot F5) : le bouton sous la barre, dans l'audit ; elle ecrit la Facade dans le projet. */
export const COMMANDE_VALIDER = 'facade.valider';
/** « Confirmer le mur » (V1) : le mur que la chaine a pose, confirme par la personne ; la meme commande dans l'audit et la calibration. */
export const COMMANDE_CONFIRMER_MUR = 'facade.confirmerMur';
/** Defaire et refaire un geste sur la facade avant V4 (Ctrl+Z, Ctrl+Y ; app/clavierGestes.ts) : sous la barre, audit et calibration. */
export const COMMANDE_ANNULER_GESTE = 'facade.annulerGeste';
export const COMMANDE_RETABLIR_GESTE = 'facade.retablirGeste';

/** Une etape telle que la barre la montre : l'etat que l'orchestrateur lui a calcule (ou a venir, ou en cours) et ce qu'elle a donne. */
export type EtapeAffichee = Pick<EtapeCalculee, 'id' | 'etat' | 'resume'> & Partial<Pick<EtapeCalculee, 'herite'>>;

interface Props {
  etapes: readonly EtapeAffichee[];
  /** L'etape qui tourne ; null au repos. */
  enCours: IdEtape | null;
  /** L'etape ouverte : son resultat et, si elle doute, son option manuelle s'ecrivent sous la barre. */
  ouverte: IdEtape | null;
  /** Ce segment s'ouvre-t-il ? La calibration : tous ; l'audit : les points de validation et les etapes qui doutent. */
  ouvrable: (s: SegmentFacade, etat: EtatAffiche) => boolean;
  /** Le registre de l'ecran ; null : la barre se lit, rien ne s'ouvre. */
  commandes: Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'> | null;
  /** Arreter le calcul en cours ; le bouton ne se montre que pendant un calcul. */
  arreter: (() => void) | null;
}

const ICONES: Partial<Record<EtatAffiche, NomIcone>> = { ok: 'coche', confirme: 'personne', 'a-confirmer': 'alerte', echec: 'fermer', saute: 'moins' };

function etatDe(etapes: readonly EtapeAffichee[], id: IdEtape): EtatAffiche {
  return etapes.find((e) => e.id === id)?.etat ?? 'a-venir';
}

/** Le segment qui porte une etape. */
const segmentDe = (id: IdEtape): SegmentFacade | undefined => SEGMENTS_FACADE.find((s) => s.etapes.includes(id));

/** Les deux lignes sous la barre : ce qui tourne (ou ce qui est ouvert), puis le resultat de la derniere etape finie. */
function lignes(etapes: readonly EtapeAffichee[], enCours: IdEtape | null, ouverte: IdEtape | null): [string, string] {
  const finies = etapes.filter((e) => e.etat !== 'a-venir' && e.etat !== 'en-cours' && e.etat !== 'saute');
  const derniere = finies[finies.length - 1];
  // Chaque etape se dit par son numero (E7 Calage du mur) : la poignee que le proprietaire emploie.
  if (enCours) return [`${libelleEtape(enCours)} (${segmentDe(enCours)?.nom ?? etapeFacade(enCours).nom}), en cours…`, derniere ? libelleEtape(derniere.id) + ' : ' + derniere.resume : ''];
  if (ouverte) {
    const e = etapes.find((x) => x.id === ouverte), def = etapeFacade(ouverte);
    const repli = e && (e.etat === 'echec' || e.etat === 'a-confirmer') && def.optionManuelle ? ' À la main : ' + def.optionManuelle + '.' : '';
    return [`${libelleEtape(ouverte)} (${segmentDe(ouverte)?.nom ?? def.nom}), ${LIBELLES_ETAT[e?.etat ?? 'a-venir']}`, (e?.resume ?? '') + repli];
  }
  if (!derniere) return ['Rien n’est encore calculé.', ''];
  return [etapes.some((e) => e.etat === 'a-venir') ? 'Enchaînement arrêté.' : 'Enchaînement terminé.', libelleEtape(derniere.id) + ' : ' + derniere.resume];
}

/**
 * L'etape qu'ouvre un segment : celle qui doute (en echec, puis a confirmer), sinon son point de validation, sinon la premiere. Le
 * segment « Forme » ouvre ainsi le diagnostic (V2) qui attend la personne, pas la silhouette lue qui a reussi (lot F4). Un doute herite
 * du mur (l'E7 a confirmer) ne compte pas ici : il se leve a l'E7, et le point de validation du segment reste ce qui attend la personne.
 */
function etapeAOuvrir(s: SegmentFacade, etapes: readonly EtapeAffichee[]): IdEtape {
  const propre = (id: IdEtape) => !etapes.find((e) => e.id === id)?.herite;
  return s.etapes.find((id) => etatDe(etapes, id) === 'echec') ?? s.etapes.find((id) => etatDe(etapes, id) === 'a-confirmer' && propre(id))
    ?? s.etapes.find((id) => etapeFacade(id).validation) ?? s.etapes.find((id) => etatDe(etapes, id) === 'a-confirmer') ?? (s.etapes[0] as IdEtape);
}

export function BarreProgressionFacade({ etapes, enCours, ouverte, ouvrable, commandes, arreter }: Props) {
  const etats = SEGMENTS_FACADE.map((s) => etatDuSegment(s.etapes.map((id) => (id === enCours ? 'en-cours' : etatDe(etapes, id)))));
  // Le segment courant : celui qui tourne, sinon celui qui est ouvert, sinon le premier qui demande un geste, sinon le dernier fait.
  const courant = Math.max(0, (() => {
    const k = SEGMENTS_FACADE.findIndex((s) => s.etapes.includes(enCours ?? ouverte ?? ('' as IdEtape)));
    if (k >= 0) return k;
    const doute = etats.findIndex((e) => e === 'echec' || e === 'a-confirmer');
    return doute >= 0 ? doute : etats.map((e, i) => (e === 'ok' || e === 'confirme' ? i : -1)).reduce((a, b) => Math.max(a, b), 0);
  })());
  const [haut, bas] = lignes(etapes, enCours, ouverte);
  const etatCommande = commandes?.etat(COMMANDE_ETAPE);
  const efface = commandes?.effacee(COMMANDE_ETAPE) ?? true;
  const seg = SEGMENTS_FACADE[courant] as SegmentFacade;
  return (
    <div className="barreFacade" role="group" aria-label="Avancement de la façade" data-etat={enCours ? 'calcul' : 'repos'}>
      <div className="barreFacadeHaut">
        <ol className="barreFacadeSegments">
          {SEGMENTS_FACADE.map((s, k) => {
            const etat = etats[k] as EtatAffiche, icone = ICONES[etat];
            // Le segment se dit par les numeros de ses etapes (E3-E6 Image) : dans l'audit, une etape cachee garde le sien.
            const texte = `${numerosDuSegment(s)} ${s.nom}, ${LIBELLES_ETAT[etat]}` + (s.validation ? ', point de validation ' + s.validation : '');
            const contenu = <>
              <span className="barreFacadeTrait" aria-hidden="true" />
              <span className="barreFacadeEtiquette" aria-hidden="true">{icone ? <Icone nom={icone} taille={14} /> : <span className="barreFacadePastille" />}{numerosDuSegment(s)} · {s.nom}{s.validation && <span className="barreFacadeRepere">{s.validation}</span>}</span>
            </>;
            const bouton = !efface && ouvrable(s, etat);
            return (
              <li key={s.numero} className={'barreFacadeSegment ' + etat + (k === courant ? ' courant' : '')} aria-current={k === courant ? 'step' : undefined}>
                {bouton
                  ? <button type="button" data-commande={COMMANDE_ETAPE} data-etape={etapeAOuvrir(s, etapes)} aria-label={texte} title={etatCommande && 'message' in etatCommande ? etatCommande.message : texte}
                    disabled={!etatCommande?.utilisable} onClick={(e) => { commandes?.executer(COMMANDE_ETAPE, e.currentTarget); }}>{contenu}</button>
                  : <span className="barreFacadeFixe" role="img" aria-label={texte}>{contenu}</span>}
              </li>
            );
          })}
        </ol>
        {enCours && arreter && <button type="button" className="secondary small barreFacadeArreter" data-controle="barreFacade.arreter" onClick={arreter}>Arrêter</button>}
      </div>
      <p className="barreFacadeRuban" aria-hidden="true">{numerosDuSegment(seg)} · {seg.nom} · {LIBELLES_ETAT[etats[courant] as EtatAffiche]}</p>
      <p className="barreFacadeLigne" role="status">{haut}</p>
      {bas && <p className="barreFacadeLigne resultat">{bas}</p>}
    </div>
  );
}
