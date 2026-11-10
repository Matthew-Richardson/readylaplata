# ReadyLaPlata

`index.html` is the public overview. `overview.html` forwards existing links to it, preserving query parameters. The Zone guide button resets search, selected incident, layers and county extent, then opens the status descriptions.

- `home.js`: incident data, address results, guide and controls.
- `home-map.js`: ArcGIS Maps SDK 4.31 adapter for the published AGOL WebMap, published layers and a temporary searched-address marker.
- `home.css`: responsive single-screen layout.
- `home-config.js`: public county data sources and refresh interval.
- `zone-status.js`: shared Set, Go, Shelter-In-Place, Access Impact Area and Planning styles.
- `home-details.js`: floating incident support window inside the map and safe external links.
- `evac.html`: legacy redirect to Home, preserving the incident name. `evac-lite.html`: lightweight map fallback.

The desktop incident list scrolls vertically beside the left edge of the map. On phones it becomes a 62 px strip of horizontally scrolling incident tabs with small status dots; tapping anywhere on the incident card zooms to its zones, while the separate ⓘ button opens support information without moving the map. Search is centered above the map. Address results use a full-width centered strip with a solid status color, a short address/action statement, matching zone codes, and large More info, Zoom to and Reset buttons. Go takes priority, followed by Shelter-In-Place, Set and Access. Only Go, Set, Access and Shelter zones appear in address results; overlapping zones are retained. Searching zooms to the matched address, adds a marker, and updates the existing status bar with every matching zone. More info, map popup details and incident list details open support resources in a scrollable floating window inside the map. Searching does not open a dialog or change the status bar layout; Reset restores the county view. Incident status badges show names without counts.

The overview loads AGOL web map `58a8bb313db64271a55e7960cb839f64`, including its published basemap and operational layers. Roads, road information and evacuation POIs use native web map layers, with the existing toggles wired to layer visibility. Points, zones, roads, symbology, labels and feature popups come exclusively from the AGOL map. The app does not inject operational layers or incident graphics and does not override map renderers or labeling. Only a temporary searched-address marker is added. Incident queries supply the list, zoom bounds and address status checks without drawing extra features. County view fits the full boundary, including its north edge. Panning and zooming are enabled; expanded map remains available. Mobile legend and controls open in a bottom panel. ArcGIS requires WebGL2; unsupported browsers can use the separately retained Leaflet lightweight map.

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
