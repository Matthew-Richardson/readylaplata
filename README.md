# ReadyLaPlata

The public entry point is `index.html`. This is a static site with no build step or application server. Publish the runtime files together; pushing GitHub does not publish the county server. See [DEPLOYMENT.md](DEPLOYMENT.md) for installation and server testing.

## Runtime files

| File | Purpose |
| --- | --- |
| `index.html` | Public map, address search, welcome guide and alert dialogs |
| `home-config.js` | Public ArcGIS URLs, county bounds, refresh interval |
| `home.js` | Incident summaries, address checks and overlay controls |
| `home-map.js` | ArcGIS Maps SDK 4.31 web map adapter |
| `home-details.js` | Incident information, active zones and Access descriptions |
| `zone-status.js` | Shared status names, colors and aliases |
| `home.css`, `home-overlay.css`, `shared-styles.css` | Page layout and shared dialog styles |
| `shared.js` | Shared dialogs, announcements and public utilities |
| `incident.json` | Incident support information and latest-update links |
| `announcement.json`, `drill-banner.json` | Optional county announcements and drill banner |
| `logo.png`, `favicon.ico` | County wordmark and official county tab icon |
| `evac-lite.html` | Separately retained lightweight Leaflet map |
| `evac.html`, `overview.html` | Legacy redirects preserving query parameters |
| `zone.html` | Staff zone editor; ArcGIS authentication and edit permissions required |

## Public map and data

Home consumes AGOL web map `58a8bb313db64271a55e7960cb839f64` and its authored basemap, zones, roads and POIs. Operational geometry is not duplicated. The page adds incident summary markers/name plates and a temporary searched-address marker. Map taps open incident information; incident cards offer separate Zoom To and Info buttons. Road and POI popups retain their native behavior.

Only zones with `LIVE = 1` appear in incident summaries, address checks and the public map. Existing web-map layer definitions remain combined with the LIVE filter. Inactive and null LIVE values are excluded. Road/POI visibility flags are not implemented. Queries fail visibly rather than falling back to all zones.

Status codes are Go, Set, Shelter, Access and Planning. Go is green, Set yellow, Shelter blue, Access purple hatch on the map, and Planning gray. Shelter displays as Shelter-In-Place; Access displays as Access Impact Area. Access aliases include Road Closure Area, Road Access Impact and Isolated. Planning is for testing.

County view starts from the county extent with symmetric mobile overlay padding, then zooms one step closer. The offset is configurable as countyZoomOffset in home-config.js. At scales closer than 1:75,000, incident name plates give way to native zone labels. Connectors are straight and paint behind every name plate. The threshold is `incidentLabelScale` in `home-config.js`.

## Address search and incident information

Searching checks all overlapping live Go, Set, Shelter and Access zones, shows a condensed status report, and automatically zooms to the address. Its only incident action is More info. Closing search clears the address result and marker without resetting the map. Info resets the overview and opens the zone guide. Map controls remain visible while search is open.

The incident window groups active zones by status. Access descriptions are listed separately by zone beneath the active zones. Access-only incidents replace evacuation support resources with Access descriptions; mixed incidents retain the resources. Missing Access-only descriptions display a pending message. Descriptions use plain text and preserve line breaks.

Public queries discover Description case-insensitively. The verified public field is `Description`, with length 4,000. The zone editor also needs that field exposed as editable in its own layer. The editor offers it for every status and explains public visibility; the incident window currently displays Access descriptions only.

The mobile keyboard layout retains the viewport-shift approach. Simulated tests cover resize, viewport pan, dismissal and rotation. Physical iPhone keyboard behavior remains a server-test item.

## Staff zone editor

`zone.html` edits authenticated web map `70dbdef4bf2e4cafbd1f8aa0b8383ddc`. It changes features only through authenticated ArcGIS edits. It does not create schema or update published service styles.

LIVE stores integer 1/0 through an Active/Inactive dropdown. New and carved zones default to inactive; edits, splits, erases and merges retain the record flag unless changed. Active zones require status, incident and zone name. Description is optional.

