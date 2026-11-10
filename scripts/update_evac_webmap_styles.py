r"""Run in ArcGIS Pro's Python window while signed into the web map's portal.

exec(open(r"C:\GIS\update_evac_webmap_styles.py", encoding="utf-8-sig").read())

Updates the web map only. Does not edit features, source service styles, LIVE,
view settings, other layers, or the styles for other statuses. Requires map
owner/admin editing rights. Original and proposed JSON are saved before updating.
"""
from collections.abc import Mapping
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path

WEBMAP_ID = "58a8bb313db64271a55e7960cb839f64"
ZONE_URL = "https://services2.arcgis.com/ilLrLpXfElYxSy9y/arcgis/rest/services/LPC_Evac_Zones_View/FeatureServer/0"
AUTH_MODE = "pro"  # Use "home" in an authenticated ArcGIS Online Notebook.
DRY_RUN = False  # True saves a preview without changing the web map.
BACKUP_DIR = Path.home() / "Documents" / "ReadyLaPlata_Backups"
LABEL_FONT_SIZE = 12
LABEL_INCLUDE_STATUS = True  # Zone name, then public status on the next line.
STYLE_MARKER = "// ReadyLaPlata Shelter/Access v1"
STYLES = {
    "Shelter": {
        "label": "Shelter-In-Place",
        "aliases": ["shelter", "shelter-in-place", "shelter in place"],
        "fill": [141, 200, 248, 128], "outline": [30, 110, 182, 255],
        "text": [18, 77, 125, 255], "style": "esriSFSSolid",
    },
    "Access": {
        "label": "Access Impact Area",
        "aliases": ["access", "access impact area", "road closure area", "road access impact", "isolated"],
        "fill": [130, 74, 182, 180], "outline": [130, 74, 182, 255],
        "text": [89, 50, 120, 255], "style": "esriSFSBackwardDiagonal",
    },
}


def plain(value):
    if isinstance(value, Mapping):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value


def walk_layers(layers):
    for layer in layers:
        yield layer
        yield from walk_layers(layer.get("layers", []))


def normalized_url(url):
    return str(url).split("?")[0].rstrip("/").lower()


def target_layers(data):
    return [layer for layer in walk_layers(data.get("operationalLayers", []))
            if normalized_url(layer.get("url", "")) == normalized_url(ZONE_URL)]


def field_name(metadata, wanted):
    for field in metadata.get("fields", []):
        if field["name"].lower() == wanted.lower():
            if field.get("type") != "esriFieldTypeString":
                raise ValueError(f"Expected a string field for {wanted}.")
            return field["name"]
    raise ValueError(f"Zone service does not expose {wanted}.")


def renderer_expression(status_field):
    lines = [STYLE_MARKER, f"var raw = Text($feature[{json.dumps(status_field)}]);", "var status = Lower(raw);"]
    for key, style in STYLES.items():
        lines.append(f'if (IndexOf({json.dumps(style["aliases"])}, status) >= 0) {{ return {json.dumps(key)}; }}')
    return "\n".join(lines + ["return raw;"])


def updated_renderer(old, status_field):
    old = deepcopy(old)
    expression = renderer_expression(status_field)
    if old.get("visualVariables") or old.get("uniqueValueGroups"):
        raise ValueError("Advanced zone renderer found. Review it manually before using this script.")
    if old.get("type") == "simple":
        if not old.get("symbol"):
            raise ValueError("Existing zone renderer has no default symbol.")
        result = {"type": "uniqueValue", "defaultSymbol": old["symbol"],
                  "defaultLabel": old.get("label") or "Other zones", "uniqueValueInfos": []}
    elif old.get("type") == "uniqueValue":
        existing_expression = old.get("valueExpression")
        if ((existing_expression and existing_expression != expression)
                or old.get("field2") or old.get("field3")
                or (not existing_expression and str(old.get("field1", "")).lower() != status_field.lower())):
            raise ValueError("Existing zone renderer is not a simple STATUS renderer; no update made.")
        result = old
    else:
        raise ValueError("Unsupported zone renderer; no update made.")
    aliases = {alias for style in STYLES.values() for alias in style["aliases"]}
    result["uniqueValueInfos"] = [info for info in result.get("uniqueValueInfos", [])
                                   if str(info.get("value", "")).lower() not in aliases]
    result.update(field1=status_field, valueExpression=expression,
                  valueExpressionTitle="Zone status")
    for key, style in STYLES.items():
        result["uniqueValueInfos"].append({
            "value": key, "label": style["label"],
            "symbol": {"type": "esriSFS", "style": style["style"], "color": style["fill"],
                       "outline": {"type": "esriSLS", "style": "esriSLSSolid",
                                   "color": style["outline"], "width": 1.8}},
        })
    return result


