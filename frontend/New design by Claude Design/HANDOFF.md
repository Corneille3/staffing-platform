# Staffig — Implementation Handoff (self-contained)

A complete, hand-it-to-an-engineer-or-AI brief for building Staffig from these mockups. You should not need any other file from this project; every value an implementer needs is inline below. Mockup `.jsx` files are useful **reference** but not required.

---

## 0 · Product summary (so the agent doesn't drift)

Staffig is a staffing platform for care workers — substitute educators (childcare), PSWs (long-term care), and similar roles in Quebec. Two surfaces:

- **Worker app** — mobile-first PWA. A substitute opens it, sees nearby open shifts, accepts in one tap, gets confirmed.
- **Admin app** — desktop web app. A coordinator at an organization creates a shift request, the system notifies eligible substitutes, the coordinator assigns one.

The product hinges on **how fast a shift gets filled**. Time-to-fill is the headline metric.

- Bilingual EN/FR (default fr-CA).
- Invite-only — no public signup.
- Authenticated via Clerk; users get sorted into orgs via `memberships`.

---

## 1 · Stack

| Layer | Pick | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router)** + React 19 | One codebase for worker app + admin + API. |
| Language | **TypeScript** strict | |
| Auth | **Clerk** | Phone + Google + email link. |
| DB | **Postgres** (Neon) | |
| ORM | **Drizzle** | SQL-first, no codegen step. |
| Background jobs | **Inngest** | Timers, retries, fan-out. Critical for the dispatch workflow. |
| Push notifications | **Web Push (VAPID)** for PWA, plus **Expo Push** later if you ship a native shell | |
| SMS fallback | **Twilio** | |
| Email | **Resend** | Invites + digests. |
| File storage | **Cloudflare R2** | Certification uploads. |
| Maps / geo | **PostGIS** for distance, **Mapbox** for client geocoding | |
| i18n | **next-intl** | `fr` and `en` locales. |
| Styling | **Tailwind CSS v4** with the design tokens in §2 | |
| Realtime | **Pusher** or **Server-Sent Events** | For the admin "responses coming in live" workflow card. |
| Hosting | **Vercel** | |
| Testing | **Vitest** + **Playwright** | |

---

## 2 · Design tokens (drop verbatim into `app/globals.css`)

```css
:root {
  /* paper + ink */
  --paper: #F6F4EE;
  --paper-2: #EFEBE0;
  --card: #FFFFFF;
  --ink: #15140F;
  --ink-2: #56544B;
  --ink-3: #8E8B7E;
  --ink-4: #BAB6A8;
  --line: #E5E1D3;
  --line-soft: #EFEBDD;

  /* accents */
  --terra: #DC5A2A;        /* signature warm; primary CTA on dark surfaces */
  --terra-soft: #FBE4D7;
  --terra-ink: #8A2F0E;
  --moss: #25684A;         /* available / confirmed */
  --moss-soft: #E0EBDF;
  --sand: #E8C97A;         /* awaiting / viewed */
  --sand-soft: #F5EAC8;
  --rose: #C53A2A;         /* urgent / cancelled / declined */
  --rose-soft: #F5DDD8;
  --slate: #2D3340;

  /* type */
  --ui: "Inter Tight", ui-sans-serif, system-ui, sans-serif;
  --serif: "Instrument Serif", ui-serif, Georgia, serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;

  /* radii */
  --r-xs: 6px;  --r-sm: 10px;  --r-md: 14px;  --r-lg: 20px;  --r-xl: 28px;
}

/* Primary CTA on light bg = ink. On dark/photo bg = terra. */
/* Display moments (page titles, big numbers): Instrument Serif, often with one italicized word for emphasis. */
/* Numerics (times, IDs, dates in tables): JetBrains Mono. */
/* Everything else: Inter Tight. */
```

Fonts to load via `next/font/google`:
- `Inter Tight` — weights 400, 500, 600, 700
- `Instrument Serif` — weights 400, italic 400
- `JetBrains Mono` — weights 400, 500

---

## 3 · Visual rules (so the agent doesn't AI-slop the design)

