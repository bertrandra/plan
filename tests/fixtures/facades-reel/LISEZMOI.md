# Corpus de façades réelles

Photos prises sur place, ouvertures annotées à la main : la seule base honnête pour juger la détection (le banc
`tests/fixtures/facades` est de synthèse). Format et mesure : `tests/banc/facades/reel.ts`.

```bash
# 1. des brouillons depuis un fichier d'audit de parcelle (photo + coins du calage + ouvertures du relevé)
npx tsx .claude/skills/facades/scripts/reel.ts extraire ~/audit-….json
# 2. relire chaque brouillon SUR LA PHOTO : corriger les ouvertures, vérifier les quatre coins, puis "statut": "valide"
# 3. mesurer (précision, rappel, cotes, fiabilité de la confiance ; avec et sans fusion + vote)
NODE_PATH=$(npm root -g) npx tsx .claude/skills/facades/scripts/reel.ts mesurer
```

- Un `brouillon` n'est **pas** une vérité : c'est ce que Plan avait proposé. Seuls les cas `valide` comptent.
- Visez des cas variés : brique, enduit, pierre, volets, haie ou voiture devant, ton sur ton, vitrages qui reflètent, plusieurs
  photos d'un même mur (pour juger la fusion et le vote). Notez les `difficultes` pour lire les résultats par cause.
- Une photo personnelle est une donnée personnelle : n'ajoutez ici que des photos que vous pouvez conserver dans le dépôt.
- Ne réglez aucun seuil de la détection sur moins d'une vingtaine de cas valides : à cette taille, on surapprend.
