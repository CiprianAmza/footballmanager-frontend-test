# Audit frontend: navigare, UI/UX, integrare de date și accesibilitate

**Worktree:** `/Users/ciprian.amza/IdeaProjects/fm-dobby-frontend-audit`

**Branch:** `codex/frontend-navigation-ux-audit`

**Bază verificată:** `2f9b08429c1ed5c08d996c73d795537acaedf79b` (`HEAD`, `origin/main` și merge-base identice la începutul auditului)

**Data auditului:** 23–24 iulie 2026 (Europe/Bucharest)
**Tip:** audit read-only; nu au fost modificate componente, servicii, teste, configurații sau lockfiles.

## 1. Rezumat executiv și metodă

Aplicația are o suprafață mare — 87 de rute și 87 de componente — dar nu este pregătită pentru o lansare sigură fără remedierea problemelor de mai jos. Auditul a găsit **20 de constatări distincte: 1 P0, 7 P1, 9 P2 și 3 P3**. Riscurile cele mai importante sunt:

1. consola de administrare publică afișează credențiale implicite care au funcționat în testul dinamic și au deschis operații destructive asupra întregului joc;
2. mai multe pagini vizibile prezintă date de domeniu inventate drept date reale (Club, Development Centre, Dynamics și profilul jucătorului);
3. rutele legacy Boardroom ocolesc feature flag-ul Regent și expun formulare de mutație bazate pe ID-uri introduse de utilizator;
4. există rute moarte fără fallback 404, inclusiv un link din fluxul explicit pentru managerul concediat;
5. shell-ul de manager este practic inutilizabil la 375 px: sidebar-ul fix consumă 220 px, conținutul primește 155 px, iar pagina ajunge la 691 px lățime;
6. suita definită de proiect este roșie (26/59 teste eșuate), deci nu poate funcționa ca poartă de regresie.

Metoda a combinat:

- citirea tuturor rutelor, template-urilor, componentelor și serviciilor relevante;
- urmărirea contractelor ID/nume și a endpointurilor care furnizează legături între entități;
- căutări sistematice pentru controale click-only, modale, stări de încărcare/eroare, valori mock/fallback și mutații HTTP;
- `npm ci`, suita Karma/ChromeHeadless și build-ul production;
- navigare Playwright pe desktop (1440×900), tabletă (768×1024) și mobil (375×812), inclusiv stările anonim, manager și Chairman/Regent;
- răspunsuri de rețea controlate în Playwright pentru a izola comportamentul frontend de indisponibilitatea ulterioară a backendului. Datele stocate/mutate nu au fost schimbate.

Nu am găsit un defect funcțional specific shell-ului Chairman/Regent Phase 1: la autentificare simulată ca `CHAIRMAN` cu flag activ, `/home` a redirecționat la `/economy`, iar navigația a conținut numai `My economy`, `Wealth rankings` și `Logout`.

## 2. Reproducibilitate, comenzi și limitări

### 2.1 Preflight

```text
git status --short --branch
## codex/frontend-navigation-ux-audit

git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
2f9b08429c1ed5c08d996c73d795537acaedf79b   (toate trei)
```

Worktree-ul era curat și branch-ul nu era folosit de alt worktree.

### 2.2 Instalare, teste și build

| Comandă | Rezultat |
|---|---|
| `npm ci --no-audit --no-fund` | PASS; 1.096 pachete instalate; numai avertismente deprecations |
| `npm test -- --watch=false --browsers=ChromeHeadless` | **FAIL**; Chrome Headless 150; 59 teste: 33 PASS, 26 FAIL; Karma mai raportează „Some of your tests did a full page reload!” |
| `npm run build` | PASS; hash `a7bcf8f91dc108ca`; 42,45 s |

Cele 26 eșecuri se împart fără suprapunere astfel:

- 18 teste fără provider `HttpClient` (inclusiv cele trei teste `AppComponent`);
- 7 teste fără provider `ActivatedRoute`;
- 1 test `DevCenterComponent` fără `RouterTestingModule`, deci `routerLink` este necunoscut.

Build-ul emite:

- bundle inițial **2,33 MB**, cu **852,65 kB** peste bugetul warning de 1,50 MB;
- `app.component.css` **35,58 kB**, cu **5,58 kB** peste bugetul warning de 30 kB;
- avertisment Autoprefixer pentru `start` în `tactic.component.css`;
- trei reguli Bootstrap omise în generarea indexului din cauza selectorilor.

### 2.3 Browser

Frontendul exact auditat a rulat pe `localhost:4201`; un server deja existent pe `localhost:4200` a avut același SHA-256 pentru `main.js` și a fost folosit pentru origin-ul permis de backend. Backendul local `localhost:8086` a fost inițial disponibil, apoi s-a oprit în timpul auditului. Înainte de oprire:

- `/admin` a afișat `admin/admin`;
- autentificarea cu aceste credențiale a reușit;
- consola a încărcat lista reală de cluburi și operațiile administrative.

După oprirea backendului, Playwright a interceptat exclusiv răspunsurile read-only necesare pentru `auth/me`, `career/status` și contractele paginilor analizate. Această limitare înseamnă că nu s-au validat end-to-end operațiile destructive, simularea unui meci, transferurile, salvarea/încărcarea sau submiturile de contract; comportamentul și wiring-ul frontend al acestora au fost auditate static.

## 3. Inventar de rute, pagini și matrice de navigare

### 3.1 Inventar complet

Sursa este `src/app/app-routing.module.ts:77-165`. Toate componentele sunt importate eager; există un singur redirect și niciun wildcard/not-found.

