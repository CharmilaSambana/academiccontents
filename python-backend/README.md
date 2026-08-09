# ScholarShare — FastAPI reference backend

A Python port of the app's server logic. **This does not run inside Lovable** —
Lovable hosts the TypeScript/React app only. Run this locally or deploy it to
Render / Fly / Railway / any Python host.

It talks to the *same* Supabase project (same tables, same RLS policies, same
`materials` storage bucket), so it is a drop-in replacement for the TanStack
server functions if you move the frontend elsewhere.

## Run it

```bash
cd python-backend
python -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env   # fill in your Supabase values
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | Sign up as `student` or `teacher` |
| POST | `/api/auth/login` | public | Email/password sign in, returns access token + role |
| GET | `/api/auth/me` | any user | Profile + role |
| PUT | `/api/auth/me/regulation` | student | Pick regulation (R25/R24/R23/R22) |
| GET | `/api/subjects` | any user | List subjects, filter by `regulation` / `mine` |
| POST | `/api/subjects` | teacher | Add a subject for a regulation |
| DELETE | `/api/subjects/{id}` | teacher | Remove own subject |
| GET | `/api/materials` | any user | List PDFs, filter by `regulation` / `subject_id` / `mine` |
| POST | `/api/materials` | teacher | Upload a PDF (multipart, max 20MB) |
| GET | `/api/materials/{id}/signed-url` | any user | Short-lived signed storage URL |
| GET | `/api/materials/{id}/file?mode=inline\|download` | any user | Same-origin PDF proxy |
| POST | `/api/materials/events` | student | Record a `view` or `download` |
| GET | `/api/analytics/teacher` | teacher | Unique views/downloads per material (chart data) |

## Auth model

Clients sign in through `/api/auth/login` (or the Supabase JS client) and send
`Authorization: Bearer <access_token>`. `get_current_user` validates the token
and binds it to the PostgREST client, so **every query runs under the existing
RLS policies as that user** — the service-role key is never used for ordinary
reads.

## Frontend pairing

Keep the React frontend as-is (Vite 7, Tailwind v4, shadcn/ui, recharts,
pdfjs-dist) and point it at this API instead of the TanStack server functions:
`/api/analytics/teacher` returns exactly the `{ title, views, downloads }` rows
the bar chart renders, and `/api/materials/{id}/file` replaces the material
proxy route that feeds the pdf.js canvas viewer.