1. **No gradients** except a single warm wash on cover/marketing surfaces.
2. **No emoji** in the product UI. Use Lucide icons (1.5–1.8px stroke, currentColor).
3. **Hairline borders only** — `0.5px solid var(--line)`. No 2px borders, no chunky shadows.
4. **Status uses color, not icons.** Chips with a 6px dot + label: terra (new), moss (confirmed), sand (waiting), rose (urgent/declined).
5. **Display headings always italicize one word** (Instrument Serif italic) for editorial warmth: "Today's *opportunities*", "When you're *open*".
6. **Big numerics are serif**, not sans. `7h`, `87%`, `12 eligible substitutes` — Instrument Serif italic for the unit, regular for the number.
7. **One signature color**: terracotta (`--terra`) used **sparingly** for primary CTAs on dark surfaces and urgent affordances. Never as a background wash. Most CTAs are `--ink` (black) on `--paper`.
8. **44px minimum hit targets** on mobile.
9. **Page bg is `--paper`, never `#FFF`.** Cards on top of paper are `#FFF`.

---

## 4 · Reusable component primitives

Build these once in `components/ui/`, used everywhere:

```ts
<Chip variant="urgent|moss|sand|terra|ink|default" />     // pill, optional dot
<Button variant="primary|terra|moss|ghost|danger" />
<Card />                                                   // bg-card border-line rounded-2xl
<Eyebrow>WHEN</Eyebrow>                                    // 10px, .18em letter-spacing, ink-3
<Display>Title with <em>italic</em></Display>              // Instrument Serif headline
<Mono>06:42</Mono>                                         // JetBrains Mono span
<Avatar initials="AT" tone="paper|terra|moss" />
<Meta icon=... label=... sub=... />                        // small labeled stat with icon
<BottomNav active=... />                                   // worker mobile shell
<AdminShell active=... page={crumb, action}>...</AdminShell>
<ToggleRow label sub on onChange />                        // settings toggle
<Field label>...</Field>                                   // form field with eyebrow label
```

These are already drafted as React in the prototype — port them first, the screens become trivial.

---

## 5 · Data model (Drizzle schema)

