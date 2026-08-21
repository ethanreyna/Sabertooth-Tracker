# Sabertooth Adventurers Guild Tracker

Guild management app for the Keizaal Skyrim RP server: job board (with collection-job entries), barrel storage tracking with location screenshots, septims ledger, and member roster. Any member can edit; changes sync to a shared JSONBin database.

React 19 + TypeScript + Vite, managed with pnpm. No UI framework — plain inline-styled components.

## Run it

```sh
pnpm install
pnpm dev        # local dev server
pnpm build      # production build to dist/
pnpm typecheck  # tsc --noEmit
```

## Shared database (JSONBin)

Out of the box the app saves to localStorage only. To share one live database with the whole guild:

1. Create a free account at https://jsonbin.io
2. Create a bin with initial content `{"members":[],"jobs":[],"barrels":[],"ledger":[]}`
3. Copy the **Bin ID** and your **X-Master-Key** API key
4. In the app, click the gear icon at the bottom of the sidebar and paste both

Everyone using the same Bin ID + key sees the same data. The app pushes on every change (debounced) and pulls every 30 seconds.

Note: JSONBin free bins are capped at ~100KB. Barrel screenshots are stored as base64 inside the record, so keep them small (crop before uploading), or swap the screenshot field for an image-host URL.

## Deploy to GitHub Pages

`vite.config.ts` already sets `base: './'`. Either:
- push and add a Pages workflow that runs `pnpm build` and publishes `dist/`, or
- run `pnpm build` locally and publish the `dist/` folder to a `gh-pages` branch.
