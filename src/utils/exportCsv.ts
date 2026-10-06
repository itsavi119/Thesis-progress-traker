import type { CaseRecord } from '../types/index.js';

/**
 * Escapes values for safe CSV export in accordance with RFC 4180
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) {
    return '""';
  }
  const stringVal = String(val).trim();
  // If string contains comma, quote, or newline, escape quotes and wrap in double quotes
  if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
    return `"${stringVal.replace(/"/g, '""')}"`;
  }
  return `"${stringVal}"`;
}

export function generateCsvContent(cases: CaseRecord[]): string {
  const headers = [
    'Patient ID',
    'Status',
    'Assigned Researcher',
    'Researcher Email',
    'Patient Name',
    'Diagnosis',
    'Drug Names / Regimen',
    'Registration Date (Local)',
    'Registration Timestamp (ISO)',
    'Last Updated (ISO)',
  ];

  const rows = cases.map((c) => {
    const localDate = new Date(c.registered_at).toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return [
      escapeCsvValue(c.patient_id),
      escapeCsvValue(c.status),
      escapeCsvValue(c.assigned_name || 'Unassigned'),
      escapeCsvValue(c.assigned_email || ''),
      escapeCsvValue(c.patient_name || ''),
      escapeCsvValue(c.diagnosis || ''),
      escapeCsvValue(c.drug_names || ''),
      escapeCsvValue(localDate),
      escapeCsvValue(c.registered_at),
      escapeCsvValue(c.updated_at),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

export function downloadCasesCsv(cases: CaseRecord[], filenamePrefix = 'thesis_cases_export'): void {
  const csvData = generateCsvContent(cases);
  // Add UTF-8 BOM (\uFEFF) for immediate compatibility with Microsoft Excel & Google Sheets
  const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${filenamePrefix}_${dateStr}.csv`;

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
