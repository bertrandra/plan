// La colonne d'outils, a gauche de la photo (comme dans les logiciels de dessin) : naviguer (choisir, main, zoom), selectionner (boite,
// lasso), tracer (rectangle, polygone, ligne, point), puis l'affichage (etiquettes, loupe) et l'aide. Une touche par outil.

import type { ModeSelection, Outil } from './Scene.js';
import { Icone, type NomIcone } from '../../ui/Icones.js';

interface Bouton { outil: Outil; icone: NomIcone; titre: string; mode?: ModeSelection }

const GROUPES: Bouton[][] = [
  [
    { outil: 'choisir', icone: 'choisir', titre: 'Choisir, déplacer, redimensionner (V)' },
    { outil: 'vue', icone: 'vue', titre: 'Déplacer la vue (H, ou Espace + glisser)' },
    { outil: 'zoom', icone: 'zoom', titre: 'Zoom (Z) : clic pour rapprocher, Alt + clic pour éloigner, tirer un cadre' },
  ],
  [
    { outil: 'selection', icone: 'boite', titre: 'Sélection en boîte (S)', mode: 'boite' },
    { outil: 'selection', icone: 'lasso', titre: 'Sélection au lasso (S, puis S)', mode: 'lasso' },
  ],
  [
    { outil: 'rectangle', icone: 'rectangle', titre: 'Rectangle (R)' },
    { outil: 'polygone', icone: 'polygone', titre: 'Polygone (P)' },
    { outil: 'ligne', icone: 'ligne', titre: 'Ligne (T)' },
    { outil: 'point', icone: 'point', titre: 'Point (O)' },
  ],
];

export function ColonneOutils({ outil, mode, onOutil, onMode, etiquettes, onEtiquettes, loupe, onLoupe, onAide }: {
  outil: Outil; mode: ModeSelection; onOutil: (o: Outil) => void; onMode: (m: ModeSelection) => void;
  etiquettes: boolean; onEtiquettes: () => void; loupe: boolean; onLoupe: () => void; onAide: () => void;
}) {
  const actif = (b: Bouton) => b.outil === outil && (!b.mode || b.mode === mode);
  return (
    <nav className="colonne-outils" aria-label="Outils">
      {GROUPES.map((g, i) => (
        <div key={i} className="groupe-outils" role="group">
          {g.map((b) => (
            <button key={b.titre} type="button" className={actif(b) ? 'outil actif' : 'outil'} aria-pressed={actif(b)} title={b.titre} aria-label={b.titre}
              onClick={() => { onOutil(b.outil); if (b.mode) onMode(b.mode); }}><Icone nom={b.icone} /></button>
          ))}
        </div>
      ))}
      <div className="groupe-outils" role="group">
        <button type="button" className={etiquettes ? 'outil actif' : 'outil'} aria-pressed={etiquettes} title="Toutes les étiquettes (E)" aria-label="Toutes les étiquettes (E)" onClick={onEtiquettes}><Icone nom="etiquettes" /></button>
        <button type="button" className={loupe ? 'outil actif' : 'outil'} aria-pressed={loupe} title="Loupe automatique (L)" aria-label="Loupe automatique (L)" onClick={onLoupe}><Icone nom="loupe" /></button>
        <button type="button" className="outil" title="Raccourcis du clavier (?)" aria-label="Raccourcis du clavier (?)" onClick={onAide}><Icone nom="aide" /></button>
      </div>
    </nav>
  );
}
