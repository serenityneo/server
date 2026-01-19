# KYC Module

Autonomous KYC verification module providing document analysis, OCR, and fake‑document detection APIs.

## Endpoints (prefix: `/api/v1`)

- `POST /validate`
  - Consumes `multipart/form-data` with fields:
    - `photo` (`image/jpeg|png`, optional) — profile or passport photo
    - `front` (`image/jpeg|png`, optional) — document front image
    - `back` (`image/jpeg|png`, optional) — document back image
    - `signature` (`image/jpeg|png`, optional)
    - `photoType` (`profile|passport|driver_license`, optional, default `profile`)
    - `customerId` (number, optional) — enable draft hash sync
    - `kycStep` (string, optional, default `step3`)
  - Returns validation report with computed score, detected type (via OCR+MRZ), messages, timers, and optional `dbSync` info.
  - Photo requirements (passport/profile):
    - Server resizes to `500x500` for processing; square or portrait accepted.
    - Recommended dimensions: `600x600` (minimum `500x500`).
    - Formats: prefer `image/jpeg` (PNG accepted but less recommended).
    - Background: uniform white (low variance), sufficient brightness.
    - Face: single, centered; neutral expression; eyes open; mouth closed; landmarks visible.
    - Quality: sufficient sharpness, reasonable contrast; avoid strong color cast.
    - Clear error codes when non‑compliant (e.g., `BACKGROUND_NOT_WHITE`, `PHOTO_TOO_BLURRY`, `FACE_CONFIDENCE_LOW`).

- `POST /kyc/license/verify`
  - Body: `{ "licenseNumber": "CD0123456", "ocrText": "..." }`
  - Scrapes CONADEP to verify license number; returns structured details when available.

## Module Structure

- `services/`
  - `analyzers.ts` — photo/signature/card analysis
  - `ocr.ts` — Tesseract OCR worker and MRZ detection
  - `hfVision.ts` — Hugging Face document realness scoring
  - `scoring.ts` — aggregate scoring and status finalization
- `routes/`
  - `validate.ts` — multipart validation flow
  - `license.ts` — license verification via CONADEP
- `index.ts` — `registerKycRoutes(app)` entrypoint; re‑exports `initOCR()`

## Initialization

- Server preloads OCR in `src/index.ts`:
  - `await initOCR()` during startup to reduce first‑request latency.
- Database sync is optional:
  - When `customerId` is provided, `validate` route upserts `kyc_drafts` hashes via shared `services/db`.
  - If DB is not configured or errors occur, validation proceeds without failing; `dbSync` reflects status.

## Notes for Integrators

- Accepts only `image/jpeg` or `image/png` for images; other MIME types return `415`.
- When no files are sent, returns `400`.
- `photoType` influences preprocessing and analysis heuristics.
- Hugging Face scoring requires `HF_TOKEN` env; absence gracefully degrades with a message.
 - Scoring is normalized by the set of checks present (e.g., photo only), so partial validations no longer appear as failed solely due to missing optional documents.

## Future Work

- Optional adapters to fully abstract DB calls behind module settings.
- Additional endpoint to return detailed server checks for UI.