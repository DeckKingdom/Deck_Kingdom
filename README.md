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

## Deployment
Push to GitHub -> Vercel builds and deploys automatically.

## Data & auth (Phase 2)
- Hosted app runs against Supabase (Postgres + logins). Schema: `supabase/migrations/`.
- `src/data/storage.js` picks the adapter: Claude preview -> window.storage (design
  mode), hosted -> Supabase relational adapter, otherwise localStorage.
- Logins are created in Supabase (Authentication -> Users). Public sign-up should
  be disabled. Roles live in `public.profiles` (admin/office/warehouse), ready for
  row-level access rules.