```ts
// db/schema.ts
import { pgTable, uuid, text, timestamp, boolean, integer, numeric, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email'),
  phone: text('phone'),
  locale: text('locale').notNull().default('fr'),         // 'fr' | 'en'
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),                            // 'childcare' | 'ltc' | 'school' | 'other'
  address: text('address'),
  city: text('city'),
  neighbourhood: text('neighbourhood'),
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),
  defaultLocale: text('default_locale').default('fr'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  role: text('role').notNull(),                            // 'admin' | 'coordinator' | 'substitute'
  status: text('status').notNull().default('invited'),     // 'invited' | 'active' | 'removed'
  invitedAt: timestamp('invited_at').defaultNow(),
  joinedAt: timestamp('joined_at'),
}, t => ({ uniq: index('mem_uniq').on(t.userId, t.organizationId) }));

export const substituteProfiles = pgTable('substitute_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  homeCity: text('home_city'),
  homeLat: numeric('home_lat', { precision: 9, scale: 6 }),
  homeLng: numeric('home_lng', { precision: 9, scale: 6 }),
  maxDistanceKm: integer('max_distance_km').default(10),
  languages: jsonb('languages').$type<string[]>().notNull().default([]),       // ['fr','en']
  qualifications: jsonb('qualifications').$type<string[]>().notNull().default([]),
  certifications: jsonb('certifications').$type<Array<{
    type: string; expiresAt: string; docUrl?: string; verified: boolean;
  }>>().notNull().default([]),
  hourlyRateMin: numeric('hourly_rate_min', { precision: 6, scale: 2 }),
  notifyUrgent: boolean('notify_urgent').default(true),
  notifyFar: boolean('notify_far').default(false),
});

export const availabilities = pgTable('availabilities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  dayOfWeek: integer('day_of_week'),                       // 0-6, null if specificDate set
  specificDate: timestamp('specific_date'),                // null if recurring
  slot: text('slot').notNull(),                            // 'morning'|'afternoon'|'evening'|'overnight'
  available: boolean('available').notNull().default(true),
});

export const requests = pgTable('requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicId: text('public_id').notNull().unique(),          // 'REQ-2041'
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  role: text('role').notNull(),                            // 'educator' | 'psw' | 'nurse' | ...
  qualificationsRequired: jsonb('qualifications_required').$type<string[]>().notNull().default([]),
  languageRequired: text('language_required'),             // 'fr' | 'en' | 'bilingual' | null
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  hourlyRate: numeric('hourly_rate', { precision: 6, scale: 2 }),
  urgency: text('urgency').notNull(),                      // 'urgent'|'planned'|'recurring'|'emergency'
  instructions: text('instructions'),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  status: text('status').notNull().default('draft'),       // 'draft'|'open'|'filled'|'cancelled'|'expired'
  assignedUserId: uuid('assigned_user_id').references(() => users.id),
  assignedAt: timestamp('assigned_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull().references(() => requests.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  matchScore: numeric('match_score', { precision: 5, scale: 2 }),
  sentAt: timestamp('sent_at').defaultNow(),
  viewedAt: timestamp('viewed_at'),
  response: text('response'),                              // 'accepted'|'declined'|null
  responseAt: timestamp('response_at'),
  declineReason: text('decline_reason'),
}, t => ({ uniq: index('notif_uniq').on(t.requestId, t.userId) }));

export const events = pgTable('events', {                  // audit log
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').references(() => requests.id),
  kind: text('kind').notNull(),                            // 'created'|'notified'|'viewed'|'accepted'|'declined'|'assigned'|'confirmed'|'cancelled'
  payload: jsonb('payload'),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull(),                    // Web Push endpoint OR Expo token
  p256dh: text('p256dh'),                                  // Web Push only
  auth: text('auth'),                                      // Web Push only
  platform: text('platform').notNull(),                    // 'web' | 'ios' | 'android'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Reference data** (seed these):
- Roles: `educator`, `assistant_educator`, `psw`, `nurse`
- Qualifications: `aec_petite_enfance`, `dec_tee`, `dec_psw`, `rn_diploma`, `food_handler`
- Certifications: `cpr`, `first_aid`, `police_check`, `vulnerable_sector`
- Languages: `fr`, `en`, `es`, `ar`, `zh`
- Slots: `morning` (06–12), `afternoon` (12–18), `evening` (18–24), `overnight` (00–06)

---

## 6 · Eligibility scoring (the heart of the product)

A single function, called per-request. Returns ranked candidates.

```ts
// lib/match.ts
export async function rankCandidates(req: Request): Promise<Candidate[]> {
  const rows = await db.execute(sql`
    WITH base AS (
      SELECT
        u.id AS user_id,
        u.full_name,
        p.languages, p.qualifications,
        ST_Distance(
          ST_MakePoint(p.home_lng, p.home_lat)::geography,
          ST_MakePoint(${req.orgLng}, ${req.orgLat})::geography
        ) / 1000.0 AS distance_km,
        (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.response = 'declined' AND n.response_at > now() - interval '30 days') AS recent_declines
      FROM users u
      JOIN substitute_profiles p ON p.user_id = u.id
      JOIN memberships m ON m.user_id = u.id AND m.organization_id = ${req.organizationId} AND m.status = 'active'
      WHERE is_available_for_window(u.id, ${req.startsAt}, ${req.endsAt})
    )
    SELECT *,
      100
        - GREATEST(distance_km - 2, 0) * 2                                           -- distance penalty
        - CASE WHEN ${req.languageRequired} = ANY(languages) THEN 0 ELSE 25 END      -- language
        - CASE WHEN ${req.qualificationsRequired}::text[] <@ qualifications THEN 0 ELSE 30 END  -- quals
        - LEAST(recent_declines * 5, 15)                                             -- recent declines
      AS match_score
    FROM base
    ORDER BY match_score DESC
    LIMIT 50;
  `);
  return rows.filter(r => r.match_score >= 50);
}
```

The integer that comes out of this is the **96 % match** chip rendered in the admin directory and the "Why you'll match" panel in the worker request detail.

Edge rules:
- Score below 50 → never notified.
- Score below 70 → notified only if no one in 70+ accepts within 5 min (escalation).
- `notifyFar = false` and `distance_km > maxDistanceKm` → exclude entirely.

---

## 7 · The dispatch workflow (Inngest)

```ts
// inngest/dispatch.ts
export const dispatchRequest = inngest.createFunction(
  { id: 'dispatch-request', retries: 3 },
  { event: 'request.published' },
  async ({ event, step }) => {
    const req = await step.run('load', () => loadRequest(event.data.requestId));
    if (req.status !== 'open') return;

    const ranked = await step.run('rank', () => rankCandidates(req));

    // Tier 1: top 12 candidates, immediate push
    const tier1 = ranked.slice(0, 12);
    await step.run('notify-tier-1', () =>
      Promise.all(tier1.map(c => sendPush(c.userId, req, c.matchScore)))
    );

    // Wait for assignment OR a 5-min timeout
    const assigned = await step.waitForEvent('await-tier-1', {
      event: 'request.assigned',
      timeout: req.urgency === 'urgent' ? '5m' : '30m',
      match: 'data.requestId',
      if: `event.data.requestId == "${req.id}"`,
    });

    if (assigned) return;

    // Tier 2: widen radius, send to next 20 + SMS to top 5
    const tier2 = ranked.slice(12, 32);
    await step.run('notify-tier-2', () =>
      Promise.all([
        ...tier2.map(c => sendPush(c.userId, req, c.matchScore)),
        ...tier1.slice(0, 5).map(c => sendSms(c.userId, req)),
      ])
    );

    // Final escalation timeout
    const finalCheck = await step.waitForEvent('await-final', {
      event: 'request.assigned',
      timeout: req.urgency === 'urgent' ? '10m' : '4h',
      match: 'data.requestId',
    });

    if (!finalCheck) {
      await step.run('mark-expired', () => markExpired(req.id));
      await step.run('notify-org', () => notifyOrgUnfilled(req));
    }
  }
);
```

Triggers:
- Worker taps "I can take it" → POST `/api/requests/:id/accept` → server emits `response.accepted` → admin's UI gets a Pusher event → admin clicks Assign → server emits `request.assigned`.
- Admin can also auto-assign top match (preference per org).

---

## 8 · API surface (REST, all under `/api/`)

All endpoints require Clerk auth; middleware injects `userId` and resolves active `memberships` to scope queries.

### Worker endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/me` | — | `{ user, profile, memberships }` |
| PATCH | `/api/me/profile` | `Partial<SubstituteProfile>` | updated profile |
| GET | `/api/me/availability` | — | `Availability[]` |
| PUT | `/api/me/availability` | `Availability[]` | replaces full grid |
| POST | `/api/me/push-token` | `{ endpoint, p256dh, auth, platform }` | `{ ok: true }` |
| GET | `/api/inbox` | `?status=active\|history` | `Notification[]` joined with `Request` |
| GET | `/api/requests/:id` | — | `Request` + eligibility breakdown for me |
| POST | `/api/requests/:id/accept` | `{}` | `{ status: 'accepted', waitingFor: 'confirmation' }` |
| POST | `/api/requests/:id/decline` | `{ reason? }` | `{ ok: true }` |
| POST | `/api/requests/:id/withdraw` | `{}` | `{ ok: true }` |
| GET | `/api/me/shifts` | `?window=upcoming\|past` | `Request[]` where `assignedUserId = me` |
| POST | `/api/shifts/:id/check-in` | `{ lat?, lng? }` | `{ checkedInAt }` |

