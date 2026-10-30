// Z8, la declaration prealable : les textes du dossier, ses photographies et sa relecture (lot L5 de la lecture IA elargie, §5.4).
//
// Chaque piece ecrite (description du cerfa, notice, insertion paysagere) : son etat (rien, brouillon de Claude, texte valide ; perime
// quand le projet a change), sa zone de texte, et trois commandes du registre (`export.redigerTexte`, `export.validerTexte`, `export.retirerTexte`), la
// piece en valeur. Le brouillon se montre a cote des faits qui l'ont nourri. Les photographies DP7 et DP8 : une par piece, prise parmi
// les photos de l'audit de la parcelle (`export.choisirPhoto`, `export.retirerPhoto`) ; les photos se prennent dans l'audit. La relecture avant l'export : une liste
// de points, chacun avec sa gravite et, quand il en a un, le geste qui le regle. Rien ne s'ecrit ici : le service du dossier ecrit.

import { useEffect, useReducer, useState } from 'react';
import { useStore } from 'zustand';
import { LIBELLES_PIECES_PHOTO, LIBELLES_PIECES_TEXTE, PIECES_PHOTO, PIECES_TEXTE, type PiecePhoto, type PieceTexte } from '../../regles/textes/dossier.js';
import { LIBELLES_GRAVITE, type PointRelecture } from '../../export/typesRelecture.js';
import type { ServiceDossier } from '../../app/declaration/serviceDossier.js';
import type { PhotoAudit } from '../../app/declaration/photosDossier.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { Magasin } from '../../app/magasin.js';

/** Un bouton lie a une commande du registre, la piece en valeur : efface sans la capacite, grise avec sa raison sinon. */
function Bouton({ commandes, id, valeur, texte, aide, classe = 'secondary small', inactif = false, apres }: {
  commandes: RegistreCommandes; id: string; valeur: string; texte: string; aide: string; classe?: string; inactif?: boolean; apres?: () => void;
}) {
  if (commandes.effacee(id)) return null;
  const e = commandes.etat(id);
  const raison = 'message' in e ? e.message : null;
  return (
    <button type="button" className={classe} data-commande={id} data-valeur={valeur} disabled={!e.utilisable || inactif} title={raison ?? aide}
      onClick={(ev) => { if (commandes.executer(id, ev.currentTarget, { valeur })) apres?.(); }}>{texte}</button>
  );
}

/** La raison d'un refus, ecrite sous le groupe (au doigt, l'infobulle n'existe pas). */
function Raison({ commandes, id }: { commandes: RegistreCommandes; id: string }) {
  const e = commandes.etat(id);
  return 'message' in e && !commandes.effacee(id) ? <p className="raisonDossier">{e.message}</p> : null;
}

const jour = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? m[3] + '/' + m[2] + '/' + m[1] : iso; };

