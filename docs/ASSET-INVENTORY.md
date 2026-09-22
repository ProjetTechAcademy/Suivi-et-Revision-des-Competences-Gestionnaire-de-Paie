# Inventaire des actifs — mise à jour du 22 septembre 2026

## Actifs officiels requis à l’exécution

Les fichiers suivants doivent être téléversés séparément dans GitHub, car le connecteur de pull request Codex ne prend pas en charge les binaires :

- `public/brand/paia-symbol.png` : symbole PAÏA officiel.
- `public/brand/paia-logo.png` : logo PAÏA officiel.
- `public/brand/mmpa-logo.png` : logo MMPA officiel.
- `public/reference/campus-home-reference.png` : représentation officielle fournie de Pia.

## Références de conception non requises au déploiement

- maquette de la fiche Campus PAÏA ;
- guide graphique PAÏA.

Ces deux fichiers restent dans le dossier de conception local et n’ont pas besoin d’être publiés avec l’application.

## Protection de la marque

Les actifs à téléverser sont les fichiers originaux reçus. Aucun pixel, texte, ratio ou colorimétrie ne doit être modifié. Le code les référence directement avec `next/image` et `object-fit: contain`.
