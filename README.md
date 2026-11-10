# ReadyLaPlata

`index.html` is the public overview. `overview.html` forwards existing links to it, preserving query parameters. Home resets search, selected incident, layers and county extent, then opens the zone guide.

- `home.js`: incident data, address results, guide and controls.
- `home-map.js`: Leaflet overview map, operational layers, labels and markers.
- `home.css`: responsive single-screen layout.
- `home-config.js`: public county data sources and refresh interval.
- `zone-status.js`: shared Set, Go, Shelter-In-Place, Access Impact Area and Planning styles.
- `evac.html`: detailed ArcGIS incident map. `evac-lite.html`: lightweight alternative.

The desktop incident list scrolls vertically beside the left edge of the map. On phones it becomes a compact horizontal list above the map. Search is centered above the map. Address results use a full-width compact strip with color-coded zones and More info, Zoom to and Reset buttons. Only Go, Set, Access and Shelter zones appear in address results; overlapping zones are retained. Searching does not move the map until Zoom to is selected. Incident status badges show names without counts.

The overview uses Leaflet with Esri World Terrain Base without a label overlay, county Roads vector tiles, road information and EvacPOIs. Terrain native tiles extend through zoom 13 and are enlarged at closer zooms. County view fits the full boundary, including its north edge. Zone labels draw below incident markers and labels. Panning and zooming are enabled; expanded map remains available. Mobile legend and controls open in a bottom panel.

Access is also recognized as Access Impact Area, Road Closure Area, Road Access Impact and Isolated. It describes road access conditions rather than a protective-action order. Planning is for testing. These frontend changes do not alter AGOL data, layer domains or schema; active/inactive filtering remains future work.

Publish the source files together to the existing county web directory to update that site. GitHub commits alone do not update the county server. External Esri/Leaflet services and libraries remain linked.
