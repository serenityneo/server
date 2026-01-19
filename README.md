# KYC Validator Server (Fastify)

Service Node.js pour la validation KYC (photos, signatures, OCR, e-cards) avec Fastify.

## Fonctionnalités
- Endpoint `POST /validate` (multipart) pour: photo, recto, verso, signature.
- Vérification faciale (facultative) via `@vladmandic/face-api` + `@tensorflow/tfjs-node` si les modèles sont présents.
- Détection de signature visible (heuristique).
- Validation OCR des mots-clés et MRZ (Tesseract).
- Heuristiques d’authenticité recto/verso (dimensions, hash perceptuel).
- Système de scoring agrégé et statut (`ok`, `flagged`, `failed`).
- Swagger disponible sur `/docs`.
- Logs structurés (pino) et protection de pression (`@fastify/under-pressure`).

## Démarrage local
1. Installer les dépendances: `npm install`
2. Lancer en dev: `npm run dev`
3. Ouvrir docs: http://localhost:8080/docs

## Modèles Face (optionnels)
- Placez les modèles dans `server/models` et définissez `FACE_MODELS_DIR=./models`.
- En absence de modèles, la détection faciale est désactivée sans erreur.

## Schéma d’intégration
- Le frontend peut appeler `/validate` avec les mêmes fichiers que le flux existant.
- Réponse contient `score`, `status` et des sections `photo`, `face`, `signature`, `front`, `back`, `ocr` avec `ok`, `messages`, `stats`.

## Performance
- Objectif `<500ms`: heuristiques rapides (sharp) et timeouts implicites.
- Heavy OCR/Face: activés seulement si disponibles.

## Docker
```
docker build -t kyc-validator:latest server
docker run -p 8080:8080 kyc-validator:latest
```

## Déploiement et auto-scaling
- Conteneur stateless, compatible auto-scaling (Kubernetes/Render/Heroku).
- Expose `/health`, et protège contre surcharge via `under-pressure`.

## Monitoring
- Utiliser logs pino + agrégation (ELK/Datadog). Ajoutez un endpoint `/metrics` si nécessaire.

## Swagger
- Documentation live via `/docs`.