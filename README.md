# Americano / Mexicano Padel Tournament

A simple organiser for a doubles padel tournament.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Optional Supabase setup

Create a Supabase project.
Copy `.env.example` to `.env`.
Add:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app will use Supabase automatically when both values are present.

## Features

- Player setup for 4 to 25 players
- 7-round competition (rounds 1–3 random, rounds 4–7 strength-based)
- 4-court schedule
- Fair bye handling
- Leaderboard
- Round input
- Schedule/results and leaderboard CSV exports
- Local storage persistence
- Demo mode

## Code

The tournament logic lives under `src/lib/tournament.ts`, with persisted state in `src/lib/storage.ts`.

## Validation

```bash
npm install
npm run test
npm run dev
```
