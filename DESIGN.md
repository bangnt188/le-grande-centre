---
name: "Le Grande Centre"
description: "A deep-green mall identity with a calm, precise leasing workspace"
colors:
  brand-ink: "#002116"
  brand-gold: "#d4af37"
  brand-gold-light: "#e8c84a"
  brand-paper: "#f4f0e4"
  brand-muted: "#b8c2ba"
  mall-dark-surface: "#001a12"
  mall-dark-raised: "#0a2a1a"
  mall-light-canvas: "#faf8f0"
  mall-light-surface: "#f5f5dc"
  mall-light-raised: "#ffffff"
  mall-light-ink: "#1a1a1a"
  mall-light-muted: "#444444"
  mall-outline: "#778a7f"
  admin-primary: "#163e2f"
  admin-selection: "#9b7938"
  admin-canvas: "#f5f3eb"
  admin-surface: "#fffefa"
  admin-raised: "#f4f5ef"
  admin-sidebar: "#082e22"
  admin-sidebar-ink: "#f3f0e4"
  admin-sidebar-muted: "#bbcabf"
  admin-sidebar-accent: "#dcc18a"
  admin-sidebar-line: "#2b4d3d"
  admin-nav-border: "#87956a"
  admin-selected: "#e9eee5"
  admin-selected-border: "#98ad9e"
  admin-ink: "#203a2e"
  admin-muted: "#647266"
  admin-line: "#e3e5db"
  admin-nav-active: "#244938"
  admin-floor-active: "#e9eee4"
  admin-field-border: "#e3e5db"
  slot-available: "var(--ui-slot-available-surface)"
  slot-leased: "var(--ui-slot-leased-surface)"
  slot-selected: "var(--ui-slot-selected-surface)"
typography:
  public-display:
    fontFamily: '"Charis SIL", Georgia, serif'
    fontSize: "clamp(2.5rem, 6vw, 5rem)"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0"
  public-body:
    fontFamily: '"Be Vietnam Pro", "Aptos", system-ui, sans-serif'
    lineHeight: 1.8
  admin-headline:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "34px"
    fontWeight: 400
    letterSpacing: "-0.025em"
  admin-headline-mobile:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "30px"
    fontWeight: 400
  admin-area:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "32px"
    fontWeight: 400
  admin-panel-title:
    fontSize: "17px"
    fontWeight: 600
  admin-mobile-field:
    fontSize: "16px"
  admin-geometry-status:
    fontSize: "10px"
  admin-title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 700
  admin-body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
  admin-control:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 500
  admin-label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 500
  admin-meta:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
rounded:
  admin-chip: "3px"
  admin-floor-choice: "4px"
  admin-control: "8px"
  admin-panel: "12px"
  brand-control: "0"
spacing:
  compact-gap: "6px"
  control-gap: "8px"
  panel-gap: "24px"
  inspector: "24px"
  rail-inline: "12px"
  sidebar-inline: "18px"
  content-inline: "36px"
components:
  admin-button-primary:
    backgroundColor: "{colors.admin-primary}"
    textColor: "{colors.admin-surface}"
    rounded: "{rounded.admin-control}"
    padding: "0 12px"
    typography: "{typography.admin-control}"
  admin-button-secondary:
    backgroundColor: "{colors.admin-raised}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.admin-control}"
    padding: "0 12px"
    typography: "{typography.admin-control}"
  admin-field:
    backgroundColor: "{colors.admin-raised}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.admin-control}"
    padding: "8px 12px"
  admin-nav-active:
    backgroundColor: "{colors.admin-nav-active}"
    textColor: "{colors.admin-sidebar-accent}"
    rounded: "{rounded.admin-control}"
    padding: "9px 11px"
  admin-panel:
    backgroundColor: "{colors.admin-surface}"
    rounded: "{rounded.admin-panel}"
  admin-chip:
    rounded: "{rounded.admin-chip}"
    padding: "4px 7px"
  admin-floor-active:
    backgroundColor: "{colors.admin-floor-active}"
    textColor: "{colors.admin-primary}"
    rounded: "{rounded.admin-floor-choice}"
    padding: "9px 10px"
  admin-plan-slot:
    backgroundColor: "{colors.slot-available}"
    padding: "7px 3px"
---
# Design System: Le Grande Centre

## Overview

**Creative North Star: "A leasing desk"**

Le Grande pairs a deep-green mall identity with restrained gold and editorial serif display type. In the admin workspace, that identity becomes a calm leasing desk: a dark green navigation rail, a warm light canvas, pale panels and focused green actions. The admin palette is a scoped product adaptation; it does not replace the public shopping-mall theme.

