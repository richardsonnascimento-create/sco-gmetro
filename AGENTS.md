# AGENTS.md — sco-gmetro (Google Apps Script Web App)

## Project Type
GAS V8 Web App with HTML/CSS/JS frontend. Backend = `.gs`, Frontend = `.html` partials.

## Architecture
- **Entry point**: `Main.gs:doGet(e)` — routes: `?token=x` → `app.html`, else → `login.html`
- **Services**: `AuthService.gs` (login/register/hash/lockout), `SessionService.gs` (token sessions, 2h TTL), `SheetService.gs` (user CRUD), `Config.gs` (constants)
- **Frontend partials**: `styles.html`, `navbar.html`, `js_auth.html`, `js_app.html`, `js_utils.html`, `validacao.html`, `loading.html`, `admin_content.html`

## Sheet Schema (`Usuarios` tab, 9 columns)
| Col | Name | Type | Notes |
|-----|------|------|-------|
| A | Email | string | PK |
| B | Username | string | |
| C | PasswordHash | SHA-256 hex | |
| D | CreatedDate | ISO string | |
| E | Status | string | `"pendente"` / `"aprovado"` / `"rejeitado"` |
| F | LastLoginAttempt | Unix ms | |
| G | FailedAttempts | number | |
| H | Modulos | string | Comma-separated, e.g. `"Cadastro de Proprietário,Login"` |
| I | IsAdmin | boolean | |

**Migration**: old 7-col sheets (boolean Status) auto-converted on first `getUsersSheet()` call. `false` → `"pendente"`, `true` → `"aprovado"`. Admin `admin@meusistema.com` created automatically on migration (password `Admin@2024`).

## Admin Panel
- **Access**: rendered in-page via `admin_content.html` partial (no page navigation — GAS doesn't support redirects)
- **Features**: list users, change status (Pendente/Aprovado/Rejeitado), toggle module checkboxes, per-row save
- **Admin nav link**: auto-shown in navbar after login if user is admin; toggles app ↔ admin view
- **Endpoints** (all require token param):
  - `isAdmin(token)` → `{isAdmin, email}`
  - `getUsers(token)` → `[{email, username, status, modulos}]` (admin-only)
  - `updateUser(token, email, status, modulos)` → `{success, message}` (admin-only)
  - `getCurrentUser(token)` → `{email}`

## Login Status Checks (AuthService)
- `"pendente"` → "Aguardando aprovação do administrador"
- `"rejeitado"` → "Conta bloqueada. Entre em contato com o administrador"
- `"aprovado"` → normal password check

## Developer Commands
```bash
clasp push      # deploy local → GAS
clasp pull      # sync GAS → local
clasp open      # open script editor
clasp logs      # Cloud Logging
```

## Required Script Properties
| Key | Purpose |
|-----|---------|
| `SHEETS_ID` | Spreadsheet ID (users database) |
| `PASSWORD_SALT` | Salt for password hashing |

## Key Conventions
- JSDoc on all exported functions
- Secrets in Script Properties only
- SHA-256 + salt (no bcrypt — GAS V8 limitation)
- LockService for concurrent writes
- Batch reads (`getValues()`), batch writes (`appendRow`)
- `var` at top-level (GAS global scope), `camelCase` functions
- `console.log/error` → Cloud Logging
- Comments in Portuguese

## Testing
No test suite. Manual: `clasp push` → `clasp open` → Deploy → Test deployments → visit Web App URL.

## Common Pitfalls
- Token routing: `doGet` only reads `e.parameter.token`; frontend persists via `sessionStorage`
- Sheet migration: old 7-col sheets auto-migrate to 9 columns — run `getUsersSheet()` once to trigger
- Admin auto-creation: `ensureAdminExists()` runs during migration; password `Admin@2024`
- `addUserRow()` now takes 6 params (email, username, hash, status, modulos, isAdmin); callers need updating
- `.clasp.json` and `appsscript.json` are gitignored

## References
- `README.md` — project overview & clasp workflow
- `SKILL.md` — GAS best practices
- `.clinerules` — local coding rules (Portuguese, Clean Code)