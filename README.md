# ReadyLaPlata

`index.html` is the public overview. `overview.html` forwards existing links to it, preserving query parameters. The Zone guide button resets search, selected incident, layers and county extent, then opens the status descriptions.

- `home.js`: incident data, address results, guide and controls.
- `home-map.js`: ArcGIS Maps SDK 4.31 adapter for the published AGOL WebMap, native layers, labels and incident graphics.
- `home.css`: responsive single-screen layout.
- `home-config.js`: public county data sources and refresh interval.
- `zone-status.js`: shared Set, Go, Shelter-In-Place, Access Impact Area and Planning styles.
- `home-details.js`: floating incident support window inside the map and safe external links.
- `evac.html`: legacy redirect to Home, preserving the incident name. `evac-lite.html`: lightweight map fallback.

The desktop incident list scrolls vertically beside the left edge of the map. On phones it becomes a 62 px strip of horizontally scrolling incident tabs with small status dots; tapping the incident name zooms to its zones, while the separate ⓘ button opens support information without moving the map. Search is centered above the map. Address results use a full-width centered strip with a solid status color, a short address/action statement, matching zone codes, and large More info, Zoom to and Reset buttons. Go takes priority, followed by Shelter-In-Place, Set and Access. Only Go, Set, Access and Shelter zones appear in address results; overlapping zones are retained. Searching zooms to the matched address, adds a marker, and updates the existing status bar with every matching zone. More info, map popup details and incident list details open support resources in a scrollable floating window inside the map. Searching does not open a dialog or change the status bar layout; Reset restores the county view. Incident status badges show names without counts.

The overview loads AGOL web map `58a8bb313db64271a55e7960cb839f64`, including its published basemap and operational layers. Roads, road information and evacuation POIs use native web map layers, with the existing toggles wired to layer visibility. Evacuation zones retain the shared public status renderer and zone labels. Incident markers/labels and searched addresses draw above the operational layers. County view fits the full boundary, including its north edge. Panning and zooming are enabled; expanded map remains available. Mobile legend and controls open in a bottom panel. ArcGIS requires WebGL2; unsupported browsers can use the separately retained Leaflet lightweight map.

Access is also recognized as Access Impact Area, Road Closure Area, Road Access Impact and Isolated. It describes road access conditions rather than a protective-action order. Planning is for testing. These frontend changes do not alter AGOL data, layer domains or schema; active/inactive filtering remains future work.

Publish the source files together to the existing county web directory to update that site. GitHub commits alone do not update the county server. External ArcGIS services and SDK remain linked; Leaflet is used only by the lightweight fallback.

Incident support resources use a floating window within the map: up to 620 px wide on desktop, nearly full map width on mobile, subtle surface transparency, compact cards and internal scrolling. Closing it leaves the address status report unchanged.

The resource window places the incident title and Latest update action in one header row.

Each page load fits the full county. Selecting an incident does not persist a zoom target in the URL. Legacy shared incident links open resources over the county view once. Mobile cells explicitly reset the older card grid layout to prevent empty rows and uneven spacing.

Mobile slider arrows stay available for touch and brighten on hover; the count has its own separated label column. Mobile address results use smaller typography, chips and actions. The Latest update action moves below the title on mobile to keep the close button clear.

Desktop incident names zoom to zones; Details opens resources separately. The address report retains its existing More info and Zoom to actions.
