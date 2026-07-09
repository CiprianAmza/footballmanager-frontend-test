# Tactics4 — Role & Weight Analysis

Actionable reference for a player **role-rating / suitability** system, kept consistent with the
existing backend. Every weight marked **EXISTING** is quoted verbatim from the shipped backend code;
everything marked **PROPOSED** is a new suggestion to fill gaps.

> Source files (backend, read-only — `/Users/ciprian.amza/IdeaProjects/footballmanager-backend-`):
> - `model/PlayerSkills.java` — the 36 attributes.
> - `service/PlayerSkillsService.java` (`computeOverallRating`, ~lines 146-269) — **position** overall-rating weight maps.
> - `service/PlayerRoleService.java` (lines 158-446) — **role** definitions + key-attribute weight maps (the truth this doc mirrors).
> - `service/CompetitionService.java` (`getPositionProfile`, lines 76-229) — per-position attribute *importance* used at generation (corroborates which attributes matter).
> - `frontend/FormationData.java` — per-slot: `positionIndex, playerId, role, duty, instructions[]`.
> - `model/PersonalizedTactic.java` — team-level instructions + set-piece taker ids.

---

## 1. How the existing rating/suitability math works

Two layers, both already implemented:

**A. Position overall rating** — `PlayerSkillsService.computeOverallRating(skills)`
```
weighted = Σ (attribute(1-20) × positionWeight)        // weights per position, ≈ sum to 1.0
rating   = clamp(1, 300, weighted × 15)                 // 1-300 scale
```

**B. Role suitability + effective rating** — `PlayerRoleService`
```
suitability(0-100)   = clamp(1, 100, Σ(attr × roleWeight) × suitabilityScale)   // suitabilityScale is config
effectiveRating      = base × overallBlend + suitability × roleBlend             // both blends config-tunable
```
- `base` = the position-weighted match value (overall rating or PlayerValueService value).
- Config lives under `match.engine.role-weights` (`suitabilityScale`, `overallBlend`, `roleBlend`, plus
  per-role attribute overrides via `attributes.<RoleName>`). Overrides **merge** onto the shipped
  defaults below (override wins; new attributes added).
- `getBestRole(skills)` already returns the highest-suitability role for a player.

**Frontend wiring (tactics4):**
- `GET /tactic/roles/{position}` → available roles for a position.
- `GET /tactic/allRoleSuitabilities/{playerId}` → all roles ranked (consumed at `tactics4.component.ts:643`).
- `GET /tactic/roleSuitability/{playerId}/{roleName}` → single role { suitability, effectiveRating }.
- `GET /tactic/instructions/{position}` → per-position instruction list (consumed at `tactics4.component.ts:674`).
- Saved per-slot via `FormationData` { role, duty, instructions[] } in `/tactic/saveFormation`.

**The 36 attributes** (exact getter names used in weight maps):
- *Technical (14):* Corners, Crossing, Dribbling, Finishing, First Touch, Free Kick, Heading, Long Shots, Long Throws, Marking, Passing, Penalty Taking, Tackling, Technique
- *Mental (14):* Aggression, Anticipation, Bravery, Composure, Concentration, Decisions, Determination, Flair, Leadership, Off The Ball, Positioning, Teamwork, Vision, Work Rate
- *Physical (8):* Acceleration, Agility, Balance, Jumping Reach, Natural Fitness, Pace, Stamina, Strength
- *GK (6):* Handling, Reflexes, One On Ones, Command Of Area, Kicking, Throwing

---

## 2. Position → role coverage status

| Position | Code | Roles status |
|---|---|---|
| Goalkeeper | `GK` | EXISTING (2) |
| Centre-Back | `DC` | EXISTING (3) |
| Full-Back L/R | `DL` / `DR` | EXISTING (3, shared) |
| Defensive Mid | `DM` | **PROPOSED — no backend roles today (empty list)** |
| Central Mid | `MC` | EXISTING (6) |
| Wide Mid / Winger L/R | `ML` / `MR` | EXISTING (4, shared) |
| Attacking Mid (central) | `AMC` | **PROPOSED — no backend roles today (empty list)** |
| Attacking Mid (wide) | `AML` / `AMR` | **PROPOSED — no backend roles today (empty list)** |
| Striker | `ST` | EXISTING (6) |

