/**
 * Google Apps Script web app that appends one-tap survey answers to the spreadsheet it is bound to.
 *
 * Setup (once):
 *   1. Open the spreadsheet Tally already writes to → 擴充功能 → Apps Script, paste this file.
 *   2. 專案設定 → 指令碼屬性: add SURVEY_SECRET with a long random value.
 *   3. 部署 → 新增部署 → 類型「網頁應用程式」, 執行身分「我」, 存取權「任何人」. Copy the /exec URL.
 *   4. In Vercel set SURVEY_SHEET_WEBHOOK_URL to that URL and SURVEY_SHEET_SECRET to the same value.
 *   5. After editing this script, 部署 → 管理部署 → 編輯 → 新版本, otherwise /exec keeps serving the old code.
 *
 * Rows go to the tab named below (created on first write) so Tally's own tab is never touched.
 */
var SHEET_NAME = "quick_answers";
var COLUMNS = ["received_at", "event", "outcome", "reasons", "route_id", "city", "district", "visit"];

function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("SURVEY_SECRET");
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply("bad request");
  }
  if (!secret || typeof body.secret !== "string" || body.secret !== secret) return reply("forbidden");
  if (body.event !== "survey_answered" && body.event !== "survey_reasons") return reply("bad request");

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS);
    sheet.appendRow(COLUMNS.map(function (column) {
      if (column === "received_at") return new Date();
      var value = body[column];
      return typeof value === "string" ? value.slice(0, 200) : "";
    }));
  } finally {
    lock.releaseLock();
  }
  return reply("ok");
}

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
