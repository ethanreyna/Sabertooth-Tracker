# Sabertooth Adventurers Guild Tracker

Guild management app for the Keizaal Skyrim RP server: job board with searchable
Skyrim item collection lists, barrel storage tracking with location screenshots,
septims ledger, and member roster. Any member with the guild password can edit;
changes sync live to a shared database.

React 19 + TypeScript + Vite on the front end, a Cloudflare Worker with D1
(database) and R2 (screenshots) on the back end. No UI framework — plain
inline-styled components. Dark mode by default, light mode optional.

## Features

- **Job board** — post jobs with priority, reward, deadline, faction, and contact.
  "Posted for" and "Posted by" accept a roster member or any written-in name.
- **Collection jobs** — build a shopping list by searching a catalogue of Skyrim
  items (or type a custom one). Members log turn-ins with their name, the item,
  and the quantity; the job shows a progress bar per item against its target.
- **Barrels** — track renter, weekly rate (50 septims default), rental window,
  paid status, and a location screenshot.
- **Ledger** — income and spending with a running treasury balance.
- **Roster** — members with jobs claimed, jobs posted, and total items turned in.
- **Themes** — dark by default; toggle to light in the sidebar. Remembered per browser.
- **Shared by default** — one guild password opens the shared database for
  everyone; edits propagate to other members within ~10 seconds.

## Run it locally

```sh
pnpm install
pnpm dev        # front end on :5173, proxies /api to :8787
pnpm dev:api    # in a second terminal: the Worker + local D1 + local R2
pnpm typecheck  # tsc for both the app and the Worker
pnpm build      # production build to dist/
```

Without `pnpm dev:api` the app still runs — it just stays in local-only mode
(everything saves to `localStorage`).

For the local Worker to have a database, seed it once:

```sh
pnpm cf:d1:init:local
```

## Cloudflare setup (one time)

You need a free Cloudflare account. All three services used here — Workers, D1,
and R2 — have free tiers that comfortably cover a guild.

```sh
npx wrangler login          # opens a browser to authorise

pnpm cf:d1:create           # create the D1 database
                            # -> copy the printed database_id into wrangler.toml
pnpm cf:d1:init             # create the table in the remote database
pnpm cf:r2:create           # create the screenshots bucket
pnpm cf:secret              # set GUILD_PASSWORD — paste the shared password
```

Commit the `database_id` change, then deploy:

```sh
pnpm deploy                 # or let the GitHub integration do it (below)
```

### Deploying from GitHub

In the Cloudflare dashboard, connect this repo under **Workers → Create → Import
a repository**, then set:

- **Build command:** `pnpm install --frozen-lockfile=false && pnpm build`
- **Deploy command:** `npx wrangler deploy`

Every push to `main` then builds and deploys automatically. The D1 database, R2
bucket, and `GUILD_PASSWORD` secret must already exist (steps above) or the
deploy will fail.

## How syncing works

The whole guild database is one JSON document in a single D1 row, with a version
counter:

- `GET /api/db` returns `{ db, version }`.
- `PUT /api/db` sends `{ db, version }` and only succeeds if `version` still
  matches the server's. If someone else saved first the server replies `409`
  with its current copy, and the app replays your unsaved edits on top of it and
  retries. Two people editing at once merge instead of overwriting each other.
- `POST /api/upload` streams a screenshot into R2 and returns a
  `/api/img/<uuid>` URL, which is what gets stored on the barrel. Images no
  longer live inside the database, so there is no practical size cap.

Every endpoint except `/api/img/*` requires `Authorization: Bearer <guild
password>`, compared in constant time against the `GUILD_PASSWORD` secret.
Image URLs are unauthenticated (a browser `<img src>` cannot send headers) but
the keys are random UUIDs, so they are unguessable rather than secret.

The app re-reads the server every 10 seconds while the tab is visible (and
immediately when you switch back to it), and pushes edits ~800ms after you stop
typing.

**The server is the source of truth.** The password screen gates the whole app —
there is no local-only mode, because a guild tracker whose edits silently go
nowhere is worse than no tracker. On sign-in the server's copy always wins;
nothing from your browser is ever uploaded to seed it. `localStorage` holds only
your password and a read-only cache of the last synced state, shown with an
"Offline" warning if the server can't be reached, and cleared on sign-out.
