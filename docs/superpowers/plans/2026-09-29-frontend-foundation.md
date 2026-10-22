# Frontend Foundation Cleanup Implementation Plan

> **For agentic workers:** This plan is executed inline in the current task. Complete one page group at a time and preserve all pre-existing working-tree changes.

**Goal:** Make the native multi-page frontend consistent and easier to maintain by consolidating shared design rules, navigation, page grouping, and resource ownership without changing public behavior.

**Architecture:** Keep HTML pages and public URLs static. Keep one authoritative design-token layer and one shared navigation data source with static renderers for the app header and utility-page header; preserve their distinct interaction controls. Migrate the main site, utility pages, account pages, admin workspace, and games in separate batches.

**Tech Stack:** Native HTML, CSS, JavaScript modules, Node.js scripts, existing Node HTTP static serving.

## Global Constraints

- Continue using native HTML, CSS, and JavaScript multi-page architecture.
- Preserve existing public URLs, static page delivery, APIs, DOM selectors, and business behavior.
- Do not add a runtime frontend framework.
- Keep shared site headers visible in static HTML; do not inject the whole primary page shell at runtime.
- Preserve admin workspace navigation and game-play-area visual themes.
- Keep light/dark theme, system-theme preference, mobile navigation, and `prefers-reduced-motion` behavior.
- Do not add or run automated tests unless the user asks for testing or verification.
- Do not stage or commit any pre-existing user changes.

---

## File Map

- `public/design-system.css` — canonical design tokens and shared primitives.
- `public/styles.css` — main-site layout, content, and view-specific styles.
- `public/utility-theme.css` — utility, game-shell, and shared page aliases/overrides; reduce to a consumer of canonical tokens.
- `public/utility-theme.js` and `public/theme-init.js` — theme initialization and user-facing theme/mobile-navigation behavior; consolidate only after confirming all current callers.
- `public/index.html`, `public/*.html` — static pages and their resource declarations; preserve public routes and feature DOM hooks.
- `public/app.js` — homepage and content-view behavior; keep business logic out of shared shell ownership.
- `public/admin.css`, `public/admin.html`, `public/admin.js` — independent admin workspace consuming shared tokens and controls.
- `public/auth.css`, `public/auth.html`, `public/auth.js` — account pages consuming shared tokens and controls.
- `public/*-tool.css`, `public/*-tool.js`, `public/*-core.*`, `public/*-worker.js` — tool-specific UI, processing logic, and workers.
- `public/game-shell.css`, `public/games.css`, `public/*game*.css`, `public/games/**` — shared game directory/shell and isolated game assets.
- `server.mjs` — static-resource allowlist and route mapping; change only when a moved asset needs an explicit compatible mapping.
- `README.md` and `docs/design-system.md` — project layout and design-system ownership documentation.

## Task 1: Inventory the Current Frontend Surface

**Files:**
- Create: `docs/frontend-structure.md`
- Read: `server.mjs`, `public/*.html`, `public/*.css`, `public/*.js`, `public/*.mjs`, `public/games/**`

- [x] List every top-level HTML page and group it as main site/content, image/video/utilities, games, authentication, or admin.
- [x] For each page, record its public URL, stylesheet order, JavaScript entry point, shared navigation variant, theme loader, and any inline CSS/JS.
- [x] Record which public assets require explicit `server.mjs` allowlisting and whether any deployed link depends on their current path.
- [x] Identify duplicated token blocks, repeated site-header markup, duplicate theme initialization, and page-specific files imported by another page.
- [x] Add the resulting page/resource matrix and the current asset-routing constraints to `docs/frontend-structure.md`.

**Deliverable:** A concise inventory that lets a maintainer find a page, its resources, and its exceptions without searching the whole repository.

## Task 2: Establish One Shared Design Foundation

**Files:**
- Modify: `public/design-system.css`
- Modify: `public/styles.css`
- Modify: `public/utility-theme.css`
- Modify: `docs/design-system.md`
- Read: `docs/frontend-structure.md`

- [x] Compare every `:root` and `[data-theme="dark"]` variable in the three stylesheets; map each duplicate to the canonical names already defined in `public/design-system.css`.
- [x] Move any genuinely missing shared token into `public/design-system.css` with light and dark values; leave page-only colors in the page stylesheet that owns them.
- [x] Remove duplicate global token definitions from `public/styles.css` and keep `styles.css` focused on main-site layout and content.
- [x] Replace shared hard-coded colors, radii, and shadows in `public/utility-theme.css` with canonical variables; keep utility layout rules there only when they serve more than one utility page.
- [x] Update `docs/design-system.md` to name `design-system.css` as the only shared token owner and specify which page stylesheet owns layout details.
- [x] Inspect every stylesheet load order recorded in Task 1 and adjust only pages that load shared styles in the wrong order.

**Deliverable:** One source of truth for shared visual tokens, with consumers retaining only their page-specific layout rules.

## Task 3: Consolidate the Shared Site Shell

**Files:**
- Create: `scripts/frontend/site-navigation.json`
- Create: `scripts/frontend/app-navigation-template.html`
- Create: `scripts/frontend/utility-navigation-template.html`
- Create: `scripts/build-site-navigation.mjs`
- Modify: `package.json`
- Modify: `public/*.html` pages that contain the public site header
- Modify: `public/utility-theme.js`
- Read/modify if required by routing: `server.mjs`

