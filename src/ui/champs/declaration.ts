// La section « Déclaration préalable » de la parcelle du projet (ui/champs/).
//
// Le plan sait le terrain et les ouvrages ; il ne sait pas qui declare. Ces champs le disent, et
// se rangent sur la parcelle (`declaration`), avec le projet. Le bouton produit le cerfa 13703
// rempli et ses pieces (commande `export.declaration`).

import { decouperAdresse, ouvragesDeclares, remplirCerfa13703 } from '../../export/cerfa13703.js';
import type { DeclarationPrealable } from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

const EFFETS: Effet[] = ['inspecteur'];
const fr = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

const decl = (c: ContexteChamps): DeclarationPrealable => c.obj.declaration || {};
function poser<K extends keyof DeclarationPrealable>(c: ContexteChamps, cle: K, v: DeclarationPrealable[K] | undefined): void {
  const d: DeclarationPrealable = { ...(c.obj.declaration || {}) };
  if (v === undefined || v === '') delete d[cle]; else d[cle] = v;
  c.obj.declaration = d;
}

type CleTexte = 'nom' | 'prenom' | 'communeNaissance' | 'departementNaissance' | 'paysNaissance' | 'numero' | 'voie' | 'lieuDit' | 'localite' | 'codePostal' | 'telephone' | 'email'
  | 'terrainNumero' | 'terrainVoie' | 'terrainLocalite' | 'terrainCodePostal';

function texte(cle: CleTexte, libelle: string, placeholder = '', aide?: string): Champ {
  return {
    type: 'texte', cle: 'dp-' + cle, libelle, placeholder, effets: EFFETS, ...(aide ? { aide } : {}),
    lire: (c) => decl(c)[cle] ?? '', ecrire: (c, v) => poser(c, cle, v.trim())
  };
}

/** L'adresse du terrain lue a l'import : elle sert d'indication tant qu'on n'en saisit pas une autre. */
const adresseLue = (c: ContexteChamps) => decouperAdresse(String((c.obj.cadastre || {}).adresse || ''));

export function sectionDeclaration(c: ContexteChamps): Section {
  const lue = adresseLue(c);
  const r = remplirCerfa13703(c.objets, new Date(), ['DP1', 'DP2', 'DP4', 'DP6']);
  const ouvrages = ouvragesDeclares(c.objets);
  const champs: Champ[] = [
    texte('nom', 'Nom'), texte('prenom', 'Prénom'),
    {
      type: 'date', cle: 'dp-naissance', libelle: 'Date de naissance', effets: EFFETS,
      lire: (cx) => decl(cx).naissance ?? '', ecrire: (cx, v) => poser(cx, 'naissance', v || undefined)
    },
    texte('communeNaissance', 'Commune de naissance'), texte('departementNaissance', 'Département de naissance', '78'),
    texte('numero', 'Numéro', '12'), texte('voie', 'Voie', 'Rue des Lilas'), texte('lieuDit', 'Lieu-dit'),
    texte('localite', 'Localité'), texte('codePostal', 'Code postal'), texte('telephone', 'Téléphone'),
    texte('email', 'Adresse électronique', 'nom@exemple.fr'),
    {
      type: 'case', cle: 'dp-accepteEmail', libelle: 'Réponses par courriel', effets: EFFETS,
      aide: 'Recevoir les réponses de l\'administration, et ses lettres recommandées, à cette adresse électronique',
      lire: (cx) => !!decl(cx).accepteEmail, ecrire: (cx, v) => poser(cx, 'accepteEmail', v || undefined)
    },
    {
      type: 'choix', cle: 'dp-residence', libelle: 'Le projet concerne', effets: EFFETS,
      options: () => [{ valeur: 'principale', libelle: 'votre résidence principale' }, { valeur: 'secondaire', libelle: 'votre résidence secondaire' }],
      lire: (cx) => decl(cx).residence ?? 'principale', ecrire: (cx, v) => poser(cx, 'residence', v === 'secondaire' ? 'secondaire' : undefined)
    },
    texte('terrainNumero', 'Terrain : numéro', lue.numero, 'Laissez vide pour reprendre l\'adresse lue au cadastre'),
    texte('terrainVoie', 'Terrain : voie', lue.voie), texte('terrainLocalite', 'Terrain : localité', lue.localite),
    texte('terrainCodePostal', 'Terrain : code postal', lue.codePostal),
    {
      type: 'lecture', cle: 'dp-ouvrages', libelle: 'Ouvrages déclarés',
      valeur: () => ouvrages.length ? ouvrages.map(o => o.nom + (o.emprise ? ' (' + fr(o.emprise) + ' m²)' : '')).join(', ') + ' — emprise au sol créée ' + fr(r.emprise) + ' m²' : 'aucun : dessinez une pergola, un carport ou une terrasse'
    }
  ];
  if (r.regime === 'permis') {
    champs.push({ type: 'alerte', cle: 'dp-permis', libelle: '', nom: 'Alerte : permis de construire', texte: () => 'Avec ' + fr(r.emprise) + ' m² d\'emprise au sol créée, le projet dépasse le seuil de la déclaration préalable : il relève d\'un permis de construire (cerfa 13406). Le dossier produit ici peut servir de base, pas être déposé tel quel.' });
  } else if (r.regime === 'aucune') {
    champs.push({ type: 'alerte', cle: 'dp-aucune', libelle: '', nom: 'Alerte : aucune formalité', texte: () => 'Moins de 5 m² d\'emprise au sol créée : aucune formalité, sauf en secteur protégé ou si le PLU en demande une.' });
  }
  champs.push({
    type: 'bouton', cle: 'dp-generer', libelle: '', nom: 'Générer le dossier de déclaration préalable', texte: () => 'Générer le dossier (cerfa 13703 et pièces)',
    agit: { commande: 'export.declaration' }, actif: () => ouvrages.length > 0, executer: (cx) => cx.executerCommande('export.declaration')
  });
  return {
    id: 'declaration', titre: 'Déclaration préalable', repliee: true,
    explication: 'Le cerfa 13703 rempli avec le terrain et les ouvrages, suivi des pièces DP1, DP2, DP4 et DP6. Pour la pièce DP6, générez le dossier depuis la Vue 3D (menu Exporter), cadrée comme vue de la rue. Complétez et signez le formulaire, ajoutez les photographies DP7 et DP8, puis déposez deux exemplaires en mairie ou le dossier sur le guichet numérique de votre commune.',
    champs
  };
}
