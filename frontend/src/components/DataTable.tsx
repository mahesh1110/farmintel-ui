import { useState, useEffect } from 'react';
import { cn, generateFallbackValue } from '../lib/utils';
import { db, ref, onValue } from '../lib/firebase';
import type { SensorData } from '../lib/utils';

interface ParameterData {
  id: number;
  name: string;
  value: string;
  timestamp: string;
  unit: string;
}

interface DataTableProps {
  historicalData?: SensorData[];
}

const PARAMETER_CONFIG = [
  { id: 1, name: "Canopy Temperature", key: "canopy_temp_C", unit: "°C", path: "sensor_data/atmosphere" },
  { id: 2, name: "Gas Resistance", key: "gas_res_Ohm", unit: "Ω", path: "sensor_data/atmosphere" },
  { id: 3, name: "Humidity", key: "humidity_pct", unit: "%", path: "sensor_data/atmosphere" },
  { id: 4, name: "Barometric Pressure", key: "pressure_hPa", unit: "hPa", path: "sensor_data/atmosphere" },
  { id: 5, name: "Available Calcium (Ca)", key: "calcium", unit: "ppm", path: "derived" },
  { id: 6, name: "Boron (B)", key: "boron", unit: "ppm", path: "derived" },
  { id: 7, name: "Copper (Cu)", key: "copper", unit: "ppm", path: "derived" },
  { id: 8, name: "Iron (Fe)", key: "iron", unit: "ppm", path: "derived" },
  { id: 9, name: "Magnesium (Mg)", key: "magnesium", unit: "ppm", path: "derived" },
  { id: 10, name: "Manganese (Mn)", key: "manganese", unit: "ppm", path: "derived" },
  { id: 11, name: "Molybdenum (Mo)", key: "molybdenum", unit: "ppm", path: "derived" },
  { id: 12, name: "Sulphur (S)", key: "sulphur", unit: "ppm", path: "derived" },
  { id: 13, name: "Zinc (Zn)", key: "zinc", unit: "ppm", path: "derived" },
  { id: 14, name: "Organic Carbon (OC)", key: "organic_carbon", unit: "%", path: "derived" },
  { id: 15, name: "Nitrogen (N)", key: "N_ppm", unit: "ppm", path: "sensor_data/soil_nutrients" },
  { id: 16, name: "Phosphorus (P)", key: "P_ppm", unit: "ppm", path: "sensor_data/soil_nutrients" },
  { id: 17, name: "Potassium (K)", key: "K_ppm", unit: "ppm", path: "sensor_data/soil_nutrients" },
  { id: 18, name: "Soil EC", key: "EC_uS", unit: "uS/cm", path: "sensor_data/soil_nutrients" },
  { id: 19, name: "Total Light Intensity", key: "total-intensity", unit: "", path: "sensor_data/rgb/RGB_TCS34725" },
  { id: 20, name: "Total Dissolved Solids (TDS)", key: "TDS_ppm", unit: "ppm", path: "sensor_data/soil_physical" },
  { id: 21, name: "Soil Moisture", key: "moisture_pct", unit: "%", path: "sensor_data/soil_physical" },
  { id: 22, name: "Soil Capacity", key: "soil_cap_pct", unit: "%", path: "sensor_data/soil_physical" },
  { id: 23, name: "Soil Temperature", key: "soil_temp_C", unit: "°C", path: "sensor_data/soil_physical" },
  { id: 24, name: "Soil pH", key: "Ph", unit: "pH", path: "sensor_data/soil_nutrients" },
  { id: 25, name: "Soil Texture", key: "texture", unit: "", path: "sensor_data/soil_physical" },
];

const STABLE_VALUE_KEYS = new Set([
  'calcium',
  'boron',
  'copper',
  'iron',
  'magnesium',
  'manganese',
  'molybdenum',
  'sulphur',
  'zinc',
  'organic_carbon',
  'N_ppm',
  'P_ppm',
  'K_ppm',
  'EC_uS',
  'Ph',
  'total-intensity',
  'texture',
]);

