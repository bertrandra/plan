// Z8, l'audit de la parcelle : une facade photographiee, dans l'enchainement de la facade (MD/spec-facade-calage-audit.md §4 ter.3,
// §4 ter.5, §6 ; lot F3). En haut, la barre de progression, la meme que celle de la calibration (zones/composants/
// BarreProgressionFacade.tsx) : elle lit les etats que l'orchestrateur a calcules pour la mesure de la facade, et n'ouvre que les
// points de validation et ce qui doute. Dessous, le mode discret (app/audit/parcelle/discret.ts) : une etape cachee qui a reussi ne
// se montre pas ; une etape qui echoue ou doute se dit en une ligne, avec son geste de repli (les quatre repères sur une photo, le
// mur tire a la main). « Rejouer la façade » rejoue l'orchestrateur ; les photos et les corrections ne bougent pas. Quand Claude a lu
// la facade (trois passes votees), une ligne le dit avec son cout, et « Escalader » (la commande `facade.escalader`, a la demande
// seulement) annonce le sien. Le point V4 (lot F5) : « Valider la façade » (la commande `facade.valider`) ecrit sa Facade dans le
// projet ; validee, l'E9 de la barre est faite. Pour l'administrateur, « Créer un cas depuis cette façade » (la commande
// `facade.creerCas`, lot F6) en fait un cas de calibration : la calibration ne prend plus de photos, elle lit celles de l'audit.

import { useCallback, useEffect, useState } from 'react';
import { BarreProgressionFacade, COMMANDE_ESCALADE, COMMANDE_VALIDER } from '../composants/BarreProgressionFacade.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { enAdmin } from '../../app/acces.js';
import { PoserReperes } from '../releve/PoserReperes.js';
import { type MurAjuste } from '../releve/AjusterMur.js';
import { coinsParDefaut } from '../releve/commun.js';
import { lignesDiscretes, ligneOuverte, ouvrableDansLAudit, type LigneDiscrete } from '../../app/audit/parcelle/discret.js';
import { cleMesure } from '../../app/audit/parcelle/mesures.js';
import { etapesApresValidation } from '../../app/audit/parcelle/facadeValidee.js';
import { lignesFacadeEnrichie } from '../../app/audit/parcelle/facadeEnrichie.js';
import { pixelsDePhoto } from '../../render/couleurPhotoAudit.js';
import { LIBELLES_ETAT } from '../../model/etapeFacade.js';
import { enteteDuRun } from '../../facade/releve/enchainement.js';
import { libelleEscalade, type PrixEscalade } from '../../app/releve/runFacade.js';
import type { RunEnregistre } from '../../regles/facades/observations.js';
import type { SessionAuditParcelle } from '../../app/audit/parcelle/controleur.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { P2 } from '../../facade/vision/homographie.js';
import type { Photo } from '../../ui/releve/camera.js';
import type { CorrectionRedressement } from '../../model/auditParcelle.js';
import type { PhotoCas } from '../../model/audit.js';
import type { GabaritMur } from '../../facade/gabaritMur.js';

/**
 * Les quatre repères de l'audit sur une photo : le geste partage (PoserReperes), et ce que l'audit y ajoute — la largeur reelle du
 * mur pour l'echelle, « Appliquer » (la correction va dans la capture : elle prime sur le calcul et survit au rejeu, puis la facade est
 * rejouee), « Revenir à l'automatique » et « Annuler ». Rien n'est ecrit avant « Appliquer ».
 */