### Admin endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/admin/dashboard` | — | KPIs: fillRate7d, openRequests, avgTimeToFill |
| POST | `/api/admin/requests` | `RequestDraft` | `{ id, publicId, status:'draft' }` |
| PATCH | `/api/admin/requests/:id` | `Partial<RequestDraft>` | updated |
| POST | `/api/admin/requests/:id/publish` | `{}` | fires `request.published`, returns `{ candidateCount }` |
| GET | `/api/admin/requests/:id` | — | full request + notifications + events |
| POST | `/api/admin/requests/:id/assign` | `{ userId }` | fires `request.assigned` |
| POST | `/api/admin/requests/:id/cancel` | `{ reason? }` | — |
| GET | `/api/admin/substitutes` | `?rankAgainstRequestId=...` | `Candidate[]` with match scores |
| POST | `/api/admin/substitutes/invite` | `{ email \| phone, role }` | sends Clerk invite + creates membership(status:'invited') |
| GET | `/api/admin/orphans` | — | users with no active memberships, age > 30d |
| POST | `/api/admin/orphans/:userId/remove` | `{}` | — |

### Realtime channel (Pusher)
- `request:{publicId}` — `notification.viewed`, `response.accepted`, `response.declined`, `request.assigned`. Admin workflow page subscribes; worker also subscribes to `me:{userId}` for assignment confirmations.

---

## 9 · Routes (Next.js App Router)