The workspace treats approved brochure references and DB-backed records as working information, without claiming surveyed geometry. The plan, register and inspector stay connected; labels carry status alongside color. Company, tenant and contract views share one enterprise module rather than separate sidebar destinations.

**Key Characteristics:**

- Deep green, warm paper and muted gold, with separate public and admin scopes.
- Editorial serif for public display and local admin panel/dossier headings; sans serif for controls and records. No global page-title/description/reload block.
- Flat bordered panels, quiet selection fills and explicit text status.
- Fixed-width geometry with contained scrolling and stacked mobile layouts.

**The Scope Rule.** Keep brand colors and admin semantic overrides separate; admin route tokens stay under the admin root.

## Colors

The public theme uses a dark green base, warm gold actions and soft paper text. The operational variant inverts the workspace to a light canvas while keeping a dark sidebar. Frontmatter values are the color source of truth; synthesized sidecar ramps are preview metadata, not additional production tokens.

### Primary

- **Deep Mall Green** (`brand-ink`): public theme canvas and dark-theme foreground for gold actions.
- **Mall Gold** (`brand-gold`): public action and accent color; the brighter `brand-gold-light` is reserved for hover and focus on the dark scheme.
- **Leasing Green** (`admin-primary`): actions and emphasis in the admin workspace.
- **Sidebar Green** (`admin-sidebar`): navigation surface; its warm light text and brass accent are scoped to the sidebar.

### Secondary

- **Muted Brass** (`admin-selection`): admin selection outline and keyboard focus, distinct from public brand gold.
- **Pale Brass** (`admin-sidebar-accent`): active sidebar text and emphasis on the dark navigation surface.

### Neutral

- **Warm Paper and Soft Sage** (`brand-paper`, `brand-muted`): public text and supporting detail on dark green.
- **Leasing Canvas and Porcelain** (`admin-canvas`, `admin-surface`, `admin-raised`): workspace, panels and raised controls.
- **Admin Ink, Muted Text and Fine Line** (`admin-ink`, `admin-muted`, `admin-line`): operational text, supporting labels and dividers.
- **Inventory Fills**: Trống uses a pale success-green surface; Đang thuê uses a warm brass surface; Đang chọn uses a solid action-green surface, on-action text and accent outline. All are mapped through --ui-slot-* tokens onto --ui-color-* semantic tokens. Badges use the same occupancy palette; selection never overwrites occupancy.

The public theme also defines dark and light semantic surfaces. Admin route overrides remain explicit so theme changes do not leak between the public frame and operations workspace.

## Typography

**Public display:** Playfair Display with Georgia and serif fallback. **Public body:** Be Vietnam Pro, Aptos, system UI and sans fallback. These stacks are declared in CSS; this document does not assume the named web fonts are downloaded.

**Admin display:** Georgia and Times New Roman serif stack for local panel and dossier headings. **Admin body:** system UI sans. Tabular numerals support dates, areas and register values; global `AdminPageHeader` is no longer rendered.

### Hierarchy

- **Public display** (regular, fluid 2.5–5rem): the centered holding-page headline.
- **Admin headline** (regular): local dossier heading where needed, not a repeated global route header; panels keep their contextual titles.
- **Area display** (regular, 32px): selected area in the plan inspector.
- **Panel title** (semibold, 17px): section and register headings.
- **Body** (13–14px, 1.55–1.8 line height): workspace copy and records.
- **Label and meta** (11–12px): filters, form labels and supporting information. Plan geometry may use 9–10px only where the diagram requires it.

The interface keeps small operational labels compact, but important status, inventory and action meaning must remain available as readable text.

## Layout

The shared shell supports sidebar/top navigation for other consumers. Le Grande uses a fixed grouped sidebar (Mặt bằng, Kinh doanh, Tài nguyên, Hệ thống), no layout selector or workflow dropdown. Kinh doanh has one **Doanh nghiệp** destination, not separate tenant/contract items. Inside it, outer shared `Tabs` expose **Tất cả / Khách đang thuê / Hợp đồng**. Arrow keys focus tabs and Enter activates. The sticky shell header retains breadcrumbs, Mở website and Đăng xuất; the global `AdminPageHeader` title/description/reload block has been removed from every screen. Local panel headings and error-only **Thử lại** for recovering an empty failed workspace remain.

Website configuration stores independent Zalo/email/phones/address in Neon PostgreSQL; public SSR reads its filtered DB projection rather than same-browser state. Branding/uploaded raster images are Neon-only, project images/video/brochure use public R2, and PDF documents use private R2 quarantine plus external manual review. No static/R2/browser logo fallback or 3D viewer link; no antivirus-clean/eSign claim. Metadata and bytes do not persist in browser IndexedDB.

