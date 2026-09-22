# Campus PAÏA

Base de connaissances personnelle construite avec Next.js, React, TypeScript et l’App Router.

## Démarrage

```bash
npm install
npm run dev
```

## Configuration du corpus

Copier `.env.example` vers `.env.local`. `OPENAI_API_KEY`, `OPENAI_VECTOR_STORE_ID` et `OPENAI_MODEL` restent exclusivement côté serveur. Sans cette configuration, `/api/search` répond explicitement « Corpus Campus PAÏA non connecté ».

Le catalogue maître reste l’onglet `07_CATALOGUE_CORPUS` du Projet 20. Le Google Apps Script transmet chaque position à `POST /api/admin/index-document`, avec le secret dans `x-campus-sync-secret` ou `Authorization: Bearer …`. La route accepte :

- du JSON pour les métadonnées et le texte extrait ;
- du `multipart/form-data` avec `metadata` (JSON) et `file` pour un PDF ou document textuel.

Chaque position reçoit un manifeste indexable, y compris les vidéos sans transcription, les `.webloc` et les six positions réservées. Les ressources sans plein texte restent ainsi recommandables par leurs métadonnées. Une ressource possédant un code bloc/module sans intitulé renvoie `422 metadata_incomplete` et une entrée structurée est écrite dans le journal serveur.

La synchronisation doit transmettre séparément `blockCode`, `blockTitle`, `moduleCode` et `moduleTitle`. Pour le Projet 15, les six intitulés de blocs connus sont restaurés côté serveur si nécessaire ; les intitulés des 46 modules doivent provenir des dossiers Drive et être transmis par le Google Apps Script.

## Actifs de marque officiels

Les fichiers PAÏA et MMPA originaux sont conservés sans modification dans `public/brand/`. Les maquettes et le guide graphique reçus sont archivés dans `public/reference/`. Ne jamais convertir, recadrer, recolorer ou écraser les actifs placés dans `public/brand/`.
