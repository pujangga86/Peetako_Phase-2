# Peetako — Phase 2

Raise a square-faced gecko from Malaysian Borneo. One Cloudflare Worker serves the static pages and the API; D1 stores the pets.

This is a **separate build** from the Phase 1 prototype: its own repository, Worker (`phase-2`), D1 database (`peetako-p2`) and `KEY_PEPPER`. Phase 1 is not touched.

## Phase 2 is shipped in three slices

| Slice | Contents | Status |
|---|---|---|
| 2A — foundation | 6-character Call Codes (`PTK-XXXXXX`), compressed tiers (Day 0/1/2/4/7/14/21/30/60), Ascension soft cap at Tier 8 (Day 90), "Immortal" renamed "Ageless", no halo on fallen pets, five mood faces with floating symbols, sky that follows the device clock | live since 14 Oct 2026 |
| **2B — look** | Retro frame, five palettes (Hijau Rimba, Tokay, Kenyalang, Pua Kumbu, Laut Borneo), palette chosen once at hatch, Immersive / Classic views, Robot line art per tier and palette, nine tier backdrops, sound | **this release** |
| 2C — social and economy | Coins (care +10 each, max 30/day; daily check-in +10; 7-day streak +30; mini-game 1 per 5 fireflies, max 50/day; tier-up +50 × tier; referral +100, max 3/day), cosmetics (100 / 300 / 800, backdrop 500), gifts (max 5/day), Tangkap Kelip-kelip and leaderboards, name filter and Report, share and invite buttons, Pamper and battle animations on a neutral arena | later |

### What 2B changes

- **Art** (`public/assets/art.js`, `palettes.js`): the gecko from the "Peetako Retro Frame" mockups, in five palettes, for Organic and Robot, with tier accessories and the nine tier backdrops; mood faces follow the "Character Concepts" mood boards. Tier 7 shows an orbit of fireflies (Robot: small drones) and Tier 8 a gold aura with awan larat curls and a gold headcloth (Robot: glowing core and floating diamonds) — no halo, rays or crown (GDD, Cultural sensitivity). The tanjak, Terabai shield and hornbill feathers still need the cultural reviewers.
- **Palettes**: column `pet.palette` (migration `0002_palette.sql`, already applied to `peetako-p2`). The owner picks one of the five palettes on the hatch screen; `POST /api/register` requires `palette` (`bad_palette` if missing or unknown). The colour is fixed for life: `POST /api/palette` always answers `403 palette_locked`, and there is no colour option in the menu. Pets hatched before this change keep the palette they have. The frame, buttons and page colour follow the palette.
- **Views**: *Immersive* (default) — the scene fills the window, a thin top bar with name, tier, bell and menu, and a dock with four buttons that each carry their stat as a bar and a pulsing "!" below 40, over a gold tumpal trim. *Classic* — the retro frame with a square screen, segmented stat bars, the four buttons and the Call Code. Desktop: Classic puts the controls beside the frame; Immersive puts a 2×2 control panel on the right. The choice lives in `localStorage` (`peetako_view`) on that device.
- **Menu** (☰): view, colour, sound on/off, full screen (where the browser supports it), FAQ/About/Privacy/Contact, Leave this device.
- **Sound** (`public/assets/sound.js`): the synthesized module from 11 Oct 2026, off by default; plays on care, hatch, tier up and errors.
- **Stats** keep their four server names; on screen they read FOOD / CLEAN / WARM / FUN (Organic) and POWER / OIL / COOL / FUN (Robot).

### What 2A changes

- **Call Code**: `PTK-` plus 6 characters from 31 unambiguous symbols (about 887 million codes).
- **Tiers**: Tier 8 (Ageless / Singularity) at Day 60. Survival windows are unchanged (48 h up to 14 days).
- **Ascension** (`POST /api/ascend` with `{ "confirm": true }`): open to an *active* Tier 8 pet after Day 90. Permanent. The pet stops decaying and can no longer fall; it keeps its record with a **Legacy Score** = whole days lived + 2 × distinct UTC days with care. Bond and battle wins join the score in Phase 3, with the stronger Legacy Egg. Declining is the default: the pet simply keeps living.
- **Soft cap**: `rankAgeHours` in the pet view stops at Day 90, ready for rankings.
- **Mood** (browser only, `public/assets/mood.js`): a stat under 40 shows its need — Hunger → *hungry* (thought bubble with kelkatu, or a battery for Robot), Warmth/Cooling → *sleepy* (Z letters), Hygiene/Maintenance or Mood → *sad* (rain cloud). No needs: *happy* (hearts), or *excited* (sparkles) when every stat is 85+ or for 8 seconds after a care action. Dormant pets look sleepy. At most two symbols. Each mood has its own face shape and a text chip, so it reads without colour; animations stop for reduced motion. Robot uses LED-eye shapes and the antenna bulb.
- **Sky** (browser only, `public/assets/sky.js`): dawn 05:30–07:00, day 07:00–17:30, dusk 17:30–19:30, night 19:30–05:30 by the device clock, blended over 30 minutes. Test any phase with `?sky=dawn`, `?sky=day`, `?sky=dusk` or `?sky=night` in the address. (2B recoloured the scenery per phase from the mockup.)

