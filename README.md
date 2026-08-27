# Kampprogram — installation

## Hurtig start

1. **Læg hele mappens indhold på din webserver** (fx `/var/www/kampprogram` på Ubuntu, eller `public_html/` på shared hosting). Vigtigt: filerne `index.html`, `script.js`, `styles.css`, `favicon.*` osv. skal ligge i den mappe webserveren peger på.

2. **Opret en MySQL-database** og importer `schema.sql`:
   ```bash
   mysql -u root -p -e 'CREATE DATABASE kampprogram CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
   mysql -u root -p -e 'CREATE USER "kampprogram"@"localhost" IDENTIFIED BY "vælg-et-stærkt-password";'
   mysql -u root -p -e 'GRANT ALL ON kampprogram.* TO "kampprogram"@"localhost"; FLUSH PRIVILEGES;'
   mysql -u kampprogram -p kampprogram < schema.sql
   ```

3. **Redigér `api/config.php`** og udfyld dine MySQL-credentials. Sæt også `session.secure` til `true` hvis du kører via HTTPS:
   ```php
   'db' => [
       'host'     => '127.0.0.1',
       'database' => 'kampprogram',
       'username' => 'kampprogram',
       'password' => 'det-password-du-valgte-i-trin-2',
       ...
   ],
   'session' => [
       'secure' => true,   // <- skift til true hvis du kører HTTPS
       ...
   ],
   ```

4. **Sørg for at Apache har mod_rewrite aktiv** (eller den tilsvarende rewrite-funktion i din webserver). På Ubuntu:
   ```bash
   sudo a2enmod rewrite
   sudo systemctl reload apache2
   ```
   `.htaccess`-filerne i mappen klarer resten. (Bruger du nginx, se "Nginx" nedenfor.)

5. **Test API'et** ved at åbne `https://din-server/api/me` i en browser. Du bør se `{"user":null}`.

6. **Log ind første gang** ved at åbne appen og klikke på menuen → "Log ind". Brug:
   - E-mail: `admin@kampprogram.local`
   - Adgangskode: `changeme`

7. **Skift adgangskode straks** under menuen "Brugere" → klik på dig selv → opdater adgangskoden.

Du er nu kørende. Du kan oprette andre brugere (editor/viewer/owner) i menuen "Brugere".

## Deployment på Simply.com (test.kampprogram.dk)

Sådan kører du det nye site på et subdomæne, mens dit eksisterende site på
GitHub Pages fortsætter uforstyrret på hoveddomænet:

### 1. Opret subdomænet

I Simply.com's kontrolpanel → dit domæne → **Subdomæner**: opret `test`.
Simply opretter automatisk DNS og en mappe til subdomænet (typisk
`/test.kampprogram.dk` eller lignende — navnet vises i kontrolpanelet).

Dine eksisterende DNS-records for hoveddomænet (A/CNAME mod GitHub Pages)
skal du **ikke** røre — subdomænet får sin egen record der peger på
Simply's webserver.

### 2. Aktivér HTTPS på subdomænet

Simply udsteder automatisk Let's Encrypt-certifikater. Tjek under
**SSL** at `test.kampprogram.dk` er dækket (det sker normalt automatisk
kort efter subdomænet er oprettet).

### 3. Opret MySQL-databasen

Kontrolpanel → **MySQL**: opret en database. Simply giver dig:
- Host (fx `mysql57.unoeuro.com` — står i kontrolpanelet)
- Databasenavn (typisk `dit_login_db`)
- Brugernavn (typisk samme som login)
- Adgangskode

Importér `schema.sql` via **phpMyAdmin** (link i kontrolpanelet):
vælg databasen → fanen **Importér** → vælg `schema.sql` → Udfør.

### 4. Upload filerne via FTP

Upload **hele mappens indhold** til subdomænets mappe (fx med FileZilla):

```
test.kampprogram.dk/
├── index.html, script.js, styles.css, favicon.*, site.webmanifest
└── api/  (hele mappen inkl. lib/ og handlers/)
```

`schema.sql`, `README.md` og `BACKEND_PROPOSAL.md` behøver ikke komme med.

### 5. Konfigurér api/config.php

Redigér før/efter upload med Simply's MySQL-oplysninger:

```php
'db' => [
    'host'     => 'mysqlXX.unoeuro.com',   // fra Simply's kontrolpanel
    'port'     => 3306,
    'database' => 'dit_login_db',
    'username' => 'dit_login',
    'password' => 'din-mysql-adgangskode',
    'charset'  => 'utf8mb4',
],
'session' => [
    ...
    'secure' => true,    // subdomænet kører HTTPS
],
```

### 6. Test