The Le Grande workspace has a 1564px content cap, 36px desktop inline padding and 24px padding below 1250px. The sidebar uses 18px inline padding and 24px top inset. At 850px and below, desktop navigation is replaced by a themed modal menu with focus containment, Escape dismissal and focus return. The mobile workspace uses 16px inline padding, 44px minimum touch controls and 16px field text.

Admin entry `/admin/` uses managed Neon Auth with shared form fields, verified email and active DB staff allowlist/assignment; signup never grants workspace access by itself. `/admin/workspace/` uses the same-origin API and relational CAS/idempotency/audit/RLS. No demo username/password/session marker or IndexedDB fallback. Unsaved drafts remain ephemeral with confirmation on navigation. No customer portal or embedded website preview.

Plan and record views place a primary region beside an inspector, then stack them at the compact breakpoint. Leads and leasing requests instead keep a full-width paginated list and open the selected record in the shared `Sheet`: right-edge 36rem panel on desktop, full viewport width on mobile, fixed header/close control and independently scrolling body. No implicit first-record selection. Escape/backdrop/close returns focus to the opener; nested editors remain in the Sheet tree with existing draft confirmation. The B2B dossier keeps its company list beside the dossier. Feature breakpoints at 1250px, 1100px, 1000px, 800px and 520px handle content density independently of the shared shell breakpoint. Six floor choices stay in a fixed grid; narrow filters wrap and media tiles reduce to two columns.

The floor diagram keeps contained labelled, keyboard-focusable scrolling. Tables scroll inside panels; the tenant table has a 720px minimum width without widening the page. Main observed no page overflow at 1440/390/320px after the enterprise-tabs cutover. Long statuses/media names wrap and supporting lead details truncate within rows.

## Elevation & Depth

Admin panels are flat at rest. Thin borders, warm surface changes and selected fills establish hierarchy; no shadow is applied to the plan, register or inspector panels. Overlay shadows exist as shared theme tokens for floating surfaces, while the navigation dialog uses a backdrop to separate it from the workspace.

**The Flat Panel Rule.** Use a border or a tonal surface change for ordinary workspace sections; reserve shadow for overlays that must sit above the page.

## Shapes

Public brand controls retain square corners. Admin controls use a softly rounded 8px corner; panels are larger at 12px, floor choices use a tighter 4px corner and selection chips use 3px. Avatars remain circular. Slot rectangles stay square so the plan reads as geometry rather than as a card grid. Selected slots use an inset outline; grouped footprints use a stronger border while still showing their original members.

## Components

### Buttons and fields

Shared buttons use the admin action palette, compact horizontal padding and a 42px minimum height; mobile actions grow to 44px. Quiet and secondary variants remain on the light surface. Inputs, selects and textareas use a raised fill, fine border, visible label and an explicit gold focus ring. Disabled and loading states keep native button behavior and clear text feedback.

### Panels, chips and registers

Plan, inspector and record panels use warm white surfaces, a thin line and generous 24px padding in the refined admin layout. Toolbars and tables use dividers instead of nested card borders. Slot-membership chips list original slot codes and expose a named removal action. Registers keep a stable pagination footer and stable table columns as visible rows change.

Admin creates/edits reuse `AdminEditor` with shared `Sheet`. **Unsaved-change discard confirmation uses a centered `ConfirmDialog`**, nested in the editor tree; navigation/logout that could discard drafts uses the same popup. Continue editing, Stay and Escape preserve the draft; explicit discard closes the editor or proceeds with navigation. Global confirmation portals follow the workspace content so they remain above full-width mobile Sheets. Other business confirmations retain `ConfirmSheet`, and historical-contract previews use Sheet. Former inline space/merge, company-note, staff-role and logo-upload forms keep the right-edge Sheet, with Save/Cancel, pending/error and field preservation. The header stays visible and the body scrolls; desktop width is 36rem, mobile fills the viewport. Pending saves prevent dismissal and duplicate submits, failures retain the draft. Login and public overlays are unchanged. Lease recording remains metadata-only; historical private PDFs retain their existing handling.

### Navigation and floor choices

Vertical and horizontal navigation use the same item states. The active item has a tinted surface, semantic border and a 3px position marker; horizontal navigation moves the marker to the bottom edge. A collapsed icon rail keeps the button hover surface inside the rail and exposes its name with the native `title` attribute. Keyboard focus remains a separate 3px outline.

Floor choices communicate one of six fixed floors with a clear selected fill and border. Floor titles/content come from DB-backed approved project seed/settings, not fabricated tenant allocations. Brochure diagrams remain provisional references, not survey certification.

