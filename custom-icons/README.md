# Kampprogram · custom-ikoner

40 originaltegnede SVG-ikoner til alle funktioner i briefet. Ingen ikonpakke er importeret. Standardhandlinger bruger velkendte symboler; klub, niveau og hold har egne motiver. Klubben vises som et klubhus, så den passer til flere sportsgrene.

## Design
24 × 24 viewBox, 1,8 enheders streg, afrundede ender og samlinger. Farven styres med `currentColor`. Brug normalt 20 eller 24 px; 16 px er til kompakte visninger. Hold klikfladen større end selve ikonet, gerne 44 × 44 px. Valgmarkøren og menuprikker er udfyldte.

## Filer
- `svg/`: 40 individuelle, redigerbare SVG-filer.
- `kampprogram-sprite.svg`: én sprite med `kp-`-præfiks.
- `preview.html`: selvstændig oversigt med lys/mørk visning og 16/20/24/32 px.
- `ikonoversigt.svg` og `ikonoversigt.png`: samlet designoversigt.
- `manifest.json`: komplet mapping fra id til dansk funktion.

## Brug spriten
Host spriten på samme origin som appen. Eksempel:

```html
<button type="button" aria-label="Lav næste kamprunde">
  <svg width="24" height="24" aria-hidden="true" focusable="false">
    <use href="/assets/kampprogram-sprite.svg#kp-next-round"></use>
  </svg>
</button>
```

Spriten er uden hardcodet farve: `button { color: #171717; }` giver mørke ikoner, `color: white` giver lyse. Eksterne SVG-sprites skal serveres via HTTP(S); ved direkte åbning af lokale filer kan browseren blokere dem. `preview.html` bruger indlejrede SVG'er og kan åbnes lokalt.

## Betydning
`retry` er en tilbagegående cirkelpil. `make-teams` viser to spillere med forbindelse mellem sig. `level` kombinerer en trinskala og en niveaumarkør. `next-round` viser afspilning med en slutstreg som tegn på næste runde. `chevron-right` genbruges til sammenfoldede paneler og åbning af rækker; `chevron-down` bruges til åbne paneler. Knappernes aria-label beskriver handlingen, fx "Fold ud", når panelet er lukket. `close` dækker luk/fjern; brug gerne `trash` ved permanent sletning, hvis I senere skelner handlingerne.

## Offline og tilgængelighed
Tilføj sprite-URL'en til appens eksisterende service worker-cache og opdatér cacheversionen ved ikonændringer. Self-hosting alene gør ikke ikonerne tilgængelige offline. Service worker-integration er ikke udført i denne leverance, da appens kode ikke er vedlagt.

Dekorative ikoner skal have `aria-hidden="true"`. Ikonknapper skal have et dansk tilgængeligt navn. Brug rigtig radio-semantik til sortering og `aria-expanded` på panelknapper; ikonet erstatter ikke kontrollens tilstand.

## Leverancens status
SVG-struktur og antal er kontrolleret; designoversigten er renderet og visuelt gennemset. Test i appens faktiske browser- og enhedsmål før release. Geometrien kan frit tilpasses i projektet.