```
app/
├── (worker)/                            # mobile-first PWA, bottom nav
│   ├── layout.tsx
│   ├── inbox/page.tsx                   # → screen: WorkerInbox
│   ├── requests/[id]/page.tsx           # → screen: WorkerRequestDetail
│   ├── requests/[id]/accepted/page.tsx  # → screen: WorkerAccepted
│   ├── schedule/page.tsx                # → screen: WorkerAssignment
│   ├── availability/page.tsx            # → screen: WorkerAvailability
│   ├── onboarding/page.tsx              # → screen: WorkerOnboarding
│   └── profile/page.tsx
├── (admin)/admin/
│   ├── layout.tsx                       # AdminShell sidebar
│   ├── dashboard/page.tsx
│   ├── requests/new/page.tsx            # → screen: AdminCreateRequest
│   ├── requests/[id]/page.tsx           # → screen: AdminWorkflow
│   ├── substitutes/page.tsx             # → screen: AdminDirectory
│   ├── housekeeping/page.tsx            # → screen: EdgeOrphan
│   └── organizations/page.tsx
├── sign-in/[[...rest]]/page.tsx         # → screen: EdgeSignIn (or Clerk hosted)
├── invite/[token]/page.tsx
├── not-invited/page.tsx                 # → screen: EdgeNotInvited
├── api/...
└── webhooks/clerk/route.ts              # user.created → upsert user
```

---

## 10 · Screen-by-screen build spec

For each screen below: which URL it lives at, what API it calls, what state it owns, and the acceptance criteria. All visual reference comes from the project mockup; build the layout to match the tokens in §2 and the rules in §3.

### Worker · Lock-screen alert (system surface, not a route)
**What it is**: A push notification rendered on the OS lock screen.
**Payload**:
```json
{
  "title": "Urgent shift · 1.2 km away",
  "body": "Les Petits Lutins — today 07:30 → 14:30. Sick call. They need someone in 48 min.",
  "data": { "requestId": "uuid", "publicId": "REQ-2041", "deeplink": "/requests/uuid" },
  "actions": [{ "action": "accept", "title": "I can take it" }, { "action": "decline", "title": "Can't" }]
}
```
**Acceptance**: Tapping "I can take it" calls `POST /api/requests/:id/accept` directly from the service worker without opening the app.

### Worker · Inbox (`/inbox`)
**Owns**: tab state (active/history).
**Calls**: `GET /api/inbox?status=active` on mount.
**Renders**: greeting, availability strip (links to `/availability`), tab control, list of request cards grouped by status: `new` (terra chip), `sent` (sand chip), `filled` (muted).
**Card variant**: `urgent=true` adds left terra border + soft shadow.
**Acceptance**: Tapping a card opens `/requests/:id`. "I can take it" inline button on `new` cards calls accept and routes to `/requests/:id/accepted`.

### Worker · Request detail (`/requests/[id]`)
**Calls**: `GET /api/requests/:id`.
**Renders**: urgent banner (if urgent), org/role title block, time block with serif day name + mono time range + 3 stats (Duration / Rate / Distance), location card, "Why you'll match" eligibility list (one row per check: profile, availability, city, language, qualification, certifications — green check / yellow warn / red x).
**Sticky footer**: "Can't" (ghost) + "I can take it" (terra primary).
**Acceptance**: Both actions hit the API, navigate to `/accepted` or `/inbox`.

### Worker · Accepted (`/requests/[id]/accepted`)
**Calls**: subscribes to Pusher `me:{userId}` to flip "Coordinator reviews" → "Confirmed" in realtime.
**Renders**: success hero, vertical timeline (Response sent → Reviewing → Confirmed → Shift starts), withdraw button.
**Acceptance**: When `request.assigned` arrives, animate the next timeline node to active.

### Worker · Availability (`/availability`)
**Owns**: 7×4 grid state (day × slot).
**Calls**: `GET /api/me/availability` on mount; debounced `PUT` on change.
**Renders**: week header (dates), grid with toggleable cells (moss = available, white = not), copy-last-week button, preferences toggles below (urgent alerts, far shifts, weekend overnights).
**Acceptance**: Toggles persist; refresh restores state.

### Worker · Today's assignment (`/schedule`)
**Calls**: `GET /api/me/shifts?window=upcoming`.
**Renders**: dark hero card with the next confirmed shift (status chip, org name in serif, time range in mono, directions + call buttons), arrival check-in card with moss CTA, "this week" list below.
**Check-in**: `POST /api/shifts/:id/check-in` with current geolocation if granted.

