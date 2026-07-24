# Chairman Phase 4C — Tactical Mandate UI

Phase 4C adds a frontend-only editor at `/tactics/{teamId}?mode=chairman-mandate`.
The mode is enabled only for an authenticated Chairman career with the Chairman
feature enabled. Manager mode continues to use the existing tactic endpoints.

The editor reads and writes the backend contract:

- `GET /api/clubs/{teamId}/tactical-mandate`
- `PUT /api/clubs/{teamId}/tactical-mandate`

The PUT includes the server version as `expectedVersion`. A stale response causes
a fresh GET and never retries the write automatically. Formation locks remain
exact `(positionIndex, playerId)` pairs; incompatible locks block saving and are
not moved or deleted by the UI. Control errors make the editor read-only.

The Chairman Command Centre exposes the editor only for the currently controlled
club. No manager tactic, assistant selection, or manager preference is saved from
Chairman mode.
