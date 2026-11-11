/* Public, read-only sources from the existing county evacuation web map. */
window.ReadyLaPlataHomeConfig = Object.freeze({
  zonesWhere: 'LIVE = 1',
  webmapId: '58a8bb313db64271a55e7960cb839f64',
  roadsServiceUrl: 'https://gis.lpcgov.org/arcgis/rest/services/Hosted/Roads/VectorTileServer',
  zonesUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/ArcGIS/rest/services/LPC_Evac_Zones_View/FeatureServer/0',
  boundaryUrl: 'https://gis.lpcgov.org/arcgis/rest/services/JS_website/Map_Pro/MapServer/83',
  roadClosuresUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/EvacPOIs_view/FeatureServer/1',
  evacPoisUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/EvacPOIs_view/FeatureServer/0',
  countyBounds: [[36.98110622387451,-108.40516285520786],[37.64873746849846,-107.46534438179984]],
  incidentLabelScale: 75000,
  countyZoomOffset: 1,
  refreshMs: 120000
});