### Status and feedback

Badges combine a restrained tone with a text label. Inventory state must never rely on color alone. Transient confirmations and errors use the shared toast component; persistent constraints stay with the relevant record. Pagination shows the current range, total and page-size control, and remains outside the changing content region.

### Floor plan and grouped spaces

The signature view connects the slot plan to register/inspector. Selection previews area and membership; a group remains composed of original slots. Approved brochure geometry retains its source and gaps; do not repeat an old B-series fixture across floors as confirmed technical inventory.

**The Slot Identity Rule.** A grouped space is shown as a combination of base slots; keep each original slot code and area visible in the register.

### Company and contract workspace

The **Doanh nghiệp** entry opens a single full-width register with search, a derived relationship-status filter, property-wide totals and one server pagination. The former outer **Tất cả / Khách đang thuê / Hợp đồng** tabs are removed. Selecting a row opens the existing `@mall/ui Sheet` at about 45% desktop width (full width on mobile), with **Tổng quan / Yêu cầu / Mặt bằng thuê / Hợp đồng** sections. Load the selected company on open and related records only when their section is active. No activity-history section is displayed; server business audit is retained. Company category remains derived: recorded lease → **Đang thuê**; otherwise active unexpired hold → **Đang giữ chỗ**; otherwise submitted/reviewing request → **Đang tư vấn**; otherwise **Chưa thuê**. Never persist a second status. Current recorded/executed leases make the “Đang thuê” and “Có hợp đồng” company totals equal; this UI change does not add a lease lifecycle. Company-linked contracts preserve exact record navigation, with historical private documents accessible from each contract. Directly occupied slots without a company remain in **Căn / Mặt bằng**, without fabricated company records.

Current phase2 evidence reported by Main: `test:admin`23pass/1deliberateliveskip, isolated `test:database`2/2pass with owned child cleanup, typecheck/shared backend integrity/tests/OpenNext build pass; browser1440/390/320px no overflow and keyboard/record-context checks. Production backend seed/Auth settings exist, but frontend production/domain/DNS cutover is explicitly deferred. Worker→Neon S3/Functions still returns403 before provider; no all-Worker readiness or OTP-delivery claim. Subsequent dated design notes preserve historical evidence and do not override this current admin state.

## Do's and Don'ts

### Do:

- **Do** keep the public brand palette separate from route-scoped admin colors.
- **Do** pair status color with readable text and preserve visible keyboard focus.
- **Do** keep plan geometry square, label grouped members and retain the central core boundary.
- **Do** use the customer reference raster with its provenance when showing the source plan.
- **Do** keep the diagram and tables inside their labelled scroll regions on narrow screens.

### Don't:

- **Don't** use color alone to communicate inventory or lead status.
- **Don't** style slot geometry as rounded cards or hide the original members of a grouped space.
- **Don't** apply admin typography or semantic overrides to the public identity.
- **Don't** present repeated fixture geometry or sample documents as confirmed inventory or signed records.

## Public image-to-3D experience — historical, archived 13/10/2026

This section records the previous design. The customer requested complete public removal: no 3D CTA, route or published manifest/projection. Preserve the scene/viewer source and history in https://github.com/bangnt188/3d-model-mall, mounted at archives/3d-model-mall as a source-only submodule. Keep R2 asset URLs public. Preserve homepage v2 and its image-based 2D floor interaction; mobile cards start 16px below the image after removing the obsolete CTA. Shared component-ui 3D/motion modules remain unchanged.

The supplied sunset image and https://realestate-neotix.vercel.app/ govern the public experience, not the admin workspace. Mode: Experience. Home leads with the exact supplied image, edge-to-edge, a quiet project title and the explicit “Khám phá” action. The image is a labelled concept reference, not evidence of the existing building architecture.

`/kham-pha/` is a full-viewport scene, not an embedded card: canvas fills the screen; a persistent “Thoát” link returns home. Floor information lives in a dismissible HTML panel; controls recede onto charcoal surfaces. Mobile uses the same canvas-first flow with a bounded information sheet and 44px touch controls.

Public palette replaces green with midnight slate `#19252b`, charcoal `#242b2c`, amber `#e7bd79`, limestone paper `#f1e9dc`, cream `#fff2dc`. Keep Playfair Display and Be Vietnam Pro. Scene mood is golden sunset, dark reflective road, warm lighting and lush landscape. Preserve the actual building geometry, never copy the reference building.

Free horizontal360° orbit and overhead elevation are required; presets are starting points, not orbit corridors. Limit distant zoom, not all-view building fit. Cars and people move on defined paths; motion can pause and respects reduced-motion/hidden tabs. Load 3D only after entering the experience. Admin colors, data truth and public-claim approval rules remain unchanged.