| Domeniu | Rute |
|---|---|
| Economy/identity (3) | `/economy`, `/wealth-rankings`, `/people/:profileId` |
| Player/card/history (8) | `/player/:playerId`, `/card/:playerId`, `/playerHistory/:playerId`, `/gallery/:teamId`, `/gallery`, `/compare/:id1/:id2`, `/compare`, `/shortlist` |
| Team/club/squad (12) | `/team/:teamId`, `/squad`, `/squad-planner`, `/squad-dynamics`, `/scouting`, `/transfers/:teamId/:season`, `/finances`, `/stadium`, `/team-history/:teamId`, `/medical`, `/staff`, `/youth-academy` |
| Tactics/training/tools (14) | `/tactic`, `/tactics/:teamId`, `/tactics1/:teamId`, `/tactics2/:teamId`, `/tactics3/:teamId`, `/tactics4/:teamId`, `/tactics5/:teamId`, `/tactics1`, `/tactics2`, `/tactics3`, `/tactics4`, `/tactics5`, `/tactics`, `/training` |
| Match/simulation (8) | `/match/ratings/:competitionId/:season/:round/:teamId1/:teamId2`, `/fixtures/:teamId`, `/fixtures`, `/simulate`, `/friendlies`, `/animation-preview`, `/assistant`, `/data-hub` |
| Competiții/global (21) | `/comp/:competitionId`, `/competition/:competitionId`, `/rounds`, `/competitionoveriew/:competitionId`, `/top3-history/:competitionId`, `/mediaPrediction/:competitionId`, `/hall-of-fame`, `/stats/scorers`, `/competition-list`, `/coefficients`, `/european-rounds/:competitionId/:season`, `/hall-of-fame/managers`, `/manager-profile/:managerId`, `/season-summary/:season`, `/season-summary`, `/all-time-champions`, `/overview`, `/competition-records/:competitionId`, `/awards/golden-boot`, `/awards/ballon-dor`, `/awards/global` |
| Awards competition (1) | `/awards/competition/:competitionId` |
| Career/shell (4) | `/home`, `/inbox`, `/job-search`, `/dev-center` |
| Boardroom legacy (7) | `/boardroom`, `/boardroom/wealth`, `/boardroom/assets/:humanId`, `/boardroom/ownership/:humanId`, `/boardroom/ownership`, `/boardroom/coach-control/:teamId`, `/boardroom/coach-control` |
| Admin (8) | `/admin`, `/admin/scores`, `/admin/offers`, `/admin/players`, `/admin/awards`, `/admin/draws`, `/admin/transfers`, `/admin/tactics-advisor` |
| Default (1) | `'' → /home` |

Total: **87 declarații de rută**. Lista de mai sus include fiecare declarație; rutele alias/parametrizate sunt numărate separat.

### 3.2 Matrice de navigare și autorizare

| Stare | Shell/pagini accesibile | Observație |
|---|---|---|
| Sesiune neverificată | nimic până la `sessionChecked` | corect pentru evitarea flicker-ului |
| Anonim | login pentru toate rutele game; `/admin*` folosește shell separat | deep-link-ul rămâne ascuns sub login; `/admin` este deliberat public înainte de carieră |
| Cont fără setup | `GameSetupComponent` | router-outlet-ul principal nu este prezentat |
| Manager activ | sidebar complet + top bar + outlet | 30+ destinații; duplicate/mislabeling descrise în N-018 |
| Manager concediat/free agent | Job Search, Hall of Fame, Overview, Competitions, Coefficients, Champions, Top Scorers, Manager Rankings | `Manager Rankings` este rută inexistentă, deci fluxul explicit este rupt |
| Chairman, Regent OFF | mesaj Phase 0 + Logout | `/economy`, `/wealth-rankings`, `/people/*` sunt protejate, dar Boardroom legacy nu este |
| Chairman, Regent ON | shell REGENT separat; redirect `/home → /economy` | verificat dinamic; navigația Phase 1 este coerentă |
| Admin fără token | login admin | hint-ul expune credențialele implicite |
| Admin cu token local | hub și 7 subpagini admin | guard-ul UI verifică numai existența unui token în `localStorage`; API-ul trebuie să rămână autoritatea |

### 3.3 Fluxuri urmărite

- login → setup → home → squad/tactics/schedule/competition/team/player;
- manager concediat → job search și pagini read-only;
- chairman Phase 0/Phase 1 → economy → rankings → profil public;
- admin login → hub → offers/funding/contracts;
- Club → manager, squad, tactics, stats, matches, transfers, honours, stadium;
- Competition list → competiție/circuit european;
- player → team/card/stats/contract/history/analytics/trophies;
- stări loading/error/empty/offline și dimensiuni desktop/tabletă/mobil.

## 4. Constatări P0 → P3

Fiecare constatare are o singură severitate și un singur owner principal; aspectele conexe sunt referite, nu duplicate.

### N-001 — P0 — Security: credențiale admin implicite expuse și funcționale

| Câmp | Detaliu |
|---|---|
| Rută/repro | Deschide `/admin`; UI afișează `admin/admin`; autentifică-te cu valorile afișate. |
| Actual | Loginul a reușit în browser și a deschis un hub capabil să mute jucători, să fixeze rezultate/draw-uri/premii, să genereze jucători și oferte, să adauge/elimine bani și să extindă contracte. Tokenul este păstrat în `localStorage`. |
| Așteptat | Nicio credențială funcțională nu este documentată în bundle/UI. Fiecare mediu are secret rotit, autentificare server-side, expirare/revocare, rate-limit și audit; UI nu consideră simpla prezență a unui string drept autentificare validă. |
| Impact | Compromiterea completă a integrității jocului în orice mediu accesibil unde defaultul rămâne activ. |
| Dovezi | `src/app/admin/admin.component.html:4-20,37-64,67-100`; `src/app/services/admin.service.ts:223-251`; Playwright: `admin/admin` a reușit și a încărcat datele reale. |
| Recomandare | Eliminați imediat hint-ul, rotiți/dezactivați defaultul în backend, invalidați tokenurile curente, cereți autentificare privilegiată reală și validați sesiunea la intrarea pe fiecare rută admin. |
| Dependență | **Backend/security obligatoriu**; remedierea numai în frontend nu securizează API-ul. |
| Test regresie | E2E: `admin/admin` primește 401 în afara unui profil dev explicit; bundle-ul nu conține parola; token expirat/fabricat nu afișează și nu execută operații admin. |

### N-002 — P1 — Data integrity: pagina Club inventează Premier League și aproape toate datele descriptive

