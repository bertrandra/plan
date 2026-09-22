import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { creerEtat } from '../../../src/core/state.js';

// Le mode lecture seule : la personne n'a pas `projects.write` sur la plateforme.
//
// Ce que ces tests figent, c'est l'endroit du refus autant que le refus lui-meme. Un geste
// d'edition doit s'arreter AVANT que l'historique soit empile : un pas d'annulation pose pour un
// deplacement qui n'a pas eu lieu se defait en ne faisant rien, et personne ne comprend pourquoi
// son annulation « ne marche pas ».

const source = readFileSync(resolve(__dirname, '../../../src/interaction/pointeur.ts'), 'utf8');

describe('l etat porte le mode', () => {
  it('est modifiable par defaut : hors plateforme, il n y a personne a qui demander', () => {
    const etat = creerEtat({ objects: [], measures: [] }, (o) => o as never[]);
    expect(etat.lectureSeule).toBe(false);
  });
});

describe('ou le refus est pose dans les gestes du pointeur', () => {
  it('garde les quatre entrees d edition : le corps et les trois poignees', () => {
    // Deplacer un objet, tirer un sommet, tirer une arete, tirer un rayon. Si une cinquieme
    // apparait un jour sans sa garde, ce compte le dira.
    expect(source.split('if(etat.lectureSeule) return;').length - 1).toBe(4);
  });

  it('refuse avant d empiler l historique, jamais apres', () => {
    // On lit les positions : chaque `pushHistory` d'un geste d'edition doit venir apres une garde.
    const lignes = source.split('\n');
    const gardes = lignes.map((l, i) => (l.includes('etat.lectureSeule') ? i : -1)).filter((i) => i >= 0);
    const empilages = lignes.map((l, i) => (l.includes('ctx.pushHistory()') ? i : -1)).filter((i) => i >= 0);
    for (const e of empilages) {
      const gardeAvant = gardes.some((g) => g < e && e - g < 40);
      expect(gardeAvant, 'pushHistory ligne ' + (e + 1) + ' sans garde de lecture seule au-dessus').toBe(true);
    }
  });

  it('refuse aussi le recul au double-clic, qui change l ordre d empilement', () => {
    expect(source).toContain('if(!etat.lectureSeule) ctx.sendObjectBackward(objDbl);');
  });
});

describe('ce que la lecture seule ne touche pas', () => {
  it('laisse selectionner, deplacer la vue et zoomer', () => {
    // Un lecteur doit pouvoir regarder : le pan, le pincement et la selection ne portent aucune
    // garde, et c'est voulu. Les gater ferait passer un plan consultable pour un plan casse.
    const pan = source.indexOf("type:'pan'");
    const gardeAvantPan = source.slice(Math.max(0, pan - 400), pan).includes('lectureSeule');
    expect(gardeAvantPan).toBe(false);
  });
});
