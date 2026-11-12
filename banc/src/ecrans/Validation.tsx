// Etape 2a : la mosaique des photos redressees, pour les valider d'un coup d'oeil avant le marquage. Une photo rejetee n'entre ni
// dans le brouillon ni dans le jeu ; une photo mal redressee repart a l'etape 2.

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import type { MetaImage, Statut } from '../types.js';

export function EcranValidation({ banc }: { banc: Banc }) {
  const [filtre, setFiltre] = useState<'a-valider' | 'validee' | 'rejetee'>('a-valider');
  const [curseur, setCurseur] = useState(0);
  const liste = useMemo(() => banc.images.filter((m) => (filtre === 'a-valider' ? m.statut === 'redressee' : m.statut === filtre)), [banc.images, filtre]);
  const poser = async (m: MetaImage, statut: Statut) => {
    try { banc.remplacer(await api.modifier(m.id, { statut })); } catch (e) { banc.dire((e as Error).message, 'erreur'); }
  };
  // Supprimer : la photo et tout son dossier sur le serveur (source, redressee, marquage) ; sans retour.
  const supprimer = async (l: readonly MetaImage[]) => {
    if (!l.length || !confirm(l.length === 1 ? `Supprimer définitivement « ${l[0]?.nom ?? l[0]?.id} » et tout son dossier ?` : `Supprimer définitivement ces ${l.length} photos rejetées et tout leur dossier ? Rien ne pourra être récupéré.`)) return;
    let n = 0;
    for (const m of l) { try { await api.supprimer(m.id); n++; } catch (e) { banc.dire(`${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur'); } }
    banc.dire(`${n} photo(s) supprimée(s).`);
    setCurseur(0);
    await banc.relire();
  };
  const tout = async () => { for (const m of liste) await poser(m, 'validee'); banc.dire(`${liste.length} photo(s) validée(s).`); };
  // Au clavier : fleches pour aller, V pour valider, R pour rejeter, A pour renvoyer au redressement.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const m = liste[curseur];
      if (e.key === 'ArrowRight') setCurseur((c) => Math.min(liste.length - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCurseur((c) => Math.max(0, c - 1));
      else if (m && e.key.toLowerCase() === 'v') void poser(m, 'validee');
      else if (m && e.key.toLowerCase() === 'r') void poser(m, 'rejetee');
      else if (m && e.key.toLowerCase() === 'a') void poser(m, 'importee');
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  });
  return (
    <section className="panneau">
      <h2>2a · Mosaïque des photos redressées</h2>
      <p className="aide">Validez chaque photo bien redressée (le mur droit, assez net, assez de façade). Au clavier : ← → pour aller, <kbd>V</kbd> valider, <kbd>R</kbd> rejeter, <kbd>A</kbd> refaire le redressement.</p>
      <div className="rang">
        {(['a-valider', 'validee', 'rejetee'] as const).map((f) => <button key={f} type="button" className={f === filtre ? 'onglet actif' : 'onglet'} onClick={() => { setFiltre(f); setCurseur(0); }}>{f === 'a-valider' ? 'À valider' : f === 'validee' ? 'Validées' : 'Rejetées'} ({banc.images.filter((m) => (f === 'a-valider' ? m.statut === 'redressee' : m.statut === f)).length})</button>)}
        {filtre === 'a-valider' && <button type="button" className="principal" disabled={!liste.length} onClick={() => { void tout(); }}>Tout valider</button>}
        {filtre === 'rejetee' && <button type="button" className="danger" disabled={!liste.length} onClick={() => { void supprimer(liste); }}>Supprimer les {liste.length} rejetée(s)</button>}
      </div>
      <ul className="mosaique grande">
        {liste.map((m, i) => (
          <li key={m.id} className={i === curseur ? 'carte courante' : 'carte'} onClick={() => setCurseur(i)}>
            <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt={m.nom ?? m.id} loading="lazy" />
            <span>{m.nom ?? m.id} · {m.redressement?.methode ?? '—'}{m.redressee ? ` · ${m.redressee.largeur}×${m.redressee.hauteur}` : ''}</span>
            <div className="rang">
              {m.statut !== 'validee' && <button type="button" className="ok" onClick={() => { void poser(m, 'validee'); }}>✓ Valider</button>}
              {m.statut !== 'rejetee' && <button type="button" className="danger" onClick={() => { void poser(m, 'rejetee'); }}>✕ Rejeter</button>}
              <button type="button" onClick={() => { void poser(m, 'importee'); }}>↺ Refaire</button>
              {m.statut === 'rejetee' && <button type="button" className="danger" onClick={() => { void supprimer([m]); }}>🗑 Supprimer</button>}
            </div>
          </li>
        ))}
      </ul>
      {!liste.length && <p className="aide">Rien ici.</p>}
    </section>
  );
}