const CONFIG_KEY_ALIASES: Record<string, string[]> = {
  'total-intensity': ['total-intensity', 'total_intensity', 'totalIntensity', 'light_intensity', 'lightIntensity', 'intensity'],
  'texture': ['texture', 'soil_texture', 'soilTexture', 'texture_class', 'soilTextureClass'],
};

function getKeyCandidates(key: string) {
  return CONFIG_KEY_ALIASES[key] ?? [key, key.replace(/-/g, '_')];
}

function readConfigValue(config: (typeof PARAMETER_CONFIG)[number], source: any) {
  if (config.path) {
    const pathParts = config.path.split('/');
    let target = source;
    for (const part of pathParts) {
      if (part) target = target?.[part];
    }

    for (const candidateKey of getKeyCandidates(config.key)) {
      const value = target?.[candidateKey];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  for (const candidateKey of getKeyCandidates(config.key)) {
    const value = source?.[candidateKey];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function hasUsableValue(config: (typeof PARAMETER_CONFIG)[number], value: unknown) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  const normalizedValue = config.key === 'Ph' && typeof value === 'number' ? value / 10 : value;

  if (STABLE_VALUE_KEYS.has(config.key)) {
    if (typeof normalizedValue === 'number') {
      return normalizedValue !== 0;
    }

    const stringValue = String(normalizedValue).trim();
    return stringValue !== '0' && stringValue !== '0.0';
  }

  return true;
}

function findLatestUsableValue(
  config: (typeof PARAMETER_CONFIG)[number],
  deviceData: Record<string, any>,
  timestamps: string[],
  fallbackValue: string,
) {
  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    const snapshot = deviceData[timestamps[index]];
    const rawValue = readConfigValue(config, snapshot);

    if (hasUsableValue(config, rawValue)) {
      return formatLiveValue(config, rawValue, fallbackValue);
    }
  }

  if (config.key === 'total-intensity' || config.key === 'texture') {
    return generateFallbackValue(config.key);
  }

  return fallbackValue;
}

function formatLiveValue(config: (typeof PARAMETER_CONFIG)[number], rawValue: unknown, previousValue: string) {
  if (!hasUsableValue(config, rawValue)) {
    if (config.key === 'total-intensity' || config.key === 'texture') {
      return generateFallbackValue(config.key);
    }
    return previousValue;
  }

  let displayValue = rawValue;
  if (config.key === 'Ph' && typeof rawValue === 'number') {
    displayValue = rawValue / 10;
  }

  if (typeof displayValue === 'number') {
    if (displayValue === 0 && STABLE_VALUE_KEYS.has(config.key)) {
      return previousValue;
    }
    return displayValue.toFixed(1).replace(/\.0$/, '');
  }

  const stringValue = String(displayValue).trim();
  if ((stringValue === '0' || stringValue === '0.0') && STABLE_VALUE_KEYS.has(config.key)) {
    return previousValue;
  }

  return stringValue.length > 0 ? stringValue : previousValue;
}

const INITIAL_PARAMS: ParameterData[] = PARAMETER_CONFIG.map(p => ({
  id: p.id,
  name: p.name,
  value: "---",
  timestamp: "---",
  unit: p.unit
}));

const DataTable: React.FC<DataTableProps> = ({ historicalData }) => {
  const [parameters, setParameters] = useState<ParameterData[]>(INITIAL_PARAMS);
  const [lastUpdatedId, setLastUpdatedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(!historicalData);
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>('');

  // If historical data is provided, use it instead of live data
  useEffect(() => {
    if (historicalData && historicalData.length > 0) {
      setLoading(false);
      // Set the first timestamp as default
      if (!selectedTimestamp) {
        setSelectedTimestamp(historicalData[0].timestamp);
      }
      
      // Find and display data for selected timestamp
      const dataForTimestamp = historicalData.find(d => d.timestamp === selectedTimestamp);
      if (dataForTimestamp) {
        setParameters(
          PARAMETER_CONFIG.map(config => {
            const paramData = dataForTimestamp.parameters.find(p => p.name === config.name);
            return {
              id: config.id,
              name: config.name,
              value: paramData?.value || '---',
              timestamp: dataForTimestamp.timestamp,
              unit: config.unit
            };
          })
        );
      }
      return;
    }

    // Live data mode
    const deviceRef = ref(db, "device_001");
    const unsubscribe = onValue(deviceRef, (snapshot) => {
      const deviceData = snapshot.val();
      if (deviceData) {
        setLoading(false);
        const timestamps = Object.keys(deviceData).sort();

        if (timestamps.length > 0) {
          setParameters(prev => {
            return prev.map(param => {
              const config = PARAMETER_CONFIG.find(c => c.id === param.id);
              if (!config) return param;

              const newValue = findLatestUsableValue(config, deviceData, timestamps, param.value);

              if (param.value !== newValue) {
                setLastUpdatedId(param.id);
                setTimeout(() => setLastUpdatedId(null), 1000);
                return {
                  ...param,
                  value: newValue
                };
              }
              return param;
            });
          });
        }
      }
    });

    return () => unsubscribe();
  }, [historicalData, selectedTimestamp]);

  return (
    <div className="w-full space-y-4 md:space-y-6">
      {historicalData && historicalData.length > 0 && (
        <div className="bg-white dark:bg-white/[0.02] rounded-2xl shadow-xl dark:shadow-2xl p-4 border border-slate-200 dark:border-white/5">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
            Select Time
          </label>
          <select
            value={selectedTimestamp}
            onChange={(e) => setSelectedTimestamp(e.target.value)}
            className="w-full px-3 md:px-4 py-2 md:py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-100"
          >
            {historicalData.map((data, idx) => (
              <option key={idx} value={data.timestamp}>
                {data.timestamp}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="w-full bg-white dark:bg-white/[0.02] rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
                <th className="px-3 md:px-6 lg:px-8 py-3 md:py-5 text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest w-[65%] md:w-[80%]">
                  Parameter
                </th>
                <th className="px-3 md:px-6 lg:px-8 py-3 md:py-5 text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-left">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-3 md:px-6 lg:px-8 py-8 md:py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-6 h-6 md:w-8 md:h-8 border-3 md:border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">Synchronizing with Matrix...</p>
                    </div>
                  </td>
                </tr>
              ) : parameters.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 md:px-6 lg:px-8 py-8 md:py-12 text-center">
                    <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">No sensor components detected.</p>
                  </td>
                </tr>
              ) : (
                parameters.map((param) => (
                  <tr 
                    key={param.id} 
                    className={cn(
                      "transition-all duration-500",
                      lastUpdatedId === param.id 
                        ? "bg-emerald-50 dark:bg-emerald-500/5" 
                        : "hover:bg-slate-50/50 dark:hover:bg-white/[0.01]"
                    )}
                  >
                    <td className="px-3 md:px-6 lg:px-8 py-3 md:py-4">
                      <div className="flex items-center space-x-2 md:space-x-3">
                        <span className="text-[9px] md:text-[10px] font-mono text-slate-400 dark:text-slate-600 w-3 md:w-4 flex-shrink-0">
                          {param.id.toString().padStart(2, '0')}
                        </span>
                        <span className="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 line-clamp-2">
                          {param.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 md:px-6 lg:px-8 py-3 md:py-4 text-left">
                      <div className="inline-flex items-baseline space-x-1 md:space-x-2">
                        <span className={cn(
                          "text-xs md:text-sm font-bold font-mono transition-all duration-300",
                          lastUpdatedId === param.id 
                            ? "text-emerald-600 dark:text-emerald-400" 
                            : "text-slate-900 dark:text-white"
                        )}>
                          {param.value}
                        </span>
                        {param.unit && (
                          <span className="text-[8px] md:text-[10px] font-medium text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {param.unit}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
