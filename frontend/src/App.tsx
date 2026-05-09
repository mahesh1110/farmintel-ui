import { useState, useEffect } from 'react';
import DataTable from './components/DataTable';
import { Sun, Moon, Download, Cloud, ThermometerSun, Droplets, Wind } from 'lucide-react';
import { ref, onValue, get, db } from './lib/firebase';
import { exportToCSV, generateFallbackValue } from './lib/utils';
import type { SensorData, WeatherData } from './lib/utils';

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

const WEATHER_FIELD_ALIASES: Record<string, string[]> = {
  cloudiness: ['cloudiness', 'clouds', 'cloud_pct', 'cloudPercent', 'cloud_percent'],
  feelsLike: ['feels_like', 'feelsLike', 'feels_like_c', 'feels_like_celsius', 'apparent_temperature'],
  temperature: ['temperature', 'temp', 'temperature_c', 'air_temperature', 'air_temp'],
  rainfall: ['rainfall', 'rain', 'rain_mm', 'rainfall_mm', 'precipitation'],
  windspeed: ['windspeed', 'wind_speed', 'windSpeed', 'wind_kph', 'wind_mps'],
};

const EMPTY_WEATHER: WeatherData = {
  cloudiness: '---',
  feelsLike: '---',
  temperature: '---',
  rainfall: '---',
  windspeed: '---',
};

function getWeatherCandidateKeys(field: keyof WeatherData) {
  return WEATHER_FIELD_ALIASES[field] ?? [field];
}

function readNestedValue(source: any, keys: string[]) {
  const queue: any[] = [source];
  const visited = new Set<any>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const key of keys) {
      const value = current[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return undefined;
}

function formatWeatherValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '---';
  }

  if (typeof value === 'number') {
    const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');
    return formatted;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : '---';
}

function extractWeatherSnapshot(source: any): WeatherData {
  return {
    cloudiness: formatWeatherValue(readNestedValue(source, getWeatherCandidateKeys('cloudiness'))),
    feelsLike: formatWeatherValue(readNestedValue(source, getWeatherCandidateKeys('feelsLike'))),
    temperature: formatWeatherValue(readNestedValue(source, getWeatherCandidateKeys('temperature'))),
    rainfall: formatWeatherValue(readNestedValue(source, getWeatherCandidateKeys('rainfall'))),
    windspeed: formatWeatherValue(readNestedValue(source, getWeatherCandidateKeys('windspeed'))),
  };
}