1. Åbn `https://test.kampprogram.dk/api/me` → skal vise `{"user":null}`
2. Åbn `https://test.kampprogram.dk` → appen skal loade
3. Menu → **👤 Log ind** → `admin@kampprogram.local` / `changeme`
4. **Skift adgangskoden med det samme** (menu → 👤 → Skift adgangskode)
5. Menu → **🛠 Admin** → her ser du klubber, alle brugere, usage-statistik
   og aktivitetslog

Bemærk: Simply kører Apache med `.htaccess`-support aktiveret som standard,
så API-routingen virker uden yderligere opsætning.

### Når testen er godkendt

Vil du senere flytte hoveddomænet fra GitHub Pages til Simply, ændrer du
blot DNS-records for `kampprogram.dk`/`www` til at pege på Simply's
webserver og uploader samme filer til hoveddomænets mappe (og genbruger
databasen — eller opretter en frisk produktion-database).

---

## Filstruktur

```
kampprogram/                    <-- denne mappe deployes som webroot
├── index.html                  frontend (statisk)
├── script.js                   "
├── styles.css                  "
├── favicon.*, manifest osv.    "
├── BACKEND_PROPOSAL.md         arkitekturoplæg (kan slettes på serveren)
├── README.md                   denne fil (kan slettes på serveren)
├── schema.sql                  MySQL-skema + default owner
└── api/
    ├── .htaccess               rewrite-regler + adgangsbeskyttelse
    ├── index.php               router
    ├── config.php              MySQL credentials (rediger her!)
    ├── lib/                    PDO + auth + ACL + JSON + aktivitetslog
    └── handlers/               auth / player_lists / users / admin
```

## Sådan fungerer det

- Uden login virker appen som før — alt gemmes i din browsers `localStorage`.
- Når du logger ind, kan du i panelet "Spillerlister" gemme og hente klub-delte spillerlister fra serveren.
- En bruger kan være **medlem af flere klubber** med hver sin rolle. Er du
  medlem af 2+ klubber, vises en klubskifter under 👤-panelet; alle
  klub-funktioner (lister, medlemmer) arbejder på den aktive klub.
- Owner-rollen ser menupunktet "Brugere" med klubbens medlemmer og
  invitationer.

### Invitationer

Nye medlemmer inviteres pr. e-mail (menu → 👥 Brugere → Invitér medlem):

