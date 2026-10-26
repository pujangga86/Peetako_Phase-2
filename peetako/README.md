# Peetako — Phase 2

Raise a square-faced gecko from Malaysian Borneo. One Cloudflare Worker serves the static pages and the API; D1 stores the pets.

This is a **separate build** from the Phase 1 prototype: its own repository, Worker (`phase-2`), D1 database (`peetako-p2`) and `KEY_PEPPER`. Phase 1 is not touched.

## Phase 2 is shipped in three slices

| Slice | Contents | Status |
|---|---|---|
| 2A — foundation | 6-character Call Codes (`PTK-XXXXXX`), compressed tiers (Day 0/1/2/4/7/14/21/30/60), Ascension soft cap at Tier 8 (Day 90), "Immortal" renamed "Ageless", no halo on fallen pets, five mood faces with floating symbols, sky that follows the device clock | live since 14 Oct 2026 |
| 2B — look | Retro frame, five palettes (Hijau Rimba, Tokay, Kenyalang, Pua Kumbu, Laut Borneo), palette chosen once at hatch, Immersive / Classic views, Robot line art per tier and palette, nine tier backdrops, sound, cute moves | live since 14–17 Oct 2026 |
| **2C — social and economy** | Coins (care +10 each, max 30/day; daily check-in +10; 7-day streak +30; mini-game 1 per 5 fireflies, max 50/day; tier-up +50 × tier; referral +100, max 3/day), cosmetics (100 / 300 / 800, backdrop 500), gifts (max 5/day), Tangkap Kelip-kelip and leaderboards, name filter and Report, share and invite buttons, Pamper and battle animations on a neutral arena; chosen Call Codes and a 6-digit PIN | live since 17 Oct 2026; aligned with the GDD on 20 Oct 2026 (see below) |

### Alignment with the GDD (decided 20 Oct 2026; migration `0005_alignment.sql`)

A review of `main` against the GDD settled 17 points. Where this list differs from the 2C list below, this list applies.

