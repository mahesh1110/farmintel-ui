import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SensorData {
  timestamp: string;
  parameters: Array<{
    name: string;
    value: string;
    unit: string;
  }>;
}

export function exportToCSV(data: SensorData[], selectedDate: string) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get all unique parameters
  const allParameters = new Set<string>();
  data.forEach(record => {
    record.parameters.forEach(param => {
      allParameters.add(param.name);
    });
  });

  // Create CSV header
  const headers = ['Timestamp', ...Array.from(allParameters)];
  const csvContent = [headers.join(',')];

  // Create CSV rows
  data.forEach(record => {
    const row: string[] = [record.timestamp];
    const paramMap = new Map(
      record.parameters.map(p => [p.name, `${p.value} ${p.unit}`.trim()])
    );

    allParameters.forEach(paramName => {
      row.push(paramMap.get(paramName) || '---');
    });

    csvContent.push(row.join(','));
  });

  // Create blob and download
  const csv = csvContent.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `farmintel-data-${selectedDate}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}
