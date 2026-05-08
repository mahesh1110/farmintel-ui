import { useState, useEffect } from 'react';
import DataTable from './components/DataTable';
import { Sun, Moon, Download } from 'lucide-react';
import { ref, onValue, get, db } from './lib/firebase';
import { exportToCSV } from './lib/utils';
import type { SensorData } from './lib/utils';

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

function App() {
  const [isDark, setIsDark] = useState(true);
  const [location, setLocation] = useState<{ lat: string; lon: string; lastUpdated: string } | null>(null);
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
        
        // Robust time extraction from "YYYY-MM-DDTHH-mm-ss" or "YYYY-MM-DD HH:mm:ss"
        const timePart = latestKey?.includes('T') ? latestKey.split('T')[1] : 
                         latestKey?.includes(' ') ? latestKey.split(' ')[1] : latestKey;
        
        // Clean up dashes to colons (e.g., 10-41-18 -> 10:41:18)
        const timestamp = timePart?.replace(/-/g, ':') || "00:00:00";

        setLocation({
          lat: latestData?.location?.lat?.toString() || "0",
          lon: latestData?.location?.long?.toString() || "0",
          lastUpdated: timestamp
        });

        // Extract unique dates from timestamps
        const dates = new Set<string>();
        timestamps.forEach(ts => {
          const date = ts.split('T')[0] || ts.split(' ')[0];
          if (date) dates.add(date);
        });
        setAvailableDates(Array.from(dates).sort().reverse());
        
        // Set default selected date to latest date
        if (!selectedDate && dates.size > 0) {
          const latestDate = Array.from(dates).sort().reverse()[0];
          setSelectedDate(latestDate);
        }
      }
    });
    return () => unsubscribe();
  }, [selectedDate]);

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
            value = '---';
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
    <div className="min-h-screen transition-colors duration-300 bg-slate-50 dark:bg-[#0B0E14] flex flex-col items-center py-12 px-6">
      <div className="w-full max-w-3xl space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-y-6 md:gap-y-0 w-full">
          <div className="flex flex-col md:flex-row md:items-center gap-y-4 md:gap-y-0 md:space-x-12">
            <div className="flex items-start justify-between w-full md:w-auto">
              <div className="w-[110px] md:w-[120px]">
                <img
                  src="/firmintel_logo.png"
                  alt="FarmIntel Logo"
                  className="w-[140%] h-auto max-w-none object-contain mb-1"
                />
              </div>
              
              <div className="md:hidden">
                <button 
                  onClick={() => setIsDark(!isDark)}
                  className="p-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 shadow-sm"
                >
                  {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>
            </div>
            
            {location && (
              <div className="flex flex-wrap md:flex-nowrap items-center gap-y-4 gap-x-6 md:gap-x-10 border-t md:border-t-0 md:border-l border-slate-200 dark:border-white/10 pt-4 md:pt-0 md:pl-10">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Latitude</span>
                  <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.lat}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Longitude</span>
                  <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.lon}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Last Sync</span>
                  <span className="text-xs md:text-sm font-mono font-bold text-emerald-500">{location.lastUpdated}</span>
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:scale-105 transition-all shadow-sm"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {/* Historical Data Controls */}
        <div className="w-full bg-white dark:bg-white/[0.02] rounded-2xl shadow-xl dark:shadow-2xl p-6 border border-slate-200 dark:border-white/5 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Select Date
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-100"
              >
                {availableDates.map(date => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button
                onClick={() => fetchHistoricalData(selectedDate)}
                disabled={isLoading || !selectedDate}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {isLoading ? 'Loading...' : 'Fetch Data'}
              </button>
              <button
                onClick={() => {
                  if (historicalData.length > 0) {
                    exportToCSV(historicalData, selectedDate);
                  } else {
                    alert('Please fetch data first');
                  }
                }}
                disabled={historicalData.length === 0}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
              >
                <Download size={16} />
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
        
        <footer className="text-center pt-8">
          <p className="text-slate-400 dark:text-slate-600 text-[10px] font-bold uppercase tracking-widest">
            © 2026 FarmIntel Systems
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;