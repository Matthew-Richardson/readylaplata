/* Public, read-only sources from the existing county evacuation web map. */
window.ReadyLaPlataHomeConfig = Object.freeze({
  basemapTilesUrl: 'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
  zonesUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/ArcGIS/rest/services/LPC_Evac_Zones_View/FeatureServer/0',
  boundaryUrl: 'https://gis.lpcgov.org/arcgis/rest/services/JS_website/Map_Pro/MapServer/83',
  roadsTilesUrl: 'https://gis.lpcgov.org/arcgis/rest/services/Hosted/Roads/VectorTileServer/tile/{z}/{y}/{x}.pbf',
  roadClosuresUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/EvacPOIs_view/FeatureServer/1',
  evacPoisUrl: 'https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/EvacPOIs_view/FeatureServer/0',
  countyBounds: [[36.98110622387451,-108.40516285520786],[37.64873746849846,-107.46534438179984]],
  refreshMs: 120000
});
