# dnda-port

Personal portfolio of **Dang Nguyen Duc Anh** (Harry Wilson): chess player turned AI Engineer.
A night chessboard, a googly-eyed pawn that follows your cursor, and the work behind it.

**Stack:** TypeScript + Vite (no framework) · FastAPI · PostgreSQL · deployed on Vercel.

## Features

- **Hero:** typed name, rotating roles, a perspective chessboard, a pawn whose eyes follow the pointer and a knight that hops.
- **Night / day:** follows the system theme; the toggle pins the other one (stored in `localStorage`).
- **Experience timeline:** the gold line fills and the pawn walks down it as you scroll.
- **Projects:** a scroll-snap carousel of the pinned GitHub repos, with keyboard, swipe and named markers.
- **Chat (`ask_my_bot`):** answers from the CV with **Postgres full-text search** (`tsvector` + `ts_rank_cd`). No LLM, no API key.
- **Pawn climb:** a small canvas game; scores go to a **Postgres leaderboard**.
- **text_me:** a contact form stored in Postgres (honeypot + per-IP rate limit).
- Respects `prefers-reduced-motion`; scroll reveals use CSS `view()` timelines with an IntersectionObserver fallback.

## Layout

```
index.html          page content (experience from the CV, projects from pinned repos)
src/main.ts         wiring: typing, eyes, reveals, timeline, copy, text_me
src/theme.ts        night/day toggle (meta color-scheme + light-dark())
src/sky.ts          canvas stars, shooting stars, fireflies
src/carousel.ts     projects carousel
src/chat.ts         chat panel → POST /api/chat
src/game.ts         pawn climb → GET/POST /api/scores
src/api.ts          typed fetch client
src/styles.css
api/index.py        FastAPI: /api/health, /api/chat, /api/scores, /api/messages
tests/test_api.py   API tests against a real Postgres
vercel.json         /api/* → the FastAPI function
```

The API creates its tables and syncs the chat knowledge base (`KB` in `api/index.py`) on the first request,
so a fresh database needs no migration step. Edit `KB` to change what the bot knows.

## Run locally

```bash
docker run -d --name dnda-port-db -e POSTGRES_PASSWORD=devonly -e POSTGRES_DB=dnda -p 127.0.0.1:18432:5432 postgres:16-alpine
export DATABASE_URL=postgresql://postgres:devonly@127.0.0.1:18432/dnda
uv run --with-requirements requirements.txt --with uvicorn uvicorn api.index:app --port 18451   # API
npm install && npm run dev                                                                        # site on :18450, /api proxied
```

Tests:

```bash
uv run --with-requirements requirements.txt --with pytest --with httpx pytest -q   # needs DATABASE_URL
npm run build                                                                       # tsc --noEmit + vite build
```

## Deploy (Vercel)

Import the repo in Vercel (framework preset: Vite). Add a Postgres database from **Storage** (Neon) and connect it
to the project; Vercel injects `DATABASE_URL`, and the API picks it up. Optional: set `IP_SALT` to any random string.

Messages from the text_me form land in the `messages` table: read them in the Neon console (SQL editor).
