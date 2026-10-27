/**
 * Paste this ENTIRE file into Apps Script, replacing the default myFunction().
 * 1. Open the destination spreadsheet → Extensions → Apps Script.
 * 2. Script properties: SURVEY_SECRET (random secret), SURVEY_SPREADSHEET_ID (sheet URL ID).
 * 3. Deploy web app: execute as yourself, access Anyone; copy the /exec URL.
 * 4. Vercel: SURVEY_SHEET_WEBHOOK_URL and SURVEY_SHEET_SECRET; redeploy the website.
 * 5. After script edits, update deployment to a new version.
 * Existing quick_answers rows are kept. New clients merge events by feedback_id;
 * older clients without an ID retain the original append-only behavior.
 */
var SHEET_NAME = "quick_answers";
var COLUMNS = ["received_at", "event", "outcome", "reasons", "route_id", "city", "district", "visit", "feedback_id", "updated_at", "reason_status"];

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
    var sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
      sheet.setFrozenRows(1);
    }
    // Find columns by name, preserving existing columns and operator notes.
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    COLUMNS.forEach(function (name) {
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
    // The same feedback ID cannot move to a different route.
    if (row && ["route_id", "city", "district"].some(function (name) { return get(name) !== body[name]; })) return reply("conflict");
    var patch = { updated_at: new Date() };
    if (!row) patch.received_at = new Date();
    ["route_id", "city", "district", "feedback_id"].forEach(function (name) {
      if (typeof body[name] === "string") patch[name] = body[name];
    });
    if (body.event === "survey_answered") {
      patch.outcome = body.outcome;
      patch.visit = body.visit;
    } else {
      patch.reasons = body.reasons;
    }
    var outcome = patch.outcome || get("outcome");
    var reasons = patch.reasons || get("reasons");
    patch.event = outcome ? "survey_answered" : body.event;
    patch.reason_status = reasons ? (reasons === "skipped" ? "skipped" : "answered") : (outcome === "found" ? "not_applicable" : "not_received");
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
  if (["route_id", "city", "district"].some(function (name) { return typeof body[name] !== "string" || !body[name].trim() || body[name].length > 64; })) return false;
  if (body.feedback_id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.feedback_id)) return false;
  if (body.event === "survey_answered") return /^(found|not_found)$/.test(body.outcome) && /^(first|return)$/.test(body.visit);
  if (body.event === "survey_reasons") return typeof body.reasons === "string" && body.reasons.length <= 200 && /^[a-z_]+(,[a-z_]+)*$/.test(body.reasons);
  return false;
}

function safeCell(value) {
  // Public input must never execute as a spreadsheet formula.
  return typeof value === "string" && /^[=+@-]/.test(value) ? "'" + value : value;
}

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