### Worker · Onboarding (`/onboarding`)
**Owns**: step (1–3), selected qualifications, certifications, languages, cities.
**Renders**: progress bar, 4 sections of multi-select chips, sticky footer with count + Continue.
**Final step**: `PATCH /api/me/profile` → redirects to `/inbox`.

### Admin · Create request (`/admin/requests/new`)
**Owns**: 3-step form, autosaves on change.
**Calls**: `POST /api/admin/requests` to create draft, `PATCH /api/admin/requests/:id` on every change, `POST /api/admin/requests/:id/publish` on final submit.
**Live preview pane**: renders the worker-side request card with current draft values.
**Reach estimate**: calls `GET /api/admin/substitutes?rankAgainstDraftId=...` on debounce, shows "12 eligible substitutes" with link to expand.

### Admin · Workflow (`/admin/requests/[id]`)
**Calls**: `GET /api/admin/requests/:id`. Subscribes to `request:{publicId}` for realtime.
**Renders**: status chips + urgency, title with serif time range, 5-step horizontal workflow tracker (Created → Notified → Responses → Assign → Confirmed), responses list (sorted: accepted first, then viewed, then declined, then no-reply), right rail with "Best match" dark card + Assign CTA, shift details summary, warning callouts (e.g. high-decline pattern).
**Assign action**: `POST /api/admin/requests/:id/assign` with `{userId}` → optimistic update + Pusher confirms.

### Admin · Substitute directory (`/admin/substitutes`)
**Calls**: `GET /api/admin/substitutes?rankAgainstRequestId=` (optional).
**Renders**: dark "Ranking against REQ-XXXX" bar with active filter chips, table (Substitute / City / Years / Availability / Languages / Match / Notify), sortable, top row highlighted moss if a request is in context.
**Match bar**: 50px progress bar in moss/terra/ink-3 depending on score band.

### Edge · Sign in (`/sign-in`)
**Hosts**: Clerk's `<SignIn />` with theme overrides matching the tokens, OR a custom screen calling Clerk's lower-level APIs.
**Renders**: serif headline "Sign in to *Staffig*", 3 buttons (phone / Google / Apple), locale switch.

### Edge · Not invited (`/not-invited`)
**Visible when**: user signed into Clerk but has zero active memberships.
**Renders**: sand warning circle, headline, the user's signed-in email shown back to them, "Two ways forward" card (different account / email coordinator), CTAs to try-different or mailto coordinator.
**Middleware**: in `middleware.ts`, after Clerk auth, if no active memberships → redirect here.

### Edge · Orphan housekeeping (`/admin/housekeeping`)
**Calls**: `GET /api/admin/orphans`.
**Renders**: list with reason + age, Invite / Remove actions, moss callout about auto-clean weekly toggle.
**Auto-clean**: a daily Inngest cron deletes users with no membership older than 30 days, but emails the user 7 days before.

---

## 11 · Clerk + invite-only middleware

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher(['/sign-in(.*)', '/invite/(.*)', '/not-invited', '/api/webhooks/(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId } = await auth.protect();

  const memberships = await getActiveMemberships(userId);
  if (memberships.length === 0 && !req.nextUrl.pathname.startsWith('/api/me')) {
    return Response.redirect(new URL('/not-invited', req.url));
  }

  // Route gate: admins → /admin, substitutes → /inbox
  if (req.nextUrl.pathname === '/') {
    const target = memberships.some(m => m.role !== 'substitute') ? '/admin/dashboard' : '/inbox';
    return Response.redirect(new URL(target, req.url));
  }
});
```

Clerk webhook (`app/webhooks/clerk/route.ts`):
- `user.created` → upsert `users`, set `locale` from `unsafe_metadata.locale ?? 'fr'`.
- `user.updated` → sync email/phone changes.
- `user.deleted` → soft-delete (set `memberships.status='removed'`, keep audit trail).

Invite flow:
1. Admin enters email/phone + role.
2. Server: `clerk.invitations.create({ emailAddress, publicMetadata: { orgId, role } })`.
3. Insert `memberships` row with `status='invited'`.
4. User accepts → Clerk webhook fires `user.created` → server reads `publicMetadata.orgId`, flips membership to `active`.

---

## 12 · i18n

- Use **next-intl** with `app/[locale]/...` segments.
- Two message files, mirrored: `messages/en.json`, `messages/fr.json`.
- Keys are namespaced per screen: `inbox.title`, `inbox.greeting`, `request.detail.cta_accept`.
- Every notification template (push, SMS, email) lives in two language variants. Pick from `user.locale`.
- Date/time: `Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: locale === 'en' })`.
- Currency: CAD, always `Intl.NumberFormat(locale, { style: 'currency', currency: 'CAD' })`.

---

## 13 · Push notifications — concrete plumbing

Worker app is a PWA. Push via Web Push (VAPID).

```ts
// app/(worker)/_components/EnablePush.tsx
'use client';
export function EnablePush() {
  const onClick = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC!),
    });
    await fetch('/api/me/push-token', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
        platform: 'web',
      }),
    });
  };
  return <button onClick={onClick}>Turn on shift alerts</button>;
}
```

```ts
// lib/notify.ts
import webpush from 'web-push';
webpush.setVapidDetails('mailto:ops@staffig.ca', process.env.VAPID_PUBLIC!, process.env.VAPID_PRIVATE!);

