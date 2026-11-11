# ReadyLaPlata

`index.html` is the public overview. `overview.html` forwards existing links to it, preserving query parameters. The Zone guide button resets search, selected incident, layers and county extent, then opens the status descriptions.

- `home.js`: incident data, address results, guide and controls.
- `home-map.js`: ArcGIS Maps SDK 4.31 adapter for the published AGOL WebMap, published layers and a temporary searched-address marker.
- `home.css`: responsive single-screen layout.
- `home-config.js`: public county data sources and refresh interval.
- `zone-status.js`: shared Set, Go, Shelter-In-Place, Access Impact Area and Planning styles.
- `home-details.js`: floating incident support window inside the map and safe external links.
- `evac.html`: legacy redirect to Home, preserving the incident name. `evac-lite.html`: lightweight map fallback.

The overview is a full-screen map with a floating centered header and a bottom-center address-search dock. Info appears in the floating header. Incidents and Tools & legend form the right-side rail; matching Zoom in and Zoom out buttons sit at the upper left. Fullscreen buttons are removed because the map already fills the viewport. Info resets the view and opens the welcome guide with all zone descriptions and the legend. Incidents opens a scrollable floating list with status symbols and Info buttons. Tools & legend opens a closable panel from the right-side rail. Only one of the tools or incident menus opens at a time; Escape closes them. Address reports and incident support resources remain independent overlays. Search starts as a compact single input, expands while typing, and closes with an X that clears address data without changing the map view. Incident cards offer separate Zoom To and Info buttons. Mobile uses the same floating controls with responsive spacing and a 16 px search input.

The overview loads AGOL web map `58a8bb313db64271a55e7960cb839f64`, including its published basemap and operational layers. Roads, road information and evacuation POIs use native web map layers, with the existing toggles wired to layer visibility. Points, zones, roads, symbology, labels and feature popups come exclusively from the AGOL map. The app does not duplicate operational layers or replace published map renderers or label definitions. County-scale zone labels are temporarily hidden beneath incident name plates and restored at zone-detail scale. It adds one incident-summary GraphicsLayer with named markers and small dots for present zone statuses, and a separate temporary searched-address marker. Tapping a summary marker opens incident resources; markers are rebuilt from LIVE = 1 zones on refresh. Incident queries supply the list, zoom bounds and address status checks without drawing extra features. County view fits the complete county boundary to the available screen area using fractional zoom, without adding a zoom step. Panning and zooming are enabled; expanded map remains available. Mobile legend and controls open in a bottom panel. ArcGIS requires WebGL2; unsupported browsers can use the separately retained Leaflet lightweight map.

Access is also recognized as Access Impact Area, Road Closure Area, Road Access Impact and Isolated. It describes road access conditions rather than a protective-action order. Planning is for testing. These frontend changes do not alter AGOL data, layer domains or schema; evacuation-zone visibility is now restricted to LIVE = 1. Road and POI visibility flags remain future work.

Publish the source files together to the existing county web directory to update that site. GitHub commits alone do not update the county server. External ArcGIS services and SDK remain linked; Leaflet is used only by the lightweight fallback.

Incident support resources use a floating window within the map: up to 620 px wide on desktop, nearly full map width on mobile, subtle surface transparency, compact cards and internal scrolling. Closing it leaves the address status report unchanged.

The resource window places the incident title and Latest update action in one header row.

Each page load fits the full county. Selecting an incident does not persist a zoom target in the URL. Legacy shared incident links open resources over the county view once. Mobile cells explicitly reset the older card grid layout to prevent empty rows and uneven spacing.

Mobile slider arrows stay available for touch and brighten on hover; the count has its own separated label column. Mobile address results use smaller typography, chips and actions. The Latest update action moves below the title on mobile to keep the close button clear.

The whole desktop incident card zooms to zones, including its status badges and padding; Details opens resources separately. The address report retains its existing More info and Zoom to actions.

Evacuation zones require the Short Integer LIVE field in the public view. Home map definitions, incident queries, address checks and the lightweight map use LIVE = 1, excluding 0 and null. Existing web map definition filters are preserved with AND. In-flight deactivations are rechecked in batch queries; no filter falls back to all features. Include LIVE in the hosted view before deploying this version. This site change does not alter the AGOL hosted view definition itself.

## Update all evacuation-zone map styles

Download `scripts/update_evac_webmap_styles.py` to `C:\GIS\update_evac_webmap_styles.py`. In ArcGIS Pro, sign into the portal that owns web map `58a8bb313db64271a55e7960cb839f64` with permission to edit that map. Open the Python window and run:

```python
exec(open(r"C:\GIS\update_evac_webmap_styles.py", encoding="utf-8-sig").read())
```

The script updates the web map's evacuation-zone renderer and labels for all five statuses: green **Go**, yellow **Set**, blue **Shelter-In-Place**, purple diagonal hatching for **Access Impact Area**, and gray **Planning**. Labels show the zone name and public status on separate lines. Planning is for testing, with no all-clear wording. Existing generic labels and symbols remain only for unrecognized statuses. The script also upgrades maps styled with the earlier Shelter/Access script. This updates the AGOL web map consumed by Home; it does not change the source service's default style or ArcGIS Pro project layers.