1. Owner skriver e-mail + vælger rolle → systemet sender en mail med et link
   (linket vises også i UI'et, så det kan deles manuelt via fx SMS)
2. Modtageren åbner linket:
   - Har de allerede en konto → logger ind → medlemskab tilføjes automatisk
   - Har de ingen konto → opretter navn + adgangskode → konto + medlemskab
   - Er de allerede logget ind med den inviterede e-mail → én accept-knap
3. Invitationer udløber efter 14 dage og kan tilbagekaldes af owner

Mailen sendes med PHP's `mail()`. Afsenderadresse og link-basen sættes i
`api/config.php` under `mail` (`from`, `fromName`, `baseUrl`).

### Roller (pr. klub)

| Rolle    | Læs klub-lister | Gem/redigér klub-lister | Medlemmer & invitationer |
|----------|:---------------:|:-----------------------:|:------------------------:|
| `viewer` | ✓               |                         |                          |
| `editor` | ✓               | ✓                       |                          |
| `owner`  | ✓               | ✓                       | ✓                        |

Roller er pr. medlemskab — samme bruger kan være owner i én klub og viewer i
en anden. Owner kan ændre roller og fjerne medlemmer fra klubben (kontoen
slettes ikke — kun adgangen til klubben).

### Site-admin (🛠 Admin)

Ud over klub-rollerne findes et `is_admin`-flag på brugere. En site-admin
ser menupunktet **🛠 Admin** med:

- Nøgletal: antal klubber/brugere/lister, aktive brugere seneste 30 dage,
  antal handlinger seneste 7/30 dage
- Alle klubber med antal brugere/lister og seneste aktivitet — plus
  opret/slet klub
- Alle brugere på tværs af klubber med login-antal og seneste login —
  plus opret bruger (i valgfri klub), skift rolle/adgangskode, slet
- Aktivitetslog: hvem gjorde hvad hvornår (login, liste gemt/slettet,
  bruger oprettet osv.)

Default-brugeren fra `schema.sql` er site-admin. Du kan give flaget til
andre direkte i databasen: `UPDATE users SET is_admin = 1 WHERE id = ...;`

## Tilføj endnu en klub

Klubber oprettes i admin-panelet: menu → **🛠 Admin** → "Opret ny klub".
Tilføj derefter dig selv (eller andre) via "Tilføj medlemskab" — eller
invitér medlemmer pr. e-mail fra 👥 Brugere-panelet, når klubben er valgt
som aktiv klub.

## Klubside

Klik på menu → **🏸 [klubnavn]** (eller en klub i admin-oversigten) for at
åbne klubbens side. Her findes:

- **Standard antal baner** (kun owner/admin): forvalget for alle medlemmer
  når de genererer kampe
- **Igangværende sessioner**: gem aftenens session, så et andet medlem kan
  klikke "↓ Overtag" og fortsætte med at generere runder. Gemmes igen under
  samme navn overskrives den (praktisk efter hver runde)
- **Farezone** (kun owner/admin): slet klubben — kræver at man skriver
  klubbens navn som bekræftelse

## Niveauer

Spillere har 5 navngivne niveauer: **Nybegynder, Let øvet, Øvet, Rutineret,
Elite**. Tal vises aldrig i appen — de bruges kun internt af
match-algoritmen (som stadig kører i browseren). Tekst-import bruger
formatet `navn,niveau` med tal 1-5 (1=Nybegynder, 5=Elite); værdier over
5 sættes blot til 5.

## Hold

En klub har én fælles **spillerbase** og kan have flere **hold** — navngivne
delmængder af spillerbasen. En spiller kan være på flere hold.

- **Hent hold**: Spillerlister-panelet → "☁ Klubbens hold" → vælg hold →
  Hent. Så er aftenens liste kun holdets spillere, ikke hele klubben.
- **Gem hold**: "Gem nuværende spillere som hold" — spillerne oprettes/
  opdateres automatisk i klubbens spillerbase.
- **Fremmødt gæst fra et andet hold?** Brug "＋ Fra klubben…"-vælgeren
  øverst i Spillere-panelet — den viser klubbens spillere, som ikke
  allerede er på aftenens liste.
- **Administrér hold**: klubsiden (🏸) → Hold → ⚙ på et hold: se medlemmer,
  fjern (✕) eller tilføj fra spillerbasen. Opret også tomme hold her.

Roller: alle klubmedlemmer kan hente hold og bruge quick-tilføj;
**editor+** kan oprette/gemme/slette hold og ændre holdmedlemmer.

## Opgradering fra tidligere version

Kør i rækkefølge (via phpMyAdmin → Importér), afhængigt af hvor du er:

1. `upgrade_multiclub.sql` — fra v2 (én klub pr. bruger) til multi-klub
2. `upgrade_clubpages.sql` — tilføjer klub-baner + delte sessioner
3. `upgrade_squads.sql` — tilføjer hold + klub-spillerbase

Ny frisk installation bruger blot `schema.sql` (indeholder alt).

## Nginx

Hvis du bruger nginx i stedet for Apache, brug denne konfiguration:

```nginx
server {
    listen 443 ssl http2;
    server_name kampprogram.dk;
    root /var/www/kampprogram;
    index index.html;

    # API routing → api/index.php
    location /api/ {
        try_files $uri /api/index.php?$query_string;
    }

    # Beskyt sensitive PHP-filer mod direkte adgang
    location ~ ^/api/(lib|handlers)/ { deny all; }
    location ~ ^/api/config\.php$    { deny all; }
    location ~ \.(sql|md)$           { deny all; }

    # PHP-FPM
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
    }

    # Static files
    location / {
        try_files $uri /index.html;
    }
}
```

## Fejlsøgning

- **"Database-fejl: kunne ikke forbinde"** → tjek credentials i `api/config.php`. Du kan også sætte `'debug' => true` i config for at se den fulde MySQL-fejl.
- **`/api/me` returnerer 404** → mod_rewrite er ikke aktiv, eller `AllowOverride` er sat til `None` i Apache. Ret det med `AllowOverride All` i din vhost-config og genstart Apache.
- **"You can not initialize the session — headers already sent"** → tjek at der ikke er BOM-tegn eller blank linje før `<?php` i nogen PHP-fil.
- **Login virker, men `/api/me` siger `null` lige efter** → tjek at `session.secure` i `api/config.php` matcher din protokol. På HTTP skal det være `false`; på HTTPS skal det være `true`.

## Sikkerhed

Default-adgangskoden i `schema.sql` er **kun til første login**. Skift den straks via UI'et (menuen "Brugere"). Når du har gjort det, slet evt. linjen i `schema.sql` der refererer til den (så ingen kan se den hvis filen ved et uheld ender på serveren).

Filer der ikke skal med på serveren:
- `BACKEND_PROPOSAL.md` (kun til reference, intet skadeligt)
- `README.md` (samme — fjern hvis du vil)
- `schema.sql` (kan slettes efter import; ligger den i web-rooten, dækker `.htaccess` den)

## Backup

Sikkerhedskopier MySQL-databasen jævnligt:

```bash
mysqldump -u root -p kampprogram > kampprogram_backup_$(date +%F).sql
```