def sql_values(values):
    return ", ".join("'" + value.replace("'", "''") + "'" for value in values)


def updated_labels(existing, status_field, zone_field):
    all_aliases = [alias for style in STYLES.values() for alias in style["aliases"]]
    exclusion = f"({status_field} IS NULL OR LOWER({status_field}) NOT IN ({sql_values(all_aliases)}))"
    names = {"ReadyLaPlata - " + key for key in STYLES}
    labels = [deepcopy(label) for label in (existing or []) if label.get("name") not in names]
    for label in labels:
        where = label.get("where") or ""
        if exclusion not in where:
            label["where"] = f"({where}) AND {exclusion}" if where else exclusion
    for key, style in STYLES.items():
        public_label = json.dumps(style["label"])
        zone = f'$feature[{json.dumps(zone_field)}]'
        expression = f'var zone = DefaultValue({zone}, "");\nreturn Text(zone);'
        if LABEL_INCLUDE_STATUS:
            expression = (f'var zone = DefaultValue({zone}, "");\n'
                          f'return IIf(IsEmpty(zone), {public_label}, Text(zone) + TextFormatting.NewLine + {public_label});')
        labels.append({
            "name": "ReadyLaPlata - " + key,
            "where": f"LOWER({status_field}) IN ({sql_values(style['aliases'])})",
            "labelExpressionInfo": {"expression": expression},
            "labelPlacement": "esriServerPolygonPlacementAlwaysHorizontal",
            "minScale": 0, "maxScale": 0,
            "symbol": {"type": "esriTS", "color": style["text"],
                       "haloColor": [255, 255, 255, 255], "haloSize": 2,
                       "font": {"family": "Arial", "size": LABEL_FONT_SIZE, "weight": "bold"},
                       "horizontalAlignment": "center", "verticalAlignment": "middle",
                       "angle": 0, "xoffset": 0, "yoffset": 0},
        })
    return labels


def update_webmap_data(original, metadata):
    proposed = deepcopy(original)
    layers = target_layers(proposed)
    if not layers:
        raise ValueError("The configured zone layer was not found in this web map.")
    status_field = field_name(metadata, "STATUS")
    zone_field = field_name(metadata, "zonename")
    inherited = metadata.get("drawingInfo", {})
    for layer in layers:
        drawing = layer.setdefault("layerDefinition", {}).setdefault("drawingInfo", {})
        drawing["renderer"] = updated_renderer(drawing.get("renderer") or inherited.get("renderer", {}), status_field)
        drawing["labelingInfo"] = updated_labels(drawing.get("labelingInfo", inherited.get("labelingInfo")), status_field, zone_field)
        layer["showLabels"] = True
    return proposed


def apply_update(item, metadata, backup_dir=BACKUP_DIR, dry_run=DRY_RUN):
    if item.type != "Web Map":
        raise ValueError("Configured item is not a Web Map.")
    original = plain(item.get_data())
    proposed = update_webmap_data(original, plain(metadata))
    if proposed == original:
        print("Shelter and Access styles already match. No changes needed.")
        return
    backup_dir = Path(backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    prefix = backup_dir / f"{WEBMAP_ID}_{stamp}"
    for suffix, data in [("original", original), ("proposed", proposed)]:
        Path(str(prefix) + f"_{suffix}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Web map: {item.title} ({WEBMAP_ID})")
    print(f"Backup: {prefix}_original.json")
    print("Zone layers: " + ", ".join(layer.get("title", layer.get("id", "zones")) for layer in target_layers(proposed)))
    if dry_run:
        print("DRY RUN: proposed JSON saved; web map has not been changed.")
        return
    if plain(item.get_data()) != original:
        raise RuntimeError("The web map changed during preparation. Nothing written; run again to use its latest version.")
    if not item.update(data=json.dumps(proposed)):
        raise RuntimeError("ArcGIS did not confirm the update. Check permissions and the saved backup.")
    saved = plain(item.get_data())
    if target_layers(saved) != target_layers(proposed):
        raise RuntimeError("Update returned success but verification differs. Inspect the map and backup; no automatic rollback attempted.")
    print("Verified: blue Shelter-In-Place, purple hatched Access Impact Area, and matching zone labels.")
    print("Reload ReadyLaPlata to see the updated web map. Other statuses retain their existing symbols.")


def main():
    from arcgis.gis import GIS
    from arcgis.features import FeatureLayer
    gis = GIS(AUTH_MODE)
    item = gis.content.get(WEBMAP_ID)
    if item is None:
        raise RuntimeError("Web map unavailable. Sign into its ArcGIS portal in Pro and try again.")
    metadata = plain(FeatureLayer(ZONE_URL, gis=gis).properties)
    apply_update(item, metadata)


if __name__ == "__main__":
    main()