| Câmp | Detaliu |
|---|---|
| Rută/repro | `/team/:teamId`; furnizează API-ului numai `{id,name,color1,color2}`, listă de trofee goală și manager absent. |
| Actual | `generateMockData()` afișează pentru orice club: `Premier League`, `England`, fondat 1905, Professional, The Team, reputație 4, căpitan/vicecăpitan fictivi, stadion 30.000 din 1995, rivali, echipamente, legende, istorie, buget €10M și salarii €500k/săptămână. Dacă requestul principal eșuează, pagina devine complet goală. |
| Așteptat | Numai date contractuale reale; câmpurile lipsă trebuie marcate „Unknown/Not available” sau ascunse. Competiția curentă trebuie derivată din membership-ul actual, iar numele trebuie să fie link spre pagina competiției. |
| Impact | Decizii sportive/financiare bazate pe date false și pierderea încrederii în întregul produs. |
| Dovezi | `src/app/club-info/club-info.component.ts:198-228,232-291,346-383`; randare în `club-info.component.html:14-19,65-145,179-233,250-334`. Browserul a afișat `Audit United` drept `Premier League / England`, €10M, €500k, 1905 etc. pe baza exclusivă a ID/nume/culori. |
| Recomandare | Eliminați complet `generateMockData`; introduceți un `ClubView` tipizat și compuneți pagina din endpointuri reale. Pentru divizie folosiți `/competition/getTeamCompetitions/:teamId`, selectând explicit liga (`typeId 1/3`) și păstrând toate cup-ele separat; link `['/comp', competitionId]` sau circuit european pentru tip 4/5. Nu selectați arbitrar prima competiție fără regulă de produs. |
| Dependență | Frontend pentru membership/link; **API** pentru nation, nickname, founded year, captains, rivals, kits/history și bugete dacă acestea trebuie afișate. `TeamService.getTeamCompetitions` există deja la `src/app/services/team.service.ts:285-287`; Home demonstrează selecția ligii la `home.component.ts:132-151`. |
| Test regresie | Contract test cu club din altă țară/ligă și două cupe; assert că „Premier League” nu apare dacă API-ul nu îl furnizează, liga reală este linkabilă, câmpurile lipsă au stare honestă, iar 404/500 produce error+Retry. |

### N-003 — P1 — Data integrity: Development Centre este o machetă prezentată ca funcție reală

| Câmp | Detaliu |
|---|---|
| Rută/repro | `/dev-center`, destinație permanentă în sidebar. |
| Actual | Componenta nu face request; `loadMockData()` injectează șapte jucători, cluburi, ligi, date și statistici fixe. Linkurile `/player/1..7` pot deschide jucători reali fără legătură. Butoanele edit/details/responsibilities/filter/recall și majoritatea taburilor nu execută nimic. |
| Așteptat | Date reale de împrumut/academie și acțiuni funcționale; până la implementare, ruta trebuie ascunsă sau să afișeze explicit „Not available”, fără linkuri către ID-uri reale. |
| Impact | Utilizatorul poate interpreta date fictive drept starea lotului și poate ajunge la entități greșite. |
| Dovezi | `src/app/dev-center/dev-center.component.ts:37-96`; `dev-center.component.html:13-38,74-125`; Playwright a randat Theo Stenumgaard…Giuseppe Casonato, Newcastle etc. fără backend, cu linkuri `/player/1..7`. |
| Recomandare | Feature flag/hide imediat; apoi contract API tipizat pentru loan assignments, teamId/playerId și comenzi de recall cu autorizare și feedback. |
| Dependență | API pentru date și mutații; frontend pentru ascundere/honest placeholder. |
| Test regresie | E2E fără endpoint: ruta nu prezintă persoane/statistici; cu fixture API: fiecare ID/link corespunde fixture-ului, iar recall are loading/success/error și refresh. |

### N-004 — P1 — Authorization/navigation: Boardroom legacy ocolește Regent și conține destinații invalide

| Câmp | Detaliu |
|---|---|
| Rută/repro | Ca manager cu `regentEnabled=false`, deschide direct `/boardroom`. Apoi deschide `Personal Assets` sau `Ownership`. |
| Actual | Toate cele 7 rute Boardroom sunt fără guard. Hub-ul s-a randat dinamic cu flag fals și oferă formulare buy/sell shares/assets, invest/withdraw și coach permissions. Linkul `/boardroom/assets` nu are rută; `/boardroom/ownership` transformă parametrul absent în `humanId=0`; coach-control acceptă team ID și owner human ID introduse manual. |
| Așteptat | O singură suprafață canonicală Economy/Regent, protejată atât în frontend cât și în backend; nicio rută legacy/mutație nu este accesibilă prin URL direct; ID-ul actorului vine din sesiune, nu din input/URL. |
| Impact | Bypass de feature rollout și suprafață de IDOR/mutație neautorizată; linkuri moarte în propriul hub. |
| Dovezi | rute `app-routing.module.ts:78-84,105-109`; guard aplicat numai la 3 rute `regent.guard.ts:6-10`; hub `boardroom-hub.component.ts:10-18`; ownership `boardroom-ownership.component.ts:29-57`; assets `boardroom-assets.component.ts:41-90`; coach control `coach-control.component.ts:48-84`; Playwright a randat hub-ul pentru manager non-Regent. |
| Recomandare | Eliminați/dezactivați rutele legacy sau aplicați guard de rol/flag; folosiți profileId din sesiune; redirect/404 explicit; nu păstrați două modele Economy/Boardroom concurente. |
| Dependență | **Backend obligatoriu** pentru autorizarea fiecărei mutații și eliminarea IDOR; frontend pentru route guard/hide/canonicalizare. |
| Test regresie | Matrice E2E anonim/manager/chairman flag off/on; toate requesturile mutate cu ID străin primesc 403; link checker confirmă că fiecare card are rută validă. |

### N-005 — P1 — Data integrity: profilul jucătorului contrazice contractul real