export function ReperesAudit({ photo, rang, depart, mur, gabarit, largeurPlanM, echelleDepart, appliquer, retablir, fermer }: {
  photo: PhotoCas; rang: number;
  /** Les reperes de depart : ceux deja poses, sinon les coins du mur que le calcul a retenus (un rectangle du mur, eux aussi). */
  depart: readonly P2[] | undefined;
  /** Les coins du mur sur la photo, trouves par la chaine ou deja ajustes a la main : le depart de « Ajuster l'égout et le sol ». */
  mur: readonly P2[] | undefined;
  gabarit?: GabaritMur | undefined;
  /** La largeur du mur lue sur le plan, en metres. */
  largeurPlanM: number | null;
  echelleDepart: number | undefined;
  appliquer: (c: CorrectionRedressement) => void;
  retablir: () => void;
  fermer: () => void;
}) {
  const url = 'data:image/jpeg;base64,' + photo.base64;
  const [dims, setDims] = useState<{ l: number; h: number } | null>(null);
  const [coins, setCoins] = useState<P2[] | null>(null);
  const [largeur, setLargeur] = useState(echelleDepart ? String(echelleDepart).replace('.', ',') : '');
  // Le mur repris a la main sur la photo redressee : null tant que la personne n'y a pas touche (la chaine le cherche seule).
  const [murAjuste, setMurAjuste] = useState<MurAjuste | null>(null);
  const charger = useCallback(async () => { const p = await pixelsDePhoto(photo.base64); return p ? { largeur: p.largeur, hauteur: p.hauteur, donnees: Uint8ClampedArray.from(p.data) } : null; }, [photo.base64]);
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      setDims({ l: img.naturalWidth, h: img.naturalHeight });
      setCoins((c) => c ?? (depart && depart.length === 4 ? depart.map((p) => ({ ...p })) : coinsParDefaut(img.naturalWidth, img.naturalHeight)));
    };
    img.src = url;
  }, [url, depart]);
  const largeurM = Number(largeur.replace(',', '.'));
  const echelle = largeur.trim() && Number.isFinite(largeurM) && largeurM > 0 ? largeurM : undefined;
  const faux = largeur.trim() !== '' && echelle === undefined;
  const lue: Photo | null = dims ? { image: { largeur: dims.l, hauteur: dims.h, donnees: new Uint8ClampedArray(0) }, url, champ: null, focalePx: null } : null;
  return (
    <div className="reperesAudit">
      {lue && coins
        ? <PoserReperes photo={lue} rang={rang} reperes={coins} changer={setCoins} mur={murAjuste?.coins ?? mur ?? null} gabarit={gabarit} charger={charger} ajusterMur={setMurAjuste} suite="« Appliquer », puis la façade se rejoue" />
        : <div className="detailPhoto">Chargement de la photo…</div>}
      <label className="detailPhoto">
        {'Largeur réelle du mur (m), pour l’échelle' + (largeurPlanM ? ' — le plan donne ' + String(Math.round(largeurPlanM * 100) / 100).replace('.', ',') : '') + ' : '}
        <input type="text" inputMode="decimal" value={largeur} aria-invalid={faux} onChange={(e) => setLargeur(e.target.value)} data-controle="auditParcelle.echelleMur" />
      </label>
      {faux && <div className="erreurParcours" role="alert">Écrivez un nombre de mètres, par exemple 9,5.</div>}
      <div className="piedDialogue">
        <button type="button" className="secondary small" data-controle="auditParcelle.retablirCoins" onClick={() => { retablir(); fermer(); }}>Revenir à l’automatique</button>
        <button type="button" className="secondary small" data-controle="auditParcelle.annulerCoins" onClick={fermer}>Annuler</button>
        <button type="button" className="small" data-controle="auditParcelle.appliquerCoins" disabled={!coins || faux}
          onClick={() => { if (coins) { appliquer({ reperes: coins.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })), ...(murAjuste ? { coins: murAjuste.coins } : {}), ...(echelle ? { echelleLargeurM: echelle } : {}) }); fermer(); } }}>Appliquer</button>
      </div>
    </div>
  );
}

interface Props {
  session: SessionAuditParcelle;
  commandes: RegistreCommandes;
  cle: string;
  cote: number;
  /** « Façade sud de Maison » */
  nom: string;
  largeurPlanM: number;
  /** Faux sur l'ecran de prise : la barre et ce qui doute, sans les gestes (ils se font depuis la liste). */
  gestes?: boolean;
}

/**
 * Une ligne du mode discret : l'etape, ce qu'elle a donne, et son geste de repli ; sur une photo, un bouton par photo. L'etape ouverte
 * depuis la barre (`ouverte`) : la barre dit deja son resultat, la ligne n'en garde que le geste.
 */
