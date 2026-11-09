/* Public, read-only sources from the existing county evacuation web map. */
window.ReadyLaPlataHomeConfig = Object.freeze({
  zonesUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/ArcGIS/rest/services/LPC_Evac_Zones_View/FeatureServer/0',
  boundaryUrl: 'https://gis.lpcgov.org/arcgis/rest/services/JS_website/Map_Pro/MapServer/83',
  roadsTilesUrl: 'https://gis.lpcgov.org/arcgis/rest/services/Hosted/Roads/VectorTileServer/tile/{z}/{y}/{x}.pbf',
  roadClosuresUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/EvacPOIs_view/FeatureServer/1',
  evacPoisUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/EvacPOIs_view/FeatureServer/0',
  nwsAlertsUrl: 'https://api.weather.gov/alerts/active?zone=COC067',
  center: [-107.8801, 37.2753],
  scale: 800000,
  refreshMs: 120000
});
