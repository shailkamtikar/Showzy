# Showzy

**See the view before you book.** Browse movies, matches and concerts, walk into the exact hall or stadium in 3D, pick seats, preview the view from your seat, and check out through a clearly labelled **simulated** payment gateway. An anti-scalping engine with rules, policy and Gemini-assisted investigations protects the inventory.

> Demo project. No real tickets, no real payments. Venues and listings are fictional.

Full spec: [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md)

## Stack

| Layer | Tech |
|---|---|
| Web | React 19, Vite, TypeScript, Tailwind v4, Motion, Lenis smooth scroll, React Three Fiber (3D), TanStack Query |
| API | Python 3.12, FastAPI, psycopg 3 (direct Postgres transactions and row locks) |
| Data / auth | Supabase Postgres + Supabase Auth (JWT verified via JWKS), Row Level Security |
| AI | Gemini **`gemini-3.5-flash-lite`** (locked), orchestrated with LangGraph; advisory only |

## Run locally

Prerequisites: Node 20+, Python 3.12, a Supabase project.

1. **Env.** Copy `.env.example` to `.env` at the repo root and fill in the Supabase, Gemini and pepper values. One file serves both apps; only `VITE_*` variables reach the browser.
2. **API.**
   ```powershell
   cd api
   python -m venv .venv
   .\.venv\Scripts\python -m pip install -r requirements-dev.txt
   .\.venv\Scripts\python scripts\migrate.py up
   .\.venv\Scripts\python scripts\seed.py
   .\.venv\Scripts\python scripts\create_demo_users.py
   ```
   `create_demo_users.py` makes three confirmed accounts (`demo-admin@`, `demo-customer@`, `demo-customer2@example.com`) and writes their generated passwords into your `.env` as `DEMO_*_PASSWORD`.
3. **Web.**
   ```powershell
   cd web
   npm install
   ```
4. **Start both.** Run `.\scripts\dev.ps1`, or start them by hand:
   ```powershell
   cd api; .\.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload
   ```
   ```powershell
   cd web; npm run dev
   ```
   Open http://localhost:5173. The API docs are at http://localhost:8000/docs.

### Demo walkthrough

1. Browse the catalog, open a movie, and pick a showtime. The two cinema halls have different layouts and prices.
2. Pick seats in **3D** or on the **2D map**, then press **Preview view** on a selected seat.
3. Sign in as `demo-customer@example.com` (the password is in `.env`), continue to checkout, and pay with the **demo code** shown.
4. Your demo tickets are under **My bookings**.
5. Run `.\.venv\Scripts\python scripts\simulate_scalper.py` in `api/`. Then sign in as `demo-admin@example.com` and open **Security** to see the case, the reasons behind it, the AI analysis and the review actions.

Reset the demo data at any time with `python scripts/seed.py --reset`. This also clears demo orders on the seeded shows.

## Tests

| Suite | Command | Covers |
|---|---|---|
| API unit + integration | `cd api; .\.venv\Scripts\python -m pytest -q` | layouts, fees, rules, policy, redaction, AI client; JWT, RLS, holds, concurrency, expiry, orders, payments, rate limits, security cases, admin |
| Web unit | `cd web; npm test` | env guard, money formatting, status page |
| End-to-end + a11y | `cd web; npx playwright test --grep-invert screenshots` (API must be running) | guest browsing, 2D/3D selection, preview, full booking with wrong and right codes, ticket isolation, admin access, axe checks, 375px and reduced motion |
| Secret scan | `.\scripts\secret_scan.ps1` | tracked files + built bundle |

The integration tests run against your Supabase dev project. They create throwaway `test-*@example.com` users and delete them afterwards.

## Design decisions worth knowing

- **3D that costs about what a 2D page costs.**
  - *Renders on demand:* zero frames while still (asserted in the E2E suite), and every camera move is time-based, so a dropped frame never changes the motion.
  - *Cheap to draw:* every seat is one instanced draw call, the stand concrete is a second and the seated crowd a third, about 7 draw calls for a whole stadium. Geometry is procedural from seat data: no models, and only small canvas textures.
  - *Lazy:* three.js loads only when the 3D opens.
  - *Adapts to the device:* low, mid and high tiers set resolution and antialiasing; resolution drops at runtime if animated frames are slow; very low-end phones open on the 2D map.
  - *Touch:* no per-move hit-testing, only on taps.
  - *Context safety:* WebGL support is probed once and the probe context released. Re-probing on every render used to exhaust the browser's GPU contexts and turn the viewer black after a couple of seat picks; this is now a regression test. If the GPU ever drops the context, the viewer offers to reload in place.
- **3D flow.** Tap a seat and the camera flies onto it, with a seat card showing distance to screen, how much of your view the screen fills, and off-centre angle. **View from this seat** dives into your eye position: drag to look around, scroll to zoom, pills switch between your seats, Esc steps back out. In a stadium, the first tap on a stand takes you there and the next tap picks a seat.

- **Server-authoritative booking.** Holds are created by the `create_hold` Postgres function, which locks rows in id order and is all-or-nothing. Prices are snapshotted on the order, and the browser never sends an amount.
- **Expiry without a worker.** Holds expire at query time and through opportunistic cleanup, so a sleeping free-tier server stays correct.
- **Demo payment.** Each attempt gets a random `DEMO-XXXX-XXXX` code, and only its HMAC is stored. Confirmation is one atomic, idempotent transaction (`confirm_demo_payment`). The code is shown on the same page it is typed into, so it is a confirmation step, **not** authentication.
  - *Spec deviation:* opening the gateway without the in-memory code (a new tab, say) issues a fresh code and invalidates the old one.
- **Security.** Events are recorded with allowlisted metadata and HMAC'd IPs. Rate limits are DB-backed. Detection rules give explainable scores, and a policy engine applies a temporary hold limit.
  - No automatic bans: humans review cases. An IP-only signal never opens a case on its own.
  - Login-failure detection is out of scope, because those failures happen inside Supabase Auth.
- **AI.** LangGraph runs gather → analyst → investigator → responder, with at most 3 model calls. The model never writes SQL or changes any state, and hypotheses that cite non-existent evidence are dropped.
  - If Gemini is unavailable, a deterministic summary is shown and nothing else changes.

## Free-tier limitations (for later deployment)

- Render free instances sleep when idle, so the first request can take about a minute. The UI shows a "server waking up" banner.
- Gemini free-tier quotas change. AI is optional and the app works without it.
- Rotate every key that was ever shared outside your password manager before deploying.