| Câmp | Detaliu |
|---|---|
| Rută/repro | `/player/:id`; fixture: portar, rating 12, fără preferredFoot/shirtNumber. |
| Actual | Headerul afișează mereu `14.`, adaugă `(Center)` oricărei poziții și arată 4½ stele; detaliile afișează `Right` dacă piciorul lipsește. Mai jos, aceeași pagină afișează corect ratingul numeric 12/WEAK, deci se contrazice vizibil. |
| Așteptat | shirt number, poziție/side, preferred foot și reprezentarea ratingului provin din API; lipsa este `—/Unknown`, nu o valoare probabilă. |
| Impact | Profil fals, mai ales pentru portar/winger și în comparații/scouting. |
| Dovezi | `src/app/player/player.component.html:23-35,56-64,127-149`; browser: `Audit Keeper`, rating API 12, a afișat `14.`, `Goalkeeper (Center)`, 4½ stele și `Right`. |
| Recomandare | Extindeți modelul tipizat; eliminați constantele/fallbackul semantic; derivați stelele din rating cu legendă de scală sau păstrați numai ratingul numeric. |
| Dependență | API dacă shirt number/position side/preferred foot nu există. |
| Test regresie | Fixtures GK/LW/ST, rating minim/maxim, valori null; header și detalii trebuie să corespundă exact contractului. |

### N-006 — P1 — Data integrity: Dynamics inventează atmosferă, influență și personalități

| Câmp | Detaliu |
|---|---|
| Rută/repro | `/squad-dynamics`. |
| Actual | Singurele date reale sunt jucători cu rating/vârstă. Top 3 devin „Team Leaders/Perfectionist”, următorii 5 „Highly Influential/Professional”, următorii 8 „Influential/Determined”; atmosfera este mereu `Excellent`, managerul `You (Manager)`. Taburile Overview/Social Groups/Happiness sunt inactive. |
| Așteptat | Dinamica vine dintr-un model de domeniu explicit sau este etichetată simulare; nicio personalitate/atmosferă nu este inventată. |
| Impact | Utilizatorul ia decizii de vestiar pe o euristică ascunsă și falsă. |
| Dovezi | `src/app/dynamics/dynamics.component.ts:7-16,28-35,44-74`; `dynamics.component.html:4-24,30-73`. |
| Recomandare | Ascundeți pagina/taburile neimplementate; creați endpoint pentru hierarchy/social groups/happiness/personality și explicați metodologia. |
| Dependență | API/domain design obligatoriu. |
| Test regresie | Contract fixture cu ordinea de influență diferită de rating; UI trebuie să respecte contractul și să nu emită valori implicite. |

### N-007 — P1 — Routing: fluxul managerului concediat are link mort și aplicația nu are 404

| Câmp | Detaliu |
|---|---|
| Rută/repro | Manager concediat → `Manager Rankings` (`/manager-leaderboard`); sau orice URL necunoscut. |
| Actual | Ruta reală este `/hall-of-fame/managers`. Nu există wildcard `**`; outlet-ul rămâne gol/top-bar only. Linkul Boardroom `/boardroom/assets` are aceeași problemă. |
| Așteptat | Toate linkurile interne corespund registry-ului; orice rută necunoscută produce pagina Not Found cu acțiune spre Home/back. |
| Impact | Un flux explicit de revenire după concediere pare blocat, fără explicație sau recuperare. |
| Dovezi | link `app.component.html:84-97`; rută reală `app-routing.module.ts:135`; finalul registry-ului `app-routing.module.ts:163-165`; browser pe `/manager-leaderboard` a avut outlet fără componentă și numai top bar. |
| Recomandare | Corectați linkul; adăugați `**` după toate rutele și un `NotFoundComponent`; automatizați verificarea linkurilor literale. |
| Dependență | Frontend. |
| Test regresie | Router test pentru fiecare link din shell/hub + E2E pe URL necunoscut cu heading 404 și link Home. |

### N-008 — P1 — Feature completeness: Training și Squad Planner expun funcții care nu există

| Câmp | Detaliu |
|---|---|
| Rută/repro | `/training` → Schedules/Units/Mentoring/Coaches; `/squad-planner` → Next Season/Season After și controalele Ask/Add/Filter/Remove. |
| Actual | Training spune „under construction for the mock version” pentru 4 taburi. Squad Planner schimbă numai `activeTab`, nu filtrează pe sezon; formația/tactica sunt fixe, All Positions nu este conectat, butoanele nu au handler, iar `Create New Recruitment Focus` este `href="#"`. |
| Așteptat | Funcțiile indisponibile sunt ascunse/disabled cu explicație; taburile disponibile schimbă datele; toate controalele interactive au rezultat. |
| Impact | Interfața promite capabilități de planificare/recrutare/dezvoltare care nu există și pierde inputul utilizatorului. |
| Dovezi | `training.component.ts:54-55`; `training.component.html:13-20,202-212`; `squad-planner.component.ts:35-53,61-76,146-178`; `squad-planner.component.html:10-14,21-48,60-64,128-139`. |
| Recomandare | Feature flags per subfeature și eliminarea controlului inert; implementați un model de plan per sezon înainte de expunere. |
| Dependență | API pentru persistență/season snapshots; frontend pentru affordance. |
| Test regresie | Test de contract al fiecărui buton/tab; niciun control enabled fără handler și schimbare observabilă; reload păstrează planul salvat. |

### N-009 — P2 — Responsive: shell-ul fix rupe experiența mobilă

| Câmp | Detaliu |
|---|---|
| Rută/repro | Orice pagină manager la 375×812; comparați 768×1024 și 1440×900. |
| Actual | Sidebar fix 220 px, main `calc(100%-220px)`, fără breakpoint de colaps. La 375 px: nav 220, main 155, main scrollWidth 471, body scrollWidth 691. La 768 px: main 548. La 1440 px: main 1220, fără overflow. |
| Așteptat | Sidebar drawer/collapse la telefon, top bar reflow, o singură axă de scroll pentru tabele și minimum 320 px utili pentru conținut. |
| Impact | 59% din viewportul mobil este ocupat permanent de meniu; formularele/tabelele/cardurile ies din ecran. |
| Dovezi | `src/app/app.component.css:2-23,86-105`; numai media queries punctuale, nu shell; măsurători Playwright de mai sus. |
| Recomandare | Breakpoint shell ≤900 px, drawer cu buton accesibil și focus management; containere fluide, table-scroll local, teste pe 320/375/768/1024/1440. |
| Dependență | Frontend/design. |
| Test regresie | Visual/E2E: `body.scrollWidth === viewport` la 320/375; main ≥ viewport; navigația se deschide/închide cu tastatură și Escape. |

