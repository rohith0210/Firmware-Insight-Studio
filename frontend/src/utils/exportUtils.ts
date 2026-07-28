import type { ParseResult } from "../App";

export const exportToJSON = (data: ParseResult) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.filename}_analysis.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportToCSV = (symbols: Array<{ name: string; section: string; size: number }>) => {
  const csv = [
    ['Name', 'Section', 'Size (KB)'],
    ...symbols.map(s => [s.name, s.section, (s.size / 1024).toFixed(2)])
  ].map(row => row.join(',')).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'symbols.csv';
  a.click();
  URL.revokeObjectURL(url);
};