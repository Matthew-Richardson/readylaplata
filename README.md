# ReadyLaPlata

`index.html` is the public overview map. `overview.html` forwards existing links to it, preserving incident parameters. The welcome dialog retains the preparedness information; visitors can reopen it with Information.

- `home-config.js`: county zone/boundary service URLs, refresh interval, and the existing county Roads vector tiles plus EvacPOIs road-information and point layers.
- `home.js` / `home.css`: responsive overview, incident list and map labels, welcome dialog and address search.
- `zone-status.js`: shared Set, Go, blue Shelter, purple-hatched Access Impact Area, and grey Planning styles. Public pages do not alter the ArcGIS layer or its domains.
- `evac.html`: existing detailed ArcGIS incident map. `evac-lite.html`: lightweight alternative. Both recognize the added statuses.


Publish the source files together to the existing county web directory to update that site. GitHub commits alone do not update the county server. External Esri/Leaflet services and libraries remain linked.

The access-impact frontend status is `Access` (also recognizes `Access Impact Area`, `Road Closure Area`, and `Isolated`). It describes road access conditions, not a protective-action order. Use a distinct zone name/ID and publish access details through the incident information. Update the layer domain separately when ready; these changes do not alter AGOL data or schema.

The overview fits the full county boundary (including the north edge) with padding. Zone names are drawn below incident markers and labels. The information dialog uses a compact six-card grid; the preparedness checklist can be expanded when needed.