It saves original and proposed web map JSON under `Documents\ReadyLaPlata_Backups` before writing and verifies the saved layer settings. Reload the website afterward. Feature data, LIVE filters, popups, other layers and hosted-view settings are preserved. Rerunning is safe; a concurrent edit aborts the write. Set `DRY_RUN = True` near the top to save a preview without updating the map, or `LABEL_INCLUDE_STATUS = False` for zone-name-only labels. Advanced renderers with unrelated expressions, multiple fields, grouped values or visual variables stop for manual review. Keep the original JSON backup to restore the web map's prior item data if needed.

Layer load warnings identify the failing AGOL layer by name and log its URL and error in the browser console. Warnings clear when that layer recovers, remain separate from address-search feedback, and ignore cancelled requests. Refresh retries failed published layers as well as refreshing zones, road information and POIs.

Incident resource windows list every LIVE = 1 zone associated with the selected incident, showing readable zone names and status text beside colored symbols. The list refreshes with incident data, marks last-known data when refresh fails, and remains available if support resources fail to load. Tapping a live zone polygon opens the same incident support window. Native road/POI popups are unchanged.

Zone-layer matching supports ArcGIS SDK service URLs with separate numeric layerId values, including layer 0. This also fixes road/POI toggle matching. Zone taps use rendered hits with a spatial-query fallback. Run `node tests/home-map.test.cjs` to check normalized layer URLs, live-zone selection, missing attributes, query errors and rapid selection changes.

## Staff zone editor

`zone.html` edits the authenticated source web map. Status choices store Go, Set, Shelter, Access and Planning; Shelter displays as Shelter-In-Place and Access as Access Impact Area. The editor map uses the matching green/yellow/blue/purple hatch/gray styles without changing the source service's stored renderer.

Public map visibility (LIVE) is an Active/Inactive dropdown storing integer 1/0. New and carved zones default to inactive; edits, splits, erases and merges retain the record's existing LIVE value unless changed in the form. Active zones require status, incident and zone name. Inactive zones remain available for editing. The source layer must expose an editable Short Integer field named LIVE (case-insensitive); the editor explains when it is unavailable and does not create fields automatically. Run `node tests/zone-editor.test.cjs` for status and LIVE control checks.

## Full-screen overlays

`home-overlay.css` contains the full-screen layout and floating panels. Map padding accounts for header/search overlays when fitting the full county. The incident marker API and layer matching are covered by `node tests/home-map.test.cjs`. Desktop and 390 px phone overlay controls were checked in the browser; the preview browser lacks WebGL2, so live ArcGIS map rendering could not be visually verified there. Publish `index.html`, `home-overlay.css`, `home.js` and `home-map.js` together with the existing assets.

Incident name plates use translucent backgrounds with centered names and 11 px status dots underneath. They are anchored inside the largest zone for each incident, with connectors when neighboring labels need separation. At scales closer than 1:75,000 they give way to native zone labels; this threshold is configurable as incidentLabelScale in home-config.js. The header and search surfaces use 78% white with backdrop blur. Native attribution is anchored below search at the screen's bottom edge; native zoom shares the right-side rail. The warning symbol is drawn inside its own box to avoid rotation clipping. `node tests/search-overlay.test.cjs` checks expansion and close behavior; `node tests/home-map.test.cjs` also checks widget placement and the county zoom offset.

The entire right-hand rail now uses the same button components for Info, Incidents, Tools & legend, Fullscreen, Zoom in and Zoom out. The SDK zoom widget is removed so it cannot drift out of alignment. The incident count badge is red. Zone geometry remains visible at close scales. Tests cover county fitting without extra zoom, interior label points, connectors, scale switching, and custom zoom controls.

The incident status/support window includes a Zoom To action beside Latest update. It navigates to the incident zones and closes the resources window, including when opened from a county-scale name plate. Run `node tests/incident-details.test.cjs` for popup action checks.

Mobile county fitting uses symmetric viewport padding and narrower side margins so the full county is larger and centered on the page. Desktop padding remains unchanged. Connectors are single straight segments from the incident anchor to the plate edge, painted behind every name plate. They do not bend around neighboring plates.

Mobile address focus now holds the map's layout height while the keyboard is open. Only the search dock tracks the visual viewport's bottom edge, including viewport pan offsets. The lock remains through the keyboard dismissal animation and resets on rotation. `node tests/mobile-search-viewport.test.cjs` covers these simulated viewport changes; real-device keyboard behavior still needs confirmation. The LPC Alerts popup shell matches the map panel styling, while its embedded signup form remains provided by Regroup. Guide headings read Set — Pre-Evacuation and Go — Evacuation Order.

Safari keyboard follow-up: compensate the entire fixed map shell for visualViewport.offsetTop, then lift the search relative to that compensated shell. This keeps the header and map from disappearing above the visible viewport when Safari pans to the input. Simulated viewport tests cover the geometry; physical iPhone verification remains necessary.

Restored the viewport-shift search layout. Removed the temporary input-focus visibility workaround and the mode that hid map controls during address lookup. Map controls stay available alongside the search report.
