// Unites marquees (spec-migration-typescript.md §5.5).
//
// Le marquage n'existe qu'a la compilation : a l'execution ce sont des `number`, donc aucune
// conversion, aucun cout, et le code deplace depuis legacy.ts garde exactement le meme
// comportement. Il sert a empecher qu'un centimetre finisse la ou on attend un metre - confusion
// que ce projet manipule en permanence (hauteurs en mm, entraxes en cm, plan en m).
//
// Portee volontairement limitee (§5.5) : engine, geometry, geo/projection, export/pdf et le type
// Construction. Les valeurs saisies dans les formulaires restent des `number` : on convertit a la
// frontiere, marquer le DOM couterait plus de ceremonie qu'il ne rapporte.

declare const marque: unique symbol;
type Unite<T, B> = T & { readonly [marque]: B };

export type Metres = Unite<number, 'm'>;
export type Cm = Unite<number, 'cm'>;
export type Mm = Unite<number, 'mm'>;
export type Cm2 = Unite<number, 'cm2'>;
export type PtPdf = Unite<number, 'pt'>;
export type Degres = Unite<number, 'deg'>;
export type Radians = Unite<number, 'rad'>;
export type MinutesDuJour = Unite<number, 'minOfDay'>;
export type Euros = Unite<number, 'EUR'>;
export type DaNParM2 = Unite<number, 'daN/m2'>;

export const m = (n: number): Metres => n as Metres;
export const cm = (n: number): Cm => n as Cm;
export const mm = (n: number): Mm => n as Mm;
export const deg = (n: number): Degres => n as Degres;

export const mVersCm = (v: Metres): Cm => (v * 100) as Cm;
export const cmVersM = (v: Cm): Metres => (v / 100) as Metres;
export const mmVersM = (v: Mm): Metres => (v / 1000) as Metres;
export const degVersRad = (v: Degres): Radians => ((v * Math.PI) / 180) as Radians;
export const radVersDeg = (v: Radians): Degres => ((v * 180) / Math.PI) as Degres;
