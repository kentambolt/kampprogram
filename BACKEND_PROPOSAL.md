# Forslag: Flerbruger-backend til Kampprogram

## TL;DR

Min anbefaling: **PHP 8 + MySQL + JSON-API**, samme `index.html`/`script.js`/`styles.css` som i dag — vi tilføjer `/api/*`-endpoints, en login-skærm, og udskifter `localStorage.setItem/getItem` med `fetch`. Hele backenden kan ligge i ét enkelt PHP-projekt (~10-15 filer). Roundtrip-tiden er kort, og du kan deploye på dit eksisterende PHP/MySQL-hosting uden noget process-management.

Hvis du gerne vil have et mere moderne stack ovenpå Ubuntu-serveren, går jeg gennem alternativet til sidst.

---

## 1. Hvad ændrer sig konceptuelt

| Idag                                | Med backend                                                            |
|-------------------------------------|------------------------------------------------------------------------|
| Én bruger pr. enhed                 | Mange brugere kan logge ind                                            |
| Data i `localStorage`               | Data i MySQL pr. *klub*                                                |
| Ingen identitet                     | Hver bruger har en email + rolle                                       |
| Spillerlister er pr. enhed          | Spillerlister deles inden for klubben                                  |
| Settings (regler) er pr. enhed      | Settings er pr. klub (én delt opsætning)                               |
| Historik er pr. enhed               | Historik gemmes pr. klub; alle medlemmer ser samme kampe               |
| `STORAGE_KEY = 'kampprogram-v3'`    | `localStorage` bruges kun som cache for offline-tilfælde (valgfrit)    |

---

## 2. Datamodel (MySQL)

Den essentielle struktur — 7 tabeller:

```sql
-- En klub er en lukket "tenant". Alt øvrigt data hænger på club_id.
CREATE TABLE clubs (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    slug          VARCHAR(60)  NOT NULL UNIQUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Brugere hører til præcis én klub.
CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id       INT UNSIGNED NOT NULL,
    email         VARCHAR(190) NOT NULL,
    name          VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,        -- password_hash() med PASSWORD_DEFAULT (bcrypt/argon2)
    role          ENUM('owner','editor','viewer') NOT NULL DEFAULT 'editor',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (club_id, email),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

-- Spillere er klub-delte. (Det er disse den nuværende roster gemmer lokalt.)
CREATE TABLE players (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id       INT UNSIGNED NOT NULL,
    name          VARCHAR(120) NOT NULL,
    level         TINYINT UNSIGNED NOT NULL DEFAULT 5,
    active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (club_id, name),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

-- Hold (super-players) til team-mode.
CREATE TABLE teams (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id       INT UNSIGNED NOT NULL,
    name          VARCHAR(120) NOT NULL,
    active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);
CREATE TABLE team_members (
    team_id       INT UNSIGNED NOT NULL,
    player_id     INT UNSIGNED NOT NULL,
    PRIMARY KEY (team_id, player_id),
    FOREIGN KEY (team_id)   REFERENCES teams(id)   ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Klubbens indstillinger (de nuværende rule-dropdowns mm.). Én række pr. klub.
CREATE TABLE club_settings (
    club_id              INT UNSIGNED PRIMARY KEY,
    team_mode            TINYINT(1) NOT NULL DEFAULT 0,
    partner_level_rule   ENUM('none','prefer','require') NOT NULL DEFAULT 'prefer',
    opponent_level_rule  ENUM('none','prefer','require') NOT NULL DEFAULT 'prefer',
    new_partner_rule     ENUM('none','prefer','oneNew','allNew') NOT NULL DEFAULT 'prefer',
    new_opponent_rule    ENUM('none','prefer','oneNew','allNew') NOT NULL DEFAULT 'prefer',
    disallow_exact_repeat TINYINT(1) NOT NULL DEFAULT 0,
    show_all_levels      TINYINT(1) NOT NULL DEFAULT 1,
    sort_players_by      ENUM('name','level-asc','level-desc') NOT NULL DEFAULT 'name',
    enabled_formats      JSON NOT NULL,                  -- fx [1,2]
    default_court_count  TINYINT UNSIGNED NOT NULL DEFAULT 2,
    maximize_courts      TINYINT(1) NOT NULL DEFAULT 1,
    updated_by_user_id   INT UNSIGNED NULL,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

-- Spillede runder (kamphistorik). round_data er hele kampens struktur.
CREATE TABLE rounds (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id            INT UNSIGNED NOT NULL,
    created_by_user_id INT UNSIGNED NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    round_data         JSON NOT NULL,        -- {courts: [...], benched: [...]}
    INDEX (club_id, created_at),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

-- Gemte spillerlister ("Torsdagsholdet" osv.).
CREATE TABLE player_lists (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id            INT UNSIGNED NOT NULL,
    name               VARCHAR(120) NOT NULL,
    created_by_user_id INT UNSIGNED NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (club_id, name),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);
CREATE TABLE player_list_members (
    list_id            INT UNSIGNED NOT NULL,
    player_id          INT UNSIGNED NOT NULL,
    PRIMARY KEY (list_id, player_id),
    FOREIGN KEY (list_id)   REFERENCES player_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)     ON DELETE CASCADE
);

-- Sessions kan håndteres via PHP's standard session-system (filsystem eller DB-backed).
```