> Position codes confirmed in frontend `scouting.component.ts:50`:
> `['GK','DL','DC','DR','DM','MC','ML','MR','AMC','AML','AMR','ST']`.
> `PlayerSkillsService`/`PlayerRoleService` currently weight only `GK, DC, DL, DR, MC, ML, MR, ST`.
> A player whose `position` is `DM/AMC/AML/AMR` gets an **empty** role list from
> `getRolesForPosition` and falls back to overall rating in `computeRoleSuitability`. Filling these is
> the single highest-value follow-up.

**Suggested duty default per role** is listed; duty does not change the suitability weights in the
current engine (it tags intent for the match engine / FormationData).

---

## 3. Roles per position

Weight maps use attribute → weight. EXISTING maps are the actual shipped values; they roughly sum to
1.0. PROPOSED maps are designed to sum to ~1.0 and reuse the existing style.

### GK — Goalkeeper *(EXISTING)*

**Goalkeeper** (Defend) — traditional shot-stopper
`Reflexes .20, Handling .18, Positioning .14, One On Ones .10, Command Of Area .10, Concentration .08, Anticipation .06, Kicking .06, Agility .04, Composure .04`

**Sweeper Keeper** (Defend/Support/Attack) — comes off line, plays with feet
`Reflexes .14, One On Ones .12, Command Of Area .12, Kicking .10, Handling .10, First Touch .08, Passing .08, Anticipation .08, Composure .08, Positioning .05, Agility .05`

- *Instructions:* Distribution (Throw/Short/Long), Sweeper aggressiveness, Take risky passes.
- *Team links:* a high `defensiveLine` favours Sweeper Keeper; `inPossession=Keep Ball` rewards Kicking/Passing.

### DC — Centre-Back *(EXISTING)*

**Central Defender** (Defend/Support)
`Tackling .15, Marking .14, Positioning .13, Heading .10, Strength .08, Concentration .08, Anticipation .08, Bravery .06, Jumping Reach .06, Composure .04, Pace .04, Decisions .04`

**Ball-Playing Defender** (Defend/Support)
`Passing .12, Tackling .10, Marking .10, Positioning .10, First Touch .08, Composure .08, Vision .06, Technique .06, Concentration .06, Anticipation .06, Heading .06, Decisions .06, Strength .06`

**No-Nonsense Defender** (Defend)
`Tackling .14, Marking .14, Heading .12, Strength .12, Bravery .10, Positioning .10, Jumping Reach .08, Aggression .08, Concentration .06, Anticipation .06`

- *Instructions:* Stay back at all times, Close down less/more, Pass shorter (BPD), Tackle harder (No-Nonsense), Mark tighter.
- *Team links:* `widePlay=Cross` + opponent target men makes Heading/Jumping decisive; `inPossession=Keep Ball` favours BPD.

### DL / DR — Full-Backs *(EXISTING, shared map)*

**Full-Back** (Defend/Support/Attack)
`Tackling .12, Marking .10, Positioning .10, Pace .10, Stamina .08, Work Rate .08, Crossing .06, Concentration .06, Anticipation .06, Teamwork .06, Acceleration .06, Decisions .06, Strength .06`

**Wing-Back** (Support/Attack)
`Crossing .14, Pace .12, Stamina .10, Dribbling .08, Acceleration .08, Work Rate .08, Tackling .06, Passing .06, Technique .06, Off The Ball .06, Teamwork .06, Agility .05, Decisions .05`

**Inverted Wing-Back** (Support/Attack)
`Passing .12, Dribbling .10, First Touch .08, Technique .08, Vision .08, Decisions .08, Composure .08, Off The Ball .08, Pace .06, Tackling .06, Acceleration .06, Stamina .06, Work Rate .06`

