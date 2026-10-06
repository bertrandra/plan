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
  it('garde les cinq entrees d edition : le corps, les trois poignees et les acces de la cloture', () => {
    // Deplacer un objet, tirer un sommet, tirer une arete, tirer un rayon, glisser un portail. Si une sixieme
    // apparait un jour sans sa garde, ce compte le dira.
    // Chaque entree est une fonction (`surObjet`, `surSommet`, `surCote`, `surRayon`, `surAcces`) qui rend 'rien'.
    expect(source.split("if(etat.lectureSeule) return 'rien';").length - 1).toBe(5);
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

  it('refuse le recul au double toucher aussi, comme a la souris (D-18)', () => {
    expect(source).toContain('if(recule && !p.etat.lectureSeule) p.ctx.sendObjectBackward(recule);');
    // Chaque recul du fichier passe par une garde de lecture seule, sur la meme ligne.
    const reculs = source.split('\n').filter((l) => l.includes('ctx.sendObjectBackward(') && !l.trim().startsWith('//'));
    for (const l of reculs) expect(l, l.trim()).toContain('etat.lectureSeule');
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

describe('toute commande qui change le dessin demande le droit d ecrire', () => {
  // La lecture seule mentait : la barre d'etat l'annoncait, et la palette restait entiere. Un
  // lecteur ajoutait un rectangle, puis decouvrait qu'il ne pouvait ni le deplacer ni enregistrer.
  // Ce test tient la liste, parce qu'une commande ajoutee demain sans son droit refera le meme
  // mensonge sans que personne le remarque.
  const sources = ['ecouteurs/objets.ts', 'ecouteurs/divers.ts', 'ecouteurs/fichiers.ts', 'projet.ts']
    .map((n) => readFileSync(resolve(__dirname, '../../../src/app', n), 'utf8')).join('\n');

  const DOIVENT = [
    'projet.nouveau', 'projet.enregistrer', 'projet.supprimer', 'projet.reinitialiser',
    'projet.depuisAdresse', 'projet.actualiserIgn',
    'fichier.importerSvg', 'fichier.importerJson',
    'mesure.nouvelle', 'mesure.effacer', 'objet.aligner'
  ];

  it('nomme projects.write sur chaque commande qui touche au projet', () => {
    const sans: string[] = [];
    for (const id of DOIVENT) {
      const i = sources.indexOf("id: '" + id + "'");
      if (i < 0) { sans.push(id + ' (introuvable)'); continue; }
      const jusqua = sources.indexOf('executer', i);
      if (!sources.slice(i, jusqua).includes('PERMISSION_ECRITURE')) sans.push(id);
    }
    expect(sans, 'commandes qui changent le dessin sans droit').toEqual([]);
  });

  it('pose le droit une fois pour tout le groupe des objets, et non ligne par ligne', () => {
    // Ajouter, dupliquer, supprimer, reculer, remettre en place : l'aide locale les couvre toutes,
    // donc une commande d'objet ajoutee demain l'aura sans qu'on y pense.
    const objets = readFileSync(resolve(__dirname, '../../../src/app/ecouteurs/objets.ts'), 'utf8');
    expect(objets).toContain('sansDroit ? {} : { permission: PERMISSION_ECRITURE }');
  });

  it('dispense l annulation, et elle seule', () => {
    // Elle ne peut defaire que ce qu'on a eu le droit de faire : en lecture seule sa pile est vide.
    const objets = readFileSync(resolve(__dirname, '../../../src/app/ecouteurs/objets.ts'), 'utf8');
    expect(objets).toContain("sansDroit: true");
    expect(objets.split('sansDroit: true').length - 1).toBe(1);
  });

  it('laisse les reglages de vue disponibles', () => {
    // Grille, Nord, voisinage, orthophoto : ils ne changent que ce que CE navigateur montre, et
    // rien ne peut etre enregistre de toute facon. Les griser ferait passer un plan consultable
    // pour un plan casse.
    const affichage = readFileSync(resolve(__dirname, '../../../src/app/ecouteurs/affichage.ts'), 'utf8');
    expect(affichage).not.toContain('PERMISSION_ECRITURE');
  });
});
