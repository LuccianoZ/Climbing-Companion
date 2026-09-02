# Climbing Companion — Architecture, Sprint 1/2 Frontend Supplement

**Phase:** Sprint 2 — the `apps/web` backfill for BL-001–018 and BL-023
**Parent document:** `claude/Architecture.md` in the Claude project — the source of truth for every table, column, enum and index, and the home of **AR-1 through AR-33**. There is no `../ARCHITECTURE.md`; an earlier version of this file referenced one that has never existed in this repo.

This file is a **supplement, not a copy**. It carries only the design notes this thread added — **AR-34 through AR-37** — so there is exactly one authoritative wording for every other entry. Nothing here changes a table, a column or an enum: every decision below is an `apps/web` decision.

Read this alongside the parent, not instead of it.

---

## §0 (continued). Design Notes & Assumptions — Sprint 1/2 Frontend

Same convention as AR-1 through AR-33: judgment calls made while turning Foundation's prose and the approved mockups into an implementation, none contradicting Foundation, flagged here rather than buried in a component.

| #     | Decision | Reasoning |
| ----- | -------- | --------- |
| AR-34 | **The mockup's "OR CLIMB WITH — Google / Apple" row is not built.** `AuthController` exposes register, login, logout and password reset and nothing else; there is no OAuth provider anywhere in the API, no `users` column for a federated identity, and no backlog item for either. The two buttons are therefore omitted from `AuthGateway` entirely rather than rendered disabled or wired to a placeholder. | Consistent with the standard this codebase already set when Epic 4 declined to ship acting in-range buttons with no forms behind them: a control that can only ever fail is worse than an absent one. Recorded rather than silently dropped, because the row is in an approved design and its absence would otherwise read as an oversight in every future review. |
| AR-35 | **Grade pickers are clamped to the discipline's real scale; the DTOs are not.** `SubmitRouteDto`, `SubmitRouteVerificationDto` and `VoteOnGradeDto` all validate a flat `0-31` for every discipline — AR-18 records that as a deliberate, accepted convention, since none of those DTOs is discipline-aware. A dropdown *is*: `gradeOptions(discipline, scale)` in `lib/grades.ts` offers 0-18 for Bouldering (the V-scale's real range) and 0-31 for rope disciplines. | Offering V19-V31 on a boulder problem means offering ordinals the V-scale has no label for — `formatGrade` renders them as `?` — and which the server would nonetheless store happily. This is one of the few places the client is deliberately *stricter* than the API, which is worth writing down: a future reader comparing the two will otherwise read it as drift. |
| AR-36 | **Check-in is a gym-only action, and it opens a named placeholder rather than firing a request.** `gym_checkins` has a `gym_id` and there is no crag or route equivalent anywhere in the schema, so "check in at a crag" is not a thing this app can ever do — the button is absent from a crag panel. **This is the one place the approved mockup and the schema disagree** (the mockup draws Check-In on a crag panel), and the schema wins. Where it *is* shown, it opens `UnbuiltActionSheet` naming **BL-024 (Epic 5, Sprint 3)**, which is not built on either side. | Same convention as `AppShell`'s `TabPlaceholder`: naming the owning story in the UI keeps "is this broken or unbuilt?" from being a question anyone has to ask during a demo. Shipping the button as a no-op, or as a request against an endpoint that does not exist, were the two alternatives — both lie in a way a placeholder does not. |
| AR-38 | **The header carries no navigation, and the Profile tab is the signed-out entry point.** The hamburger menu (logout, submission links, admin link) and the profile shortcut are both removed. Submission lives on the map's floating `+` (AR-29) and nowhere else; **logout moves to the Profile tab**, which redirects a signed-out visitor to `/login?next=/profile` rather than refusing them. The single remaining header control is an **admin-only** dashboard button, top-left, with a mirrored empty slot on the right so the title stays optically centred for everyone. `HeaderMenu.tsx` is deleted. | Two controls at the ends of a phone header squeeze the product name between them, and both duplicated a destination the tab bar already reaches. Hiding the admin button from non-admins follows AR-17's rule: BL-012's endpoint answers 403, so the entry point is hidden rather than shown-and-refused. Tapping Profile is the most natural way into the auth flow from a tab bar that is always visible, which is why that tab prompts rather than blocks. |
| AR-37 | **`app/layout.tsx` and the `[gymId]` page type their own props instead of using Next's generated `LayoutProps`/`PageProps`.** Those types are emitted into `.next/types`, so a clean checkout — or a CI job, or a working tree whose `.next` was deleted — cannot run `npm run typecheck -w apps/web` until a build or dev server has run once. Both files declare `{ children: ReactNode }` and `{ params: Promise<{ gymId: string }> }` explicitly. | Neither route has parallel-route slots, so the generated types add nothing over the explicit ones, and typecheck stops depending on build order. Found the hard way: deleting the stale 199MB Linux-built `.next` (see below) broke `tsc --noEmit` with a single `Cannot find name 'LayoutProps'`. |