function App() {
  const [isDark, setIsDark] = useState(true);
  const [location, setLocation] = useState<{ lat: string; lon: string; date: string; time: string } | null>(null);
  const [weather, setWeather] = useState<WeatherData>(EMPTY_WEATHER);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [historicalData, setHistoricalData] = useState<SensorData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Fetch available dates from Firebase
  useEffect(() => {
    const deviceRef = ref(db, "device_001");
    const unsubscribe = onValue(deviceRef, (snapshot) => {
      const deviceData = snapshot.val();
      if (deviceData) {
        const timestamps = Object.keys(deviceData).sort();
        const latestKey = timestamps[timestamps.length - 1];
        const latestData = deviceData[latestKey];
        
        // Extract date (YYYY-MM-DD)
        const dateStr = latestKey?.split('T')[0] || latestKey?.split(' ')[0] || '';
        
        // Robust time extraction from "YYYY-MM-DDTHH-mm-ss" or "YYYY-MM-DD HH:mm:ss"
        const timePart = latestKey?.includes('T') ? latestKey.split('T')[1] : 
                         latestKey?.includes(' ') ? latestKey.split(' ')[1] : latestKey;
        
        // Clean up dashes to colons (e.g., 10-41-18 -> 10:41:18)
        const timeStr = timePart?.replace(/-/g, ':') || "00:00:00";

        setLocation({
          lat: latestData?.location?.lat?.toString() || "0",
          lon: latestData?.location?.long?.toString() || "0",
          date: dateStr,
          time: timeStr
        });
        setWeather(extractWeatherSnapshot(latestData));

        // Extract unique dates from timestamps
        const dates = new Set<string>();
        timestamps.forEach(ts => {
          const date = ts.split('T')[0] || ts.split(' ')[0];
          if (date) dates.add(date);
        });
        setAvailableDates(Array.from(dates).sort().reverse());
        
        // Set default selected date to latest date only once on first load
        setSelectedDate(prev => {
          if (!prev && dates.size > 0) {
            const latestDate = Array.from(dates).sort().reverse()[0];
            return latestDate;
          }
          return prev;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchHistoricalData = async (date: string) => {
    setIsLoading(true);
    try {
      const deviceRef = ref(db, "device_001");
      const snapshot = await get(deviceRef);
      const deviceData = snapshot.val();

      if (!deviceData) {
        alert('No data available');
        setIsLoading(false);
        return;
      }

      // Filter entries for selected date
      const timestamps = Object.keys(deviceData)
        .filter(ts => ts.startsWith(date))
        .sort();

      if (timestamps.length === 0) {
        alert(`No data found for date: ${date}`);
        setIsLoading(false);
        return;
      }

      // Process data for all timestamps on selected date
      const processedData: SensorData[] = timestamps.map(timestamp => {
        const data = deviceData[timestamp];
        const timePart = timestamp.includes('T') ? timestamp.split('T')[1] : 
                        timestamp.includes(' ') ? timestamp.split(' ')[1] : timestamp;
        const displayTime = timePart?.replace(/-/g, ':') || "00:00:00";

        const parameters = PARAMETER_CONFIG.map(config => {
          let rawValue: any;
          if (config.path) {
            const pathParts = config.path.split('/');
            let target = data;
            for (const part of pathParts) {
              if (part) target = target?.[part];
            }
            rawValue = target?.[config.key];
          } else {
            rawValue = data[config.key];
          }

          let displayValue = rawValue;
          if (config.key === "Ph" && typeof rawValue === 'number') {
            displayValue = rawValue / 10;
          }

          let value: string;
          if (typeof displayValue === 'number') {
            value = displayValue.toFixed(1).replace(/\.0$/, '');
          } else if (displayValue !== undefined && displayValue !== null) {
            value = String(displayValue);
          } else {
            // Use fallback value for missing data
            value = generateFallbackValue(config.key);
          }

          return {
            name: config.name,
            value,
            unit: config.unit
          };
        });

        return {
          timestamp: displayTime,
          parameters
        };
      });

      setHistoricalData(processedData);
      setShowHistorical(true);
    } catch (error) {
      console.error('Error fetching historical data:', error);
      alert('Error fetching data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-slate-50 dark:bg-[#0B0E14] flex flex-col items-center py-6 md:py-12 px-4 md:px-6">
      <div className="w-full max-w-3xl space-y-5 md:space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-y-3 md:gap-y-0 w-full">
          <div className="flex flex-col md:flex-row md:items-center gap-y-3 md:gap-y-0 md:space-x-12">
            <div className="flex items-start justify-between w-full md:w-auto">
              <div className="w-[100px] md:w-[120px]">
                <img
                  src="/firmintel_logo.png"
                  alt="FarmIntel Logo"
                  className="w-[140%] h-auto max-w-none object-contain mb-1"
                />
              </div>
              
              <div className="md:hidden">
                <button 
                  onClick={() => setIsDark(!isDark)}
                  className="p-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 shadow-sm"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </div>
            
            {location && (
              <div className="flex flex-col gap-4 border-t md:border-t-0 md:border-l border-slate-200 dark:border-white/10 pt-3 md:pt-0 md:pl-8 w-full md:max-w-[700px]">
                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 md:gap-x-8">
                  <div className="flex flex-col">
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Latitude</span>
                    <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.lat}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Longitude</span>
                    <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.lon}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date</span>
                    <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.date}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Time</span>
                    <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.time}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 md:gap-6">
                  {[
                    { label: 'Cloud', value: weather.cloudiness, icon: Cloud },
                    { label: 'Feels', value: weather.feelsLike, icon: ThermometerSun },
                    { label: 'Temp', value: weather.temperature, icon: Sun },
                    { label: 'Rain', value: weather.rainfall, icon: Droplets },
                    { label: 'Wind', value: weather.windspeed, icon: Wind },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="flex items-center gap-2">
                        <Icon size={18} className="text-emerald-500 shrink-0" />
                        <div className="flex flex-col">
                          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                            {item.label}
                          </div>
                          <div className="text-sm md:text-base font-semibold text-slate-900 dark:text-white">
                            {item.value}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:block self-start pt-1">
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:scale-105 transition-all shadow-sm"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {/* Historical Data Controls */}
        <div className="w-full bg-white dark:bg-white/[0.02] rounded-2xl shadow-xl dark:shadow-2xl p-4 md:p-6 border border-slate-200 dark:border-white/5 space-y-3 md:space-y-4">
          <div className="flex flex-col gap-2 md:gap-3">
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Select Date
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 md:px-4 py-2 md:py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-100"
              >
                {availableDates.map(date => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => fetchHistoricalData(selectedDate)}
                disabled={isLoading || !selectedDate}
                className="flex-1 px-3 md:px-4 py-2 md:py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors text-xs md:text-sm whitespace-nowrap"
              >
                {isLoading ? 'Loading...' : 'Fetch Data'}
              </button>
              <button
                onClick={() => {
                  if (historicalData.length > 0) {
                      exportToCSV(historicalData, selectedDate, weather);
                  } else {
                    alert('Please fetch data first');
                  }
                }}
                disabled={historicalData.length === 0}
                className="flex-1 px-3 md:px-4 py-2 md:py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors text-xs md:text-sm flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap"
              >
                <Download size={14} className="md:w-4 md:h-4" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </button>
            </div>
          </div>
        </div>

        <main>
          {showHistorical ? (
            <DataTable historicalData={historicalData} />
          ) : (
            <DataTable />
          )}
        </main>
        
        <footer className="text-center pt-4 md:pt-8">
          <p className="text-slate-400 dark:text-slate-600 text-[9px] md:text-[10px] font-bold uppercase tracking-widest">
            © 2026 FarmIntel Systems
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;