function PieceEcrite({ piece, dossier, commandes }: { piece: PieceTexte; dossier: ServiceDossier; commandes: RegistreCommandes }) {
  // La frappe ne touche pas au projet : seule cette piece se redessine, pas tout l'ecran.
  const [, redessiner] = useReducer((n: number) => n + 1, 0);
  const e = dossier.etatTexte(piece);
  const b = e.texte?.brouillon, v = e.texte?.valide;
  const etat = e.enCours ? 'Claude rédige…'
    : v ? 'Texte validé le ' + jour(v.le) + (e.valideDate ? ' — le projet a changé depuis : relisez-le.' : ' : l’export l’imprime tel quel.')
    : b ? 'Brouillon de Claude du ' + jour(b.le) + (e.perime ? ' — périmé : le projet a changé depuis sa rédaction.' : ', à relire et valider : l’export ne l’imprime pas encore.')
    : piece === 'description' ? 'Aucun texte validé : l’export garde la description calculée par le plan.' : 'Aucun texte validé : pas de page dans le dossier.';
  const trop = e.edition.trim().length > e.longueurMax;
  return (
    <div className="pieceDossier" data-piece={piece}>
      <div className="titrePieceDossier">{LIBELLES_PIECES_TEXTE[piece]}</div>
      <p className={'etatPieceDossier' + ((e.perime && !v) || e.valideDate ? ' alertePieceDossier' : '')} role="status">{etat}</p>
      <textarea className="texteDossier" aria-label={LIBELLES_PIECES_TEXTE[piece]} value={e.edition} rows={piece === 'description' ? 4 : 7}
        onChange={(ev) => { dossier.editer(piece, ev.currentTarget.value); redessiner(); }} />
      <p className={'compteDossier' + (trop ? ' alertePieceDossier' : '')}>{e.edition.trim().length + ' / ' + e.longueurMax + ' caractères'}</p>
      {b && b.reserves.length > 0 && <p className="reservesDossier">{'Ce que Claude n’a pas pu dire depuis le plan : ' + b.reserves.join(' ; ') + '.'}</p>}
      {b && <p className="detailPhoto">{(b.synthetique ? 'Rédaction de démonstration (pas Claude)' : 'Rédigé par ' + b.modele) + ', prompt v' + b.prompt + (b.cout !== null ? ', ' + b.cout.toFixed(4).replace('.', ',') + ' $' : '') + '.'}</p>}
      <div className="actionsDossier" role="group" aria-label={'Texte : ' + LIBELLES_PIECES_TEXTE[piece]}>
        <Bouton commandes={commandes} id="export.redigerTexte" valeur={piece} texte={b || v ? 'Rédiger de nouveau avec Claude' : 'Rédiger avec Claude'} aide="Claude rédige un brouillon depuis les faits du projet ; vous le relisez et le validez (une requête)" />
        <Bouton commandes={commandes} id="export.validerTexte" valeur={piece} classe="small" inactif={!e.edition.trim() || trop} texte="Valider ce texte" aide="Ce texte entre dans le dossier : l’export l’imprime tel quel (Ctrl+Z le défait)" />
        {e.texte && <Bouton commandes={commandes} id="export.retirerTexte" valeur={piece} texte="Retirer" aide="Retire le brouillon et le texte validé de cette pièce (Ctrl+Z les rend)" />}
      </div>
      <Raison commandes={commandes} id="export.redigerTexte" />
    </div>
  );
}

function PiecePhotoDossier({ piece, dossier, commandes, audit }: { piece: PiecePhoto; dossier: ServiceDossier; commandes: RegistreCommandes; audit: PhotoAudit[] }) {
  const p = dossier.photo(piece);
  return (
    <div className="pieceDossier" data-piece={piece}>
      <div className="titrePieceDossier">{piece + ' — ' + LIBELLES_PIECES_PHOTO[piece]}</div>
      {p?.image ? <img className="photoDossier" src={p.image} alt={LIBELLES_PIECES_PHOTO[piece]} />
        : <p className="etatPieceDossier">{p ? 'La photo choisie est restée sur un autre appareil : choisissez-la de nouveau.' : 'Aucune photographie : la pièce reste à joindre.'}</p>}
      {p && <div className="actionsDossier" role="group" aria-label={'Photographie ' + piece}>
        <Bouton commandes={commandes} id="export.retirerPhoto" valeur={piece} texte="Retirer" aide="Retire la photographie de cette pièce (Ctrl+Z la rend)" />
      </div>}
      {!audit.length && <p className="raisonDossier">Aucune photo de l’audit de cette parcelle sur cet appareil : les photographies se prennent dans l’audit de la parcelle (la clôture et le portail, vus de la rue).</p>}
      {audit.length > 0 && <div className="photosAuditDossier" role="group" aria-label={'Photos de l’audit pour la pièce ' + piece}>
        {audit.map((a, i) => (
          <button key={i} type="button" className="vignetteDossier" data-commande="export.choisirPhoto" data-valeur={piece + ':audit:' + i} title={a.legende}
            aria-label={'Prendre pour ' + piece + ' : ' + a.legende} disabled={!commandes.etat('export.choisirPhoto').utilisable}
            onClick={(ev) => { commandes.executer('export.choisirPhoto', ev.currentTarget, { valeur: piece + ':audit:' + i }); }}>
            <img src={a.image} alt="" aria-hidden="true" />
          </button>
        ))}
      </div>}
    </div>
  );
}