- **Care coins**: +10 only for the *first* care action of each type per MYT day (Feed, Clean, Warm/Cool, Play; Robot: Charge, Oil, Cool, Update), at most 30 a day. `me.today.caredTypes` lists the types already paid.
- **Name and Call Code filter** (`src/filter.js`): religion and royalty terms added as whole words (Allah, Tuhan, Nabi, Sultan, Agong, Raja, Tunku and others), so Rajang and Tengkuk stay allowed.
- **Pamper and Bond**: Pamper gives *both* pets +5 FUN. Each pair shares Bond points (`bonds` table, `a < b`): Pamper +10, gift +20, battle +5, Mentor Boost +10. Levels 1 Friends (30), 2 Buddies (100, shared selfie drawn and saved in the browser), 3 Best Friends (250), 4 Forever Friends (500). Pamper, gift, battle and Mentor Boost answers carry `bond`; `GET /api/visit` carries `bond`, `contact`, `blocked`, `badges` and `can.mentor`.
- **Friends**: `GET /api/friends` (saved contacts with Bond, blocked pets), `POST /api/contact { code, save }` (up to 100), `POST /api/block { code, block }` (up to 200; blocking drops the contact). A blocked pet cannot Pamper, battle, gift or mentor its blocker and is told only "not accepting that right now"; the blocker can't act on it either until it unblocks.
- **Open to challenges**: `POST /api/challenges { open }`, a menu switch (on by default); the pet view carries `openToChallenge`.
- **Mentor Boost**: `POST /api/mentor { to }`. An active Tier 4+ pet boosts a living pet of a lower tier: 10% slower decay for 24 h (`pet.mentor_until`, on top of the Tier 3 rate). One per receiver per day, 3 per giver per day.
- **Hibernation** (automatic): when the survival window runs out, the pet hibernates instead of falling, using the days left in that MYT month (3 per month; `pet.hib_month`, `pet.hibernation_days_used`). Stats stop decaying while it sleeps. Care wakes it and counts the days slept (rounded up). `deathTime` = window end + days left; the view carries `hibernation { active, daysLeft, windowEndsAt, wakeBy }`. Care alerts follow the real deadline.
- **Legacy Egg**: `POST /api/legacy { pin, code, name, type, palette, remember }` from a session on a pet that fell at Day 30+ or ascended (`pet.legacy_claimed`, once). The PIN is checked against the old pet and carried over; the country carries over. The new pet is born a day ago (Tier 1, tier reward counted as paid), with half the old coins + 200 and every cosmetic (`passLegacy`); `legacy_from` points back. Refusals: `still_alive`, `too_young`, `legacy_claimed`, `wrong_pin`, plus the hatch checks.
- **Tangkap Kelip-kelip**: a run ends after 3 misses or 60 s; combo ×2/×3/×4 from 5/10/20 in a row; golden fireflies (about 1 in 12) are worth 5; fireflies speed up over the run. `POST /api/game/finish { run, score, fireflies }`: plausibility only (at least 2 s, at most 4 fireflies a second, score between fireflies and fireflies × 5 × 4); coins = 1 per 5 *fireflies*. An old client that sends only `score` is treated as fireflies = score.
- **Five mini-games** (20 Oct 2026, migration `0007_games.sql`): Tangkap Kelip-kelip, Ikut Rentak (repeat a sompoton/sape/agung/chik-chak pattern; 1 coin per round), Lidah Pantas (timed tongue flick at bugs; 1 coin per 5 bugs), Padan Motif (match Borneo motifs on boards of 6, 8 and 10 pairs, no clock; 1 coin per 3 pairs) and Panjat Pokok (climb a tree, dodge branches, beat the timer; 1 coin per 20 m). `POST /api/game/start { game }` (Kelip-kelip when left out) stores the game on the run; `POST /api/game/finish { run, ... }` judges the run by that game's rules (`judgeRun` in `src/economy.js`): the server works out the score itself for Ikut Rentak (`count` = rounds), Padan Motif (`count` = pairs, `misses`) and Panjat Pokok (`count` = metres), and checks plausibility for the tap games (`score`, `count`). Coins from all games share one 50-a-day cap (`daily` kind `game_coins`). Scores live in `game_best` (per game, pet and day), badges in `game_medals`; the old `game_scores` and `game_badges` tables were copied and are no longer used. `/api/leaderboard` and `/api/leaderboard/countries` take `?game=`; `/api/public` adds `bests` (best ever per game).
- **Daily top 3**: the daily cron gives yesterday's top 3 of each game a gold, silver or bronze badge (`game_medals`); `me.badges`, `/api/public` and `/api/visit` carry the totals over all games, shown beside the name.
- **QR codes**: on the public page and in the Share dialog, drawn in the browser with the vendored MIT `qrcode-generator` (`public/assets/vendor/qrcode.js`, wrapped by `public/assets/qr.js`).
- **Borneo sounds** (`public/assets/sound.js`, synthesized): sompoton-style reeds for care, a sape phrase for tier-up and hatch, an agung strike at battle start, the gecko's chik-chak for news; an optional sape music loop (menu, off by default, `peetako_music`; since 26 Oct 2026 a livelier ~132 BPM groove of four sape bars with drone and chik-chak ticks).
- **Ads**: an empty, hidden `#ad-slot` container sized 320×50 / 728×90 below the game, ready for the AdSense unit once approved.
- Kept as built (GDD updated to match): friendly battles, player country, the +50 invite bonus for the new player, the device-based default view, no Tier 7 title, sound on by default, no Turnstile on unlock, the check-in streak.

### What 2C changes (decided 14–17 Oct 2026)

