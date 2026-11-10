// L'inventaire des champs d'un schema JSON et d'un type TypeScript, a plat : un chemin par champ (`ouvertures[].carreaux.vantaux`),
// et ce qu'il peut valoir, en jetons (`number`, `integer`, `string`, `boolean`, `null`, `objet`, `liste`, `absent` pour un champ
// facultatif, `'mot'` pour un mot d'un vocabulaire ferme). Sert au garde-fou de la lecture des facades
// (tests/unit/regles/facades/champsLecture.test.ts) : un champ d'hier doit toujours exister, et chacun de ses jetons d'hier y etre.

import ts from 'typescript';

export type Inventaire = Record<string, string[]>;

const ajouter = (inv: Map<string, Set<string>>, chemin: string, jeton: string) => {
  if (!inv.has(chemin)) inv.set(chemin, new Set());
  (inv.get(chemin) as Set<string>).add(jeton);
};
const aPlat = (inv: Map<string, Set<string>>): Inventaire => Object.fromEntries([...inv].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));

type Noeud = { $ref?: string; anyOf?: Noeud[]; type?: string; enum?: unknown[]; properties?: Record<string, Noeud>; items?: Noeud };

/** Les champs d'un schema JSON (les `$ref` vers `$defs` resolus, `anyOf` reuni). */
export function inventaireSchema(schema: Noeud & { $defs?: Record<string, Noeud> }): Inventaire {
  const inv = new Map<string, Set<string>>();
  const defs = schema.$defs ?? {};
  const voir = (n: Noeud, chemin: string, profondeur: number): void => {
    if (profondeur > 20) return;
    if (n.$ref) { voir(defs[n.$ref.replace('#/$defs/', '')] ?? {}, chemin, profondeur + 1); return; }
    if (n.anyOf) { n.anyOf.forEach((x) => voir(x, chemin, profondeur + 1)); return; }
    if (n.enum) n.enum.forEach((v) => ajouter(inv, chemin, "'" + String(v) + "'"));
    else if (n.type === 'object') {
      ajouter(inv, chemin, 'objet');
      for (const [k, v] of Object.entries(n.properties ?? {})) voir(v, chemin ? chemin + '.' + k : k, profondeur + 1);
    } else if (n.type === 'array') {
      ajouter(inv, chemin, 'liste');
      if (n.items) voir(n.items, chemin + '[]', profondeur + 1);
    } else if (n.type) ajouter(inv, chemin, n.type);
  };
  voir(schema, '', 0);
  inv.delete('');
  return aPlat(inv);
}

/** Un programme TypeScript sur ces fichiers, avec les options du depot. */
export function programme(fichiers: string[]): ts.Program {
  return ts.createProgram(fichiers, { strict: true, exactOptionalPropertyTypes: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, noEmit: true, types: [] });
}

/** Les champs d'un type exporte (interface ou alias) d'un fichier, a plat, en suivant les objets, les listes et les unions. */
export function inventaireType(p: ts.Program, fichier: string, nom: string): Inventaire {
  const tc = p.getTypeChecker(), sf = p.getSourceFile(fichier);
  if (!sf) throw new Error('fichier absent du programme : ' + fichier);
  const module = tc.getSymbolAtLocation(sf);
  const sym = module ? tc.getExportsOfModule(module).find((s) => s.name === nom) : undefined;
  if (!sym) throw new Error('type absent : ' + nom + ' dans ' + fichier);
  const inv = new Map<string, Set<string>>();
  const voir = (t: ts.Type, chemin: string, pile: ts.Type[]): void => {
    if (t.isUnion()) { t.types.forEach((x) => voir(x, chemin, pile)); return; }
    if (t.isStringLiteral()) { ajouter(inv, chemin, "'" + t.value + "'"); return; }
    if (t.isNumberLiteral()) { ajouter(inv, chemin, String(t.value)); return; }
    const f = t.flags;
    if (f & ts.TypeFlags.BooleanLiteral) { ajouter(inv, chemin, 'boolean'); return; }
    if (f & ts.TypeFlags.Number) { ajouter(inv, chemin, 'number'); return; }
    if (f & ts.TypeFlags.String) { ajouter(inv, chemin, 'string'); return; }
    if (f & ts.TypeFlags.Boolean) { ajouter(inv, chemin, 'boolean'); return; }
    if (f & ts.TypeFlags.Null) { ajouter(inv, chemin, 'null'); return; }
    if (f & ts.TypeFlags.Undefined) { ajouter(inv, chemin, 'absent'); return; }
    if (f & ts.TypeFlags.Unknown || f & ts.TypeFlags.Any) { ajouter(inv, chemin, 'inconnu'); return; }
    if (tc.isArrayType(t) || tc.isTupleType(t)) {
      ajouter(inv, chemin, 'liste');
      const el = tc.getTypeArguments(t as ts.TypeReference);
      el.forEach((x) => voir(x, chemin + '[]', pile));
      return;
    }
    if (f & ts.TypeFlags.Object || t.isIntersection()) {
      ajouter(inv, chemin, 'objet');
      if (pile.includes(t) || pile.length > 12) return;
      if (tc.getIndexInfosOfType(t).length) ajouter(inv, chemin, 'dictionnaire');
      for (const prop of tc.getPropertiesOfType(t)) {
        const c = chemin ? chemin + '.' + prop.name : prop.name;
        if (prop.flags & ts.SymbolFlags.Optional) ajouter(inv, c, 'absent');
        voir(tc.getTypeOfSymbol(prop), c, [...pile, t]);
      }
      return;
    }
    ajouter(inv, chemin, tc.typeToString(t));
  };
  voir(tc.getDeclaredTypeOfSymbol(sym.flags & ts.SymbolFlags.Alias ? tc.getAliasedSymbol(sym) : sym), '', []);
  inv.delete('');
  return aPlat(inv);
}

/**
 * Ce qu'un inventaire d'aujourd'hui a perdu de celui d'hier : un champ disparu, ou un jeton d'hier qui n'y est plus (un mot retire du
 * vocabulaire, un nombre devenu texte, un champ facultatif devenu obligatoire, ce qui rend illisibles les fichiers qui ne l'ont pas).
 * Un champ ou un jeton nouveaux ne sont pas une perte.
 */
export function pertes(hier: Inventaire, aujourdhui: Inventaire): string[] {
  const out: string[] = [];
  for (const [chemin, jetons] of Object.entries(hier)) {
    const a = aujourdhui[chemin];
    if (!a) { out.push(chemin + ' : disparu'); continue; }
    const manquent = jetons.filter((j) => !a.includes(j));
    if (manquent.length) out.push(chemin + ' : ne peut plus valoir ' + manquent.join(', ') + ' (vaut ' + a.join(', ') + ')');
  }
  return out;
}
