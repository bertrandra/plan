import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { controler, diffLignes, estimerTokens, insererAvantLaFin, lignesChangees, modifierBloc, modifierChamp, nouveauSujet, remplacerSujet, retirerBloc, sourceDescription } from '../../../../src/regles/sujets/edition.js';
import { assemblerPrompt, assemblerSchema } from '../../../../src/regles/sujets/assembler.js';
import { DESCRIPTIONS_SUJETS } from '../../../../src/regles/sujets/liste.js';
import type { DescriptionSujet } from '../../../../src/regles/sujets/description.js';

// Ce que l'ecran Admin › Regles fait des descriptions : des copies, jamais les originales ; un sujet
// nouveau qui s'intercale sans renumeroter ; des controles qui disent ce qui empecherait d'ecrire.

const livre = DESCRIPTIONS_SUJETS;
const sujet = (id: string) => livre.find((s) => s.id === id) as DescriptionSujet;
const niveaux = (l: ReturnType<typeof controler>) => l.map((c) => c.niveau);

describe('modifier une description', () => {
  it('rend une copie : l’original du dépôt ne bouge pas, le prompt suit', () => {
    const avant = JSON.stringify(livre);
    const s = modifierBloc(sujet('couverture'), 'consignes', 0, { texte: '- `couverture` : le matériau de couverture, tel qu’on le voit sur le versant sud.' });
    const liste = remplacerSujet(livre, 'couverture', () => s);
    expect(JSON.stringify(livre)).toBe(avant);
    expect(assemblerPrompt(liste)).toContain('tel qu’on le voit sur le versant sud');
    expect(assemblerPrompt(livre)).not.toContain('tel qu’on le voit sur le versant sud');
  });

  it('déplacer un texte, c’est changer son rang : la consigne passe devant celle d’avant', () => {
    const s = modifierBloc(sujet('cheminees'), 'consignes', 0, { rang: 0.5 });
    const p = assemblerPrompt(remplacerSujet(livre, 'cheminees', () => s));
    expect(p.indexOf('- `cheminees`')).toBeLessThan(p.indexOf('- `forme`'));
  });

  it('retirer une consigne est un contrôle rouge : le champ n’a plus d’explication', () => {
    const s = retirerBloc(sujet('couverture'), 'consignes', 0);
    const c = controler(remplacerSujet(livre, 'couverture', () => s));
    expect(c.some((x) => x.code === 'consigne-absente' && /couverture/.test(x.message))).toBe(true);
    expect(niveaux(c)).not.toContain('ok');
  });

  it('refuse un JSON illisible ou qui n’est pas un objet, et dit pourquoi', () => {
    const s = sujet('couverture');
    expect(modifierChamp(s, 'couverture', '{ pas du json')).toEqual({ erreur: expect.stringMatching(/^JSON illisible/) });
    expect(modifierChamp(s, 'couverture', '[1]')).toEqual({ erreur: 'Le schéma d’un champ est un objet JSON.' });
    const ok = modifierChamp(s, 'couverture', '{ "type": "string" }');
    expect('sujet' in ok && ok.sujet.champs.couverture).toEqual({ type: 'string' });
  });
});

describe('les contrôles', () => {
  it('ne trouvent ni erreur ni alerte dans les sujets livrés : chaque terme du schéma est défini dans le prompt', () => {
    const c = controler(livre);
    expect(c[0]).toMatchObject({ niveau: 'ok' });
    expect(niveaux(c)).not.toContain('erreur');
    // Le prompt v5 définit les couvertures, le sens du faîtage et le châssis d'éclairage (plus d'alerte).
    expect(c.filter((x) => x.niveau === 'alerte').map((x) => x.message)).toEqual([]);
  });

  it('signalent en alerte les termes que le prompt ne définit pas, et nomment le champ', () => {
    const sans = remplacerSujet(livre, 'couverture', (s) => ({ ...s, vocabulaire: [] }));
    const alertes = controler(sans).filter((x) => x.niveau === 'alerte').map((x) => x.message);
    expect(alertes.some((m) => /« couverture »/.test(m) && /tuile-plate/.test(m) && /bac-acier/.test(m))).toBe(true);
    // « fenetre-de-toit » est dit en toutes lettres (« Fenêtre de toit ») : pas d'alerte.
    expect(alertes.join(' ')).not.toMatch(/fenetre-de-toit/);
  });

  it('refusent deux sujets de même identifiant, un champ décrit deux fois, une référence perdue, un objet ouvert', () => {
    const double = [...livre, { ...sujet('couverture') }];
    expect(controler(double).map((x) => x.code)).toEqual(expect.arrayContaining(['id-double', 'champ-double']));
    const perdue = remplacerSujet(livre, 'couverture', (s) => ({ ...s, champs: { couverture: { type: 'object', additionalProperties: false, required: ['indices'], properties: { indices: { $ref: '#/$defs/inconnue' } } } } }));
    expect(controler(perdue).some((x) => x.code === 'ref' && /inconnue/.test(x.message))).toBe(true);
    const ouvert = remplacerSujet(livre, 'couverture', (s) => ({ ...s, champs: { couverture: { type: 'object', properties: { a: { type: 'string' } } } } }));
    expect(controler(ouvert).filter((x) => x.code === 'schema-ferme').length).toBe(2);
  });

  it('refusent deux textes de même rang dans une liste', () => {
    const s = modifierBloc(sujet('lucarnes'), 'consignes', 0, { rang: sujet('cheminees').consignes[0]!.rang });
    expect(controler(remplacerSujet(livre, 'lucarnes', () => s)).some((x) => x.code === 'rang-double')).toBe(true);
  });
});

