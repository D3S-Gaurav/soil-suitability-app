# SECURITY TODO — action required

**Status:** one live credential was committed to this public repository and is still
reachable on GitHub. The working tree has been cleaned, but **cleaning the file does not
un-leak the key.** Git history still contains it, and history is deliberately *not* being
rewritten (see "Why we are not rewriting history" below).

**The only fix that actually works is revoking the key at the provider.**

---

## 1. Key that must be REVOKED

| Field | Value |
|---|---|
| Type | Google API key (Google AI / Gemini API) |
| Value | `AIzaSyAtNEdmy23vRjHWyxg3z6XPr0RTMUZkTgU` |
| Leaked in file | `backend/.env.example` |
| Introduced by commit | `64f9cd9958f94f091b452de8c4f292dcdd21726f` — *"feat: add Gemini API health endpoint and rate-limit guard in UI"* |
| Merged to `master` by | `1a1fa2a` (Merge pull request #27) |
| Publicly reachable at | `github.com/D3S-Gaurav/soil-suitability-app` (**public**, on the default `master` branch) |
| Also mirrored to | `github.com/mightbeanshuu/soil-suitability-app` (**public** fork) |
| Still in use locally? | **Yes** — the same key is present in the local, gitignored `backend/.env` |

### How to revoke

1. Open <https://console.cloud.google.com/apis/credentials> and select the project that owns this key.
2. Find the API key ending in `…MUZkTgU`. **Delete** it (preferred) or **Regenerate** it.
3. Create a replacement key, and restrict it before use:
   - *Application restrictions* — restrict to the server IP, not "None".
   - *API restrictions* — limit to the Generative Language API only.
4. Put the new key **only** in `backend/.env` (gitignored). Never in `backend/.env.example`.
5. Check <https://console.cloud.google.com/billing> for unexpected usage between
   the leak date and revocation, in case the key was scraped and used.

> Automated scrapers routinely harvest `AIza…` keys from public GitHub within minutes of a
> push. Assume this key is compromised, not merely exposed.

---

## 2. Where the key is exposed (revocation is required in all of these)

Deleting the branch or force-pushing will **not** clear these — GitHub keeps commits
addressable by SHA, and the fork holds an independent copy that the upstream owner cannot delete.

- `https://github.com/D3S-Gaurav/soil-suitability-app/blob/master/backend/.env.example`
- `https://github.com/D3S-Gaurav/soil-suitability-app/commit/64f9cd9`
- `https://github.com/mightbeanshuu/soil-suitability-app/commit/64f9cd9`

---

## 3. Why we are not rewriting history

The key has been public on the default branch of a public repo. Rewriting history
(`filter-branch` / `filter-repo` / force-push) would:

- **not** revoke the key — the key stays valid until revoked in Google Cloud Console;
- **not** remove it from the fork, from any other clone, or from GitHub's dangling-commit
  storage, or from any scraper that already has it;
- break every open PR and every teammate's clone, on a repo with shared history.

Rewriting history is theatre once a secret is public. **Revoke the key instead.** This file
is the record of what must be revoked.

---

## 4. Audit performed (2026-08-19)

Every blob in the full history (all refs, all branches, all PR refs) was decoded and scanned
for `AIzaSy…`, `sk-…`, `sk_live/sk_test`, `ghp_…`, `xox[baprs]-…`, `AKIA…`,
`Bearer <token>`, and PEM private-key headers.

**Result: exactly one real secret — the Google API key above.** Specifically:

| Finding | Verdict |
|---|---|
| `backend/.env.example` @ `64f9cd9` — `AIzaSy…MUZkTgU` | **REAL SECRET — revoke** |
| `backend/.env.example` @ `a2cf9f9` — `GOOGLE_API_KEY=your_gemini_api_key_here` | Placeholder, safe |
| `.env.example` @ `d5bfb0e` — `ANTHROPIC_API_KEY=your_real_key_here` | Literal placeholder string, safe |
| `AKIA…` matches in `0d8d16f` / `568589b` | False positive — base64 wasm inside committed `node_modules/` |
| `sk-` / `Bearer ` / `password` / `SECRET` matches | False positives — vendored `venv/` (FastAPI docstrings) and CSS property names in `node_modules/` |
| Any `.env` (non-`.example`) file | Never tracked — confirmed clean |

Note: `backend/venv/` and `frontend/node_modules/` were committed in `0d8d16f` and
re-committed in `568589b`, then removed. They contain no credentials, but they are the
source of every false positive above and they bloat the repository.

---

## 5. Follow-ups (not blocking)

- [ ] `backend/.env.example` no longer contains `GOOGLE_API_KEY` — the app now targets a
      local LM Studio server (`LM_STUDIO_URL`) and needs no cloud key at all.
- [ ] CORS is now an env-driven allowlist (`CORS_ALLOW_ORIGINS`) instead of `*`.
- [ ] `POST /webhook/analyze-soil` interpolates the uploaded CSV and the `crop_type` form
      field straight into the LLM prompt with no sanitisation. The numeric-allowlist guard
      in `ai_service.analyze_soil_data()` protects `/api/analyze`, **but not this route.**
      Apply the same allowlist treatment there.
- [ ] Consider making the upstream repo private, or opening a PR to upstream `master` with
      this fix — the placeholder fix only helps once it is on the branch people actually open.
