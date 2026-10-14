# Adjustment Support

A web tool for appraisers: load MLS sales, run several adjustment methods per feature, reconcile a market-supported adjustment, and export documents for the workfile. Built for your own appraisal practice (see `replica/` for how it was planned and verified).

## Run it

```bash
npm install
cp .env.example .env.local     # optional; with no DATABASE_URL a local database is used
npm run build && npm start     # http://localhost:3000, create your account on first visit
npm test                       # unit tests (the real-data tests are skipped unless .sample/ has your MLS exports)
```

Backend details, setup for a hosted database, password reset and the security checklist: `replica/backend.md`.

Your MLS exports are private: `.sample/` and `.data/` are gitignored.
