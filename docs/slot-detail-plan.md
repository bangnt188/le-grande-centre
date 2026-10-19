# Slot detail — public and admin

## Confirmed scope

Build both public leasing detail and internal admin slot detail. Preserve the current public green/cream visual system and admin leasing-desk frame. No new dependency, authentication or production intake system.

## Implementation

1. Public `/mat-bang/[unitId]/`: pre-render every `BROCHURE_UNITS` entry with async Next page params, `generateStaticParams`, per-unit metadata and unknown-ID handling. Show brochure area, optional dimensions, approximate orientation, floor description and notes. Use a photo-first gallery/info overview with shared shopping-mall color tokens, a floating selected-slot floor map, a floor-specific PDF CTA, unit-aware consultation/visit request links and same-floor alternatives. Keep real explorer links and indexable sitemap; never import admin data.
2. Admin: full slot dossier as a dedicated workspace view, using the existing useAdminData instance. Support deep links and browser return without reinitializing the repository. Show original slot ID/area, effective group status, members, tenant, matching requests/reservations/leases and scoped media. Reuse existing commands for editing and splitting; respect commitment guards, the two occupancy states Trống/Đang thuê, error/loading/empty states. Preserve current merge workflow. Demo state remains session-only.
3. Review both slices against this scope, then inspect desktop/mobile in one batched round. Fix the concrete defects together, confirm once, run static production build and exercised runtime paths.

## Acceptance

- Every public brochure unit has a shareable URL; unknown IDs do not render a fabricated unit.
- Explorer links open the selected unit; consultation preserves that unit and area; source PDF points to the correct page.
- Admin slot detail opens from the register and returns to the same floor without losing in-session mutations.
- Grouped slots expose original members; protected commitments cannot be edited or split through the detail UI.
- Public contains no private admin tenant/contract/hold data, and admin fixtures are visibly identified as demo.
- Desktop/mobile have readable controls, visible focus and no document-level horizontal overflow; diagrams may scroll within their own viewport.
- Static export supports the existing base path; docs describe reachable routes and storage limitations.

## Verification and review outcome

- `npm run build` passed with all 81 static public unit routes and the existing public-export guard. Admin is exercised on the dev runtime, not published in `out/`.
- HTTP smoke checked all 81 exported URLs: HTTP 200, matching rendered unit heading and correct brochure page. Checked private hold/lease/customer markers are absent; unknown public ID returned HTTP 404 on the Next dev runtime.
- Browser exercised C.23 detail → consultation (correct slot and area) → same-floor explorer return → detail. Foreground, normal-motion A.1 → consultation also rendered the form visibly with the correct unit.
- Admin smoke exercised status/tenant edits surviving navigation, merge/group edits, cancelled and confirmed split (original area/IDs and group status retained), scoped image upload and blob preview surviving workspace/history navigation.
- Active hold T2-B8 and leased T4-B2 disabled direct editing/splitting; related actions opened the exact request/lease. Unknown and empty admin IDs showed explicit missing-record states.
- Review found and fixed header-covered heading focus, then cancelled-history navigation overwriting the destination entry. Back/Forward cancel/confirm now retain both destination and company draft; manual history scroll restoration keeps focused slot headings visible.
- Desktop 1440px and mobile 390px inspected for both surfaces: document scroll width equals viewport; no uncaught page errors or confirmed axe WCAG A/AA violations. The F.2 horizontally clipped plan labels produced an axe contrast incomplete result, not a confirmed violation; foreground/background colors and contained keyboard scrolling/focus were inspected. Viewport emulation is not physical-device coverage.
- Impeccable detector returned `[]` for both new detail components. `npm run test:admin` passed 3/3 existing contract tests. UI/history regressions were verified through the real browser; no automated browser test suite was added.
- Browser-tool limits were isolated: open viewport sometimes required explicit emulate, background RAF required foreground activation, and immediate viewport captures required compositor settling. No app motion change was made from those invalid signals.
- Auth, persistence across reload, production upload/intake and live API failure/retry were not implemented or verified in this demo task. No commit, push or deploy performed.

## Public layout preview — confirmed client brief