- [x] Store the shared navigation items, labels, destinations, app-view values, page identifiers, and active-state keys in `scripts/frontend/site-navigation.json`. Represent app views with their existing `data-view` values and static-page destinations with their existing URLs.
- [x] Create separate static render templates for the main app navigation and utility/game navigation. Keep the app header's search, category dropdown, submit, favorites, comparison, and drawer controls in `index.html`; keep utility pages' theme and mobile controls in their existing header actions.
- [x] Implement `scripts/build-site-navigation.mjs` using Node built-ins only. It must update only the `.site-nav` block in the explicit page list, select the renderer from each page's declared `data-site-shell`, set its active item from `data-page`, preserve the surrounding header and page content, and fail if a page, nav block, navigation item, or destination is missing.
- [x] Replace the marked navigation block in `public/index.html` and in-scope utility/game pages. Leave `public/admin.html`, `public/auth.html`, and third-party standalone game HTML files on their distinct shells.
- [x] Add `npm run frontend:navigation` to regenerate the static navigation from the shared data and templates.
- [x] Keep generated navigation present in HTML. Retain current theme persistence and mobile-menu behavior in `utility-theme.js`; remove only behavior made redundant by the shared navigation source.
- [x] Confirm the generated page set matches the inventory and preserve the pre-existing content around each marker.

**Deliverable:** One navigation data source with checked-in static HTML output and distinct app/utility renderings that retain their current interactions and public routes.

## Task 4: Organize the Main Site and Content Frontend

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Create or move only after route mapping is recorded: `public/assets/css/site/`, `public/assets/js/site/`
- Modify: `server.mjs` only for compatible asset path mapping

- [x] Separate `public/styles.css` into focused main-site stylesheet files by existing page responsibility (site shell, catalog, content views, and overlays) without changing selector names used by HTML or `app.js`.
- [x] Keep the homepage API/rendering behavior in `public/app.js`; move a function only if it has a single clear owner and preserve its current public entry point.
- [x] Update `public/index.html` stylesheet references in deterministic dependency order: design system, shared shell/layout, page-specific styles.
- [x] Keep all existing main-site routes and metadata intact.
- [x] Update `server.mjs` allowlist/mapping and README resource-layout notes only for paths changed by this task.

**Deliverable:** Main-site styles and scripts are grouped by responsibility and still load from the existing URLs.

## Task 5: Align Account and Admin Pages with the Shared Foundation

**Files:**
- Modify: `public/auth.html`, `public/auth.css`
- Modify: `public/admin.html`, `public/admin.css`
- Read: `public/auth.js`, `public/admin.js`

- [x] Make account pages use canonical theme, form, button, card, focus, and status tokens while preserving all fields, IDs, authentication flows, and redirects.
- [x] Make admin pages use canonical theme, form, button, table, dialog, focus, and status tokens while preserving the sidebar, information density, permissions, and admin DOM hooks.
- [x] Remove only proven duplicate appended overrides after moving their final intended values into the owning rule; do not delete a rule based only on matching colors.
- [x] Keep the admin shell distinct from the public-site header.

**Deliverable:** Account and admin pages share the visual foundation while retaining their separate interaction structure.

## Task 6: Align Utility and Game Page Groups

**Files:**
- Modify: `public/utilities.html`, `public/games.html`
- Modify: `public/image-*.html`, `public/video-*.html`, `public/link-extract.html`
- Modify: matching utility CSS files and `public/game-shell.css`, `public/games.css`
- Modify: `server.mjs` only if compatible mappings are needed

- [x] Normalize each page's shared stylesheet order and shared shell usage from the inventory.
- [x] Consolidate repeated upload, fieldset, status, action-button, and output-panel rules into utility-level styles only where multiple tools use the same behavior and appearance.
- [x] Keep image/video processing styles in their feature stylesheets and keep their scripts, workers, core modules, and DOM hooks unchanged.
- [x] Apply shared page shell, typography, cards, buttons, theme, and focus rules to game directory and game wrappers.
- [x] Preserve each game's canvas/board palette and isolated vendor asset tree.
- [x] Keep pricing-page inline export/print behavior and game-specific layout exceptions documented until they can be safely moved into owning files.

**Deliverable:** Tool and game pages use consistent shared controls and navigation without coupling their feature logic or gameplay visuals.

## Task 7: Close Out Ownership and Documentation

**Files:**
- Modify: `docs/frontend-structure.md`
- Modify: `docs/design-system.md`
- Modify: `README.md`
- Modify: `package.json` only if the final resource workflow requires another explicit script

- [x] Update the inventory with the final resource owner for every page group, including documented exceptions.
- [x] Document the exact command for regenerating static navigation and the rule that generated HTML must be updated together with navigation data and templates.
- [x] Document the CSS ownership rule: design tokens and primitives in `design-system.css`; site layout and content in site styles; page groups own only feature layout and feature state.
- [x] Remove obsolete references to duplicate token or navigation ownership.
- [x] Review the final diff to ensure no pre-existing user changes were staged or reverted.

**Deliverable:** The repository explains where frontend work belongs and how to update shared navigation without reintroducing drift.
