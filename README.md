# ReadyLaPlata

`index.html` is the public overview map. `overview.html` forwards existing links to it, preserving incident parameters. The welcome dialog retains the preparedness information; visitors can reopen it with Information.

- `home-config.js`: county zone/boundary service URLs, NWS county feed, refresh interval, and optional `roadClosuresUrl`. Leave the road URL empty until a public county road-closure feature layer is ready.
- `home.js` / `home.css`: responsive overview, incident list and map labels, welcome dialog, address search, and NWS bulletin list.
- `zone-status.js`: shared Set, Go, Shelter, and grey Planning/All clear styles. Public pages do not alter the ArcGIS layer or its domains.
- `evac.html`: existing detailed ArcGIS incident map. `evac-lite.html`: lightweight alternative. Both recognize the added statuses.

The NWS feed uses `COC067` (La Plata County), which includes associated zone-based alerts. Warnings appear first, followed by watches and advisories. Alert loading failures are displayed separately from a successful response containing no alerts. All displayed feed times use America/Denver.

Publish the source files together to the existing county web directory to update that site. GitHub commits alone do not update the county server. External Esri/Leaflet services and libraries remain linked.