---

## Frontend file map (Sprint 1/2 backfill)

| Path | Story | Notes |
| ---- | ----- | ----- |
| `lib/session.tsx` | BL-001–004 | `SessionProvider`/`useSession` over `GET /api/auth/me`, mounted at the root layout (AR-22). Every screen reads session state from here. |
| `lib/errors.ts` | all | The plain-language 4xx table keyed on `(action, status)` (AR-26). Any new endpoint's failure modes get an entry here, never an inline string. |
| `components/auth/` | BL-001–004 | `AuthShell` (no tab bar), `AuthGateway` (one component, two routes — AR-23), `ForgotPassword`, `ResetPassword`, `RequireSession`, `fields.tsx`. |
| `components/media/ImageUploadField.tsx` | BL-008 | Owns the whole round trip and reports a `MediaAsset` upward (AR-24). Client-side 2MB + MIME pre-check; real multipart. |
| `components/submit/` | BL-006/007 | `SubmitShell`, `SubmitRouteForm`, `SubmitGymForm`, `LocationPicker`, `LocationPickerCanvas` (a second Leaflet canvas behind its own `ssr:false` boundary — AR-27). |
| `components/ui/ActionSheet.tsx` | BL-009–018 | The bottom-sheet frame every in-range action uses (AR-25). |
| `components/actions/` | BL-009–018 | `VerifyRouteSheet`, `VerifyGymSheet`, `VoteOnGradeSheet`, `LogClimbSheet`, the shared `RouteChoice`, and `UnbuiltActionSheet` (AR-36). |
| `components/admin/` | BL-012 | `AdminShell` (dense multi-column, sidebar, no tab bar — AR-28), `UnverifiedGymList` (AR-31), `AdminVerifyGymForm`. |
| `components/map/SubmitFab.tsx` | BL-006/007 | The floating `+`, hidden from signed-out visitors (AR-29). |
| `components/shell/HeaderMenu.tsx` | BL-003 | Logout is a menu item, not a page. Also the only always-reachable route to `/admin`, hidden from non-admins. |

`components/shell/AppShell.tsx` is down to **four tabs** — Map, Search, Alerts, Profile. Direct messaging is cut from MVP scope entirely (parent document §7, "CUT, not implemented"), so the Chat slot was dropped rather than kept as a permanent dead placeholder. That is the one deliberate departure from the approved five-tab design, and `app/chat/page.tsx` is deleted.

---

## Test surface (extends AR-21)

AR-21's split holds: backend behaviour in `apps/api/features/*.feature` over real HTTP against the test database; UI behaviour in `apps/web/features/*.feature` via Cucumber + Playwright against a running `next dev`, with `/api/*` stubbed by `page.route`.

Epic 4 stubbed `/api/map/*` and nothing else. This backfill stubs the whole `/api/*` surface, and the reason is different but at least as strong: **the states worth asserting are the refusals.** Reaching "you have already verified this route" through a live backend means seeding a user, a route, a media asset and a prior verification row; making "you are too far away" happen means moving the browser's GPS *and* having PostGIS disagree with it. Every one of those rules already has a green scenario in `apps/api`'s own suite, over real HTTP against the real database — which is where it belongs, because that is where the rule lives. What is unproven anywhere else is that this app turns each refusal into the right sentence on the right screen, and that a stub can prove honestly.

A catch-all `**/api/**` handler is registered first (Playwright resolves routes in reverse registration order, so every specific handler wins over it) and answers **501**, so an unstubbed endpoint fails loudly and instantly instead of falling through to the dev-server proxy and hanging against an API that is not running.

Not stubbed, and deliberately real: the forms and their validation, the multipart upload body, Leaflet, the OSM tiles, the browser Geolocation API, and every line of app code.

| Feature file | Scenarios | Covers |
| ------------ | --------- | ------ |
| `map-ui.feature` | 14 | Epic 4, with two corrections (below) |
| `auth-ui.feature` | 12 | BL-001–004, plus the Profile tab's signed-out redirect (AR-38) |
| `submission-ui.feature` | 10 | BL-006/007, BL-023 |
| `verification-ui.feature` | 10 | BL-008/009/010/011/014 — one scenario removed, see below |
| `activity-ui.feature` | 9 | BL-015/016/017/018 |
| `admin-ui.feature` | 10 | BL-012 |

