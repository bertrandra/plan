// La barre de progression de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 ter.5) : la meme pour l'audit et la
// calibration (decision 20). Elle lit les etats que l'orchestrateur calcule (facade/releve/enchainement.ts) et rien d'autre : aucun
// ecran ne calcule sa propre progression des etapes de la facade.
//
// Huit segments, chacun le pire etat de ses etapes ; chaque etat a une forme (coche, point d'exclamation, croix, tiret) et un mot,
// pas seulement une couleur. Un segment ouvrable est un bouton lie a la commande `facade.etape` (son etape dans `data-etape`) : la
// calibration les ouvre tous, l'audit seulement les points de validation et ce qui doute. Sous la barre, deux lignes : l'etape en
// cours (ou ouverte), et le resultat de la derniere etape finie. Au telephone, un fin ruban et « 3 sur 8 · Mur ».

import { SEGMENTS_FACADE, etapeFacade, etatDuSegment, LIBELLES_ETAT, type EtatAffiche, type IdEtape, type SegmentFacade } from '../../model/etapeFacade.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { EtapeCalculee } from '../../facade/releve/enchainement.js';
import { Icone, type NomIcone } from '../icones.js';

/** La commande qui ouvre une etape : declaree par l'ecran qui porte la barre. */
export const COMMANDE_ETAPE = 'facade.etape';

/** Une etape telle que la barre la montre : l'etat que l'orchestrateur lui a calcule (ou a venir, ou en cours) et ce qu'elle a donne. */
export type EtapeAffichee = Pick<EtapeCalculee, 'id' | 'etat' | 'resume'>;

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

const ICONES: Partial<Record<EtatAffiche, NomIcone>> = { ok: 'coche', 'a-confirmer': 'alerte', echec: 'fermer', saute: 'moins' };

function etatDe(etapes: readonly EtapeAffichee[], id: IdEtape): EtatAffiche {
  return etapes.find((e) => e.id === id)?.etat ?? 'a-venir';
}

/** Le segment qui porte une etape. */
const segmentDe = (id: IdEtape): SegmentFacade | undefined => SEGMENTS_FACADE.find((s) => s.etapes.includes(id));

/** Les deux lignes sous la barre : ce qui tourne (ou ce qui est ouvert), puis le resultat de la derniere etape finie. */
function lignes(etapes: readonly EtapeAffichee[], enCours: IdEtape | null, ouverte: IdEtape | null): [string, string] {
  const finies = etapes.filter((e) => e.etat !== 'a-venir' && e.etat !== 'en-cours' && e.etat !== 'saute');
  const derniere = finies[finies.length - 1];
  if (enCours) return [`${segmentDe(enCours)?.nom ?? etapeFacade(enCours).nom} : ${etapeFacade(enCours).nom.toLowerCase()}, en cours…`, derniere ? derniere.resume : ''];
  if (ouverte) {
    const e = etapes.find((x) => x.id === ouverte), def = etapeFacade(ouverte);
    const repli = e && (e.etat === 'echec' || e.etat === 'a-confirmer') && def.optionManuelle ? ' À la main : ' + def.optionManuelle + '.' : '';
    return [`${segmentDe(ouverte)?.nom ?? def.nom} : ${def.nom.toLowerCase()}, ${LIBELLES_ETAT[e?.etat ?? 'a-venir']}`, (e?.resume ?? '') + repli];
  }
  if (!derniere) return ['Rien n’est encore calculé.', ''];
  return [etapes.some((e) => e.etat === 'a-venir') ? 'Enchaînement arrêté.' : 'Enchaînement terminé.', derniere.resume];
}

export function BarreProgressionFacade({ etapes, enCours, ouverte, ouvrable, commandes, arreter }: Props) {
  const etats = SEGMENTS_FACADE.map((s) => etatDuSegment(s.etapes.map((id) => (id === enCours ? 'en-cours' : etatDe(etapes, id)))));
  // Le segment courant : celui qui tourne, sinon celui qui est ouvert, sinon le premier qui demande un geste, sinon le dernier fait.
  const courant = Math.max(0, (() => {
    const k = SEGMENTS_FACADE.findIndex((s) => s.etapes.includes(enCours ?? ouverte ?? ('' as IdEtape)));
    if (k >= 0) return k;
    const doute = etats.findIndex((e) => e === 'echec' || e === 'a-confirmer');
    return doute >= 0 ? doute : etats.map((e, i) => (e === 'ok' ? i : -1)).reduce((a, b) => Math.max(a, b), 0);
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
            const texte = `Étape ${s.numero} sur ${SEGMENTS_FACADE.length}, ${s.nom}, ${LIBELLES_ETAT[etat]}` + (s.validation ? ', point de validation ' + s.validation : '');
            const contenu = <>
              <span className="barreFacadeTrait" aria-hidden="true" />
              <span className="barreFacadeEtiquette" aria-hidden="true">{icone ? <Icone nom={icone} taille={14} /> : <span className="barreFacadePastille" />}{s.numero} · {s.nom}{s.validation && <span className="barreFacadeRepere">{s.validation}</span>}</span>
            </>;
            const bouton = !efface && ouvrable(s, etat);
            return (
              <li key={s.numero} className={'barreFacadeSegment ' + etat + (k === courant ? ' courant' : '')} aria-current={k === courant ? 'step' : undefined}>
                {bouton
                  ? <button type="button" data-commande={COMMANDE_ETAPE} data-etape={s.etapes[0]} aria-label={texte} title={etatCommande && 'message' in etatCommande ? etatCommande.message : texte}
                    disabled={!etatCommande?.utilisable} onClick={(e) => { commandes?.executer(COMMANDE_ETAPE, e.currentTarget); }}>{contenu}</button>
                  : <span className="barreFacadeFixe" role="img" aria-label={texte}>{contenu}</span>}
              </li>
            );
          })}
        </ol>
        {enCours && arreter && <button type="button" className="secondary small barreFacadeArreter" data-controle="barreFacade.arreter" onClick={arreter}>Arrêter</button>}
      </div>
      <p className="barreFacadeRuban" aria-hidden="true">{seg.numero} sur {SEGMENTS_FACADE.length} · {seg.nom} · {LIBELLES_ETAT[etats[courant] as EtatAffiche]}</p>
      <p className="barreFacadeLigne" role="status">{haut}</p>
      {bas && <p className="barreFacadeLigne resultat">{bas}</p>}
    </div>
  );
}