function Ligne({ l, rangs, nom, placer, gestes, ouverte = false }: { l: LigneDiscrete; rangs: readonly number[]; nom: string; placer: (rang: number) => void; gestes: boolean; ouverte?: boolean }) {
  if (ouverte && !l.option) return null;
  return (
    <li className={'ligneEtapeAudit ' + l.etat + (ouverte ? ' ouverte' : '')}>
      {!ouverte && <><span className="etatEtapeAudit">{LIBELLES_ETAT[l.etat]}</span> {l.texte}</>}
      {l.option && <span className="optionEtapeAudit">{(ouverte ? '' : ' ') + 'À la main : ' + l.option + '.'}</span>}
      {gestes && l.surLaPhoto && rangs.length > 0 && <span className="actionsAudit">
        {rangs.map((r) => <button key={r} type="button" className={l.etat === 'echec' ? 'small' : 'secondary small'} data-controle="auditParcelle.placerCoins" aria-label={'Placer quatre repères sur la photo ' + (r + 1) + ' : ' + nom} onClick={() => placer(r)}>{rangs.length > 1 ? 'Repères, photo ' + (r + 1) : 'Placer 4 repères'}</button>)}
      </span>}
    </li>
  );
}

/** Le point V4 : la Facade a valider (son bilan, l'E9), et le bouton qui l'ecrit dans le projet. */
function ValiderFacade({ commandes, nom }: { commandes: RegistreCommandes; nom: string }) {
  const etat = commandes.etat(COMMANDE_VALIDER);
  if (commandes.effacee(COMMANDE_VALIDER)) return null;
  const raison = etat && 'message' in etat ? etat.message : null;
  return (
    <button type="button" className="small" data-commande={COMMANDE_VALIDER} disabled={!etat?.utilisable} aria-label={'Valider la façade : ' + nom}
      title={raison ?? 'Écrire ses dimensions, sa forme, sa texture calée et ses ouvertures vérifiées dans le projet (Ctrl+Z la défait)'}
      onClick={(e) => { commandes.executer(COMMANDE_VALIDER, e.currentTarget); }}>Valider la façade</button>
  );
}

/** La lecture de Claude d'une facade : ses passes, son modele, son cout ; et l'escalade, a la demande, son cout annonce. */
function LectureClaude({ run, prix, commandes, nom, lignes }: { run: RunEnregistre; prix: PrixEscalade | null; commandes: RegistreCommandes; nom: string; lignes: readonly { texte: string; signal?: true }[] }) {
  const etat = commandes.etat(COMMANDE_ESCALADE);
  const efface = commandes.effacee(COMMANDE_ESCALADE);
  const raison = run.escalade ? 'Déjà escaladée : une seule escalade par lecture.' : etat && 'message' in etat ? etat.message : null;
  return (
    <div className="lectureClaude">
      <p className="detailPhoto">{'Lue par ' + enteteDuRun(run) + '.'}</p>
      {/* La facade enrichie (lot L1) : ce que Claude lit de plus ; l'etat du mur est un signal, sans case (decision 8). */}
      {lignes.map((l, i) => <p key={i} className={'detailPhoto' + (l.signal ? ' signalClaude' : '')} {...(l.signal ? { role: 'note' } : {})}>{l.texte}</p>)}
      {!efface && <button type="button" className="secondary small" data-commande={COMMANDE_ESCALADE} disabled={!!run.escalade || !etat?.utilisable} aria-label={libelleEscalade(run, prix) + ' : ' + nom}
        title={raison ?? 'Une lecture de plus, par un modèle plus fin ; le moteur la pèse contre le vote des passes'} onClick={(e) => { commandes.executer(COMMANDE_ESCALADE, e.currentTarget); }}>{libelleEscalade(run, prix)}</button>}
    </div>
  );
}

