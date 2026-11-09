/* Site-owned read-only data sources. Add the county road-closure layer URL here when ready. */
window.ReadyLaPlataHomeConfig = Object.freeze({
  zonesUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/ArcGIS/rest/services/LPC_Evac_Zones_View/FeatureServer/0',
  boundaryUrl: 'https://gis.lpcgov.org/arcgis/rest/services/JS_website/Map_Pro/MapServer/83',
  roadClosuresUrl: '',
  nwsAlertsUrl: 'https://api.weather.gov/alerts/active?zone=COC067',
  center: [-107.8801, 37.2753],
  scale: 800000,
  refreshMs: 120000
});
