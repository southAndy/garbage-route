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
  const candidate = style as { layers?: Array<{ filter?: JsonValue }> };
  for (const layer of candidate.layers ?? []) {
    if (layer.filter) layer.filter = protectNumericFilters(layer.filter);
  }
  return style;
}
