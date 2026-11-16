// Z8, « Partager ce projet » (menu Fichier, lot 6 du parcours client ; app/partage.ts).
//
// Trois temps dans un seul dialogue : le lien a creer (pour qui, le nom montre a l'ouverture, la duree),
// le lien cree (montre UNE fois : la plateforme n'en garde que l'empreinte), et la liste des liens du
// projet, ou chacun se retire. Le retrait est definitif et ne demande pas de seconde confirmation : il part
// a la fin d'un toast qui offre « Annuler » pendant quelques secondes.
//
// Le jeton n'est range nulle part : il vit dans l'etat de ce composant, le temps que la personne le
// copie, et disparait avec le dialogue.

import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { LIBELLE_ETAT, dateLongue, libelleDuree, phraseDuLien } from '../../app/partage.js';
import { DUREES_PARTAGE, DUREE_PARTAGE_DEFAUT, LONGUEUR_DESTINATAIRE, LONGUEUR_NOM_AFFICHE, phraseRefusPartage, type LienPartage } from '../../plateforme/partage.js';
import { notifications } from '../../shell/notifications.js';
import { showToast } from '../../shell/dialogs.js';
import type { ServicePartage } from '../../app/parcours.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { Magasin } from '../../app/magasin.js';

/** Le temps de se raviser avant que le retrait d'un lien parte a la plateforme. */
export const DELAI_RETRAIT_MS = 6000;

interface Cree { url: string; expireLe: string }
interface NavigateurPartage { share?: (d: { title?: string; url?: string }) => Promise<void> }