export function FacadeAudit({ session, commandes, cle, cote, nom, largeurPlanM, gestes = true }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [rangReperes, setRangReperes] = useState<number | null>(null);
  const mesure = session.validation.mesuresFaites().get(cleMesure(cle, cote));
  const saisie = session.capture.lire().batiments[cle]?.facades[String(cote)];
  // Validee (V4), la Facade de cette mesure est dans le projet : l'E9 de la barre est faite.
  const validee = session.validation.facadeValidee(cle, cote);
  const etapes = etapesApresValidation(mesure?.etapes ?? [], validee);
  const facade = cle + '#' + cote;
  const o = session.etapeOuverte();
  const ouverte = o?.facade === facade ? o.etape : null;
  const tourne = session.validation.etapeEnCours(cle, cote);
  const rejouer = () => { setEnCours(true); void session.validation.rejouerFacade(cle, cote).finally(() => setEnCours(false)); };
  // Une correction ecrite dans la capture, puis la facade rejouee : le calcul reprend les points de la personne.
  const corriger = (rang: number, c: CorrectionRedressement | null) => {
    const avant = saisie?.corrections?.[String(rang)];
    session.capture.corrigerRedressement(cle, cote, rang, c ? { ...avant, ...c } : null);
    rejouer();
  };
  const rangs = (saisie?.photos ?? []).map((_, i) => i);
  const lignes = lignesDiscretes(etapes).filter((l) => l.id !== ouverte);
  const premiere = ouverte ? ligneOuverte(etapes, ouverte) : null;
  const photo = rangReperes !== null ? saisie?.photos[rangReperes] : undefined;
  const coinsPx = rangReperes !== null ? mesure?.redressement?.photos.find((p) => p.rang === rangReperes)?.coinsPx : undefined;
  const correction = rangReperes !== null ? saisie?.corrections?.[String(rangReperes)] : undefined;
  const run = session.analyse.runs()?.[facade] ?? null;
  return (
    <div className="facadeAudit" data-facade={facade} aria-label={'Enchaînement : ' + nom}>
      <BarreProgressionFacade etapes={etapes} enCours={tourne} ouverte={ouverte} ouvrable={ouvrableDansLAudit} commandes={commandes} arreter={tourne ? () => session.validation.arreterMesure() : null} />
      {!mesure && !tourne && <p className="detailPhoto">Pas encore calculée : la façade se calcule après la photo, ou avec « Rejouer la façade ».</p>}
      {mesure && !etapes.length && <p className="detailPhoto">Mesure reprise d’un fichier d’audit : « Rejouer la façade » recalcule ses étapes.</p>}
      {(premiere || lignes.length > 0) && <ul className="etapesAudit" aria-label={'Étapes à voir : ' + nom}>
        {premiere && <Ligne l={premiere} rangs={rangs} nom={nom} placer={setRangReperes} gestes={gestes} ouverte />}
        {lignes.map((l) => <Ligne key={l.id} l={l} rangs={rangs} nom={nom} placer={setRangReperes} gestes={gestes} />)}
      </ul>}
      {gestes && photo && rangReperes !== null && <ReperesAudit photo={photo} rang={rangReperes} largeurPlanM={largeurPlanM}
        depart={correction?.reperes ?? correction?.coins ?? coinsPx} mur={correction?.coins ?? coinsPx} gabarit={mesure?.gabarit}
        echelleDepart={correction?.echelleLargeurM}
        appliquer={(c) => corriger(rangReperes, c)} retablir={() => corriger(rangReperes, null)} fermer={() => setRangReperes(null)} />}
      {gestes && run && <LectureClaude run={run} prix={session.analyse.prixEscalade()} commandes={commandes} nom={nom}
        lignes={lignesFacadeEnrichie(run, { largeurM: mesure?.facade?.dimensions.largeurM ?? largeurPlanM, egoutM: mesure?.facade?.dimensions.egoutM ?? mesure?.releve?.hauteur ?? 3 })} />}
      {gestes && mesure?.facade && !validee && !tourne && <ValiderFacade commandes={commandes} nom={nom} />}
      {gestes && enAdmin() && rangs.length > 0 && <BoutonCommande commandes={commandes} id="facade.creerCas" className="secondary small">Créer un cas depuis cette façade</BoutonCommande>}
      {gestes && <button type="button" className="secondary small" data-controle="auditParcelle.rejouerFacade" disabled={enCours || !!tourne} aria-label={'Rejouer la façade : ' + nom} onClick={rejouer}>{enCours || tourne ? 'Calcul en cours…' : 'Rejouer la façade'}</button>}
    </div>
  );
}