**Multi-tenancy-princip**: hver request får et `club_id` udledt fra session, og *hver* SQL-query skal indeholde `WHERE club_id = ?` for ikke at lække data mellem klubber. Det er den eneste sikkerhedsregel der virkelig betyder noget.

---

## 3. Roller

Tre niveauer er nok til at starte:

| Rolle    | Læs spillere/historik | Opret/redigér spillere & kampe | Slet spillere | Ændre regler | Inviter/fjern brugere |
|----------|:--------------------:|:------------------------------:|:-------------:|:------------:|:---------------------:|
| `viewer` | ✓                    |                                |               |              |                       |
| `editor` | ✓                    | ✓                              | ✓             | ✓            |                       |
| `owner`  | ✓                    | ✓                              | ✓             | ✓            | ✓                     |

Den der opretter klubben bliver automatisk `owner`. Owner kan invitere flere `owner`s, `editor`s og `viewer`s.

---

## 4. API-design

Helt simpelt JSON-API, alt under `/api/`. Sessions-cookie (HttpOnly, Secure, SameSite=Lax) styrer auth — ingen JWT'er.

```
POST   /api/auth/register-club     {clubName, email, name, password}   → opretter klub + owner
POST   /api/auth/login             {email, password}                   → sætter session
POST   /api/auth/logout
GET    /api/me                                                         → {user, club, role}

GET    /api/players                                                    → [{id,name,level,active}, ...]
POST   /api/players                {name, level}
PATCH  /api/players/:id            {name?, level?, active?}
DELETE /api/players/:id
POST   /api/players/bulk-delete    {ids: [...]}

GET    /api/teams
POST   /api/teams                  {name, memberIds:[...]}
PATCH  /api/teams/:id              {name?, memberIds?, active?}
DELETE /api/teams/:id

GET    /api/settings                                                   → hele club_settings-rækken
PUT    /api/settings               {...full payload...}

GET    /api/rounds?limit=50                                            → seneste runder (paginated)
POST   /api/rounds                 {round_data}                        → gem ny runde
DELETE /api/rounds/:id

GET    /api/player-lists                                               → alle lister i klubben
POST   /api/player-lists           {name, playerIds:[...]}
PUT    /api/player-lists/:id       {name?, playerIds?}
DELETE /api/player-lists/:id

# Kun for owner:
GET    /api/users
POST   /api/users                  {email, name, role, tempPassword}
PATCH  /api/users/:id              {role?, name?}
DELETE /api/users/:id
```

Hver endpoint returnerer JSON, fejler med 401 (ikke logget ind), 403 (forkert rolle), 404 (eksisterer ikke, eller findes i en anden klub), 422 (valideringsfejl).