### N-010 — P2 — Accessibility: click-only, sortare inaccesibilă și modale fără contract de focus

| Câmp | Detaliu |
|---|---|
| Rută/repro | Navigare numai cu Tab/Enter/Space în Competition list, Gallery, Tactics, Training, Data Hub, Champions și tabele sortabile; deschide orice modal tactic/transfer/staff. |
| Actual | Căutarea a găsit **226** elemente `div/tr/td/th/li/span/article/section` cu `(click)`. Exemple: competition card, gallery card, 5 variante tactics, session cards, headers Club şi sortable `<th>`. Majoritatea nu au `tabindex`, rol, keyboard handler sau `aria-sort`. Majoritatea modalelor sunt `div` fără `role=dialog`, focus trap, focus restore ori Escape. Shell-ul folosește `href="javascript:void(0)"`. |
| Așteptat | Link pentru navigare, button pentru acțiune, sortable button în `<th>`, dialog semantic cu focus lifecycle; focus-visible consistent. |
| Impact | Fluxuri majore indisponibile pentru tastatură și tehnologii asistive; activări accidentale și lipsă de context. |
| Dovezi | exemple `competition-list.component.html:8-20`; `player-gallery.component.html:91`; `manager-leaderboard.component.html:24-33`; `training.component.html:37-48`; `club-info.component.html:152-160,198-201`; `app.component.html:75-77,154-162`; modale `transfer-page.component.html:609-903`, `staff.component.html:214-653`; doar un subset mic are aria/dialog (de ex. app load/tutorial). |
| Recomandare | Migrare sistematică la elemente native; directivă comună de dialog; `aria-sort`, caption/labels, skip-link și focus-visible global. |
| Dependență | Frontend/design; validați cu utilizatori AT dacă produsul are cerință WCAG formală. |
| Test regresie | axe-core + scenarii keyboard; fiecare element cu click este nativ sau are rol/tabindex/key handlers; focus intră/rămâne/revine din dialog. |

### N-011 — P2 — Resilience: erorile și deep-linkurile invalide devin pagini goale

| Câmp | Detaliu |
|---|---|
| Rută/repro | API offline/404 pe `/player/12345`, `/competition-list` sau `/team/:id`. |
| Actual | Player are template doar sub `*ngIf="playerView"` și request `next`-only; după eșec nu există spinner, eroare, 404 sau Retry. Competition list lasă gridul gol fără să distingă „zero competiții” de request eșuat. Club oprește loading dar `club` rămâne null. |
| Așteptat | Stări distincte initial/loading/success-empty/not-found/error/offline, mesaj contextual, Retry și navigare de recuperare. |
| Impact | Utilizatorul nu știe dacă nu există date, URL-ul e greșit sau sistemul este indisponibil. |
| Dovezi | `player.component.ts:119-137`; `player.component.html:1`; `competition-list.component.ts:79-84`; `competition-list.component.html:1-114`; `club-info.component.ts:195-228`; browser: player necunoscut a arătat numai top bar, fără spinner/eroare; competitions offline a arătat doar heading și zero carduri. |
| Recomandare | Model standard `AsyncState<T>`, componentă comună error/empty/retry și maparea HTTP 404/403/5xx/offline. |
| Dependență | Frontend; API trebuie să returneze statusuri coerente. |
| Test regresie | Component/E2E pentru 200-empty, 404, 403, 500 și offline pe fiecare pagină critică. |

### N-012 — P2 — Navigare între entități: ID-uri disponibile sunt randate ca text inert

| Câmp | Detaliu |
|---|---|
| Rută/repro | Urmează numele unui adversar/club/competiție din paginile din secțiunea 5. |
| Actual | Mai multe contracte conțin ID-ul țintei, dar template-ul afișează numai numele; în alte pagini același tip de entitate este link, deci comportamentul este inconsistent. |
| Așteptat | Orice nume identificabil de player/team/manager/competition folosește ruta canonicală și link semantic; dacă ID-ul lipsește, contractul se extinde sau numele rămâne explicit non-link. |
| Impact | Investigația naturală a lotului, adversarului și competiției este întreruptă; utilizatorii sunt obligați să caute manual. |
| Dovezi | Inventarul exact este în secțiunea 5; exemple certe: `competition-list.component.ts:33-50` vs HTML `70-88`, `club-info.component.ts:26-38,274-291` vs HTML `271-280,306-308`, `player.component.ts:472-498` vs HTML `504-510`. |
| Recomandare | Componentă/directivă canonicală `EntityLink`; păstrați ID-urile la mapare; `routerLink` + stopPropagation unde rândul părinte este clickabil. |
| Dependență | Frontend pentru cazurile cu ID existent; API pentru cele marcate „contract lipsă”. |
| Test regresie | Contract/unit test care enumeră entity renderers; E2E verifică URL-ul și Back pentru fiecare categorie. |

### N-013 — P2 — Mutații: protecție inconsistentă la dublu-submit și feedback incomplet

| Câmp | Detaliu |
|---|---|
| Rută/repro | Player → shortlist, contract renewal, clauses; Boardroom assets/shares/ownership; Friendly cancel. Faceți dublu click sau simulați latență/eroare. |
| Actual | Mai multe POST/DELETE nu setează stare in-flight și nu dezactivează controlul; shortlist nu are error handler, renewal/clauses permit submit repetat, Boardroom buy/sell/invest nu blochează duplicatele și acțiunile ireversibile nu cer confirmare. Alte fluxuri (admin, individual training, job offers) implementează deja patternul corect, deci UX-ul este inconsistent. |
| Așteptat | Buton disabled/spinner cât timp requestul rulează, feedback inline/live, confirmare pentru destructive, retry sigur și idempotency server-side. |
| Impact | Operații duplicate, stare locală divergentă și lipsă de certitudine asupra rezultatului. |
| Dovezi | `player.component.ts:173-193,259-317`; `player.component.html:27-29,395-397,461-463`; `boardroom-assets.component.ts:58-90`; `boardroom-assets.component.html:41,53,86,105-110`; `boardroom-ownership.component.ts:42-57`. |
| Recomandare | Operator RxJS comun (`exhaustMap`/state machine), disabled + `aria-busy`, toast/inline live region; cheie idempotency în backend pentru operații financiare/contractuale. |
| Dependență | Frontend + backend pentru idempotency. |
| Test regresie | Dublu click produce un singur request; 409/500 restabilește controlul și păstrează datele; succesul reîncarcă exact o dată. |