The map filter offers All, Active and Inactive (0 or null), defaulting to All. It filters the layer view without changing attributes or service-query scope. Overlap trimming starts off. Geometry tools include vertex editing, undo/redo, split, carve, erase and merging touching zones. Carved shapes may extend outside their parent.

The editor fills the viewport, with compact tools, a two-column form and pinned actions. Only the field region scrolls on constrained screens. The workflow guide starts collapsed.

## Performance cleanup

- The Regroup signup iframe is loaded only when LPC Alerts is opened, once per page load.
- Incident queries request only the fields the page uses; full geometry is retained for address checks and incident bounds.
- Concurrent refresh requests share work. Background tabs do not poll; brief tab switches do not immediately repeat fresh data requests. The normal two-minute foreground refresh remains.
- Resize notifications are coalesced to one animation frame. Identical map padding is not reapplied to the SDK.
- Incident label dimensions are read before positioning writes, and straight connector nodes are reused.
- The duplicate initial county fit, unused frontend variables and 40 obsolete control selectors were removed. The two home stylesheets are 3,415 bytes smaller combined.
- The tab icon uses the official square county favicon rather than shrinking the wide wordmark. Legacy shared exports remain for compatibility.

These are source-level and simulated improvements, not a measured browser performance score. ArcGIS rendering and mobile keyboard behavior require testing on a WebGL2-capable device. No new runtime dependencies were added.

## Validation

From the repository root:

```sh
python scripts/check_site.py
node tests/home-map.test.cjs
node tests/incident-details.test.cjs
node tests/search-overlay.test.cjs
node tests/mobile-search-viewport.test.cjs
node tests/zone-editor.test.cjs
node tests/performance.test.cjs
```

The Python check validates local asset references, unique HTML IDs, JSON parsing, standalone JavaScript and inline script syntax. It requires Node.js. Tests model the ArcGIS adapter; they do not replace live ArcGIS or authenticated save testing.

## Update published evacuation-zone styles

Download `scripts/update_evac_webmap_styles.py` to `C:\GIS\update_evac_webmap_styles.py`. In ArcGIS Pro, sign into the portal that owns the public web map, then run:

```python
exec(open(r"C:\GIS\update_evac_webmap_styles.py", encoding="utf-8-sig").read())
```

The script updates web-map renderer/label definitions for all five statuses, backs up original and proposed JSON under `Documents\ReadyLaPlata_Backups`, checks for concurrent changes, verifies the write and supports dry runs. It does not change features, schema, LIVE values, hosted-view definitions or source-service defaults.

Native browser gesture zoom is canceled within the map frame only, including WebKit gesture events and multi-touch moves. ArcGIS receives the events for map navigation. Deliberate browser zoom outside the map remains available. Actual rapid-gesture iPhone behavior needs device testing.

Incident name plates are transparent to pointer input so users can drag or pinch the map starting on a label. Completed ArcGIS map clicks are matched to visible label rectangles to retain tap-to-open information. Label buttons remain keyboard accessible. Hidden labels do not capture taps.

Tools & legend includes an Incident labels checkbox, initially off. Turning it off hides incident name plates and connectors but keeps incident points, zones, and native layer labels. Refresh and map navigation retain the toggle; Info resets it to off with the default overview controls.

Incident labels are off by default. Enabling the tool shows separate name plates for every incident in the county-scale view, with vertical separation and straight connectors where needed. Labels are not grouped or suppressed for priority. The Incidents menu and map points remain available while labels are off. Info restores the default labels-off state.

Incident points use a compact 18 px dark-blue diamond with a white outline, distinct from the blue circular address marker and yellow warning symbols. They remain visible at detailed zoom and are included in the map legend. Publish `incident-marker.svg` with the updated home files.

Incident points have a slow blue pulse halo rendered as pointer-transparent CSS rings. Symbol size stays 18 px; label visibility does not affect the halo. Reduced-motion preferences replace the animation with a faint static ring. The effect uses no JavaScript animation timer and is removed/rebuilt with incident refresh.