/** La relecture avant l'export : recalculee a chaque changement du projet, deterministe. */
/** Un geste hors du dossier (ouvrir la Vue 3D, importer la parcelle, interroger le PLU) se fait derriere le dialogue : il le ferme. */
const horsDuDossier = (id: string): boolean => !/^export\.(redigerTexte|validerTexte|retirerTexte|choisirPhoto|retirerPhoto)$/.test(id);

function Relecture({ dossier, commandes, version, fermer }: { dossier: ServiceDossier; commandes: RegistreCommandes; version: number; fermer: () => void }) {
  const [points, setPoints] = useState<PointRelecture[] | null>(null);
  useEffect(() => {
    let vivant = true;
    dossier.relire().then((p) => { if (vivant) setPoints(p); }, () => { if (vivant) setPoints([]); });
    return () => { vivant = false; };
  }, [dossier, version]);
  return (
    <section className="relectureDossier" aria-label="Vérifier avant l’export">
      <div className="titrePieceDossier">Vérifier avant l’export</div>
      {points === null ? <p className="etatPieceDossier">Relecture du dossier…</p>
        : !points.length ? <p className="etatPieceDossier">Rien à signaler.</p>
        : <ul className="pointsRelecture">
            {points.map((p) => (
              <li key={p.cle} data-gravite={p.gravite}>
                <span className="graviteRelecture">{LIBELLES_GRAVITE[p.gravite]}</span>
                <span className="textePointRelecture">{p.cerfa ? 'Reste à compléter : ' + p.texte + '.' : p.texte}</span>
                {p.geste && <Bouton commandes={commandes} id={p.geste.commande} valeur={p.geste.valeur ?? ''} texte={p.geste.libelle} aide={p.geste.libelle} {...(horsDuDossier(p.geste.commande) ? { apres: fermer } : {})} />}
              </li>
            ))}
          </ul>}
    </section>
  );
}

export function TextesDossier({ dossier, commandes, magasin, fermer }: { dossier: ServiceDossier; commandes: RegistreCommandes; magasin: Magasin; fermer: () => void }) {
  const version = useStore(magasin.store, (s) => s.version);
  const [audit, setAudit] = useState<PhotoAudit[]>([]);
  useEffect(() => { let vivant = true; dossier.photosDeLAudit().then((l) => { if (vivant) setAudit(l); }, () => {}); return () => { vivant = false; }; }, [dossier]);
  return (
    <div className="dossierDeclaration">
      <details className="sectionDossier" open>
        <summary>Textes du dossier</summary>
        <p className="sousTitreParcours">Claude rédige un brouillon depuis les faits du plan ; vous le relisez, le corrigez et le validez. Seul un texte validé entre dans le dossier, à l’identique à chaque export.</p>
        {PIECES_TEXTE.map((p) => <PieceEcrite key={p} piece={p} dossier={dossier} commandes={commandes} />)}
        <details className="faitsDossier">
          <summary>Les faits du projet envoyés à Claude</summary>
          <pre>{dossier.faits()}</pre>
        </details>
      </details>
      <details className="sectionDossier">
        <summary>Photographies DP7 et DP8</summary>
        {PIECES_PHOTO.map((p) => <PiecePhotoDossier key={p} piece={p} dossier={dossier} commandes={commandes} audit={audit} />)}
      </details>
      <Relecture dossier={dossier} commandes={commandes} version={version} fermer={fermer} />
    </div>
  );
}