- **Call Code and PIN** (`src/codes.js`, `src/index.js`): the player chooses the Call Code at hatch — `PTK-` plus 6 to 8 letters and digits (O, I and L allowed). Uniqueness and login treat 0 as O and 1/L as I. *Ideas* suggests free, partly Borneo-themed codes (`GET /api/code/suggest`); the field checks availability as you type (`GET /api/code/check`). Locked after hatch. The four-word Secret Key is gone: a 6-digit PIN (very easy PINs refused) is stored as an HMAC with `KEY_PEPPER`. 5 wrong PINs lock the pet for 15 minutes, 20 in a MYT day lock it for 24 hours. No recovery; a signed-in device can change the PIN (`POST /api/pin`, other devices are signed out). Login: `POST /api/login { code, pin, remember }`.
- **Coins** (`src/economy.js`): care +10 (max 30/day), daily check-in +10 and +30 on every 7th day in a row (`POST /api/checkin`), tier-up +50 × tier (paid once per tier, also for tiers reached while away), mini-games (max 50/day shared by all five games; Tangkap Kelip-kelip 1 per 5 fireflies), invite +100 to the inviter (max 3/day) and +50 to the new player, settled at the new pet's first care action after its first day; self-invites from the same network are void. All daily limits reset at 00:00 Malaysia time.
- **Cosmetics**: head (beaded headband 100, terendak hat 300), neck (bead necklace 100, pua sash 300), back (firefly wings 800, parasol 800), backdrops (Kinabalu from Kundasang, Rajang River — 500). Robot versions of each. `GET /api/shop`, `POST /api/shop/buy` (a bought item is worn straight away), `POST /api/equip { slot, item | null }`. Drawn in `art.js` (`wear` option of `drawPet`, `backdrop` option of `drawScene`).
- **Friends**: `GET /api/visit?code=` (public view + what you can do), `POST /api/gift { to, item }` (you pay the price, max 5/day, no resale), `POST /api/pamper { to }` (+5 FUN, 3/day, once per pet per day, not counted as care), `POST /api/battle { to }` (stats × 0.6 + tier × 6 + luck 0–20; no penalty, no coins; 5/day; both pets hatched, yours active). Animations on a neutral arena (`public/assets/arena.js`). What happened while you were away (gifts, Pampers, battles, invites) shows as news (`me.events`, `POST /api/events/seen`).
- **Tangkap Kelip-kelip** (`public/assets/kelip.js`): full-screen, 45-second runs (now 60 s / 3 misses, see Alignment). `POST /api/game/start` returns a one-time run token; `POST /api/game/finish { run, score }` rejects runs under 20 s, over 10 min, or scores above 4 per second. Leaderboards: `GET /api/leaderboard?period=day|all&scope=global|mine|country&country=MY&sort=score|age|recent` (best per pet; daily resets at 00:00 MYT; rows carry the player's country) and `GET /api/leaderboard/countries?period=day|all` (country against country).
- **Free text and Report** (`src/filter.js`): pet names and Call Codes pass a short English + Malay blocklist. `POST /api/report { target, field: "name" }` hides the name at the first report. Review at **`/admin`** with the `ADMIN_TOKEN` secret: *Keep* shows it again and stops further reports of it; *Remove* renames the pet "Peetako". (The Tier 7 custom title was removed on 17 Oct 2026; the unused `pet.title` and `pet.title_status` columns are left in the database.)
- **Share and invite**: public pet page **`/p/PTK-XXXXXX`** (rendered by the Worker with an Open Graph card, `public/icons/og-card.png`); share buttons for WhatsApp, Facebook, X, Telegram, Threads and native Web Share. Invite link `/?ref=PTK-XXXXXX`. Only the Call Code is ever shared.
- **Countries** (decided 17 Oct 2026; migration `0004_country.sql`): column `pet.country` holds an ISO 3166-1 alpha-2 code, or `ZZ` for "Prefer not to say" (never ranked, shown as a globe, global board only). `src/countries.js` is the single source of the list (ISO 3166-1 only, 249 codes; no additions, no Kosovo/XK) and `/api/config` sends it to the client with `suggestedCountry` (Cloudflare's `request.cf.country`, only a suggestion the player must click to confirm). `POST /api/register` requires `country` (`bad_country`). The choice is locked: `POST /api/country` sets it once for a pet whose country is still NULL (hatched before this migration) and answers `403 country_locked` otherwise. The pet board filters by `scope` (`mine` needs a real country, `409 no_country` otherwise) and sorts by score, Peetako age or latest score. The country board ranks countries by the **median** of each player's best score (window functions in `countryBoard`), listing only countries with at least `MIN_COUNTRY_PLAYERS` players (3 for now; raise it in `src/countries.js` when there are enough players). Flags are the flag-icons SVGs (MIT, 4x3) in `public/assets/flags/`, one per ISO code, loaded on demand (not precached), with the emoji flag as fallback; names come from the browser's `Intl.DisplayNames`. The picker and flag helpers are in `public/assets/flags.js`.
- **Migration `0003_social.sql`** rebuilds the pet table (all pets reset, decided 16 Oct 2026) and adds `daily`, `inventory`, `events`, `game_runs`, `game_scores`, `reports`, `battles`.

### What 2B changes

- **Art** (`public/assets/art.js`, `palettes.js`): the gecko from the "Peetako Retro Frame" mockups, in five palettes, for Organic and Robot, with tier accessories and the nine tier backdrops; mood faces follow the "Character Concepts" mood boards. Tier 7 shows an orbit of fireflies (Robot: small drones) and Tier 8 a gold aura with awan larat curls and a gold headcloth (Robot: glowing core and floating diamonds) — no halo, rays or crown (GDD, Cultural sensitivity). The tanjak, Terabai shield and hornbill feathers still need the cultural reviewers.
- **Palettes**: column `pet.palette` (migration `0002_palette.sql`, already applied to `peetako-p2`). The owner picks one of the five palettes on the hatch screen; `POST /api/register` requires `palette` (`bad_palette` if missing or unknown). The colour is fixed for life: `POST /api/palette` always answers `403 palette_locked`, and there is no colour option in the menu. Pets hatched before this change keep the palette they have. The frame, buttons and page colour follow the palette.
- **Views**: *Immersive* — the scene fills the window, a thin top bar with name, tier, bell and menu, and a dock with four buttons that each carry their stat as a bar and a pulsing "!" below 40, over a gold tumpal trim. *Classic* — the retro frame with a square screen, segmented stat bars, the four buttons and the Call Code. **Default follows the device**: Classic on a desktop window (min-width 900px, landscape), Immersive on a phone. On desktop, Classic puts the square screen on the left at two thirds of the frame and a narrow controls column (buttons 2×2, social 3 per row) on the right, the frame is as wide as the window height allows (760–1280px), and the site header is hidden on the pet screen (the menu keeps the page links); Immersive is drawn as the phone layout in a centred portrait frame (max 460px wide) with a neutral surround. A choice made in the menu lives in `localStorage` (`peetako_view_v2`) on that device and overrides the default; a player who never chose follows the device default, including when the window is rotated or resized.
- **Menu** (☰): view, colour (removed 15 Oct 2026, palette lock), sound on/off, full screen (where the browser supports it), FAQ/About/Privacy/Contact, Leave this device.
- **Sound** (`public/assets/sound.js`): the synthesized module from 11 Oct 2026, off by default (on by default since 17 Oct 2026); plays on care, hatch, tier up and errors.
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
src/index.js        Worker: core API routes (hatch, Call Code, PIN login, care, Ascension), daily + hourly crons
src/countries.js    ISO 3166-1 country list, "Prefer not to say" code, minimum players for the country board
src/social.js       2C routes: check-in, shop, gifts, Pamper and Bond, battles, Mentor Boost, Friends (contacts, blocks), mini-game, leaderboards, Report, admin, /p/ pages
src/economy.js      2C numbers: coins, catalogue, limits, battle and Pamper rules, Malaysia-time days
src/codes.js        Call Code rules and suggestions
src/filter.js       Blocklist for names and Call Codes
src/http.js         Shared request helpers (JSON, cookies, rate limits, hashing)
src/store.js        Data layer: the only file that talks to D1 (all SQL lives here)
src/push.js         Care alerts: Web Push encryption (RFC 8291), VAPID (RFC 8292), alert rules
src/game.js         All game rules and tunable numbers (tiers, decay, actions, Ascension)
migrations/         D1 schema
public/             Static site: game (index.html), FAQ, About, Privacy, Contact, 404, ads.txt, admin.html (report review)
public/assets/      app.js (client), social.js (2C dialogs), qr.js + vendor/qrcode.js (QR codes), kelip.js, rentak.js, lidah.js, motif.js, panjat.js (mini-games; minigame.js is their shared full-screen frame, icons.js the Borneo motif icons), arena.js (Pamper/battle), public.js (/p/ page), flags.js (country names, flags, picker), flags/ (SVG flags), art.js (gecko, Robot, accessories, backdrops, mood symbols), palettes.js, mood.js, sky.js, sound.js, style.css
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
   password manager, and **never change it later** — every PIN would stop working.
4. Turn on the `workers.dev` route (Production) and open `https://phase-2.<your-subdomain>.workers.dev`.

Every `git push` to `main` redeploys automatically. The two cron triggers (daily cleanup at 02:00 Malaysia time and the
hourly care-alert run) come from `wrangler.jsonc`.

### Report review (Phase 2C)

Add a Worker **Secret** named `ADMIN_TOKEN` (a long random string, kept in your password manager), then open `/admin`
and paste it. Without it the review page answers "Set the ADMIN_TOKEN secret".

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

Daily reminders (20 Oct 2026, migration `0006_reminders.sql`): alerts speak in the pet's own voice; a **streak at risk**
alert goes out once a day from 20:00 MYT when the owner checked in yesterday (streak of 2 or more) but not yet today;
at most **2 alerts per pet per MYT day** (`MAX_PER_DAY`), except "last chance", which is never capped. Care and streak
alerts set a badge on the installed app's icon (App Badging API, where supported); the page sets the badge to the number
of things waiting (today's check-in plus each stat under 40) and clears it when nothing is. The pet screen shows a
streak line that turns red with a countdown in the last 4 hours before the midnight reset; tapping it checks in.

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

`test/regression.mjs` runs the real Worker against a throwaway local D1 built from `migrations/`, with a fixed clock, fixed randomness and a mocked push service. It registers pets, logs in, cares, trips the rate limits, subscribes and unsubscribes devices, runs the hourly alert cron (delivered, expired and failed pushes) and the daily cron (deaths, cleanup), then compares every API response, every outbound push request and a snapshot of every table with `test/golden.json`. It never touches the real database and needs no secrets (it generates throwaway keys on each run). The 2C scenario covers countries (the ISO list, flags on disk, hatch validation, the one-time choice for older pets, filters, sorting, the median board with odd and even counts), chosen Call Codes (look-alikes, blocklist), PIN locks and changes, coins and daily caps, check-in streaks, shop, gifts, Pamper, battles, Report and admin review, the mini-games' anti-cheat, shared coin cap and per-game leaderboards, invites and the public pet page. The 20 Oct 2026 alignment adds care coins per type, the religion and royalty filter, Bond, contacts, block (both directions), the challenge switch, Mentor Boost and its slower decay, the daily top-3 badges, automatic hibernation (sleeping, waking, falling when the days run out) and the Legacy Egg (still alive, too young, wrong PIN, taken code, blocked name, success, twice). The Phase 2A scenario also raises one pet for 93 days of daily care and checks every Ascension rule (not confirmed, too young, dormant, success, twice, and that an ascended pet never falls). Tested on Node 22.

## Schema changes later

Add a new file such as `migrations/0004_something.sql`, then run `npm run db:migrate:remote` (needs `npx wrangler login`), or paste
its SQL into the D1 console (and record it in `d1_migrations`). Migrations `0001`–`0005` are applied on `peetako-p2` (0005 on 20 Oct 2026; it only adds columns and tables, so no data is lost).

## Tuning

Every number from the GDD (tier days, survival windows, decay per hour, action gains) is in `src/game.js`; the 2C economy (coins, prices, daily limits, battle and Pamper rules) is in `src/economy.js`. They are first proposals for playtesting.

## Credits

Fonts: Bangers, Nunito, Press Start 2P and VT323 (Google Fonts). Hosted on Cloudflare.