### N-014 — P2 — Deployability: origin-ul API este hardcodat la localhost

| Câmp | Detaliu |
|---|---|
| Rută/repro | Build/deploy pe orice origin/port diferit sau rulează `ng serve` pe 4201. |
| Actual | `urlApp = "http://localhost:8086"` este importat global. Pe 4201 browserul a primit CORS pentru `/api/auth/csrf`; nu există fișiere environment/proxy în source. |
| Așteptat | Base URL injectat per mediu sau same-origin `/api`, cu configurație runtime și CORS explicit doar unde este necesar. |
| Impact | Build-ul production nu este portabil; autentificarea se oprește înainte de login. |
| Dovezi | `src/app/app.component.ts:9`; importuri în toate serviciile/componentele; CORS observat dinamic pe `127.0.0.1:4201` și `localhost:4201`. |
| Recomandare | InjectionToken/config runtime sau reverse proxy same-origin; centralizați API clientul și eliminați importul din componenta root. |
| Dependență | Frontend + deployment/backend CORS. |
| Test regresie | Build smoke cu base URL injectat; login pe origin alternativ; niciun literal `localhost:8086` în bundle production. |

### N-015 — P2 — Performance: toate cele 87 de pagini sunt eager, iar build-ul depășește bugetele

| Câmp | Detaliu |
|---|---|
| Rută/repro | `npm run build`; prima încărcare pe rețea mobilă. |
| Actual | `app-routing.module.ts` importă direct toate componentele, iar `AppModule` le declară. Bundle initial 2,33 MB depășește warningul cu 852,65 kB; shell CSS depășește bugetul. Admin, cinci variante de tactics și preview-uri sunt descărcate înainte de a fi folosite. |
| Așteptat | Lazy feature modules/standalone routes, shared chunks și bugete care trec fără warning. |
| Impact | Time-to-interactive și consum de date/memorie cresc, mai ales pe mobilul deja afectat de layout. |
| Dovezi | `app-routing.module.ts:3-75,77-165`; `angular.json:33-45`; output build din secțiunea 2. |
| Recomandare | Lazy-load admin, boardroom/economy, tactics variants, awards/history și analytics; eliminați variante legacy; analizați bundle-ul înainte/după. |
| Dependență | Frontend/build. |
| Test regresie | Buget build sub prag, test network care verifică faptul că admin/tactics chunks nu se încarcă pe login/home. |

### N-016 — P2 — Quality gate: suita standard este roșie și nu acoperă navigarea critică

| Câmp | Detaliu |
|---|---|
| Rută/repro | `npm test -- --watch=false --browsers=ChromeHeadless`. |
| Actual | 26/59 fail; 18 HttpClient, 7 ActivatedRoute, 1 routerLink; full page reload. Doar 37/87 componente au fișier `component.spec.ts`; numai 3 spec-uri folosesc RouterTestingModule și 4 HttpClientTestingModule. Nu există Playwright/Cypress/axe în proiect. |
| Așteptat | Zero teste roșii; smoke test pentru fiecare rută, link checker, auth/guard matrix, state tests și responsive/a11y E2E. |
| Impact | Defecte evidente precum ruta moartă, mockurile și ecranele goale nu sunt detectate automat. |
| Dovezi | output secțiunea 2; `package.json` oferă doar Karma; inventar specs. |
| Recomandare | Reparați TestBed-urile înainte de funcții noi; adăugați harness comun cu HttpClientTestingModule/RouterTestingModule și un set E2E minim. |
| Dependență | Frontend/CI. |
| Test regresie | CI blochează merge la orice test fail/build budget warning convenit; route manifest test și axe smoke pe shell-uri. |

### N-017 — P2 — Data methodology: fallbackuri numerice transformă „lipsă” sau zero în valori inventate

| Câmp | Detaliu |
|---|---|
| Rută/repro | Overview → All-time rating impact cu procent 0/lipsă; Player fără preferredFoot; pagini financiare fără câmpuri. |
| Actual | `teamAppearancePercentage || 55`, `competitionAppearancePercentage || 60`, weights `|| 2.5/1`, boardConfidence `?? 50`, preferredFoot `|| Right`; unele valori sunt default de produs, altele date prezentate, dar UI nu le distinge. Boardroom legacy formatează `$`, Economy canonical folosește moneda contractului/EUR. |
| Așteptat | `null/undefined` sunt distincte de 0; defaulturile de metodologie sunt explicite, versionate și etichetate; moneda vine din `Money.currency`. |
| Impact | Rapoarte/statistici pot afirma praguri sau valori care nu au fost returnate de backend. |
| Dovezi | `leagues-overview.component.html:211-218,360-361`; `player.component.html:133`; `finances.component.ts:134-147`; `boardroom-assets.component.ts:103-108`; `economy/economy.models.ts:1-17`. |
| Recomandare | Helperi null-safe, tipuri `number | null`, „Not reported”, config metodologic de la API și un singur money formatter. |
| Dependență | Frontend + API/domain pentru sursa pragurilor/monedei. |
| Test regresie | Matrix 0/null/undefined/positive; zero rămâne zero, null nu devine statistică, moneda respectă contractul. |

### N-018 — P3 — Information architecture: aliasuri/labeluri și componente legacy concurează