---

## 5. Filstruktur for backend

Klassisk PHP front-controller — én entry-point, der dispatcher til endpoint-handlers:

```
public/
  index.html               # frontend (uændret)
  script.js                # frontend (let modificeret — se §6)
  styles.css               # frontend (uændret)
  favicon.svg, *.png       # ikoner
  api/
    index.php              # router — dispatcher til handlers/*
  manifest.webmanifest

src/
  Db.php                   # PDO-wrapper med prepared statements
  Auth.php                 # login/logout/me, password_hash, session-håndtering
  Acl.php                  # require_role('editor') osv.
  handlers/
    Players.php
    Teams.php
    Settings.php
    Rounds.php
    PlayerLists.php
    Users.php
    AuthHandler.php
  schema.sql               # tabel-DDL fra §2
  migrations/
    001_initial.sql
    002_add_team_mode_column.sql
    ...

scripts/
  install.sh               # opretter DB, kører migrations, opretter første klub
  migrate.php              # kører nye migrations idempotent
```

Apache config: simpel `.htaccess` der ruter `/api/*` til `public/api/index.php`. Hvis du foretrækker nginx, ét `location /api { try_files $uri /api/index.php; }`.

---

## 6. Hvad der ændres i frontend

Mindre end man skulle tro. Det meste handler om at *udskifte* persistenslaget:

1. **Ny login-side** — én ekstra standalone-panel `#loginPanel` med email/password-form + en "Opret klub"-knap.
2. **`saveState()` → `apiSaveAll()` eller granulære calls.** I dag dumper `saveState` hele UI-blobben hver gang noget ændrer sig. Med backend giver det mening at dele det op: ændre én spiller → `PATCH /api/players/:id`; ændre en regel → `PUT /api/settings`; generere en runde → `POST /api/rounds`.
3. **`restoreState()` → `apiBootstrap()`**: ved sidens load, hent `/api/me`, `/api/settings`, `/api/players`, `/api/teams`, `/api/rounds?limit=50`, `/api/player-lists` parallelt og populér state.
4. **Rolle-tjek i UI'et**: skjul/disable knapper baseret på `state.user.role`. Et lille helper:
   ```js
   function can(action) {
       const r = state.user?.role;
       if (action === 'manage_users') return r === 'owner';
       if (action === 'edit') return r === 'owner' || r === 'editor';
       return !!r; // viewer kan læse
   }
   ```
   Derefter `el.newPlayerBtn.disabled = !can('edit');` osv.
5. **Sync-indikator**: en lille "Gemmer..." / "Gemt"-prik øverst, så brugeren ved at deres ændring nåede serveren.
6. **Konfliktstrategi** (når to brugere redigerer samtidig): jeg vil starte med **last-write-wins** + et `updated_at` i hver respons. Hvis vi senere oplever konflikter, kan vi tilføje optimistic locking. Til en sport-app er konflikter sjældne nok til at ignorere indtil de bliver et reelt problem.
7. **Realtid** (helt valgfri): poll `/api/changes-since/:timestamp` hver 10-15 sekunder hvis to brugere er aktive samtidig. Server-Sent Events giver en pænere oplevelse, men polling rækker.

Det hele kan implementeres så `script.js` kører mod *enten* localStorage *eller* API'et baseret på om `state.user` er sat. På den måde kan en "gæste-mode" stadig virke offline for nye brugere der ikke har en konto endnu.

---

## 7. Migrering af eksisterende data

For de brugere der allerede har data i `localStorage`:

1. Når de logger ind første gang og deres klub-data er tom: spørg "Vi har fundet en gemt session lokalt på din enhed — vil du uploade den til klubben?".
2. Hvis ja → POST `/api/import` med hele `localStorage`-blobben → server kører `migrateV2ToV3`-logikken (eksisterer allerede i `script.js` — kan portes til PHP) og indsætter alt.
3. Bagefter sletter vi den lokale kopi (eller markerer den `archived: true`).

---