## Homepage navigation refinement — 08/10/2026

Prioritize the public homepage for client review. Use five destinations with separate pages: Trang chủ, Mặt bằng / Cho thuê, Tổng quan từng tầng, Tổng quan Le Grande, Liên hệ. The homepage retains the existing cover, project film and contact section; its main cover action opens leasing information, with 3D as a second action. Six floor links form an editorial list beneath the introduction. Programme descriptions share one public content module with the overview pages and viewer; they do not represent live inventory.

The shared header uses a horizontal desktop menu and a native mobile disclosure. Keep the dark slate, cream and amber public identity. Separate pages reuse the header and contain available public project information; no leasing workflow is added. Verification: TypeScript passed, four new routes returned HTTP 200, the mobile menu navigated to the leasing page, and 1440px/390px browser checks showed no horizontal page overflow. Screenshots inspected at `/tmp/le-grande-home-desktop.png`, `/tmp/le-grande-home-mobile.png` and `/tmp/le-grande-home-floors.png`. These checks cover local UI and navigation, not production deployment.

## Canva content import — 08/10/2026

Keep the exact shared navigation: Trang chủ, Mặt bằng/Cho thuê, Tổng quan từng tầng, Tổng quan Le Grande, Liên hệ. Apply the supplied Canva layout and content below that navigation on the leasing, project overview and contact pages. These pages use scoped green and cream styling, native filters and floor selection, local attributed imagery and shared contact details. Floor overview links select the corresponding leasing floor by hash. The sample A01–A05 plan is illustrative; floors 2–6 await technical data. Customer portal stays hidden.

Local visual inspection covered all three pages at 1440px and 390px, with no horizontal page overflow and all images loaded. Area filtering was checked manually. This is a local UI update; production CMS integration and publication remain outside this change.

## Contact form and legacy editorial sections — 08/10/2026

Contact follows the supplied Canva two-column composition: project contacts on the left, a cream framed form on the right. At narrow widths, information then fields flow in DOM order; form controls use 16px mobile type and minimum 48px height. The form uses existing shared UI fields with local semantic tokens, explicit unchecked consent and inline validation. Business fields, validation and first-error focus remain local; the shared `@mall/ui/forms` survey submission hook owns readiness, duplicate-submit protection, storage synchronization and the three-success/five-minute window followed by a five-minute cooldown. The contact adapter selects `mode: "demo"` and local storage with the existing `legrande:contact-preview-rate-limit:v1` key. Demo mode never sends or stores contact details.

The old legrandecentre.vn site now governs the investor letter and project document sections. Preserve its centered serif title, green/gold emphasis, pale decorative stock background, quote rhythm, diamond SVG divider and leadership signature. Keep its three document groups; only actual available files get download anchors. Brochure uses the verified local file; decision is copied from the public old site. Dedicated floor plans and building permit await files because the old floor-plan URL returns brochure bytes and the permit URL is missing. Route composition and shared navigation stay intact.

## Branded header and Solar-style submission feedback — 08/10/2026

Use the original legrandecentre.vn logo mark with its uppercase gold serif wordmark in the shared public header, including the homepage. Self-host the resized transparent logo (256px) and browser icon (64px). Keep the approved five page destinations rather than importing the old eight anchor links. The header remains available while scrolling; desktop links use the old gold hover/active underline, and the native mobile disclosure closes on navigation. Motion respects reduced-motion.

The contact form delegates submission outcomes to `useSurveySubmission<ContactValues>` and default feedback to the shared `SurveyForm` wrapper from `@mall/ui/forms`. Shared demo mode matches Solar’s 700ms submission delay and equal random success/failure outcomes; live mode instead requires a real asynchronous submit handler. `SurveyForm` owns the persistent demo disclosure and safe-area-aware system Toast, including honest demo copy, accessible announcements, close and timed dismissal. Contact no longer duplicates gateway simulation, rate-limit helpers, notice state, Toast markup or placement CSS. Failure preserves the form values; only a shared successful submission resets them. The local form retains its fields, labels, first-error focus and cooldown countdown copy.

Verified locally at 1440×960 and 390×844: original logo loaded, all five destinations remained usable, mobile keyboard navigation closed the menu, neither page nor toast overflowed, both outcomes appeared, dismissal worked, and the third demo success disabled submission with a 05:00 countdown.

## Vietnamese display typography

