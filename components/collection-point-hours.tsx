import { Fragment } from "react";

// Highlight only complete time ranges; keep every word and separator from the
// official notes, including weekday exceptions and collection restrictions.
const TIME_RANGE = /(\b(?:[01]?\d|2[0-3])[:：][0-5]\d\s*[~～–—-]\s*(?:[01]?\d|2[0-3])[:：][0-5]\d\b)/u;

export default function CollectionPointHours({ notes }: { notes: string }) {
  return <div className="schedule collection-hours">
    <div className="collection-hours-header">
      <h3 className="collection-hours-heading">開放時間與規定</h3>
      <span className="collection-hours-source">官方原文</span>
    </div>
    <p className="collection-hours-text">{notes.split(TIME_RANGE).map((part, index) => index % 2
      ? <strong key={index} className="collection-hours-time">{part}</strong>
      : <Fragment key={index}>{part}</Fragment>)}</p>
  </div>;
}