## 8. Sikkerhedsbasis (de 6 ting jeg vil sætte op uanset hvad)

- **Bcrypt/Argon2** på passwords (`password_hash` i PHP). Aldrig MD5/SHA1.
- **Prepared statements** overalt via PDO. Ingen string-interpolation i SQL.
- **HttpOnly + Secure + SameSite=Lax** cookies. Session-ID skal være kryptografisk tilfældig.
- **CSRF-tokens** på POST/PUT/PATCH/DELETE (PHP kan udstede én pr. session og kræve den i en `X-CSRF-Token`-header).
- **Rate-limit på login** (mod brute force) — fx 5 forsøg / 5 minutter pr. IP+email, ellers 429.
- **`WHERE club_id = ?` på *alle* queries** — den hyppigste multi-tenant-fejl er at en bruger kan se en anden klubs data ved at gætte en `id`. Skriv en testsuite der prøver præcis det.

---

## 9. Estimat

Realistisk tidsbudget (med PHP/MySQL-routen), målt i fokuseret arbejde:

| Del                                                   | Estimat                |
|-------------------------------------------------------|------------------------|
| DB-schema + migrations + seed-script                  | 0.5 dag                |
| Auth (register/login/logout/me) + sessions + CSRF     | 1 dag                  |
| 7 sæt CRUD-handlers (players, teams, settings, ...)  | 2 dage                 |
| ACL/roller + tests                                    | 0.5 dag                |
| Frontend: login-side + apiBootstrap + saveX-rewriting | 2 dage                 |
| Frontend: rolle-baseret UI-disable                    | 0.5 dag                |
| Migrering af localStorage → server                    | 0.5 dag                |
| Manuel test + bugfix                                  | 1 dag                  |
| **I alt**                                             | **~8 dages arbejde**   |

Du kunne også gøre det i mindre tempo og rulle features ud én ad gangen — fx start med kun spillere + settings, og lad rounds blive ved at gemme i `localStorage` i en uge eller to.

---

## 10. Alternativ: Node + SQLite (hvis du vil have det "moderne" stack)

Hvis du foretrækker at holde alt i JavaScript end-to-end:

- **Backend**: Node 20+, Express (eller Hono), `better-sqlite3`, `argon2`, `express-session`.
- **Database**: SQLite-fil på Ubuntu-serveren — er fint til et hold med <10k spillere og <100k runder.
- **Deploy**: systemd-service der kører `node server.js`, nginx som reverse-proxy til den.

Fordele: én sprogvane (JS), `better-sqlite3` er synkront og super hurtigt, deployment er én tar-ball.

Ulemper: du skal vedligeholde et process-supervisor og opdatere Node engang imellem.

Hvis du allerede er glad for at sætte PHP-hosting op, vil jeg **stadig anbefale PHP-vejen** — den er kortere fra "fil på server" til "virker", og hele backenden bliver under 1000 linjer kode.

---

## 11. Hvad jeg gerne vil have du beslutter inden vi går videre

1. **Stack**: PHP/MySQL (anbefalet) eller Node/SQLite på Ubuntu?
2. **Multi-klub fra dag ét, eller én klub først?** Det er trivielt at lave systemet til single-tenant og bagefter åbne det op. Men det vender ikke modsat ret elegant.
3. **Skal historikken (`rounds`) være privat pr. klub, eller global?** (Jeg anbefaler privat pr. klub — så får hver klub deres egen statistik.)
4. **E-mail-bekræftelse + glemt-password-flow** dag 1, eller udsæt det? (Kan klares med en simpel mailgun/postmark-integration.)
5. **Skal alle medlemmer kunne se hinandens niveauer**, eller skal "skjul niveauer" stadig være et UI-toggle pr. bruger? Mit forslag: gør det til et klub-niveau-flag (vis/skjul niveauer for alle medlemmer), så det stemmer overens med, at det er klubbens data.

Lad mig vide hvilken vej du vil gå, så går jeg i gang med schema-en og auth-flowet først.
