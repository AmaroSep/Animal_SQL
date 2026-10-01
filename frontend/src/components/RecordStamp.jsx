import React from 'react';

// Backend timestamps are UTC without a zone suffix
const when = (iso) => new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Small grey "created by / last edited by" line for record detail views
export default function RecordStamp({ record, className = '' }) {
  if (!record) return null;
  const { created_by, created_at, updated_by, updated_at } = record;
  const created = created_by
    ? `Created by ${created_by}${created_at ? ` · ${when(created_at)}` : ''}`
    : created_at ? `Created ${when(created_at)} (before user tracking)` : null;
  const edited = updated_at ? `Last edited by ${updated_by || 'unknown'} · ${when(updated_at)}` : null;
  if (!created && !edited) return null;
  return (
    <p className={`text-[10px] font-mono text-white/30 leading-relaxed ${className}`}>
      {created}
      {created && edited && <br />}
      {edited}
    </p>
  );
}
