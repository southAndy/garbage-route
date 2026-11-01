/** Version 1 is the unversioned, two-outcome, multi-select survey. */
export const SURVEY_VERSION = "2";
export type SurveyOutcome = "found" | "not_found" | "in_progress";

export const SURVEY_REASONS = [
  { value: "no_route", label: "找不到附近的路線或站點" },
  { value: "unreadable_schedule", label: "有看到資料，但看不懂時間或清運日" },
  { value: "hard_to_use", label: "不知道怎麼操作" },
  { value: "time_mismatch", label: "時間跟實際到站不同" },
  { value: "other", label: "其他／不確定" },
] as const;
export type SurveyReason = typeof SURVEY_REASONS[number]["value"];
