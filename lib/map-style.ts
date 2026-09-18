type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const NUMERIC_FILTER_OPERATORS = new Set([">", ">=", "<", "<="]);

function protectNumericFilters(value: JsonValue): JsonValue {
  if (!Array.isArray(value)) return value;
  const children = value.map(protectNumericFilters);
  const operator = children[0];
  const operand = children[1];
  if (
    typeof operator === "string" &&
    NUMERIC_FILTER_OPERATORS.has(operator) &&
    Array.isArray(operand) &&
    operand[0] === "get"
  ) {
    const fallback = operator === ">" || operator === ">=" ? -1_000_000_000 : 1_000_000_000;
    children[1] = ["number", operand, fallback];
  }
  return children;
}

/**
 * Some OpenMapTiles features contain explicit nulls for optional numeric fields.
 * MapLibre numeric comparison filters reject those values, so numeric `get`
 * expressions receive a fallback that keeps incomplete features out of the layer.
 */
export function makeMapStyleCompatible<T>(style: T): T {
  const candidate = style as {
    sprite?: string;
    layers?: Array<{ id?: string; filter?: JsonValue; layout?: { "icon-image"?: JsonValue } }>;
  };
  const openFreeMapSprite = candidate.sprite?.startsWith("https://tiles.openfreemap.org/sprites/");
  for (const layer of candidate.layers ?? []) {
    if (layer.filter) layer.filter = protectNumericFilters(layer.filter);
    // OpenFreeMap's POI data can name icons absent from its sprite (for example, "gate").
    // Use an icon that is present in that sprite so the symbol can still render.
    if (openFreeMapSprite && layer.id?.startsWith("poi_") && Array.isArray(layer.layout?.["icon-image"])) {
      layer.layout["icon-image"] = ["coalesce", ["image", layer.layout["icon-image"]], ["image", "marker"]];
    }
  }
  return style;
}
