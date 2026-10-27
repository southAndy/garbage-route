import { track } from "@vercel/analytics";

type MapPickerEvent =
  | { name: "map_picker_opened" | "map_picker_cancelled" | "map_picker_confirm_clicked" | "map_area_search_clicked" }
  | { name: "map_picker_result" | "map_area_search_result"; status: "success" | "empty" | "error" };

/** Construct a fixed payload: never forward queries, points, or error text. */
export function trackMapPicker(event: MapPickerEvent) {
  try {
    track(event.name, "status" in event ? { status: event.status } : {});
  } catch { /* Analytics failures must not affect searching or choosing a point. */ }
}
