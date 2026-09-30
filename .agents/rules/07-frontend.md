# Rule 07 — Frontend (React)

## Stack

React + TypeScript (strict) on Vite; TanStack Query (server state); React Router; React Hook Form + Zod (`@hookform/resolvers`); Mantine (proposed default component library, MIT); react-i18next. No Redux or other global state library.

## Structure

```
apps/web/src/
  app/            # providers, router, layout shell, auth bootstrap
  features/<module>/   # pages, components, hooks, api calls for one module
  components/     # shared, module-agnostic UI
  lib/            # api client, i18n, formatting, permission helpers
  locales/        # en/ (default); other languages later
  styles/
```

Feature folders mirror backend modules. A feature never imports from another feature's internals; shared pieces move to `components/` or `lib/`.

## Data and state

- All server data through TanStack Query. Query keys are centralized per feature.
- Types and Zod schemas come from `packages/shared`. Never hand-write API types.
- One API client (`lib/api`) that: sends `credentials: 'include'`, attaches `X-CSRF-Token`, parses the standard error format, and on `401` clears state and redirects to login.
- Local UI state stays local (`useState`). No storing patient data in any browser storage, ever.
- **Never use `localStorage` or `sessionStorage` for authentication or patient data.** Non-sensitive UI preferences (language, table density) are allowed.

## Authentication and permissions in the UI

- On load, call `GET /auth/me` to get the user, permissions, and CSRF token.
- If `must_change_password`, force the change-password screen before anything else.
- `usePermission('patient.read')` and `<Can permission="...">` hide or disable UI. **This is convenience only; the server enforces everything.** Never rely on UI hiding for security.
- Show a warning before the idle timeout and redirect to login cleanly when the session ends. Unsaved form data is not preserved silently; warn the user.

## Forms

- React Hook Form with the shared Zod schema as the resolver, so client and server validation match.
- Inline field errors with clear messages. Disable submit while pending; handle `409 VERSION_CONFLICT` by telling the user the record changed and offering to reload.
- Keyboard-first: logical tab order, Enter submits, autofocus the first field, shortcuts for frequent reception actions. Reception staff are fast typists.

## Tables and lists

- Server-side pagination, sorting, and filtering (never load whole tables).
- Empty, loading, and error states are always implemented.

## Patient safety in the UI

- Any screen that acts on a patient shows at least **two identifiers** (name plus MRN or date of birth) in a persistent header.
- Destructive or irreversible actions (void, dispense, discharge) require a confirmation that restates the patient and the action.
- Never auto-select a patient from a list. Never show a "default" patient.
- Do not put patient names, dates of birth, or other PHI in URLs or query strings. Patient IDs (UUIDs) in paths are fine.

## Internationalization

- Every user-visible string is an i18n key from day one, including validation messages and table headers. English is the default locale.
- Format dates, numbers, and currency with `Intl` using the configured locale and hospital timezone.
- Layout must tolerate longer text and right-to-left languages later (use logical CSS properties where practical).

## Offline-safe assets (rule 18)

- No CDN links. Fonts are self-hosted (for example via `@fontsource` packages with permissive/OFL licenses). Icons are bundled. The app makes no requests to third-party origins.

## Design and usability

- Clean, dense, high-contrast interface suited to long working days. Usable at 1366x768 and on tablets. Light theme first; dark theme later.
- Accessible: semantic HTML, labels on inputs, visible focus, sufficient contrast, ARIA where needed.
- Print styles for printable artifacts (patient card, prescriptions, receipts, lab reports) that render correctly without browser chrome.
- Consistent patterns: one layout shell, one table component, one form layout. Do not invent new patterns per screen.

## Errors

- A top-level error boundary shows a friendly message with the `requestId` (from the API error) so staff can report it. Never show raw server errors or stack traces.