- *Instructions:* Get further forward, Stay wider / Sit narrower (IWB), Cross from byline/deep, Dribble more.
- *Team links:* `width=Wide` + `mentality≥Attacking` rewards Wing-Back; `width=Narrow`/possession favours Inverted Wing-Back; high `pressing`/`tempo` taxes Stamina.

### DM — Defensive Midfielder *(PROPOSED — none exist today)*

Style adapted from MC's defensive roles + the full-back/CB physical maps and the generation profile.

**Anchor** (Defend) — pure screen in front of the back line
`Positioning .16, Tackling .14, Marking .12, Anticipation .12, Concentration .10, Teamwork .08, Strength .08, Decisions .08, Bravery .06, Composure .06`

**Half-Back** (Defend) — drops between centre-backs
`Marking .14, Tackling .14, Positioning .14, Heading .08, Strength .08, Anticipation .08, Concentration .08, Passing .08, Composure .06, Bravery .06, Jumping Reach .06`

**Defensive Midfielder** (Defend/Support) — balanced ball-winning screen
`Tackling .14, Positioning .12, Anticipation .10, Work Rate .10, Marking .08, Teamwork .08, Stamina .08, Passing .08, Concentration .08, Strength .07, Decisions .07`

**Regista** (Support) — deep free-roaming playmaker
`Passing .18, Vision .14, Technique .10, First Touch .10, Composure .10, Decisions .08, Flair .08, Teamwork .06, Anticipation .06, Balance .05, Off The Ball .05`

**Segundo Volante** (Support/Attack) — defensive mid that breaks forward
`Stamina .12, Work Rate .10, Tackling .10, Passing .08, Off The Ball .08, Long Shots .08, Finishing .06, Anticipation .08, Positioning .08, Pace .06, Decisions .06, Strength .04, Teamwork .06`

- *Instructions:* Hold position, Mark tighter, Win ball back, Take fewer/more risks (Regista), Get forward (Segundo Volante).
- *Team links:* high `pressing` + `transition=Fast Counter` favours Defensive Midfielder/Segundo Volante; `inPossession=Keep Ball` + low `tempo` favours Regista.

### MC — Central Midfielder *(EXISTING)*

**Central Midfielder** (Defend/Support/Attack)
`Passing .14, Tackling .08, Decisions .08, Teamwork .08, First Touch .07, Technique .07, Stamina .07, Work Rate .07, Positioning .06, Vision .06, Concentration .06, Composure .06, Anticipation .05, Dribbling .05`

**Deep-Lying Playmaker** (Defend/Support)
`Passing .18, Vision .14, First Touch .10, Technique .10, Composure .08, Decisions .08, Teamwork .06, Anticipation .06, Flair .05, Concentration .05, Positioning .05, Balance .05`

**Ball-Winning Midfielder** (Defend/Support)
`Tackling .16, Work Rate .12, Stamina .10, Aggression .10, Anticipation .08, Positioning .08, Teamwork .06, Strength .06, Bravery .06, Concentration .06, Marking .06, Decisions .06`

**Box-to-Box Midfielder** (Support)
`Stamina .12, Work Rate .10, Passing .08, Tackling .08, Finishing .06, Long Shots .06, Off The Ball .06, Teamwork .06, Pace .06, Decisions .06, Dribbling .06, First Touch .06, Anticipation .06, Strength .04, Technique .04`

**Advanced Playmaker** (Support/Attack)
`Vision .14, Passing .14, First Touch .10, Technique .10, Flair .08, Composure .08, Decisions .08, Dribbling .08, Off The Ball .06, Anticipation .06, Agility .04, Balance .04`

**Mezzala** (Support/Attack)
`Dribbling .10, Passing .10, Technique .08, Off The Ball .08, Vision .08, Decisions .08, Acceleration .06, Pace .06, First Touch .06, Long Shots .06, Finishing .06, Stamina .06, Work Rate .06, Flair .06`