- Reference `item.png` supplies composition only: large gallery/thumbnail rail left, exact unit facts/actions right. Reuse five existing project images; do not transplant the apartment photo, Unit 2303, bedrooms, bathrooms, dollars or Available badge.
- Scope confirmed through questions: public detail only; admin dossier unchanged. Initial two-CTA choice was superseded by the client’s three-CTA instruction: consultation, visit request and the existing brochure at `floor.sourcePage`. No 3D or real reservation button.
- “Vị trí trong tầng” is an icon-only 48px floating map button at the upper-left under the public header (supersedes the earlier upper-right text trigger). Shared `Modal` opens a theme-scoped floor diagram up to 1280px wide on desktop; on narrow screens it scales the complete plan to the dialog width with no horizontal scrollbar. Slot labels scale with the diagram. Selected unit has `aria-current`, other units navigate to their own details. The custom shared Button has an accessible name/title, dialog semantics and a ref passed through `returnFocusRef`; Escape closes and restores trigger focus. No duplicate inline plan.
- Public colors are semantic `@mall/ui` shopping-mall light tokens; preserve incumbent Charis SIL/Be Vietnam Pro and the public Vietnamese leading/tracking constraints. Gallery uses shared Button/Modal primitives; photo lists are module constants rather than rebuilt per selection.
- The gallery advances one image every three seconds, stops at the final image, pauses while the lightbox is open, and uses the shared reduced-motion-aware `TransitionImage`.
- `intent=visit` only activates with a valid brochure unit. The existing demo form receives unit/area and a visit-request note, with a matching label/submit action. Normal consultation has no visit note. No appointments are created or confirmed.

### Verification for the revised layout

- Final `npm run build` passed, including all 81 unit routes and the existing public-export guard. HTTP smoke on static preview checked all 81: 200 response, exact unit heading, brochure area, gallery presence and correct PDF page. Brochure HEAD returned 200 / application/pdf.
- Real browser exercised thumbnail selection, next-photo wrap, ArrowRight, all-five-photo modal selection/close/focus, map → A.2 navigation with correct 152 m² facts and closed old modal, and both consultation/visit handoffs. Static F.2 visit prefilled the correct floor/area/note.
- Desktop 1440×1000 and mobile 390×844 confirmed final static surfaces. Gallery images loaded, floating control remained below the header, three CTAs had correct hrefs and page width equalled viewport. A.1 brochure opens page 5; F.2 page 10. Main surface axe A/AA reported 0 violations and 0 incomplete on both.
- Map axe reported 0 confirmed violations, with aria-hidden-focus and contrast incomplete results. Manual modal review kept focus inside for nine consecutive Tabs including wrap. Measured map heading/shared-area/selected-slot/source-note contrast ranged from 8.8:1 to 17.4:1. No uncaught page errors observed.
- Review fixed mobile breadcrumb crowding around the floating button and preserved current public typography. Impeccable scan has advisory-only local radius/fluid-type scale findings; these are layout-preview values, not palette overrides. No DESIGN.md drift repair was performed.
- Verification is emulated Chromium, not a physical-device pass. No new automated browser tests, backend booking, commit, push or deployment.

### Surface-token and map-icon correction

- Slot route now scopes shopping-mall light on `PublicPageLayout`, via optional `colorScheme`/`className`; other callers remain unchanged. Route frame and inner content share `--ui-color-canvas`; gallery/facts panel uses `--ui-color-surface-raised`, not the pale-yellow surface token. No global palette or admin change.
- Final production build passed with all 81 unit routes. Ordinary browser-tool capture/observation failed and killed its tabs, then runtime initialization failed; these harness failures were reported, not treated as app defects.
- Dedicated Chromium CDP smoke exercised exported A.1 at 1440×1000 and F.2 at 390×844: outside/inside canvas matched rgb(250,248,240), raised panel rgb(255,255,255); map icon x=16, 48×48, y=100/88 below the 88/76px header; document width matched viewport. Native mouse activation opened the correctly highlighted unit and native Escape closed it with focus returned. No uncaught JS exceptions. Both actual screenshots were inspected.
- The smoke is a throwaway external script, not a permanent test or a new full-site accessibility claim.

### Map hover and gentle live mark

