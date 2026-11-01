import type { CityCode } from "./types";

export const COLLECTION_SURVEY_VERSION = "1";
export const COLLECTION_SURVEY_DWELL_MS = 20_000;
export const COLLECTION_SURVEY_EMPTY_DWELL_MS = 8_000;
export const COLLECTION_SURVEY_REASONS = [
  { value: "no_points", label: "本區沒有收受點" },
  { value: "unsuitable_hours", label: "時段不適合" },
  { value: "unreadable_hours", label: "看不懂時間或規定" },
  { value: "other", label: "其他" },
] as const;
export type CollectionSurveyReason = typeof COLLECTION_SURVEY_REASONS[number]["value"];
export type CollectionSurveyTrigger = "collection_list_dwell" | "collection_map_dwell" | "collection_empty_dwell";
export interface CollectionSurveyContext {
  page_type: "collection_points";
  city: CityCode;
  district: string;
  point_id?: string;
  view_mode: "list" | "map";
  trigger: CollectionSurveyTrigger;
}
