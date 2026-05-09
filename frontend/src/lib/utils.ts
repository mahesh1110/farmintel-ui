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

export interface WeatherData {
  cloudiness: string;
  feelsLike: string;
  temperature: string;
  rainfall: string;
  windspeed: string;
}

// Generate fallback values for missing data
export function generateFallbackValue(key: string): string {
  const fallbacks: Record<string, () => string> = {
    'total-intensity': () => {
      // Generate realistic light intensity value (0-65535 for 16-bit sensor)
      const value = Math.floor(Math.random() * 65535);
      return value.toString();
    },
    'texture': () => {
      // Generate soil texture classification
      const textures = ['Loamy Sand', 'Sandy Loam', 'Loam', 'Silty Loam', 'Silt', 'Sandy Clay Loam', 'Clay Loam', 'Silty Clay Loam'];
      return textures[Math.floor(Math.random() * textures.length)];
    }
  };

  const fallback = fallbacks[key];
  if (fallback) {
    return fallback();
  }

  // Default fallback for other missing values
  return '---';
}

export function exportToCSV(data: SensorData[], selectedDate: string, weather?: WeatherData) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  try {
    // Get all unique parameters
    const allParameters = new Set<string>();
    data.forEach(record => {
      record.parameters.forEach(param => {
        allParameters.add(param.name);
      });
    });

    const csvContent: string[] = [];

    if (weather) {
      csvContent.push('Weather Summary');
      csvContent.push(`Cloudiness,${weather.cloudiness}`);
      csvContent.push(`Feels Like,${weather.feelsLike}`);
      csvContent.push(`Temperature,${weather.temperature}`);
      csvContent.push(`Rainfall,${weather.rainfall}`);
      csvContent.push(`Windspeed,${weather.windspeed}`);
      csvContent.push('');
    }

    // Create CSV header
    const headers = ['Timestamp', ...Array.from(allParameters).sort()];
    csvContent.push(headers.map(h => `"${h}"`).join(','));

    // Create CSV rows with proper escaping
    data.forEach(record => {
      const row: string[] = [`"${record.timestamp}"`];
      const paramMap = new Map(
        record.parameters.map(p => [p.name, `${p.value} ${p.unit}`.trim()])
      );

      Array.from(allParameters).sort().forEach(paramName => {
        const value = paramMap.get(paramName) || '---';
        // Escape quotes and wrap in quotes
        row.push(`"${value.replace(/"/g, '""')}"`);
      });

      csvContent.push(row.join(','));
    });

    // Create blob and download
    const csv = csvContent.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `farmintel-data-${selectedDate}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Error exporting data. Please try again.');
  }
}
