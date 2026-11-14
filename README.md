Frontend for Argus Football World. Currently not deployed.

Angular 15 single-page app for the football management simulator. The backend
lives in `https://github.com/CiprianAmza/footballmanager-backend-.git`; its
README covers the full development setup, the database and the bundled save.

## Development

```bash
npm ci
npm start      # ng serve on http://localhost:4200
```

The API base URL is `urlApp` in `src/app/app.component.ts`: port 4201 talks to
`http://localhost:8087`, every other port to `http://localhost:8086`. The
multiplayer client has the same mapping in `src/app/multiplayer/multiplayer-api.ts`.
To run a second frontend against a second backend, change both locally and add
the frontend origin to the backend's `cors.allowed-origins`; keep such local
port mappings out of commits.

## Tests

```bash
npm test       # Karma + Jasmine
```

The Schedule page logic is covered by `src/app/fixtures/schedule-model.spec.ts`.

## Club Schedule

Routes `/fixtures` (your club) and `/fixtures/:teamId` (any club); the side
menu's Schedule entry opens `/fixtures/:teamId`. The same component is embedded
in Club info › Matches.

Code: `src/app/fixtures/`. `schedule-model.ts` holds the pure logic (rows,
filters, month grouping, calendar grids, form, date and scorer formatting) and
`fixtures.component.*` the page.

What the page shows:

- **Header** with the club's league position and next match, plus a played /
  won / drawn / lost summary for the visible rows.
- **Fixtures list** grouped by month: date, competition and stage, venue,
  opponent with league position, result (a.e.t., penalties, aggregate). Custom
  menu for visible columns, optional free-date rows, a Goalscorers view and a
  text search.
- **Filter** flyout (can be pinned): competitions, venue, result, free dates.
- **Calendar** in Month, Week, Year and List modes.
- **Match panel** for the selected row. Played matches: score, scorers with
  minutes (`45+2`, `pen 83`, `o.g.`), attendance, own players with ratings and
  injuries, and View Match to open the report. Upcoming matches: preview with
  both teams' positions and form, team news (injuries, suspensions) and
  previous results.
- **Previous Meetings** page: head-to-head table and all previous results.

Season, tab, selected match and the Previous Meetings page are kept in the URL
(`season`, `tab`, `match`, `meetings`; prefixed with `fixtures` when embedded),
so Back and shared links restore the view. Column choice and the selection are
remembered in `localStorage`.

Backend endpoints used:

| Endpoint | Used for |
| --- | --- |
| `/match/getScheduleForSeasonNumber/{season}/{teamId}` | season rows |
| `/match/calendar/{teamId}/{season}` | match days, free dates |
| `/match/preview/{teamId}` and `/match/preview/{competitionId}/{season}/{round}/{team1}/{team2}` | header standing, upcoming-match preview |
| `/match/summary/...`, `/match/matchEvents/...`, `/match/playerRatings/...` | played-match panel |
| `/match/goalscorers/{season}/{teamId}` | Goalscorers view |
| `/match/h2h/{teamId}/{opponentId}` | previous meetings |
| `/competition/getTeams/{competitionId}` | league positions |
| `/teams/availability/{teamId}` | team news |

Optional fields (`attendance`, `awayAttendance`, goal `addedTime`, `injury`
events, `opponentLeaguePosition` on played rows) are shown when the backend
returns them and hidden otherwise, so older saves keep working.
