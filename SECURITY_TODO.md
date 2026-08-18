# Security TODO

## 1. REVOKE the leaked Google API key (action required — not fixed by any commit)

A live Google API key beginning `AIzaSyAtNEdmy2…` was committed to `backend/.env.example`
in **`64f9cd9`** (2026-04-06, "feat: add Gemini API health endpoint and rate-limit guard in UI")
and stayed in the tracked file until **`ce7193a`** removed it.

**This repository is public and is a fork, so the key is already disclosed.** Deleting it from
the working tree does not undo that: the value remains reachable in the git history of this
repo and of every clone and fork. Rewriting history would not help either — anything public
for that long must be assumed captured.

**The only real fix is revocation at the provider:**

1. Open Google Cloud Console → *APIs & Services* → *Credentials*.
2. Find the API key starting `AIzaSyAtNEdmy2` and **delete** it.
3. Create a replacement key, and restrict it (API restrictions → Generative Language API only;
   application restrictions → IP or referrer as appropriate).
4. Put the new value only in a local `.env` — never in `.env.example`. `.env` is already
   covered by `.gitignore:8`.
5. Check *Billing → Reports* for unexpected Generative Language API usage between
   2026-04-06 and the revocation date.

History was deliberately **not** rewritten: no `filter-branch`, no force-push. Rewriting a
public fork's history breaks every clone while leaving the disclosed key just as compromised.

## 2. Fixed in-repo

- `backend/.env.example` now carries a placeholder, not a live key (`ce7193a`).
- CORS is no longer `allow_origins=["*"]`; origins come from `CORS_ALLOW_ORIGINS`, defaulting
  to the local Next.js dev server (`backend/app/main.py`). A wildcard here let any website on
  the internet drive a user's local sensor gateway.
- Prompt-injection guard on the AI path is now covered by tests: only N, P, K, pH and moisture
  are read from caller payloads and each is forced through `float()`, so no attacker-controlled
  string can reach the model prompt (`backend/tests/test_ai_service_guard.py`).

## 3. Sweep result

`git log -p --all` across the full history plus a tracked-tree grep for `sk-`, `SECRET_KEY=`
and `password=` found **exactly one** secret: the Google key above. No other credential is
committed.
