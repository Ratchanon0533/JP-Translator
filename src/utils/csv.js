import { getLanguage } from '../config/languages.js';
import { fileStamp } from './format.js';

const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

// Like Mirai's "csvダウンロード": save the session so you can review it later.
export function downloadCsv(entries) {
  const header = ['Time', 'From', 'To', 'Original', 'Translation'];
  const rows = entries.map((entry) => [
    new Date(entry.createdAt).toLocaleString(),
    getLanguage(entry.from).english,
    getLanguage(entry.to).english,
    entry.source,
    entry.translation,
  ]);
  const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');

  // The byte-order mark tells Excel the file is UTF-8, so Japanese and Thai display correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jp-translator-${fileStamp()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
