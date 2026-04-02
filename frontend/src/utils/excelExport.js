// No need for XLSX library for CSV export

/**
 * Flatten a single sensor data tick into a row object for Excel export.
 * Produces one row per timestamp with all sensor readings as columns.
 * Missing/null values are recorded as "NA" with status "NA".
 */
export function flattenSensorReading(sensorRaw, sessionId, sessionName) {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

  const safeVal = (v) => (v !== null && v !== undefined && !Number.isNaN(v)) ? v : 'NA';
  const status = (v) => (v !== null && v !== undefined && !Number.isNaN(v)) ? 'Valid' : 'NA';

  return {
    'Session ID': `${sessionName}-${String(sessionId).padStart(3, '0')}`,
    'Timestamp': timestamp,
    'N (mg/kg)': safeVal(sensorRaw?.N),
    'N Status': status(sensorRaw?.N),
    'P (mg/kg)': safeVal(sensorRaw?.P),
    'P Status': status(sensorRaw?.P),
    'K (mg/kg)': safeVal(sensorRaw?.K),
    'K Status': status(sensorRaw?.K),
    'pH': safeVal(sensorRaw?.pH),
    'pH Status': status(sensorRaw?.pH),
    'Moisture (%)': safeVal(sensorRaw?.moisture),
    'Moisture Status': status(sensorRaw?.moisture),
    'Light (lux)': safeVal(sensorRaw?.light_lux),
    'Light Status': status(sensorRaw?.light_lux),
    'Pressure (hPa)': safeVal(sensorRaw?.pressure_hpa),
    'Pressure Status': status(sensorRaw?.pressure_hpa),
    'Ambient Temp (°C)': safeVal(sensorRaw?.dht22?.temp_c),
    'Temp Status': status(sensorRaw?.dht22?.temp_c),
    'Humidity (%)': safeVal(sensorRaw?.dht22?.humidity),
    'Humidity Status': status(sensorRaw?.dht22?.humidity),
    'Soil Probe (°C)': safeVal(sensorRaw?.ds18b20?.temp_c),
    'Soil Probe Status': status(sensorRaw?.ds18b20?.temp_c),
    'Rain Intensity': safeVal(sensorRaw?.rain?.intensity),
    'Rain Signal': safeVal(sensorRaw?.rain?.raw),
    'Rain Status': status(sensorRaw?.rain?.intensity),
  };
}

/**
 * Export recorded data array to a CSV file.
 * Uses dynamic naming: [testName]_[date]_[sessionTime].csv
 * 
 * @param {Array} recordedData - Array of flattened row objects
 * @param {string} testName - User-defined test name
 * @param {Date} sessionStart - When recording started
 * @returns {{ success: boolean, filename?: string, error?: string }}
 */
export function exportToCSV(recordedData, testName, sessionStart) {
  try {
    if (!recordedData || recordedData.length === 0) {
      return { success: false, error: 'No recorded data to export.' };
    }

    // Dynamic filename: test1_2026-04-02_18-42.csv
    const now = sessionStart || new Date();
    const dateStr = now.toISOString().substring(0, 10); // 2026-04-02
    const timeStr = now.toTimeString().substring(0, 5).replace(':', '-'); // 18-42
    const safeName = (testName || 'test').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}_${dateStr}_${timeStr}.csv`;

    const headers = Object.keys(recordedData[0]);
    const csvContent = [
      headers.join(','),
      ...recordedData.map(row => 
        headers.map(header => {
          let cell = row[header] === null || row[header] === undefined ? '' : row[header].toString();
          // Escape quotes and commas
          cell = cell.replace(/"/g, '""');
          if (cell.search(/("|,|\n)/g) >= 0) {
            cell = `"${cell}"`;
          }
          return cell;
        }).join(',')
      )
    ].join('\n');

    // Trigger browser download via Blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return { success: true, filename };
  } catch (err) {
    console.error('CSV export failed:', err);
    return { success: false, error: err.message || 'Export failed unexpectedly.' };
  }
}