Public display headings use self-hosted Charis SIL at weight 400 in normal and italic styles, with Latin and Vietnamese subsets loaded through `next/font/google`. Charis is also used by the homepage gallery captions. Be Vietnam Pro remains the functional/body family; Playfair Display remains available for the brand, existing editorial sections and the admin theme. On `/lien-he/`, the contact information list uses self-hosted Inter for labels, values, support notes and the map link; the heading and form keep their existing typography. Do not change the logo, copy, form typography or admin styling as part of this correction.

Vietnamese display headings need room for stacked diacritics: use line-height 1.35 and zero negative tracking, with the existing 1.45 contact heading leading retained. The homepage introduction allows a 10ch measure and a small inline-end inset for italic overhang. Preserve responsive size rules instead of shrinking text to hide collisions.

Local checks covered 1440px, 848px, 390px and 320px widths, the homepage introduction and the overview, floor overview, leasing and contact headings. Chrome reported actual Charis SIL regular/italic glyph rendering, measured ink clearance stayed positive, long Vietnamese copy stayed inside the heading, and no horizontal page overflow was observed. TypeScript and the Next production/static export build passed.

## Homepage v2 — supplied reference, 10/10/2026

The supplied `Trang chủ.png` governs homepage v2; the client subsequently approved applying its cream header across public pages. Route `/` composes `homepage-v2.tsx`; `homepage-v1.tsx` preserves the previous composition without an active route or import from v2. Existing viewer and destination-page content are unchanged. This supersedes the earlier homepage-cover composition and old public header styling, not admin.

Use a scoped cream-and-green editorial surface: paper `#fffcf5`, green `#123e2e`, deep green `#002116`, warm brass `#a4853c`, divider `#dcdccd`, and gold floor actions `#e4c962`. Supporting green-tinted text and brass hover states stay local to `homepage-v2.module.css`. Charis SIL owns display headings, italic section titles and captions; Be Vietnam Pro owns body and controls. The scoped ramp uses 90px maximum hero display, 30–46px section headings, 30px floor-range headings with 19px functional subtitles, 21–27px card titles, 12–14px body, and 9–11px labels/captions. Keep generous leading for Vietnamese diacritics and responsive image heights independent of intrinsic HTML dimensions.

Honor the annotations rather than rendering them: one composite building uses the actual supplied cutaway, scroll-driven layer separation, three numberless hover/focus/touch hotspots, and links to the selected floor plan. Replace the six-tile amenities grid with the existing expanding-gallery pattern, stacked vertically on mobile. All six categories remain present. The final image collection uses project photography in a masonry-like editorial collage rather than unrelated hotel branding. Hero uses client-supplied `ảnh hero.png`, optimized as `hero.webp`; “Nhịp Thở Mới” uses `nhiptho.png`, optimized as `introduction.webp` without an illustrative caption or description. Other illustrative assets retain their disclosure. All facts and floor ranges come from the public brochure model; no live vacancy or third-party tenant claims are added.

Local smoke covered desktop pointer hover, keyboard floor selection, 390px mobile disclosure/Escape, floor selection, gallery activation, thumbnail selection and navigation to `/mat-bang/#tang-2` with floor 2 active. The homepage had no canvas or GLB/model resource requests and no horizontal overflow at 390px. Native project video playback reached readyState 4. TypeScript and the 92-page Next static export passed.

### Client-approved header and motion refinement

Use one `SiteHeader` and `SiteFooter` across public routes, backed by `PUBLIC_NAVIGATION`. “Không gian kinh doanh” links to `/tong-quan-tang/`, “Le Grande Centre” to `/tong-quan/`, and “Đặt lịch tham quan” to `/lien-he/`; destination content and demo form behavior remain unchanged. Desktop labels are nowrap; at 1200px and below switch the complete navigation to the native disclosure rather than hiding destinations. Neither mode includes a 3D link; `/kham-pha/` is removed as of 13/10/2026. Header height is 88px desktop/76px at 720px and below, owned and consumed by the global public-header token. CTA radius is 8px, including contact-form submit and visit actions; inputs remain square. Keep old left-origin underline hover/active motion extended to keyboard focus.

V2 reuses `LayeredScrollStory` and `ScrollMotion` from v1: stationary hero under the header, a content surface sliding over it, cream cloud background motion and expo-out section entrances. No old homepage is imported. Reduced motion disables Lenis/entrances and makes hero relative with zero offset, avoiding a header-sized blank gap; content remains visible.

Real Chromium screenshots verified desktop hero/intro and the exact 390px mobile hero/intro. Opening one headless Chrome app tab avoids the earlier capture problem; do not open separate named spawned handles to the same target for desktop/mobile. Live checks exercised hover/focus underline, active tabs after navigating all three renamed destinations, mobile menu open/Escape/navigation close, floor-2 navigation, motion toggle and no horizontal overflow at 1366px, 1201px, 1001px, 390px and 320px. The 92-page TypeScript/static production build passed.