- *Instructions:* Get further forward (B2B/Mezzala), Hold position (DLP), Tackle harder (BWM), More risky passes / dribble more (AP), Move into channels (Mezzala).
- *Team links:* `tempo`/`possession` settings strongly interact — Keep Ball + low tempo amplifies DLP/AP; Fast Counter amplifies B2B/Mezzala.

### ML / MR — Wide Midfield / Winger *(EXISTING, shared map)*

**Winger** (Support/Attack)
`Crossing .14, Dribbling .12, Pace .10, Acceleration .08, Technique .08, Agility .06, Flair .06, Off The Ball .06, First Touch .06, Passing .06, Stamina .06, Work Rate .06, Decisions .06`

**Inside Forward** (Support/Attack)
`Finishing .14, Dribbling .12, Acceleration .08, Off The Ball .08, Composure .08, First Touch .06, Technique .06, Pace .06, Passing .06, Long Shots .06, Anticipation .06, Decisions .06, Agility .04, Flair .04`

**Wide Midfielder** (Defend/Support/Attack)
`Crossing .10, Work Rate .10, Stamina .10, Passing .08, Tackling .08, Teamwork .08, Pace .06, Dribbling .06, Positioning .06, Decisions .06, Technique .06, Concentration .06, Anticipation .05, First Touch .05`

**Inverted Winger** (Support/Attack)
`Dribbling .14, Passing .10, Vision .08, Technique .08, First Touch .08, Acceleration .08, Agility .06, Pace .06, Long Shots .06, Composure .06, Decisions .06, Flair .06, Off The Ball .04, Finishing .04`

- *Instructions:* Stay wider / Cut inside (IW/IF), Cross more, Run wide with ball (Winger), Shoot more (IF), Sit narrower (Wide Mid defend).
- *Team links:* `widePlay=Cut Inside` favours Inside Forward/Inverted Winger; `widePlay=Cross` + `width=Wide` favours Winger; `transition=Fast Counter` rewards Pace/Acceleration.

### AMC — Attacking Midfielder, central *(PROPOSED — none exist today)*

Adapted from MC attacking roles + ST link roles + the winger creative maps.

**Attacking Midfielder** (Support/Attack) — balanced No.10
`Passing .12, Vision .12, Technique .10, First Touch .10, Decisions .08, Dribbling .08, Composure .08, Off The Ball .08, Flair .08, Long Shots .08, Anticipation .04, Agility .04`

**Advanced Playmaker** (Support/Attack) — final-third creator (mirror of MC AP)
`Vision .14, Passing .14, First Touch .10, Technique .10, Flair .08, Composure .08, Decisions .08, Dribbling .08, Off The Ball .06, Anticipation .06, Agility .04, Balance .04`

**Shadow Striker** (Attack) — late-running second striker
`Off The Ball .14, Finishing .12, Anticipation .10, Dribbling .08, Composure .08, First Touch .08, Acceleration .08, Pace .08, Long Shots .08, Technique .06, Decisions .06, Flair .04`

**Trequartista** (Attack) — free creative roamer, low defensive duty
`Flair .12, Vision .12, Dribbling .10, Technique .10, Passing .10, First Touch .10, Composure .08, Off The Ball .08, Decisions .06, Finishing .06, Agility .04, Balance .04`

**Enganche** (Support) — static classic playmaker, the team's pivot
`Vision .18, Passing .16, Technique .12, First Touch .10, Composure .10, Decisions .10, Flair .08, Anticipation .06, Balance .05, Off The Ball .05`

- *Instructions:* Roam from position (Treq), Hold position (Enganche), Get into box / Move onto ST (Shadow Striker), More risky passes, Shoot more.
- *Team links:* needs `inPossession=Keep Ball`/lower tempo to feed Enganche/Treq; Shadow Striker thrives with `mentality≥Attacking` and Fast Counter.

### AML / AMR — Attacking Midfielder, wide *(PROPOSED — none exist today, shared map)*

Adapted from the existing ML/MR winger maps (these are higher/more advanced than ML/MR).

