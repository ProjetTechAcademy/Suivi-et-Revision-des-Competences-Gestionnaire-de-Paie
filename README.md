# Corpus Campus PAÏA

Base de connaissances privée construite avec Next.js, React et TypeScript. L’application permet d’explorer les métadonnées réelles du corpus, d’interroger ses contenus et d’afficher les ressources ayant alimenté une réponse sans exposer les documents sources.

## Architecture active

Le flux actif repose sur :

1. **Google Apps Script V002**, qui lit le catalogue maître `07_CATALOGUE_CORPUS` ;
2. **l’API Corpus Campus PAÏA**, qui authentifie la synchronisation côté serveur ;
3. **Qdrant**, qui indexe et recherche les contenus ;
4. **Groq**, qui génère une réponse à partir des extraits retrouvés ;
5. **`CAMPUS_SYNC_SECRET`**, utilisé exclusivement côté serveur pour authentifier la synchronisation.

Le catalogue maître décrit **1 833 ressources réelles** et **6 positions réservées** portant `Type ressource = EMPTY`. L’indexation effectue un upsert par `resourceCode` / `document_key` : une ressource existante est remplacée, jamais ajoutée comme doublon.

## Configuration

Copier `.env.example` vers `.env.local`, puis renseigner uniquement dans l’environnement d’exécution :

```text
GROQ_API_KEY
GROQ_MODEL
QDRANT_URL
QDRANT_API_KEY
QDRANT_COLLECTION
CAMPUS_SYNC_SECRET
```

Ne jamais committer de secret ou de valeur réelle. Les clés, URL privées, identifiants Drive et chemins sources ne doivent jamais être transmis au navigateur.

## Démarrage

```bash
npm install
npm run dev
```

## Lecture du corpus

- `POST /api/search` recherche dans Qdrant puis produit une réponse avec Groq.
- `GET /api/catalog` lit séparément les métadonnées publiques utiles à l’Explorer (formation, bloc, module, type, titre, code et Pulse).
- Le bouton **Ouvrir la ressource** est volontairement inactif tant qu’un service d’accès authentifié, capable de résoudre un code interne côté serveur, n’est pas branché. Aucune URL Drive privée n’est intégrée au HTML.
- La zone **Mise à jour & veille** ne revendique aucune vérification Internet. Un futur service de veille devra fournir la date, le statut et les sources officielles avant de pouvoir afficher ces informations comme vérifiées.

## Synchronisation et compatibilité

Les routes utilisées par `SYNC_FULL` et Google Apps Script V002 restent les suivantes :

- `POST /api/admin/index-document` ;
- `GET /api/controller/ping` ;
- `POST /api/controller/setup-search` ;
- `GET /api/controller/corpus-stats` ;
- `POST /api/controller/index-document` (compatibilité).

Elles acceptent les en-têtes de compatibilité prévus et comparent les justificatifs uniquement à `CAMPUS_SYNC_SECRET` côté serveur. Leur modification ou leur suppression doit faire l’objet d’une migration séparée et contrôlée.

Les anciens fichiers liés à une architecture précédente peuvent rester présents tant qu’une route existante les importe. Ils ne décrivent pas l’architecture active et ne doivent pas être supprimés sans audit dédié.

## Actifs de marque

Les fichiers officiels de `public/brand/` ne doivent être ni convertis, ni recadrés, ni recolorés, ni renommés.