## Project layout

```
src/index.js        Worker: API routes, sessions, rate limits, daily + hourly crons
src/store.js        Data layer: the only file that talks to D1 (all SQL lives here)
src/push.js         Care alerts: Web Push encryption (RFC 8291), VAPID (RFC 8292), alert rules
src/game.js         All game rules and tunable numbers (tiers, decay, actions, Ascension)
src/wordlist.js     EFF Large Wordlist (7,776 words) for Secret Keys
migrations/         D1 schema
public/             Static site: game (index.html), FAQ, About, Privacy, Contact, 404, ads.txt
public/assets/      app.js (client), art.js (gecko, Robot, accessories, backdrops, mood symbols), palettes.js, mood.js, sky.js, sound.js, style.css
public/sw.js        Service worker: install/offline shell, shows care alerts
public/icons/       App icons; public/splash/ iOS launch images
wrangler.jsonc      Worker config (D1 binding, cron, vars)
```

## Deploy (GitHub → Cloudflare Workers Builds)

The D1 database `peetako-p2` already exists in the **Peetako** Cloudflare account (APAC) and its schema
(`migrations/0001_init.sql`) is applied and recorded as applied. Its ID is in `wrangler.jsonc`.

1. Create a new, empty GitHub repository named **`Peetako_Phase-2`** and push this whole folder to it
   (the repository root holds `.github/` and `peetako/`).
2. Cloudflare dashboard (Peetako account) → **Workers & Pages → Create → Import a repository** → pick `Peetako_Phase-2`.
   - Project name: `phase-2`
   - Root directory: `peetako`
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy`
3. After the first deploy: Worker `phase-2` → **Settings → Variables and Secrets → Add** a **Secret** named
   `KEY_PEPPER` with a NEW long random value (64 random characters). Do not reuse Phase 1's value, keep a copy in your
   password manager, and **never change it later** — every Secret Key would stop working.
4. Turn on the `workers.dev` route (Production) and open `https://phase-2.<your-subdomain>.workers.dev`.

Every `git push` to `main` redeploys automatically. The two cron triggers (daily cleanup at 02:00 Malaysia time and the
hourly care-alert run) come from `wrangler.jsonc`.

### Optional: Turnstile (human check on hatching)

1. Cloudflare dashboard → **Turnstile → Add widget** for your domain(s).
2. Put the **site key** in `wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`, push.
3. Add the **secret key** as a Worker secret named `TURNSTILE_SECRET`.

Without these, hatching works with no human check (fine for a private prototype).

### Care alerts (Web Push)

Alerts stay switched off until both steps are done:

1. The alert tables are already part of `0001_init.sql` on `peetako-p2`.
2. Add a Worker **Secret** named `VAPID_PRIVATE_KEY` (the private half of the key pair whose public half is
   `vars.VAPID_PUBLIC_KEY`). Changing the key pair later means every player must turn alerts on again.
   If you no longer have the private half of the key pair in `wrangler.jsonc`, make a new pair with
   `node scripts/vapid-keys.mjs`, put the public half in `vars.VAPID_PUBLIC_KEY` and the private half in the secret.

The hourly cron (`5 * * * *`) sends at most `PUSH_MAX_PER_RUN` alerts per run (Workers Free: 50 outgoing requests and
10 ms CPU per run). Rules and wording are in `src/push.js`.

### Custom domain

Worker → **Settings → Domains & Routes → Add custom domain** (e.g. `peetako.com`) once the domain is on Cloudflare.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # sets KEY_PEPPER for local only
npm run db:migrate:local
npx wrangler dev --test-scheduled     # http://localhost:8787
npm run cron:test                     # run the daily cron once
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=5+*+*+*+*"   # run the hourly alert cron once
```

## Regression test

```bash
npm test               # compare behaviour with test/golden.json (about 10 seconds, offline)
npm run test:update    # after an INTENDED behaviour change: rewrite the golden, then review its diff
```

`test/regression.mjs` runs the real Worker against a throwaway local D1 built from `migrations/`, with a fixed clock, fixed randomness and a mocked push service. It registers pets, logs in, cares, trips the rate limits, subscribes and unsubscribes devices, runs the hourly alert cron (delivered, expired and failed pushes) and the daily cron (deaths, cleanup), then compares every API response, every outbound push request and a snapshot of every table with `test/golden.json`. It never touches the real database and needs no secrets (it generates throwaway keys on each run). The Phase 2A scenario also raises one pet for 93 days of daily care and checks every Ascension rule (not confirmed, too young, dormant, success, twice, and that an ascended pet never falls). Tested on Node 22.

## Schema changes later

Add a new file such as `migrations/0002_coins.sql` (2C), then run `npm run db:migrate:remote` (needs `npx wrangler login`), or paste
its SQL into the D1 console. Migration `0001_init.sql` is already recorded as applied on `peetako-p2`.

## Tuning

Every number from the GDD (tier days, survival windows, decay per hour, action gains) is in `src/game.js`. They are first proposals for playtesting.

## Credits

Secret Keys use the EFF Large Wordlist (Electronic Frontier Foundation, believed CC BY 3.0 US — confirm before launch).