Three assertions in there are about what the app **sent**, not what it rendered, because nothing else can prove them: that a Bouldering submission omits `boltCount`/`minRopeLengthM` as keys rather than sending nulls; that the photo upload is `multipart/form-data` and not base64-in-JSON (invisible from the outside — both shapes "work" against a permissive server); and that the verification call carries the `media_asset_id` the upload came back with.

### Two corrections to `map-ui.feature`

Epic 4's suite had never actually been executed — the previous thread verified it with `cucumber-js --dry-run`, which resolves steps without running them. Its first real run surfaced two defects in the feature file itself, neither of them in the app:

- **The French grade expectation was wrong.** `Solar Power`'s fixture grade is ordinal **14**, which is `5.11a` on the Yosemite table and **`6c+`** on the French one — `7a` is ordinal 15. The scenario asserting the scale toggle re-renders grades was checking for `7a` and could never have passed. Corrected to `6c+`.
- **A crag panel now offers three actions, not four**, per AR-36. The step was reworded to match.

One structural consequence worth carrying forward: `map-ui.feature` asserts that **exactly two pins** are on the map (the silhouette comparison counts them), and the crag and the first gym sit ~250m apart, which at the default zoom 12 is a handful of pixels — their markers already overlap. Any pin added to the default fixture set both breaks that count and can obstruct a click on one of the other two, which Playwright reports as a 30-second timeout rather than as an overlap. The waiting-gym pin is therefore opt-in per scenario and placed ~1.7km away.

### One scenario removed, to be checked by hand

`verification-ui.feature` had a scenario asserting AR-25's rule that a route which has already reached four verifications appears in the picker **struck out**, rather than hidden. The behaviour is built; the scenario could not be made to pass across four attempts. Its diagnostic proved the crag was reaching the browser with one route instead of two — the two-route fixture never arrived — while `activity-ui.feature`'s multi-route scenario, using the identical step and the same fixture, passes. That difference was never explained.

The scenario is deleted with a comment in its place naming the manual check: open a crag with one `UNVERIFIED` and one `VERIFIED` route, tap Verify Route, and confirm the verified one is listed greyed and unselectable with "already verified" beside it, not missing from the list. Worth revisiting if the same fixture mechanism misbehaves again — two scenarios sharing a stub and disagreeing about what it served is a real smell, not a flake.

### Two constraints the UI suite imposes on fixtures

**Pins must be separated in pixels, not metres.** `pin-icons.ts` builds each marker at `iconSize: [140, 52]` â the icon carries BL-020's "Unverified by Community" badge beside the glyph, so it is far wider than it looks. Two markers closer than ~140px overlap, and Leaflet z-orders markers by latitude, so the southern one silently covers the northern one. Playwright will not click an obstructed element; it waits for the hit target to be the element it was asked for and then times out after 30 seconds, which reads as a slow page rather than as an overlap. At the default zoom 12 (~30m per pixel at this latitude) 140px is **~4.2km**, so fixture pins now sit ~5.5km apart. The original `GYM_LOCATION` was ~270m from the crag â about 9 pixels â and its pin has never been clickable.

**Restart `next dev` after app-code edits made through the device bridge — a precaution, not a known defect.** This was briefly recorded here as a certainty: a fix to `RouteChoice.tsx` appeared not to take effect, and "the Linux VM's writes into the mounted Windows folder do not raise the notifications Next's watcher listens for" was an explanation that fit. It was wrong. Grepping the dev build afterwards found the new code compiled and being served — `.next/dev/static/chunks/…` contained the new predicate — and the scenario was failing for an unrelated reason. Hot reload has never actually been observed to fail here. A restart costs seconds and removes one variable when an app-side fix appears not to land, which is the whole of the advice; test-side edits (feature files, fixtures, `world.ts`, step definitions) never need one, since Cucumber re-reads them every run.

---

## Repository hygiene fixed alongside this work

- **`.gitattributes` added** with `* text=auto`. `git status` was showing 34 modified files whose entire diff was 19,295 CRLF insertions against 19,295 deletions — `git diff --ignore-cr-at-eol` showed nothing at all. A working tree that is permanently "dirty" hides real changes, and it is a plausible contributor to the work-loss event that preceded this thread.
- **`apps/web/.next` deleted.** It was a 199MB Linux-built directory that hangs `next dev` on Windows. Deleting it is what surfaced AR-37.