export async function sendPush(userId: string, req: Request, score: number) {
  const tokens = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
  const payload = buildPushPayload(req, score, await getUserLocale(userId));
  await Promise.all(tokens.map(t => webpush.sendNotification(
    { endpoint: t.endpoint, keys: { p256dh: t.p256dh!, auth: t.auth! } },
    JSON.stringify(payload),
  ).catch(err => handlePushError(err, t))));
  await db.insert(notifications).values({ requestId: req.id, userId, matchScore: score, sentAt: new Date() });
}
```

Service worker (`public/sw.js`):
- Listens for `push` events, calls `showNotification` with actions.
- `notificationclick` with `accept` action → `fetch('/api/requests/:id/accept', { method: 'POST' })` then open the app at `/requests/:id/accepted`.

SMS fallback (Twilio) fires from the Inngest workflow if no push token is registered OR the worker hasn't viewed the notification in 5 min on urgent requests.

---

## 14 · Quebec / privacy compliance (Law 25)

- Privacy policy + consent on first sign-in.
- Data retention: orphan users auto-deleted at 30 days (warned at 23 days).
- Right to be forgotten: `POST /api/me/delete` deletes Clerk user + nulls FK refs in `notifications`/`events` (keep aggregate stats only).
- Data residency: Neon `aws-ca-central-1`, R2 also CA.
- Audit log: every admin action writes to `events`.

---

## 15 · Build order (6 weeks, one developer)

| Week | Deliverable |
|---|---|
| 1 | Stack scaffold; Clerk auth; users / organizations / memberships; invite flow; middleware + `/not-invited`; admin shell with empty dashboard. |
| 2 | Substitute profile + onboarding screens; availability grid; the `rankCandidates` query (test in psql against seed data). |
| 3 | Admin create request (3 steps); the Inngest dispatch function; Web Push plumbing end-to-end on at least Android Chrome. |
| 4 | Worker inbox + request detail + accept/decline + accepted screen. Happy-path demo: admin posts → push arrives → worker accepts → admin sees it live. |
| 5 | Admin workflow card (Pusher realtime); substitute directory with match ranking; assign action. |
| 6 | Bilingual everything; SMS fallback; orphan housekeeping cron; certifications upload; Playwright E2E for the happy path; deploy. |

---

## 16 · Non-goals for v1 (call out if asked to build them)

- Time tracking / clock-in beyond the simple "check in on arrival" flag.
- Payroll / invoicing.
- In-app chat between worker and coordinator (use phone, contact info is in the request).
- Public marketplace / public worker profiles.
- Multi-org availability conflict resolution (a sub double-booked across two orgs — for v1, first-accept wins).

---

## 17 · Acceptance test (the demo script)

1. Coordinator signs in at 06:40 a.m., creates an urgent request: educator, today 07:30–14:30, French, AEC required.
2. System ranks 23 substitutes ≥ 50 score; pushes top 12.
3. Worker Amélie's phone lights up at 06:41 with the lock-screen card.
4. She taps "I can take it" from the lock screen.
5. Coordinator's workflow card shows her as accepted within 1 second (Pusher).
6. Coordinator taps "Assign Amélie."
7. Amélie's phone gets a second push: "You're confirmed for 07:30."
8. Her `/schedule` shows the shift; she taps Directions.

If steps 1–8 work end-to-end in both French and English, v1 is shippable.

---

That's the whole thing. The mockup `.jsx` files in `src/` are visual reference — open them when you need to see exactly how a screen lays out. Everything else an implementer needs is above.