| Câmp | Detaliu |
|---|---|
| Rută/repro | Sidebar manager și registry. |
| Actual | `Squad` și `Club Info` duc ambele la `/team/:id`; `Club Vision` duce la `/stats/scorers`; există `/comp` și `/competition`, `competitionoveriew` typo, `/rounds`, 6 intrări Tactics fără ID și 6 cu ID, plus `tactic`. Cinci componente tactice coexistă cu advisorul. |
| Așteptat | O rută canonicală per concept, label care descrie destinația și redirecturi compatibile pentru aliasuri legacy. |
| Impact | Active state ambiguu, mentenanță și analytics fragmentate, documentație greu de înțeles. |
| Dovezi | `app.component.html:99-141`; `app-routing.module.ts:85-109,118-125`; `app.module.ts` declară toate variantele. |
| Recomandare | Definiți route constants și sitemap canonical; redenumiți Squad/Club Vision corect; deprecați aliasurile prin redirect, nu componente duplicate. |
| Dependență | Product/design + frontend. |
| Test regresie | Snapshot al meniului pe fiecare stare; fiecare label are destinație unică și active state unic. |

### N-019 — P3 — Contract maintainability: `any` pierde ID-uri și logica de domeniu este duplicată

| Câmp | Detaliu |
|---|---|
| Rută/repro | Player season stats, season summary, friendlies, competition insights și type labels. |
| Actual | Obiecte `any` pe fluxuri întregi; Player mapează `competitionEntries` și păstrează numele, dar aruncă `competitionId`. `competitionTypeLabel/getTypeLabel` este implementat separat în mai multe componente, cu denumiri diferite. Season summary nu are model, deci nu se poate garanta linkabilitatea awards/transfers/teams. |
| Așteptat | DTO-uri partajate, discriminated unions și mapare care păstrează identity fields; o singură taxonomie competition type. |
| Impact | Linkuri imposibile, drift semantic și erori detectate doar runtime. |
| Dovezi | `player.component.ts:333-350`; `season-summary.component.ts:15-38`; `friendly.component.ts:16-29`; `competition-insights.component.ts:25,38,45`; label mappings în `club-info.component.ts:160-173` și `competition-list.component.ts:123+`. |
| Recomandare | Modele API generate/partajate, `strict` incremental, mapper tests și `EntityRef {id,name}`. |
| Dependență | Frontend; eventual OpenAPI/backend schemas. |
| Test regresie | Type-level compile tests și mapper unit tests care confirmă păstrarea tuturor ID-urilor. |

### N-020 — P3 — Lifecycle/performance: subscriptions și N+1 requests fără orchestration comună

| Câmp | Detaliu |
|---|---|
| Rută/repro | Navigări repetate în root/player trophies și componente care urmăresc route/team streams. |
| Actual | Root subscribe direct la patru streamuri fără `takeUntil`/AsyncPipe; Player trophies face două requesturi suplimentare per trofeu pentru numele team/competition; multe componente reîncarcă independent aceleași nume/date. Root trăiește de regulă cât aplicația, dar patternul se propagă și îngreunează teardown/testarea. |
| Așteptat | AsyncPipe/DestroyRef, facade/cache pentru entity refs și endpointuri batch/enriched. |
| Impact | Trafic suplimentar, race conditions și teste fragile; severitatea este P3 deoarece nu s-a demonstrat leak vizibil în sesiunea scurtă. |
| Dovezi | `app.component.ts:170-202`; `player.component.ts:469-507`; numeroase subscriptions directe în componente. |
| Recomandare | `takeUntilDestroyed`, facades, cache `shareReplay` cu invalidare și DTO trophy deja îmbogățit. |
| Dependență | Frontend; API opțional pentru batch/enrichment. |
| Test regresie | Navigare repetată nu multiplică requesturile/listeners; test de teardown și request-count. |

## 5. Premier League/competition linkage și inventarul linkurilor între entități

### 5.1 Remedierea exactă pentru Club → competiție

Defectul „Premier League” nu trebuie reparat printr-un alt string sau printr-un fallback mai sofisticat. Contractul de membership există deja:

```text
GET /competition/getTeamCompetitions/{teamId}
→ [{ competitionId, name, typeId, ...lifecycle/stats }]
```

Este consumat în `TeamService.getTeamCompetitions()` și în Home/Competition list. Implementarea recomandată:

1. `ClubInfoComponent` încarcă branding + membership în același flux.
2. Separă `domesticLeagues = typeId in [1,3]`, `domesticCups = typeId in [2,6]`, `european = typeId in [4,5]`.
3. Afișează fiecare membership ca link semantic; pentru tip 4/5 folosește `/european-rounds/:competitionId/:season`, altfel `/comp/:competitionId`.
4. Dacă produsul cere exact o „division”, API/product trebuie să definească prioritatea pentru promovare/relegare, competiții multiple sau membership între sezoane. Nu folosiți `competitions[0]` ca adevăr implicit.
5. Dacă lista este goală, afișați `No active competition membership`, nu Premier League.
6. Nation nu se deduce din numele ligii; necesită `nationId/name` în Team/Competition DTO sau un request explicit.

Testele obligatorii: club în liga 1, club în liga 2, două cupe, circuit european, club fără membership, sezon de tranziție și eroare API.

### 5.2 Gap-uri certe: ID-ul există deja în frontend

| Context | Identity disponibil | Randare actuală | Țintă recomandată |
|---|---|---|---|
| Competition list, next match | `opponentTeamId` | adversar text | `/team/:opponentTeamId` |
| Competition list, elimination | `byTeamId` | eliminator text | `/team/:byTeamId` |
| Club stats filters/rows | `competitionId`, `competitionName`, `typeId` | nume/chip text | `/comp/:id` sau european route |
| Club header division | membership endpoint conține `competitionId/name/typeId` | string hardcodat Premier League | link la liga reală |
| Player trophies | `teamId`, `competitionId` sunt păstrate prin spread | team/competition text | `/team/:teamId`, `/comp/:competitionId` |
| Player season competition entries | backend entry este disponibil înainte de mapper | mapper aruncă ID-ul, nume text | păstrează ID și link |
| Leagues Overview, compact category cards | `StatisticLeader.teamId` | teamName text în `<small>` | `/team/:teamId` |
| Friendly match | `homeTeamId`, `awayTeamId` folosite deja pentru logică | ambele nume text | `/team/:id` |
| Award Centre manager winner | modelul are numai `playerId`, dar ruta folosește acel ID drept manager ID | posibil entity-ID misuse | contract separat `winnerEntityType/winnerEntityId` sau `managerId` |
| Boardroom wealth | `humanId` și, pentru owned clubs, team identity | numele persoanei duce la assets mutable; cluburile sunt badges | profil public `/people/:profileId` și `/team/:teamId` după contract |

