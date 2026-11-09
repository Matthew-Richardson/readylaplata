# ReadyLaPlata

`index.html` is the public overview map. `overview.html` forwards existing links to it, preserving incident parameters. The welcome dialog retains the preparedness information; visitors can reopen it with Information.

- `home-config.js`: county zone/boundary service URLs, refresh interval, and the existing county Roads vector tiles plus EvacPOIs road-information and point layers.
- `home.js` / `home.css`: responsive overview, incident list and map labels, welcome dialog and address search.
- `zone-status.js`: shared Set, Go, blue Shelter, purple-hatched Access Impact Area, and grey Planning styles. Public pages do not alter the ArcGIS layer or its domains.
- `evac.html`: existing detailed ArcGIS incident map. `evac-lite.html`: lightweight alternative. Both recognize the added statuses.


Publish the source files together to the existing county web directory to update that site. GitHub commits alone do not update the county server. External Esri/Leaflet services and libraries remain linked.

The access-impact frontend status is `Access` (also recognizes `Access Impact Area`, `Road Closure Area`, and `Isolated`). It describes road access conditions, not a protective-action order. Use a distinct zone name/ID and publish access details through the incident information. Update the layer domain separately when ready; these changes do not alter AGOL data or schema.

The overview fits the full county boundary (including the north edge) with padding. Zone names are drawn below incident markers and labels. The information dialog uses a compact six-card grid; the preparedness checklist can be expanded when needed.

The full-width header contains branding, Address Search and primary actions. Search moves to its own row on mobile. Incident cards sit above the map. Arrow buttons scroll the incident cards, which show zone counts by status. The legend sits directly below the map, followed by grouped map controls and layer toggles. The footer is a single compact line. The viewport layout has no page scroll; map interaction stays enabled. Close expanded map or Escape returns to the overview.

The responsive viewport layout keeps the map and page controls within one screen. Panning, pinch and wheel zoom are enabled. On phones, legend and controls open in a bottom panel. Expanded map remains available.

Address search lists all containing zones and their statuses in the upper results panel, with incident links and Reset. It does not pan/zoom or open a map popup. The incident list minimizes while viewing results. Home restores default layers/county extent, clears search and incident selection, and opens the zone guide.