**Inside Forward** (Support/Attack) — mirror of existing winger IF
`Finishing .14, Dribbling .12, Acceleration .08, Off The Ball .08, Composure .08, First Touch .06, Technique .06, Pace .06, Passing .06, Long Shots .06, Anticipation .06, Decisions .06, Agility .04, Flair .04`

**Winger** (Support/Attack) — touchline width + delivery
`Crossing .14, Dribbling .12, Pace .10, Acceleration .08, Technique .08, Agility .06, Flair .06, Off The Ball .06, First Touch .06, Passing .06, Stamina .06, Work Rate .06, Decisions .06`

**Inverted Winger** (Support/Attack)
`Dribbling .14, Passing .10, Vision .08, Technique .08, First Touch .08, Acceleration .08, Agility .06, Pace .06, Long Shots .06, Composure .06, Decisions .06, Flair .06, Off The Ball .04, Finishing .04`

**Wide Playmaker** (Support) — creates from the flank, drifts inside
`Passing .14, Vision .12, Technique .10, First Touch .10, Dribbling .10, Decisions .08, Composure .08, Off The Ball .06, Flair .06, Agility .06, Teamwork .05, Crossing .05`

**Raumdeuter** (Attack) — pure space-finder/poacher from wide
`Off The Ball .16, Finishing .14, Anticipation .12, Composure .10, First Touch .08, Acceleration .08, Pace .08, Technique .06, Decisions .06, Concentration .06, Balance .06`

- *Instructions:* Stay wider / Cut inside, Sit narrower (Wide Playmaker), Get into box (Raumdeuter), Cross more (Winger).
- *Team links:* same `widePlay` interactions as ML/MR; Raumdeuter pairs with a Target Man / crossing game.

### ST — Striker *(EXISTING)*

**Advanced Forward** (Attack)
`Finishing .14, Off The Ball .10, Composure .08, Dribbling .08, First Touch .08, Technique .06, Anticipation .06, Pace .06, Acceleration .06, Decisions .06, Heading .06, Strength .04, Agility .04, Balance .04, Flair .04`

**Poacher** (Attack)
`Finishing .20, Off The Ball .14, Anticipation .12, Composure .10, Heading .08, First Touch .06, Technique .06, Concentration .06, Pace .06, Acceleration .06, Decisions .06`

**Target Man** (Support/Attack)
`Heading .14, Strength .14, Jumping Reach .10, First Touch .08, Finishing .08, Balance .06, Bravery .06, Composure .06, Off The Ball .06, Passing .06, Teamwork .06, Anticipation .05, Decisions .05`

**Deep-Lying Forward** (Support/Attack)
`First Touch .10, Passing .10, Technique .10, Vision .08, Composure .08, Dribbling .08, Flair .06, Off The Ball .06, Finishing .06, Decisions .06, Teamwork .06, Strength .06, Balance .05, Anticipation .05`

**Pressing Forward** (Defend/Support/Attack)
`Work Rate .14, Aggression .10, Stamina .10, Finishing .08, Anticipation .08, Bravery .06, Off The Ball .06, Teamwork .06, Pace .06, Acceleration .06, Decisions .06, Composure .06, Strength .04, First Touch .04`

**Complete Forward** (Support/Attack)
`Finishing .10, Dribbling .08, First Touch .08, Off The Ball .08, Heading .06, Passing .06, Technique .06, Composure .06, Strength .06, Pace .06, Anticipation .06, Decisions .06, Vision .04, Work Rate .04, Flair .04, Acceleration .04, Balance .02`

- *Instructions:* Close down more (Pressing Fwd), Hold up ball (Target Man), Drop deeper (DLF), Get in behind / Shoot more (AF/Poacher), Roam (Complete Fwd).
- *Team links:* `widePlay=Cross` rewards Target Man Heading/Jumping; `pressing=High`/`transition=Fast Counter` rewards Pressing Forward; Poacher needs service so pairs with playmakers/wingers.

---

## 4. Individual vs team instructions