- Fixed the cascade at its source: the map trigger now uses shared `primary`, not `secondary`. The previous `.secondary:hover:not(:disabled)` selector overrode the local hover background while leaving a white icon. Shared primary owns normal/hover colors; removed duplicate local color/hover rules. No global button or palette changes.
- One thin pulse ring uses the action token, at most 22% opacity and 1.2× scale on a 4.8s cycle; the 48px hit target stays fixed. CSS enables it only outside hover/focus and modal-open state with no reduced-motion preference. A visibilitychange listener follows the existing dataset convention and disables the effect in a hidden tab.
- Final build passed. Actual Chromium 1440×1000/390×844 observed normal #002116, hover #0a2a1a, white icon, running 4.8s pulse; hover, keyboard focus, open map and reduced motion each disabled the ring. Opening a real background tab changed document.hidden=true / data-live=false / animation=none, and returning resumed the unfocused ring. Maps still highlighted A.1/F.2 and Escape returned focus. Mobile width remained 390 with no overflow.
- Desktop hover and mobile screenshots inspected; layout detector returned []. Request capture recorded aborted Next HEAD prefetches during navigation, not uncaught JS errors. No permanent test or full-site accessibility claim added.

### Responsive map dialog fit

- The selected-unit map dialog is capped at 1280px on desktop, uses 16px viewport gutters on mobile, and scales the full floor plan instead of requiring horizontal scrolling.
- Production build passed. Browser measurements at 1440×1000, 390×844 and 320×844 showed dialog/plan widths 1280/1230px, 374/348px and 304/278px; dialog, plan and document `scrollWidth` matched their `clientWidth`. All 11 A.1 floor labels fit their unit boxes at 320px.
- Map-popup screenshots timed out after 20 seconds in the browser tool; layout was verified from rendered DOM geometry and computed styles instead. No visual screenshot claim.

### Deferred map rendering — 15/10/2026

- Closed-map content is no longer rendered as Server Component children and serialized into the initial RSC payload. `LeasingUnitMap` receives only floor shared areas and unit IDs/areas/geometry, and builds the same plan when opened. The website-settings client provider likewise receives no unused inventory.
- Next/OpenNext build passed. Local workerd C.5 HTML fell from 87,333 to 63,040 UTF-16 code units (not compressed bytes). Actual Chromium desktop/mobile verified 23 floor links, C.5 selection, orientation/area, no overflow, completed Escape focus return, and map navigation to C.6 with the new dialog closed. Deployed Worker verified the same 23-link map and focus return; no physical-device or full accessibility audit claim.

### Shared floor-map facts — 19/10/2026

- `FloorPlanMap` owns the slot information and two exterior edge labels for public explorer/detail and admin: code, reference area, measured width × depth in metres, then a separate bottom status badge when status display is enabled. List cards, preview popups and the detail facts panel are unchanged; mini-maps retain their compact presentation.
- Dimensions come from the same `slot_versions.technical_spec.dimensions` used by public detail, not canvas coordinates or area division. Admin plan projection includes and validates this pair. The current local public API returned dimensions for 80/81 slots; F.2 displays “Chưa có kích thước”. Invalid/non-positive dimensions are rejected by the plan parser.
- Per owner clarification, the top edge reads **Mặt sau · Hồ Nước Ngọt**, and the bottom edge **Mặt trước · Đường Nguyễn Chí Thanh**. These describe the whole diagram, not a promised view from every unit; existing cardinal-direction/reference data is not rewritten.
- Non-mini diagrams now keep a 1280px minimum drawing width with contained horizontal scrolling, including detail maps. This supersedes the older fit-to-dialog rule above: adding dimensions must not shrink labels into illegibility. Edge labels remain visible while scrolling sideways; geometry/polygon positions are unchanged.
- Verification: application TypeScript and five focused parser/filter tests passed. Owned disposable PostgreSQL regression passed all five integration tests, including the admin plan query; no live DB mutation or migration. Chromium 1440/390px checked all 81 admin-variant controls in an isolated renderer using public geometry, selection and compact mini-map; this is not an authenticated admin-workspace browser check. Actual local public routes exercised all six floor maps, status-footers/label bounds, popup/Escape/focus return, F.2 unknown dimensions and keyboard map navigation to F.1 after native scrolling reveals the map. No document-level overflow or uncaught browser exceptions observed. No production build/deploy performed.
