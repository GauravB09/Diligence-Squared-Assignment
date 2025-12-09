## DiligenceSquared – Voice Interview Flow

A two-part system (FastAPI + React/Vite) that collects survey responses from Typeform, segments users, and routes eligible users into an ElevenLabs voice interview. The app supports resuming incomplete conversations and storing aggregated transcripts.

---

## Features
- Typeform webhook ingestion with survey segmentation and status tracking.
- ElevenLabs voice interview with resume support and transcript aggregation.
- React SPA with survey embedding and interview UI.
- SQLite by default (pluggable via `DATABASE_URL`).

---

## Project Structure
```
backend/
  webhook.py         # FastAPI app + Typeform webhook
  interview.py       # Interview endpoints (session, complete, update-id, check-completion)
  models.py          # SQLAlchemy models (UserSession)
  database.py        # DB engine/session setup
  schemas.py         # Pydantic schemas for Typeform payload
frontend/
  src/
    App.jsx          # Routing & flow control
    components/
      Survey.jsx     # Typeform embed
      Interview.jsx  # ElevenLabs client integration
  vite.config.js     # Vite config (allowedHosts, dev server)
```

---

## Environment Variables

### Backend (FastAPI)
Set in your shell or a `.env` (not committed):
- `DATABASE_URL` – e.g. `sqlite:///./survey.db` (default) or Postgres URL.
- `ELEVENLABS_AGENT_ID` – Required; agent id for transcript fetch/validation.
- `ELEVENLABS_API_KEY` – Required; ElevenLabs API key for transcript retrieval.

### Frontend (Vite)
Must be prefixed with `VITE_` to be exposed:
- `VITE_API_BASE_URL` – e.g. `http://localhost:8000`
- `VITE_ELEVENLABS_AGENT_ID` – Same agent id used by backend.

---

## Initial Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export ELEVENLABS_AGENT_ID=agent_xxx
export ELEVENLABS_API_KEY=your_key
# optional: export DATABASE_URL=postgresql://user:pass@host/db
uvicorn webhook:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
cp .env.example .env   # create and edit if you keep an example
echo "VITE_API_BASE_URL=http://localhost:8000" >> .env
echo "VITE_ELEVENLABS_AGENT_ID=agent_xxx" >> .env
npm install
npm run dev -- --host --port 5173
```

---

## Flow
1. User opens `/survey/:form_id?userId=xxxx` in the frontend. A `userId` is persisted in `localStorage` or from the URL param.
2. Survey is embedded via `Survey.jsx`; hidden field sends `user_id` to Typeform.
3. Typeform webhook posts to `POST /webhook`:
   - Parses payload, derives `segment` & `survey_status` (`completed` or `terminated`).
   - Upserts `UserSession` with status/segment.
4. Frontend polls `/api/interview/session/{user_id}` until status is not `pending`.
5. If qualified, `Interview.jsx` initializes ElevenLabs client with `_previous_transcript_` to resume if needed.
6. On end (or tab close with keepalive), frontend calls `POST /api/interview/complete/{user_id}`:
   - Backend fetches transcript from ElevenLabs and appends to existing transcript.
7. Frontend can show, download, or print transcript; resume if incomplete.

---

## Key Endpoints (Backend)
- `POST /webhook` – Typeform webhook ingestion.
- `GET /api/interview/session/{user_id}` – Session info (status, segment, transcript).
- `POST /api/interview/update-id` – Save ElevenLabs conversation id.
- `POST /api/interview/complete/{user_id}` – Fetch & append transcript.
- `GET /api/interview/check-completion/{user_id}` – Heuristic completion check.
- `GET /health` – Health check.

---

## Notes & Recommendations
- CORS: currently permissive; lock down origins for production.
- Security: add authZ/authN, rate limiting, and Typeform signature verification before prod.
- Database: SQLite for dev; use Postgres in production. Consider migrations for schema changes.
- ElevenLabs: ensure the agent configuration can use `_previous_transcript_` to resume.

---

## Scripts
- Backend: `uvicorn webhook:app --reload --host 0.0.0.0 --port 8000`
- Frontend: `npm run dev -- --host --port 5173`

---

## Troubleshooting
- Missing agent id: ensure both `ELEVENLABS_AGENT_ID` and `VITE_ELEVENLABS_AGENT_ID` are set.
- Transcript not saving: verify `ELEVENLABS_API_KEY` and that conversation ids are updated via `/api/interview/update-id`.
- Webhook not firing: confirm Typeform webhook URL points to your backend and consider adding signature verification.