### Leasing catalogue — supplied hero and popup selection

The leasing page uses the client’s evening facade as a full-bleed cover, a separate dark-green overlay, gold eyebrow and white two-line italic Charis SIL title. Optimize the supplied 785×442 photo to WebP without resizing. The compact catalogue has five floor groups (1–2, 3, 4, 5, 6), two native filters, and mutually exclusive Map/List modes. Keep two physical diagrams and all 22 original A/B units in the first group; do not sum areas or invent merged units. Preserve physical floor hash aliases and explicit unit query selection.

Map slots and List rows open the shared controlled Modal; only its detail CTA navigates to the existing unit route. No implicit first-unit selection or inline detail panel remains. Portal inside the local green/cream theme, restore focus to the clicked slot, trap Tab, and close via Escape, backdrop or button. On narrow screens put view controls at the left, clear of the shared floating contact control; plans scroll horizontally inside their own regions and long popups scroll vertically.

Live Chromium proof covered desktop Map/List, all physical floor inventories, filtering and empty/reset states, A/B facts, B.1 detail navigation and the existing child-page map modal, native mobile touch, keyboard focus/trapping, backdrop close and a cold B.1 deep link. Captures at 1366/390/320px showed no horizontal page overflow. Popup-scoped axe reported zero violations and one manual contrast check; measured secondary text contrast is 8.66:1 on the solid green popup, with readable non-overlapping text.

### Shared image viewer — inline and modal

`ImagePreview` in `@mall/ui` owns the image viewport, zoom toolbar, cyclic photo navigation and thumbnail strip. Keep an opaque neutral canvas and sharp image/controls; only the backdrop receives 38% black dimming and 6px blur. Portal into the nearest local UI theme/root, rather than inheriting the public body’s dark scheme. Use standard `backdrop-filter` without a trailing manual WebKit declaration: the UI build otherwise retains only the unsupported prefix in Chromium.

The public unit gallery opens this controlled lightbox from either its main photo or **Xem tất cả ảnh**, shares the selected index, and no longer uses a stacked-photo modal that closes upon selection. `FilePreview` reuses the renderer inline and offers **Mở xem ảnh**, without changing its file-reading policies or other document renderers. Zoom is 50–300% of fit, with real layout dimensions and native scrolling rather than a clipped center transform. Restore focus to the actual opener; keep focus inside the viewer even when a zoom control reaches its disabled bound.

Live Chromium proof covered 1366px desktop zoom limits/panning, source-change fit reset, buttons/thumbnails/arrow keys, close-button/Escape/backdrop dismissal, focus restoration and a complete Tab cycle. Native touch at 390px exercised photo opening, zoom and thumbnail navigation; the 320px popup retained its image/controls without horizontal overflow. A routed 404 produced the image error state and allowed navigation to the next valid photo. The existing admin image fixture verified FilePreview inline zoom and modal opening. UI build/typecheck and the 92-page Next static export passed. A separate browser run against the actual static export confirmed background blur, sharp foreground, photo navigation/reset and Escape dismissal.

### Reasons section — supplied opacity reference

The client supplied a dedicated evening facade (`taisao.png`) and a reference with softly blurred architecture and dark-green panels fading toward their bottoms. `reasons-background.webp` crops the upper 24.5% sky, applies Gaussian blur radius 1.15 at source resolution, and keeps the building/landscape. Apply blur to the prepared image only; never blur foreground content or lower opacity on an entire card. The section has a 42% green-dark overlay; panel background alpha fades from 98% to 38%, body color is warm white at 92%, and serif italic headings use the same pale green as headings on other dark surfaces; gold stays reserved for functional accents. Panel corners are 12px. Existing six reasons and intro copy remain unchanged.

Desktop keeps three columns/two rows with generous row clearance. At 720px and below, use one column and a viewport-height sticky image behind the longer text flow, with cover preserving the image proportions; reduced motion restores an absolute static background. Reuse the existing entrance animation, with all text visible after reveal or immediately under reduced motion. Actual desktop/mobile captures verified the supplied background and translucent panels; live checks covered six readable cards, no horizontal overflow at 1366/390/320px, sticky background reaching the final card, and reduced-motion content visibility.

### Single building — scroll expansion

Replace repeated floor panels with one 2D scene. Partition the client’s `phan-khu.png` into three lossless alpha WebP layers on a shared 1440×960 canvas: base/core/ground, middle office wings, and roof. Remove exterior white while preserving enclosed whites and the original ground shadow. The layers total 1,018,580 bytes. Preserve visible source geometry; do not invent concealed facades. Compact offsets are 9% for the middle and 20% for the roof; the base stays fixed.

