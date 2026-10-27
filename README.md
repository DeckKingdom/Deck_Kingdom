# Deck Kingdom Ops

Internal operations platform for Deck Kingdom Ltd. Module 1: import/shipment planner.

## Structure
- `src/modules/` - one file per app module (ImportPlanner today; CRM modules later)
- `src/lib/core.js` - shared constants, helpers and calculations
- `src/data/storage.js` - swappable storage adapter (Claude preview / localStorage now, Supabase in Phase 2)
- `scripts/build-preview.mjs` - bundles the app into one file for Claude's chat preview

## Commands
- `npm install` - install dependencies
- `npm run dev` - run locally at localhost:5173
- `npm run build` - production build (what Vercel runs)
- `npm run build:claude-preview` - single-file bundle for the Claude preview window

## Deployment (Phase 2)
Push to GitHub -> Vercel builds and deploys automatically. Data moves from
browser storage to Supabase behind `src/data/storage.js`.
