
  # Listly

  A shared list app for families, friends & teams — register/login with an
  account, or use guest mode (no account, backed by a local + server-side
  session so you can rejoin from the same device even after clearing your
  browser cache).

  ## Project layout

  - `src/` — React + Vite frontend (mobile-shaped UI).
  - `server/` — Node.js + Express + PostgreSQL (via Prisma) backend API.
  - `docker-compose.yml` — local Postgres for development.

  ## Running the code locally

  You need three things running: Postgres, the API server, and the frontend.

  1. **Start Postgres**
     ```
     docker compose up -d
     ```
     This runs Postgres on `localhost:5433` (chosen to avoid clashing with
     any other local Postgres on the default 5432).

  2. **Start the API server** (first time: copy `server/.env.example` to
     `server/.env` and fill in real secrets — the example values are
     placeholders)
     ```
     cd server
     npm install
     npm run prisma:migrate   # applies the schema, first run only (or after schema changes)
     npm run dev              # http://localhost:4000
     ```

  3. **Start the frontend** (in a separate terminal, from the repo root)
     ```
     npm i
     npm run dev               # http://localhost:5173 (or next free port)
     ```
     The frontend talks to the API through a Vite dev proxy (`/api` →
     `http://localhost:4000`), configured in `vite.config.ts` — no CORS
     setup needed in dev.

  ## How auth works

  - **Guest mode** is the default: on first load the app silently creates a
    guest identity and stores its tokens in `localStorage`. If that storage
    is cleared, the app asks the server whether it recognizes this device
    (IP + a browser/device fingerprint) as a recent guest, and if so prompts
    "Is this you?" before restoring anything — it never restores silently.
  - **Register / Log in** are available from the welcome screen for a real
    account synced across devices.
  - Any group member can invite others via the group's invite code; only
    the group **admin** (the creator, or whoever is auto-promoted if the
    admin leaves) can remove a member.

  See `server/.env.example` for all configurable options (token lifetimes,
  CORS origin, guest-recovery window, etc).
