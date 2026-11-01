/**
 * Paste this ENTIRE file into Apps Script, replacing the default myFunction().
 * 1. Open the destination spreadsheet → Extensions → Apps Script.
 * 2. Script properties: SURVEY_SECRET (random secret), SURVEY_SPREADSHEET_ID (sheet URL ID).
 * 3. Deploy web app: execute as yourself, access Anyone; copy the /exec URL.
 * 4. Vercel: SURVEY_SHEET_WEBHOOK_URL and SURVEY_SHEET_SECRET; redeploy the website.
 * 5. After script edits, update deployment to a new version.
 * Collection surveys use a separate collection_answers sheet.
 * Existing quick_answers rows are kept. New clients merge events by feedback_id;
 * older clients without an ID retain the original append-only behavior.
 */
var SHEET_NAME = "quick_answers";
var COLLECTION_SHEET_NAME = "collection_answers";
var COLUMNS = ["received_at", "event", "outcome", "reasons", "route_id", "city", "district", "visit", "feedback_id", "updated_at", "reason_status", "survey_version", "reason_revision"];
var COLLECTION_COLUMNS = ["received_at", "event", "outcome", "reasons", "page_type", "city", "district", "point_id", "view_mode", "trigger", "visit", "feedback_id", "updated_at", "reason_status", "survey_version", "reason_revision"];

function doPost(e) {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("SURVEY_SECRET");
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply("bad request"); }
  if (!body || !secret || body.secret !== secret) return reply("forbidden");
  if (!validRecord(body)) return reply("bad request");
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var spreadsheetId = properties.getProperty("SURVEY_SPREADSHEET_ID");
    var spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) return reply("missing spreadsheet");
    var isCollection = body.page_type === "collection_points";
    var sheetName = isCollection ? COLLECTION_SHEET_NAME : SHEET_NAME;
    var columns = isCollection ? COLLECTION_COLUMNS : COLUMNS;
    var contextFields = isCollection ? ["page_type", "city", "district", "point_id", "view_mode", "trigger"] : ["route_id", "city", "district"];
    var revisioned = isCollection || body.survey_version === "2";
    var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
      sheet.setFrozenRows(1);
    }
    // Find columns by name, preserving existing columns and operator notes.
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    columns.forEach(function (name) {
      if (headers.indexOf(name) < 0) {
        headers.push(name);
        sheet.getRange(1, headers.length).setValue(name);
      }
    });
    var row = 0;
    if (body.feedback_id && sheet.getLastRow() > 1) {
      var match = sheet.getRange(2, headers.indexOf("feedback_id") + 1, sheet.getLastRow() - 1, 1)
        .createTextFinder(body.feedback_id).matchEntireCell(true).findNext();
      if (match) row = match.getRow();
    }
    var existing = row ? sheet.getRange(row, 1, 1, headers.length).getValues()[0] : headers.map(function () { return ""; });
    function get(name) { return existing[headers.indexOf(name)]; }
    // The same feedback ID cannot move to a different route or collection context.
    if (row && contextFields.some(function (name) { return (get(name) || "") !== (body[name] || ""); })) return reply("conflict");
    // Ignore duplicate or delayed older selections; keep the latest user choice.
    if (row && revisioned && body.event === "survey_reasons" && Number(get("reason_revision")) >= body.reason_revision) return reply("ok");
    var patch = { updated_at: new Date() };
    if (!row) patch.received_at = new Date();
    patch.survey_version = body.survey_version || get("survey_version") || "1";
    contextFields.concat(["feedback_id"]).forEach(function (name) {
      if (typeof body[name] === "string") patch[name] = body[name];
    });
    if (body.event === "survey_answered") {
      patch.outcome = body.outcome;
      patch.visit = body.visit;
    } else {
      patch.reasons = body.reasons;
      if (revisioned) {
        patch.reason_revision = body.reason_revision;
        patch.outcome = body.outcome;
        patch.visit = body.visit;
      }
    }
    var outcome = patch.outcome || get("outcome");
    var reasons = patch.reasons || get("reasons");
    patch.event = outcome ? "survey_answered" : body.event;
    patch.reason_status = reasons ? (reasons === "skipped" ? "skipped" : "answered") : (outcome === "found" || outcome === "in_progress" ? "not_applicable" : "not_received");
    row = row || sheet.getLastRow() + 1;
    // Only update owned fields; never rewrite operator formulas or notes.
    Object.keys(patch).forEach(function (name) {
      sheet.getRange(row, headers.indexOf(name) + 1).setValue(safeCell(patch[name]));
    });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return reply("ok");
}

function validRecord(body) {
  if (body.page_type === "collection_points") return validCollectionRecord(body);
  if (body.page_type !== undefined && body.page_type !== "route") return false;
  if (["route_id", "city", "district"].some(function (name) { return typeof body[name] !== "string" || !body[name].trim() || body[name].length > 64; })) return false;
  if (body.feedback_id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.feedback_id)) return false;
  if (body.survey_version !== undefined && body.survey_version !== "1" && body.survey_version !== "2") return false;
  if (body.survey_version === "2") {
    if (!body.feedback_id) return false;
    if (body.event === "survey_reasons" &&
      (typeof body.reason_revision !== "number" || body.reason_revision % 1 !== 0 || body.reason_revision < 1 || body.reason_revision > 1000000 ||
      body.outcome !== "not_found" || !/^(first|return)$/.test(body.visit) ||
      !/^(no_route|unreadable_schedule|hard_to_use|time_mismatch|other|skipped)$/.test(body.reasons))) return false;
  }
  if (body.event === "survey_answered") return (body.outcome === "in_progress" ? body.survey_version === "2" : /^(found|not_found)$/.test(body.outcome)) && /^(first|return)$/.test(body.visit);
  if (body.event === "survey_reasons") return typeof body.reasons === "string" && body.reasons.length <= 200 && /^[a-z_]+(,[a-z_]+)*$/.test(body.reasons);
  return false;
}

function validCollectionRecord(body) {
  if (body.survey_version !== "1" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.feedback_id || "")) return false;
  if (!/^(TPE|NTP)$/.test(body.city) || typeof body.district !== "string" || body.district.length > 64 || !/^(list|map)$/.test(body.view_mode)) return false;
  if (body.point_id !== undefined && (typeof body.point_id !== "string" || !body.point_id.trim() || body.point_id.length > 64)) return false;
  if (!/^(collection_list_dwell|collection_map_dwell|collection_empty_dwell)$/.test(body.trigger) || !/^(first|return)$/.test(body.visit)) return false;
  if (body.event === "survey_answered") return /^(found|not_found|in_progress)$/.test(body.outcome);
  if (body.event === "survey_reasons") return body.outcome === "not_found" &&
    typeof body.reason_revision === "number" && body.reason_revision % 1 === 0 && body.reason_revision >= 1 && body.reason_revision <= 1000000 &&
    /^(no_points|unsuitable_hours|unreadable_hours|other|skipped)$/.test(body.reasons);
  return false;
}

function safeCell(value) {
  // Public input must never execute as a spreadsheet formula.
  return typeof value === "string" && /^[=+@-]/.test(value) ? "'" + value : value;
}

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