describe('un sujet nouveau, en brouillon', () => {
  const spec = { id: 'objetJardin', libelle: 'Objets du jardin', question: 'les objets découverts dans le jardin (abri, bassin, mobilier)', termes: [{ terme: 'abri', definition: 'petite construction fermée' }, { terme: 'bassin', definition: 'pièce d’eau' }] };

  it('s’intercale avant la fin de la réponse, avec son champ, sa consigne et son vocabulaire', () => {
    const s = nouveauSujet(spec, livre);
    expect(s).toMatchObject({ id: 'objetJardin' });
    // Un seul identifiant : la description n'a plus d'`attributs`, c'est le module de meme `id` qui porte l'attribut.
    expect(s).not.toHaveProperty('attributs');
    const liste = insererAvantLaFin(livre, s);
    expect(liste[liste.length - 2]?.id).toBe('objetJardin');
    expect(liste[liste.length - 1]?.id).toBe('transverse');
    const p = assemblerPrompt(liste);
    expect(p).toContain('- `objetJardin` : les objets découverts dans le jardin (abri, bassin, mobilier).');
    expect(p.indexOf('- `objetJardin`')).toBeGreaterThan(p.indexOf('- `facades`'));
    expect(p.indexOf('- `objetJardin`')).toBeLessThan(p.indexOf('- `ecarts`'));
    expect(p).toContain('## Vocabulaire : Objets du jardin\n\n- `abri` : petite construction fermée.\n- `bassin` : pièce d’eau.');
    const schema = assemblerSchema(liste, { version: 1, note: '' }) as { schema: { required: string[]; properties: Record<string, { properties: { valeur: { enum: string[] } } }> } };
    expect(schema.schema.required).toContain('objetJardin');
    expect(schema.schema.properties.objetJardin?.properties.valeur.enum).toEqual(['abri', 'bassin', 'indetermine']);
  });

  it('passe les contrôles tel quel : ses termes sont définis, ses rangs libres', () => {
    const c = controler(insererAvantLaFin(livre, nouveauSujet(spec, livre)));
    expect(niveaux(c)).not.toContain('erreur');
    expect(c.map((x) => x.message).join(' ')).not.toMatch(/abri|bassin/);
  });

  it('sans termes, c’est un nombre : entier ou « indetermine »', () => {
    const s = nouveauSujet({ ...spec, termes: [] }, livre);
    expect(s.champs.objetJardin).toMatchObject({ required: ['indices', 'nombre'], properties: { nombre: { $ref: '#/$defs/compte' } } });
    expect(s.vocabulaire).toEqual([]);
  });

  it('refuse un identifiant qui n’en est pas un', () => {
    const s = nouveauSujet({ ...spec, id: 'Objet du jardin' }, livre);
    expect(controler(insererAvantLaFin(livre, s)).some((x) => x.code === 'id')).toBe(true);
  });
});

describe('ce qui change', () => {
  it('dit les lignes ajoutées et retirées, et rien quand le texte est le même', () => {
    expect(lignesChangees(diffLignes('a\nb\nc', 'a\nb\nc'))).toBe(0);
    const d = diffLignes('a\nb\nc', 'a\nX\nc\nd');
    expect(d).toEqual([{ type: '=', texte: 'a' }, { type: '-', texte: 'b' }, { type: '+', texte: 'X' }, { type: '=', texte: 'c' }, { type: '+', texte: 'd' }]);
    expect(lignesChangees(d)).toBe(3);
  });

  it('estime les tokens à un pour trois caractères et demi', () => {
    expect(estimerTokens('x'.repeat(350))).toBe(100);
    expect(estimerTokens('')).toBe(0);
  });
});

describe('le module du dépôt', () => {
  it('reproduit à l’octet les huit descriptions livrées : ce que l’écran exporte se pose tel quel', () => {
    for (const s of livre) {
      const fichier = readFileSync('src/regles/sujets/descriptions/' + s.id + '.ts', 'utf8');
      expect(sourceDescription(s) === fichier, s.id).toBe(true);
    }
  });

  it('écrit un sujet nouveau dans la même forme, avec ses accents et ses accents graves protégés', () => {
    const s = nouveauSujet({ id: 'objetJardin', libelle: 'Objets du `jardin`', question: 'les objets du jardin', termes: [{ terme: 'abri', definition: 'petite construction' }] }, livre);
    const t = sourceDescription(s);
    expect(t).toContain("export const objetJardin: DescriptionSujet = {");
    expect(t).toContain('libelle: `Objets du \\`jardin\\``,');
    expect(t).toContain('{ rang: 10.5, texte: `- \\`objetJardin\\` : les objets du jardin.` },');
  });
});

describe('compter ce qui change', () => {
  it('une ligne remplacée compte pour une ligne modifiée, deux lignes changées', async () => {
    const { lignesModifiees } = await import('../../../../src/regles/sujets/edition.js');
    const d = diffLignes('a\nb\nc', 'a\nX\nc');
    expect(lignesChangees(d)).toBe(2);
    expect(lignesModifiees(d)).toBe(1);
    expect(lignesModifiees(diffLignes('a', 'a\nb\nc'))).toBe(2);
  });
});