### 5.3 Gap-uri unde API-ul trebuie verificat/extins

| Context | Nume inert | Necesitate contract |
|---|---|---|
| Player recent form | opponentName, competitionName | opponentTeamId + competitionId/type |
| Season Summary standings/scorers/best players/awards/objectives/transfers | team/competition/winner/player names; numai unele playerId sunt folosite | DTO tipizat cu toate entity refs; componenta este `any` |
| Competition Insights champion/final/runner-up/current fixtures/group table | team names | teamId pe fiecare nested object |
| Manager leaderboard current club | currentTeamName | currentTeamId |
| League overview team value manager | managerName | managerId dacă profilul trebuie navigabil |
| Dev Centre loan teams | loanTeam/league strings | real playerId/teamId/competitionId/loanAssignmentId |

### 5.4 Semantica linkului

Chiar când navigarea există prin `(click)`, nu este echivalentă unui link. `Competition card`, `Player Gallery card`, `All-time champion row`, `Friendly match row` și multiple nume în tactics sunt `div/tr/td` click-only. Pentru o destinație, folosiți `<a [routerLink]>` astfel încât Enter, context menu, copy link și open-in-new-tab să funcționeze. Butonul se păstrează numai pentru acțiuni/modal local.

## 6. Roadmap de remediere

### Quick wins (1–3 zile)

1. **Incident/security:** eliminați hint-ul admin, rotiți credențialele și invalidați tokenurile (backend owner obligatoriu).
2. Corectați `/manager-leaderboard`, `/boardroom/assets` și adăugați wildcard 404.
3. Ascundeți prin flag/routing Dev Centre, Dynamics și subtaburile Training/Planner neimplementate.
4. Eliminați constantele vizibile din Player sau afișați `—` până există contract.
5. Adăugați error/empty/retry pe Player, Club și Competition list.
6. Înlocuiți linkurile certe din secțiunea 5.2 și păstrați `competitionId` în mapper.

### Mediu (1–3 sprinturi)

1. Înlocuiți Club mock cu DTO-uri reale și membership links; coordonați câmpurile lipsă cu API.
2. Protejați/eliminați Boardroom legacy în FE și BE; migrați orice funcție validă în Economy canonical.
3. Implementați responsive shell/drawer și reflow pentru top bar/tabele/modale.
4. Standardizați `AsyncState`, mutation state și dialog semantics.
5. Reparați toate cele 26 teste și adăugați route/auth/link E2E + axe.
6. Introduceți config API per mediu și same-origin deployment.

### Structural (3+ sprinturi)

1. Sitemap/route constants canonical, eliminare aliasuri și variante tactics legacy.
2. Lazy loading per feature și reducerea bundle-ului sub buget.
3. DTO-uri tipizate/generate, `EntityRef`, taxonomie competition type și money formatter comun.
4. Facade/cache pentru date comune, teardown RxJS și endpointuri enriched/batch.
5. Model de domeniu real pentru Dynamics, Development Centre și multi-season Squad Planner.

## 7. Goluri de acoperire și checklist de acceptare

### 7.1 Goluri

- Nu există E2E în repository, audit automat de accesibilitate sau visual regression.
- 50 din 87 componente nu au spec component dedicat.
- Testele curente „should create” nu montează dependențele reale și 26 sunt roșii.
- Nu există test al manifestului de rute/linkurilor, 404, auth matrix sau feature flags.
- Nu există contract tests pentru entity IDs/names și null/zero/missing.
- Nu există viewport tests; CSS-ul shell nu are breakpoint.
- Nu s-au putut executa destructive E2E din cauza scope-ului read-only și opririi backendului; acestea necesită mediu izolat/resetabil.

### 7.2 Checklist release

- [ ] `admin/admin` dezactivat, secret rotit, tokenuri invalidate și API admin verificat server-side.
- [ ] 0 date mock prezentate ca reale în rute enabled.
- [ ] Club afișează liga/competițiile reale și linkabile; nation/buget/captains provin din contract sau sunt `N/A`.
- [ ] Boardroom legacy inaccesibil pentru rol/flag nepotrivit și fără ID-uri de actor introduse de client.
- [ ] Fiecare rută internă este validă; wildcard 404 cu recovery.
- [ ] Toate entity refs cu ID sunt linkuri semantice; API extins pentru gap-urile rămase.
- [ ] 320/375/768/1024/1440 fără horizontal body overflow; drawer accesibil.
- [ ] Keyboard-only poate opera meniul, sortarea, cards și modalele; axe fără încălcări critice/serioase agreate.
- [ ] Loading, empty, 404, 403, 500 și offline sunt diferențiate pe paginile critice.
- [ ] Toate mutațiile au in-flight/disabled, feedback și idempotency adecvat.
- [ ] API base URL configurabil și smoke deploy pe origin non-localhost.
- [ ] `npm test -- --watch=false --browsers=ChromeHeadless` are 0 fail și fără full-page reload.
- [ ] `npm run build` trece bugetele fără warninguri convenite.
- [ ] Fluxurile active manager, fired manager, Chairman Phase 0/1 și admin sunt acoperite E2E.

## 8. Totaluri și verdict

| Severitate | Număr | IDs |
|---|---:|---|
| P0 | 1 | N-001 |
| P1 | 7 | N-002…N-008 |
| P2 | 9 | N-009…N-017 |
| P3 | 3 | N-018…N-020 |
| **Total** | **20** | fără duplicate |

**Verdict:** `BLOCK RELEASE` până la închiderea N-001 și a constatărilor P1 care expun date fictive/rute neautorizate. După acestea, minimum pentru un review de lansare este: rute fără dead ends, state handling, shell mobil funcțional, test suite verde și contracte entity-link stabilizate.
