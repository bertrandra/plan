// Le menu d'un objet (demande du proprietaire, 13 novembre 2026) : clic droit a la souris, appui long au doigt ou au stylet. Il propose
// les types de sa classe (une fenetre : 1 vantail, 2 vantaux…), et pour une classe sans type, ses voisines de meme forme (changer
// d'objet) ; puis copier et supprimer. Sur une selection, il vaut pour toute la selection : les types de chaque classe presente, et le
// choisi donne a tous cette classe et ce type, comme l'inspecteur.

import { useEffect, useRef } from 'react';
import type { Classe, Objet } from '../../types.js';
import { libelleDe } from '../../classes.js';
import { Icone } from '../../ui/Icones.js';

export interface Choix { classe: string; type?: string }

export function MenuObjet({ x, y, objets, classes, onChoisir, onCopier, onSupprimer, onFermer }: {
  x: number; y: number; objets: Objet[]; classes: Classe[];
  onChoisir: (c: Choix) => void; onCopier: () => void; onSupprimer: () => void; onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  // Fermer : un toucher ailleurs, Echap, la page qui defile.
  useEffect(() => {
    const dehors = (e: PointerEvent) => { if (!boite.current?.contains(e.target as Node)) onFermer(); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onFermer(); } };
    const t = window.setTimeout(() => document.addEventListener('pointerdown', dehors, true), 0);
    document.addEventListener('keydown', touche, true);
    window.addEventListener('scroll', onFermer, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', dehors, true); document.removeEventListener('keydown', touche, true); window.removeEventListener('scroll', onFermer, true); };
  }, [onFermer]);
  // Le menu reste dans l'ecran : pres du bord droit ou du bas, il s'ouvre de l'autre cote du point.
  useEffect(() => {
    const b = boite.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.left = `${Math.max(8, x + r.width > innerWidth - 8 ? x - r.width : x)}px`;
    b.style.top = `${Math.max(8, y + r.height > innerHeight - 8 ? y - r.height : y)}px`;
  }, [x, y]);

  const presentes = [...new Set(objets.map((o) => o.classe))].map((id) => classes.find((c) => c.id === id)).filter((c): c is Classe => !!c);
  const tous = (c: Choix) => objets.every((o) => o.classe === c.classe && (o.type ?? '') === (c.type ?? ''));
  const titre = objets.length > 1 ? `${objets.length} objets` : objets[0] ? libelleDe(objets[0], classes) : '';
  const ligne = (c: Choix, nom: string) => (
    <button key={c.classe + ':' + (c.type ?? '')} type="button" role="menuitemradio" aria-checked={tous(c)} className={tous(c) ? 'coche' : ''} onClick={() => { onChoisir(c); onFermer(); }}>
      <span className="marque">{tous(c) ? <Icone nom="valider" taille={14} /> : null}</span>{nom}
    </button>
  );
  return (
    <div ref={boite} className="menu-objet" role="menu" aria-label={`Menu : ${titre}`} style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="tete-menu">{titre}</div>
      {presentes.map((k) => {
        const couleur = <span className="pastille" style={{ background: k.couleur }} />;
        if (k.types?.length) return (
          <div key={k.id} className="groupe-menu">
            {presentes.length > 1 && <div className="sous-tete">{couleur} {k.nom}</div>}
            {k.types.map((t) => ligne({ classe: k.id, type: t.id }, t.nom))}
          </div>
        );
        // Sans type : les classes voisines (meme parent, meme forme) pour changer d'objet.
        const voisines = classes.filter((c) => c.parent === k.parent && c.forme === k.forme && !c.regroupement);
        return voisines.length > 1 ? (
          <div key={k.id} className="groupe-menu">
            {presentes.length > 1 && <div className="sous-tete">{couleur} {k.nom}</div>}
            {voisines.map((c) => ligne({ classe: c.id }, c.nom))}
          </div>
        ) : null;
      })}
      <div className="groupe-menu actions-menu">
        <button type="button" role="menuitem" onClick={() => { onCopier(); onFermer(); }}><span className="marque"><Icone nom="copier" taille={14} /></span>Copier</button>
        <button type="button" role="menuitem" className="danger" onClick={() => { onSupprimer(); onFermer(); }}><span className="marque"><Icone nom="poubelle" taille={14} /></span>Supprimer{objets.length > 1 ? ` les ${objets.length}` : ''}</button>
      </div>
    </div>
  );
}