export function Partage({ service, commandes, magasin, fermer }: { service: ServicePartage; commandes: RegistreCommandes; magasin: Magasin; fermer: () => void }) {
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  // Le statut du projet : « Enregistrer » depuis le dialogue retire l'avertissement des modifications.
  const statut = useStore(magasin.store, (s) => s.projet.statut);
  const [cree, poserCree] = useState<Cree | null>(null);
  const [liens, poserLiens] = useState<LienPartage[] | null>(null);
  const [erreurListe, poserErreurListe] = useState<string | null>(null);
  // Les retraits annonces dont le toast court encore : la ligne le dit, et son bouton attend.
  const [enRetrait, poserEnRetrait] = useState<ReadonlySet<string>>(new Set());
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);

  const relire = async (): Promise<void> => {
    try {
      const l = await service.lister();
      if (vivant.current) { poserLiens(l); poserErreurListe(null); }
    } catch (e) {
      if (vivant.current) poserErreurListe(phraseRefusPartage(e));
    }
  };
  // Une lecture a l'ouverture ; les gestes du dialogue relisent ensuite eux-memes.
  useEffect(() => { void relire(); }, []);

  const retirer = (l: LienPartage): void => {
    poserEnRetrait((s) => new Set(s).add(l.id));
    const oublier = () => { if (vivant.current) poserEnRetrait((s) => { const n = new Set(s); n.delete(l.id); return n; }); };
    const qui = l.recipient_label ? ' de « ' + l.recipient_label + ' »' : '';
    // Le retrait part a la fin du toast (ou quand on le ferme) ; « Annuler » le retient. Il part meme si le dialogue est ferme.
    notifications.emettreAvecAction('Le lien' + qui + ' sera retiré : il ne s’ouvrira plus.', 'Annuler', oublier, () => {
      void service.retirer(l.id).then(
        () => { showToast('Lien' + qui + ' retiré.'); oublier(); if (vivant.current) void relire(); },
        (e: unknown) => { oublier(); showToast('Le lien' + qui + ' n’a pas été retiré : ' + phraseRefusPartage(e)); }
      );
    }, DELAI_RETRAIT_MS);
  };

  return (
    <div className="dialogueImperatif dialoguePartage" role="dialog" aria-modal="true" aria-label="Partager ce projet">
      <div className="titreParcours">Partager ce projet</div>
      <div className="sousTitreParcours">
        Un lien en lecture seule vers « {service.nom()} » : la personne qui le reçoit voit le plan, la 3D et le chiffrage, sans compte et sans rien pouvoir modifier.
      </div>
      {service.modifie() && (
        <div className="avertissementPartage" role="note">
          <p>Le lien montrera la dernière version enregistrée ; enregistrez pour y inclure vos derniers changements.</p>
          <button type="button" data-commande="projet.enregistrer" className="secondary" disabled={statut === 'enregistrement' || !commandes.etat('projet.enregistrer').utilisable}
            onClick={(e) => { commandes.executer('projet.enregistrer', e.currentTarget); }}>
            {statut === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
      {cree
        ? <LienCree cree={cree} nom={service.nom()} tactile={tactile} autre={() => poserCree(null)} />
        : <FormulairePartage service={service} cree={(c) => { if (vivant.current) { poserCree(c); void relire(); } }} />}
      <ListeLiens liens={liens} erreur={erreurListe} enRetrait={enRetrait} retirer={retirer} />
      <div className="piedDialogue">
        <button type="button" data-controle="partage.fermer" className="secondary" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}

/** Le lien a creer : pour qui (prive), le nom montre a l'ouverture, la duree. */
function FormulairePartage({ service, cree }: { service: ServicePartage; cree: (c: Cree) => void }) {
  const [pour, poserPour] = useState('');
  const [nomAffiche, poserNomAffiche] = useState('');
  const touche = useRef(false);
  // Le nom du compte, propose tant que la personne n'a rien tape dans le champ.
  useEffect(() => { void service.nomPropose().then((n) => { if (!touche.current) poserNomAffiche(n); }); }, [service]);
  const [jours, poserJours] = useState<number>(DUREE_PARTAGE_DEFAUT);
  const [enCours, poserEnCours] = useState(false);
  const [erreur, poserErreur] = useState<string | null>(null);
  const creer = async (): Promise<void> => {
    poserEnCours(true);
    poserErreur(null);
    try {
      const r = await service.creer({ jours, nomAffiche, destinataire: pour });
      cree({ url: r.url, expireLe: r.expires_at });
    } catch (e) {
      poserErreur(phraseRefusPartage(e));
      poserEnCours(false);
    }
  };
  return (
    <form className="formulairePartage" onSubmit={(e) => { e.preventDefault(); void creer(); }}>
      <label className="champPartage">
        <span>Pour qui <em>(privé, facultatif)</em></span>
        <input type="text" data-controle="partage.destinataire" value={pour} maxLength={LONGUEUR_DESTINATAIRE} placeholder="Par exemple : le menuisier"
          onChange={(e) => poserPour(e.target.value)} />
        <span className="note">Vous seul le voyez, dans la liste des liens : il sert à retirer le bon.</span>
      </label>
      <label className="champPartage">
        <span>Nom affiché à l’ouverture</span>
        <input type="text" data-controle="partage.nomAffiche" value={nomAffiche} maxLength={LONGUEUR_NOM_AFFICHE} placeholder="Votre nom"
          onChange={(e) => { touche.current = true; poserNomAffiche(e.target.value); }} />
        <span className="note">La personne lit « Projet partagé par {nomAffiche.trim() || '…'} ». Vide, aucun nom.</span>
      </label>
      <div className="champPartage">
        <span id="dureePartage">Durée</span>
        <div className="segmente" role="group" aria-labelledby="dureePartage">
          {DUREES_PARTAGE.map((j) => (
            <button key={j} type="button" data-controle="partage.duree" className={j === jours ? 'actif' : undefined} aria-pressed={j === jours}
              onClick={() => poserJours(j)}>{libelleDuree(j)}</button>
          ))}
        </div>
      </div>
      {erreur && <p className="erreurPartage" role="alert">{erreur}</p>}
      <div className="actionsPartage">
        <button type="submit" data-controle="partage.creer" className="boutonAccent" disabled={enCours}>{enCours ? 'Création…' : 'Créer le lien'}</button>
      </div>
    </form>
  );
}

/** Le lien cree, montre une fois : le copier (presse-papiers, sinon le champ selectionne), l'envoyer au doigt. */
function LienCree({ cree, nom, tactile, autre }: { cree: Cree; nom: string; tactile: boolean; autre: () => void }) {
  const champ = useRef<HTMLInputElement>(null);
  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(cree.url);
      showToast('Lien copié : collez-le dans un message.');
    } catch {
      // Sans presse-papiers (page non securisee, permission refusee) : le lien est selectionne, a copier a la main.
      champ.current?.focus();
      champ.current?.select();
      showToast('Le lien est sélectionné : copiez-le (Ctrl+C, ou « Copier » au doigt).');
    }
  };
  const nav = navigator as NavigateurPartage;
  const natif = tactile && typeof nav.share === 'function';
  const envoyer = async (): Promise<void> => {
    try { await nav.share?.({ title: nom, url: cree.url }); } catch { /* la feuille fermee sans choisir : rien a dire */ }
  };
  return (
    <section className="lienCree" aria-label="Le lien créé">
      <p className="phraseLien">{phraseDuLien(cree.expireLe)}</p>
      <input ref={champ} type="text" readOnly value={cree.url} data-controle="partage.lien" aria-label="Le lien" className="champLien"
        onFocus={(e) => e.currentTarget.select()} />
      <p className="hint">Ce lien ne s’affichera plus : copiez-le maintenant. Perdu, il se retire et se refait.</p>
      <div className="actionsPartage">
        <button type="button" data-controle="partage.copier" onClick={() => { void copier(); }}>Copier le lien</button>
        {natif && <button type="button" data-controle="partage.natif" className="secondary" onClick={() => { void envoyer(); }}>Envoyer…</button>}
        <button type="button" data-controle="partage.autre" className="secondary" onClick={autre}>Créer un autre lien</button>
      </div>
    </section>
  );
}

/** Les liens du projet, les plus recents d'abord (l'ordre de la plateforme) : pour qui, l'etat, l'echeance, les ouvertures. */
function ListeLiens({ liens, erreur, enRetrait, retirer }: { liens: LienPartage[] | null; erreur: string | null; enRetrait: ReadonlySet<string>; retirer: (l: LienPartage) => void }) {
  return (
    <section className="liensPartage" aria-label="Les liens de ce projet">
      <div className="titreSectionPartage">Liens de ce projet</div>
      {erreur && <p className="erreurPartage" role="alert">{erreur}</p>}
      {!liens && !erreur && <p className="hint">Lecture des liens…</p>}
      {liens && liens.length === 0 && <p className="hint">Aucun lien pour l’instant.</p>}
      {liens && liens.length > 0 && (
        <ul className="listeLiens">
          {liens.map((l) => {
            const attend = enRetrait.has(l.id);
            return (
              <li key={l.id} className={'lienPartage etat-' + l.status.toLowerCase()} data-lien={l.id}>
                <div className="lienTete">
                  <span className="lienPour">{l.recipient_label || 'Sans destinataire'}</span>
                  <span className="lienEtat">{attend ? 'Retrait…' : LIBELLE_ETAT[l.status]}</span>
                </div>
                <div className="lienDetails">
                  {l.status === 'REVOKED' ? 'Retiré le ' + dateLongue(l.revoked_at) : (l.status === 'EXPIRED' ? 'Expiré le ' : 'Jusqu’au ') + dateLongue(l.expires_at)}
                  {' · '}{l.open_count === 0 ? 'jamais ouvert' : 'ouvert ' + l.open_count + ' fois'}
                  {l.last_opened_at && ', la dernière le ' + dateLongue(l.last_opened_at)}
                </div>
                {l.status === 'ACTIVE' && (
                  <button type="button" data-controle="partage.retirer" className="small secondary" disabled={attend}
                    aria-label={'Retirer le lien' + (l.recipient_label ? ' de ' + l.recipient_label : '')} onClick={() => retirer(l)}>Retirer</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