ScrollTrigger progressively returns those offsets to zero; reverse scrolling compacts the building. Start later by shortening the former scroll range to 1/1.15, keeping the original open endpoint (desktop scene center at viewport 50%; mobile scene top at 20%). This makes separation approximately 15% faster per scroll distance without moving the completed pose out of view. The gold hotspots fade in from the beginning of separation, with expo-out opacity, and track the middle/roof offsets rather than floating at their final locations. Hover/focus/touch becomes available as soon as separation starts, not after completion. The leader’s origin tracks the same linear layer progress while its card endpoint stays fixed; closing fully disables the dots and removes the card/leader. Their expanding/fading rings reuse the 3D viewer’s 2.8-second ease-out pulse and staggered phases; pause outside the viewport or in hidden tabs. Reduced motion presents the exploded pose, enables controls immediately and removes the pulse. This scene owns its choreography and is excluded from the generic section entrance.

Three numberless 12px marks have 44px hit targets, for floors 1–2, 3–4, and 5–6. Hover, native keyboard focus, or touch selects a group, draws one leader and shows one information card. During compact/partial poses the mobile hit targets overlap; pointer selection resolves to the nearest dot center rather than whichever button is stacked on top. Keyboard focus and keyboard clicks still select their exact native button. Its two floor buttons preserve hover/click selection and brochure-derived content, area ranges and selected-floor links. Escape/close returns focus to the active dot without reopening; use native DOM Tab order. Floor-range headings are 30px with 19px functional subtitles. Desktop cards sit beside the building; mobile cards sit below with reserved space and a downward leader, including 320px clearance for the longest descriptions.

Actual production-export smoke covered compact/open/reverse poses, all three groups, native Tab/Escape, touch selection at 390px, all six floor cards at 320px, reactive reduced motion, and navigation to `/mat-bang/#tang-6` with floor 6 active. The retimed desktop range measured 620px versus 713.33px previously (1.1505× speed). The early-marker refinement verified the pulse changing over time, pausing offscreen/in hidden tabs, resuming when visible, and disappearing under reduced motion. The latest interaction change was exercised on the live site at 1366px, 390px and 320px: all three groups open during partial separation and after full opening; nearest-dot touch selection chooses the intended group despite overlap, and measured leader-origin error stays below 0.1px. Keyboard focus/Enter and Escape remain usable; fully compacting removes the card. TypeScript and the 92-page static export passed.

### Homepage video and banner — client correction, 11/10/2026

The project film follows the legacy site: muted, looping, inline background playback without native controls. Keep its existing below-hero position and responsive cover crop; do not move it behind the hero text. Pause offscreen, in hidden tabs and under reduced motion. The client clarified that the hero must keep `images/home-v2/hero.webp`; only the video thumbnail is removed. Both homepage and viewer videos have no poster attribute; retain no local MP4 or obsolete project-film poster assets.

The static export build passed. Real Chromium checks at 1366×800 and 390×844 verified the original hero image, absence of video posters, muted autoplay without clicking play, no homepage native controls and no mobile horizontal overflow. Earlier playback checks crossed the loop boundary, paused/resumed offscreen and respected reactive reduced motion.

The homepage film includes a compact 44px-minimum sound toggle on a solid deep-green surface at its lower-right corner. Default autoplay stays muted to satisfy browser policy; only an explicit user click/tap enables sound. The visible label names the next action, while the stable accessible label and pressed state communicate sound status. Preserve the chosen sound state when the video leaves and re-enters the viewport. Chromium checks verified decoded audio with mute disabled, keyboard muting, offscreen pause/resume without re-muting, and both sound transitions through touch input at 390px.

The server homepage imports the sound control directly from the dedicated `home-video-sound-toggle.tsx` client boundary via its default export, rather than a newly added named export in the shared interactive module. The Next 16.3.6 Turbopack dev route was verified after editing, including client navigation away/back and both sound transitions, with no captured runtime errors.


### Admin company logos and contextual uploads

Company logos use shared `UploadField`, `CheckboxField` and `Avatar` in the existing editor. Persist the uploaded media ID on the company's property relationship; initials remain the Avatar fallback. Floor overview opens an in-place upload Sheet with a fixed floor scope; floor-content editors include UploadField directly and upload selected files when saving. Neither flow navigates to Media. Media and website-logo file inputs also use shared UploadField. App wrapper-label grid styles must exclude shared field labels; preserve their native inline label/required marker and checkbox layout instead of overriding component internals.