Per-slot individual instructions are stored in `FormationData.instructions[]` and fetched per position
via `/tactic/instructions/{position}`. They should be *modifiers* layered on top of the role; the
existing **team** instructions (from `PersonalizedTactic`) set the global context they live in:

| Team setting (PersonalizedTactic) | Options | Reinforced individual instructions |
|---|---|---|
| `mentality` | Very Defensive … Very Attacking | Get forward / Stay back duty bias |
| `tempo` | Much Lower … Much Higher | Take more touches vs Release early |
| `inPossession` | Keep Ball / Standard / Free Ball Early | Risky passes, Dribble more/less |
| `passingType` | Short / Normal / Long | Pass shorter / Direct passes |
| `pressing` | Low / Standard / High | Close down more/less |
| `defensiveLine` | Deep / Standard / High | Mark tighter, Stay back (GK Sweeper) |
| `width` | Narrow / Balanced / Wide | Stay wider / Sit narrower |
| `widePlay` | Cut Inside / Shoot / Cross | IF/IW cut inside vs Winger cross |
| `transition` | Win Fouls / Balanced / Fast Counter | Get into box, Counter runs |
| `dribbling`, `foulFrequency`, `foulHardness`, `tempoFragmentation` | (see options) | Dribble more, Tackle harder/Ease off |

Rule of thumb for a future implementation: an individual instruction that contradicts the team setting
should be allowed but flagged in the UI (e.g. "Cut Inside" on a Winger while `widePlay=Cross`).

---

## 5. Role weight within position fit (PROPOSED prioritisation)

For ranking which players fit a slot, weight each role's suitability by how "central" the role is to
that position's identity. Suggested role weights (sum to 1.0 per position) — use only when collapsing
multiple roles into one position-fit number; the engine itself uses the *selected* role directly.

- **GK:** Goalkeeper .70, Sweeper Keeper .30
- **DC:** Central Defender .50, No-Nonsense .25, Ball-Playing .25
- **DL/DR:** Full-Back .45, Wing-Back .35, Inverted Wing-Back .20
- **DM (proposed):** Defensive Midfielder .35, Anchor .20, Half-Back .15, Regista .15, Segundo Volante .15
- **MC:** Central Midfielder .30, Box-to-Box .20, Deep-Lying Playmaker .15, Ball-Winning .15, Advanced Playmaker .12, Mezzala .08
- **ML/MR:** Winger .35, Wide Midfielder .30, Inside Forward .20, Inverted Winger .15
- **AMC (proposed):** Attacking Midfielder .35, Advanced Playmaker .25, Shadow Striker .20, Trequartista .12, Enganche .08
- **AML/AMR (proposed):** Inside Forward .35, Winger .25, Inverted Winger .20, Wide Playmaker .12, Raumdeuter .08
- **ST:** Advanced Forward .30, Complete Forward .20, Poacher .18, Target Man .12, Deep-Lying Forward .10, Pressing Forward .10

---

## 6. How this feeds a future role-rating implementation

The plumbing already exists — the only work to "complete" the system is data, not new math:

1. **Fill the gap positions** (`DM`, `AMC`, `AML`, `AMR`) by adding the PROPOSED `RoleDef`s in
   `PlayerRoleService` `ROLES_BY_POSITION` (same `Map.ofEntries(...)` style). Once added,
   `/tactic/roles/{position}` and `/tactic/allRoleSuitabilities/{playerId}` light up for those
   positions in tactics4 automatically — no frontend change needed.
2. **Tune without recompiling** via `match.engine.role-weights.attributes.<RoleName>` overrides plus
   `suitabilityScale` / `overallBlend` / `roleBlend`.
3. **Position-fit ranking** (section 5) is the one piece with no backend home yet — implement it as a
   helper (e.g. a `positionFit(playerId, position)` endpoint) if the squad/scouting views want a single
   number per slot; otherwise the per-role `effectiveRating` from `computeEffectiveRating` is enough.

> All EXISTING weights above are mirrored from `PlayerRoleService.java` (lines 158-446). If that file
> changes, re-sync this document.
