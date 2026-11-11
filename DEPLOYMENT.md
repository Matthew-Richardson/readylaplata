# County server testing

## Publish

Copy these files together into the test web directory, retaining their names:

- `index.html`, `evac.html`, `overview.html`, `evac-lite.html`, `zone.html`
- `home.js`, `home-map.js`, `home-details.js`, `home-config.js`, `zone-status.js`, `shared.js`
- `home.css`, `home-overlay.css`, `shared-styles.css`, `logo.png`, `favicon.ico`, `incident-marker.svg`
- `incident.json`, `announcement.json`, `drill-banner.json`

No npm installation or build is needed. Tests, scripts and documentation are not runtime files. Keep the existing county `staff/` and alert tools; this repository does not replace those separate server applications. Workflow links in the zone editor point to the existing county tools.

Keep the server's current JSON if staff have updated it since the GitHub copy was synchronized. Back up the deployed files before replacement. For rollback, restore that complete backup together.

Serve HTML, CSS, JavaScript, PNG, ICO and JSON with their normal content types over HTTPS. Public maps require access to the configured ArcGIS services and SDK; the signup panel requires Regroup. A restrictive server content policy must allow those existing dependencies and the current inline scripts/styles.

Keep HTML and live JSON revalidated (`Cache-Control: no-cache` or an equivalent server policy); do not give incident/announcement data an immutable cache policy. CSS/JS URLs include version query strings, so static assets can use a reasonable cache lifetime when the server cache includes the query string in its key. Compression for text assets can reduce transfer size; enable gzip/Brotli if supported by your server. These server settings are recommendations and have not been applied by this repository.

During the cleanup review, the county root was available but `/readylpc/home.js` returned 404. Publish all runtime dependencies together before testing this version.

## Test on the server

1. Open Home in a private window. Confirm the complete county, incident name plates, legend, controls, footer and Esri attribution. Check the browser network/console for failed local files or service requests.
2. Search an address inside a zone, inside overlapping statuses, and outside live zones. Confirm automatic zoom, zone/status text, More info and Close. Repeat with a second address.
3. Test iPhone Safari and Android portrait/landscape, including the keyboard opening and closing. Confirm header/search placement and no footer clipping. Test desktop zoom and narrow windows.
4. Open incidents from a name plate, a polygon and the incident menu. Verify Info, Zoom To and Latest update. Verify grouped zones, multiple Access descriptions, Access-only resources replacement and mixed-status resources.
5. Open LPC Alerts. Confirm the signup iframe loads on first open, stays available on reopening, and the Caller ID contact download works. Verify welcome preferences and announcement dismissal.
6. With authorized staff credentials, open `zone.html`. Confirm all five statuses, Description, LIVE and map filters. Use a test zone to verify saves and geometry operations. Overlap trimming must start off. Verify LIVE=0 is absent publicly and LIVE=1 appears after refresh. A preview-only CSS/JS test cannot verify authenticated service edits.
7. Return to Home after two minutes in another tab. Verify refreshed data. If a service is unavailable, confirm that a clear warning appears and Refresh recovers without duplicate layers.
8. Test legacy `evac.html?incident=...` and `overview.html` links and the lightweight map fallback.

Do not call this production-validated until the device, real-map and authenticated edit checks are complete. Automated tests cover source dependencies and application logic, not live service permissions or browser rendering speed.
