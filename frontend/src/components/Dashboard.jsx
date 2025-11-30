import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './Dashboard.css';
import MultiMunicipioSelector from './MultiMunicipioSelector';
import MultiMetricaSelector from './MultiMetricaSelector';
import MetricaSelector, { METRICAS } from './MetricaSelector';
import RadianzaChart from './RadianzaChart';
import DateRangeSlider from './DateRangeSlider';
import YearSelector from './YearSelector';
import BoxPlot from './BoxPlot';

// Usar /api en producción o variable de entorno (adaptado para Vite)
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

// Paleta de colores para municipios
const COLORS = [
  '#667eea',  '#764ba2',  '#e74c3c',  '#2ecc71',  '#f39c12',
  '#3498db',  '#9b59b6',  '#e67e22',  '#1abc9c',  '#c0392b',
  '#16a085',  '#d35400',  '#2980b9',  '#8e44ad',  '#27ae60'
];

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('visualizacion'); // 'visualizacion' o 'eda'
  const [municipios, setMunicipios] = useState([]);
  const [selectedMunicipios, setSelectedMunicipios] = useState([]);
  const [selectedMetricas, setSelectedMetricas] = useState(['Media_de_radianza']);
  const [selectedMetrica, setSelectedMetrica] = useState('Media_de_radianza'); // Para EDA
  const [municipioData, setMunicipioData] = useState([]);
  const [radianzaData, setRadianzaData] = useState([]); // Para EDA
  const [radianzaDataAll, setRadianzaDataAll] = useState([]); // Para box plot
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [edaDataLoaded, setEdaDataLoaded] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedMunicipios.length > 0) {
      loadMultipleMunicipioData(selectedMunicipios, selectedYear);
    }
  }, [selectedMunicipios, selectedYear]);

  // Cargar datos del EDA cuando se cambia a la pestaña EDA
  useEffect(() => {
    if (activeTab === 'eda' && !edaDataLoaded && municipios.length > 0) {
      loadEdaData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, edaDataLoaded, municipios.length]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Primero verificar que el backend esté disponible
      try {
        await axios.get(`${API_BASE_URL}/health`);
      } catch (healthErr) {
        setError('El backend no está disponible. Asegúrate de que esté ejecutándose en http://localhost:5000');
        setLoading(false);
        return;
      }

      const [municipiosRes, yearsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/municipios`),
        axios.get(`${API_BASE_URL}/years`)
      ]);

      if (municipiosRes.data.success) {
        setMunicipios(municipiosRes.data.municipios);
        if (municipiosRes.data.municipios.length > 0) {
          setSelectedMunicipios([municipiosRes.data.municipios[0]]);
        }
      } else {
        console.error('Error en municipios:', municipiosRes.data.error);
        setError(`Error al cargar municipios: ${municipiosRes.data.error}`);
      }

      if (yearsRes.data.success) {
        setYears(yearsRes.data.years);
        // Seleccionar el año más reciente por defecto
        if (yearsRes.data.years.length > 0) {
          setSelectedYear(yearsRes.data.years[0]);
        }
      } else {
        console.error('Error al cargar años:', yearsRes.data.error);
      }

    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Error desconocido';
      setError(`Error al cargar los datos: ${errorMessage}`);
      console.error('Error completo:', err);
      if (err.response?.data?.traceback) {
        console.error('Traceback:', err.response.data.traceback);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMultipleMunicipioData = async (municipiosList, year = null) => {
    try {
      const promises = municipiosList.map(municipio => {
        const params = {};
        if (year) {
          params.year = year;
        }
        return axios.get(`${API_BASE_URL}/municipio/${encodeURIComponent(municipio)}`, { params });
      });
      
      const responses = await Promise.all(promises);
      const allData = responses
        .filter(res => res.data.success)
        .flatMap(res => res.data.data);
      
      setMunicipioData(allData);
    } catch (err) {
      console.error('Error al cargar datos de municipios:', err);
    }
  };


  // Filtrar datos según el rango de fechas seleccionado
  const filteredMunicipioData = useMemo(() => {
    if (!dateRange || !municipioData || municipioData.length === 0) {
      return municipioData;
    }

    return municipioData.filter(item => {
      const fecha = item.Fecha?.split(' ')[0] || item.Fecha;
      if (!fecha) return false;
      
      const itemDate = new Date(fecha);
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      
      return itemDate >= startDate && itemDate <= endDate;
    });
  }, [municipioData, dateRange]);

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  const loadEdaData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedMunicipios.length > 0) {
        selectedMunicipios.forEach(municipio => {
          params.append('municipios', municipio);
        });
      }
      
      // Cargar datos filtrados
      const [filteredRes, allRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/data?${params.toString()}`),
        axios.get(`${API_BASE_URL}/data`, { params: { limit: 10000 } })
      ]);
      
      if (filteredRes.data.success) {
        setRadianzaData(filteredRes.data.data);
      }
      if (allRes.data.success) {
        setRadianzaDataAll(allRes.data.data);
      }
      
      setEdaDataLoaded(true);
    } catch (err) {
      console.error('Error cargando datos EDA:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadData = async () => {
    try {
      // Construir parámetros de la petición
      const params = new URLSearchParams();
      
      // Agregar municipios si están seleccionados
      if (selectedMunicipios.length > 0) {
        selectedMunicipios.forEach(municipio => {
          params.append('municipios', municipio);
        });
      }
      
      // Agregar año si está seleccionado
      if (selectedYear) {
        params.append('year', selectedYear);
      }
      
      // Agregar rango de fechas si está seleccionado
      if (dateRange) {
        if (dateRange.startDate) {
          params.append('from', dateRange.startDate);
        }
        if (dateRange.endDate) {
          params.append('to', dateRange.endDate);
        }
      }
      
      // Hacer la petición para descargar
      const response = await axios.get(`${API_BASE_URL}/download`, {
        params: params,
        responseType: 'blob'
      });
      
      // Crear URL temporal y descargar
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Obtener nombre de archivo del header Content-Disposition o usar uno por defecto
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'datos_radianza.csv';
      if (contentDisposition) {
        // Extraer el nombre del archivo del header Content-Disposition
        // Maneja tanto filename="archivo.csv" como filename=archivo.csv
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?([^'";]+)['"]?/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].trim();
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al descargar datos:', err);
      alert('Error al descargar los datos. Por favor, intenta nuevamente.');
    }
  };

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (loading && municipios.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="loading">Cargando datos...</div>
      </div>
    );
  }

  // Determinar si usar facetas (múltiples métricas)
  const useFacets = selectedMetricas.length > 1;
  const multipleMunicipios = selectedMunicipios.length > 1;

  // Estadísticas descriptivas para Radianza (EDA)
  const radianzaStats = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'eda') return null;
    
    const radianzaValues = radianzaData
      .map(d => parseFloat(d.Media_de_radianza))
      .filter(v => !isNaN(v) && v > 0);
    
    if (radianzaValues.length === 0) return null;

    const sorted = radianzaValues.slice().sort((a, b) => a - b);
    const sum = radianzaValues.reduce((a, b) => a + b, 0);
    const mean = sum / radianzaValues.length;
    const variance = radianzaValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / radianzaValues.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: radianzaValues.length,
      mean: mean.toFixed(2),
      median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
      stdDev: stdDev.toFixed(2),
      min: sorted[0].toFixed(2),
      max: sorted[sorted.length - 1].toFixed(2),
      q1: sorted[Math.floor(sorted.length * 0.25)].toFixed(2),
      q3: sorted[Math.floor(sorted.length * 0.75)].toFixed(2)
    };
  }, [radianzaData, activeTab]);

  // Histograma de Radianza (EDA)
  const radianzaHistogram = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'eda') return [];
    
    const sampleSize = Math.min(radianzaData.length, 2000);
    const sampledData = radianzaData.length > 2000 
      ? radianzaData.filter((_, i) => i % Math.ceil(radianzaData.length / sampleSize) === 0)
      : radianzaData;
    
    const radianzaValues = sampledData
      .map(d => parseFloat(d.Media_de_radianza))
      .filter(v => !isNaN(v) && v > 0);
    
    if (radianzaValues.length === 0) return [];
    
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < radianzaValues.length; i++) {
      const val = radianzaValues[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    
    const bins = 20;
    const binWidth = (max - min) / bins;
    
    const histogram = Array(bins).fill(0).map((_, i) => ({
      range: `${(min + i * binWidth).toFixed(0)} - ${(min + (i + 1) * binWidth).toFixed(0)}`,
      count: 0,
      mid: min + (i + 0.5) * binWidth
    }));
    
    radianzaValues.forEach(val => {
      const binIndex = Math.min(Math.floor((val - min) / binWidth), bins - 1);
      histogram[binIndex].count++;
    });
    
    return histogram;
  }, [radianzaData, activeTab]);

  // Serie temporal de Radianza (EDA)
  const radianzaTimeSeries = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'eda') return [];
    
    const grouped = new Map();
    for (let i = 0; i < radianzaData.length; i++) {
      const d = radianzaData[i];
      const fecha = d.Fecha?.split('T')[0] || d.Fecha;
      const radianza = parseFloat(d.Media_de_radianza);
      if (fecha && !isNaN(radianza) && radianza > 0) {
        const existing = grouped.get(fecha);
        if (existing) {
          existing.sum += radianza;
          existing.count += 1;
        } else {
          grouped.set(fecha, { fecha, sum: radianza, count: 1 });
        }
      }
    }
    
    return Array.from(grouped.values())
      .map(d => ({ fecha: d.fecha, promedio: d.sum / d.count }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [radianzaData, activeTab]);

  // Suma de Radianza por Año y Municipio (EDA)
  const sumaRadianzaPorAnioMunicipio = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'eda') return { chartData: [], municipios: [] };
    
    const grouped = new Map();
    const municipiosSet = new Set();
    
    for (let i = 0; i < radianzaData.length; i++) {
      const d = radianzaData[i];
      const fecha = d.Fecha?.split('T')[0] || d.Fecha || d.fecha;
      const municipio = (d.Municipio || d.municipio || '').toString().trim();
      const sumaRadianza = parseFloat(d.Suma_de_radianza);
      
      if (fecha && municipio && !isNaN(sumaRadianza) && sumaRadianza > 0) {
        const yearMatch = fecha.toString().match(/(\d{4})/);
        let year = yearMatch ? parseInt(yearMatch[1]) : null;
        
        if (!year || year < 2000 || year > 2100) {
          try {
            const dateObj = new Date(fecha);
            if (!isNaN(dateObj.getTime())) {
              year = dateObj.getFullYear();
            }
          } catch (e) {}
        }
        
        if (year && !isNaN(year) && year >= 2000 && year <= 2100) {
          municipiosSet.add(municipio);
          const key = `${year}-${municipio}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.suma += sumaRadianza;
          } else {
            grouped.set(key, { año: year, municipio, suma: sumaRadianza });
          }
        }
      }
    }
    
    const municipios = Array.from(municipiosSet).sort();
    const años = [...new Set(Array.from(grouped.values()).map(d => d.año))].sort((a, b) => a - b);
    
    const chartData = años.map(año => {
      const dataPoint = { año };
      municipios.forEach(municipio => {
        const key = `${año}-${municipio}`;
        const item = grouped.get(key);
        dataPoint[municipio] = item ? item.suma : null;
      });
      return dataPoint;
    });
    
    return { chartData, municipios };
  }, [radianzaData, activeTab]);

  // Box Plot Data (EDA)
  const boxPlotData = useMemo(() => {
    if (!radianzaDataAll || radianzaDataAll.length === 0 || activeTab !== 'eda') return [];
    
    const groupedByMunicipio = {};
    
    for (let i = 0; i < radianzaDataAll.length; i++) {
      const d = radianzaDataAll[i];
      const municipio = (d.Municipio || '').toString().trim();
      const valor = parseFloat(d[selectedMetrica]);
      
      if (municipio && !isNaN(valor) && valor > 0) {
        if (!groupedByMunicipio[municipio]) {
          groupedByMunicipio[municipio] = [];
        }
        groupedByMunicipio[municipio].push(valor);
      }
    }
    
    const boxPlotStats = Object.keys(groupedByMunicipio).map(municipio => {
      const values = groupedByMunicipio[municipio].sort((a, b) => a - b);
      const n = values.length;
      
      if (n === 0) return null;
      
      const min = values[0];
      const max = values[n - 1];
      const q1 = values[Math.floor(n * 0.25)];
      const median = values[Math.floor(n * 0.5)];
      const q3 = values[Math.floor(n * 0.75)];
      
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      
      const outliers = values.filter(v => v < lowerBound || v > upperBound);
      const whiskerMin = Math.max(min, lowerBound);
      const whiskerMax = Math.min(max, upperBound);
      
      return {
        municipio,
        min: whiskerMin,
        q1,
        median,
        q3,
        max: whiskerMax,
        outliers,
        count: n
      };
    }).filter(Boolean).sort((a, b) => b.median - a.median);
    
    return boxPlotStats;
  }, [radianzaDataAll, selectedMetrica, activeTab]);

  return (
    <div className="dashboard-container">
      {municipios.length === 0 && !loading && (
        <div className="loading">No hay municipios disponibles. Verifica la conexión con el backend.</div>
      )}
      
      {municipios.length > 0 && (
        <>
          <div className="eda-tabs">
            <button
              className={`eda-tab ${activeTab === 'visualizacion' ? 'active' : ''}`}
              onClick={() => setActiveTab('visualizacion')}
            >
              Visualización
            </button>
            <button
              className={`eda-tab ${activeTab === 'eda' ? 'active' : ''}`}
              onClick={() => setActiveTab('eda')}
            >
              EDA
            </button>
          </div>

      {municipios.length > 0 && (
        <div className="dashboard-controls">
          <div className="controls-row">
            <MultiMunicipioSelector
              municipios={municipios}
              selectedMunicipios={selectedMunicipios}
              onSelectMunicipios={setSelectedMunicipios}
            />
            {activeTab === 'visualizacion' ? (
              <>
                <MultiMetricaSelector
                  selectedMetricas={selectedMetricas}
                  onSelectMetricas={setSelectedMetricas}
                />
                <YearSelector
                  years={years}
                  selectedYear={selectedYear}
                  onSelectYear={setSelectedYear}
                />
              </>
            ) : (
              <MetricaSelector
                selectedMetrica={selectedMetrica}
                onSelectMetrica={setSelectedMetrica}
              />
            )}
          </div>
          {activeTab === 'visualizacion' && municipioData.length > 0 && (
            <div className="date-range-control">
              <DateRangeSlider 
                data={municipioData} 
                onRangeChange={handleDateRangeChange}
              />
            </div>
          )}
          {activeTab === 'visualizacion' && (
            <div className="chart-controls">
              <button 
                className={`toggle-markers-btn ${showMarkers ? 'active' : ''}`}
                onClick={() => setShowMarkers(!showMarkers)}
                title={showMarkers ? 'Ocultar markers' : 'Mostrar markers'}
              >
                {showMarkers ? '●' : '○'} {showMarkers ? 'Ocultar Markers' : 'Mostrar Markers'}
              </button>
              <button 
                className="download-btn"
                onClick={handleDownloadData}
                title="Descargar datos filtrados como CSV"
              >
                ⬇ Descargar Datos
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'visualizacion' && (
        <div className="charts-grid">
        {municipioData.length === 0 ? (
          <div className="chart-card">
            <div className="no-data">No hay datos disponibles. Selecciona un municipio y año para ver los gráficos.</div>
          </div>
        ) : useFacets ? (
          // Facetas: un gráfico por métrica
          selectedMetricas.map((metrica) => {
            const metricaLabel = METRICAS.find(m => m.value === metrica)?.label || metrica;
            return (
              <div key={metrica} className="chart-card">
                <h2>{metricaLabel}</h2>
                {multipleMunicipios && (
                  <p className="chart-subtitle">
                    Municipios: {selectedMunicipios.join(', ')}
                  </p>
                )}
                <RadianzaChart 
                  data={filteredMunicipioData} 
                  selectedMetrica={metrica}
                  multipleMunicipios={multipleMunicipios}
                  showMarkers={showMarkers}
                />
              </div>
            );
          })
        ) : (
          // Sin facetas: un solo gráfico con la métrica seleccionada
          <div className="chart-card">
            <h2>{METRICAS.find(m => m.value === selectedMetricas[0])?.label || selectedMetricas[0]}</h2>
            {multipleMunicipios && (
              <p className="chart-subtitle">
                Municipios: {selectedMunicipios.join(', ')}
              </p>
            )}
            <RadianzaChart 
              data={filteredMunicipioData} 
              selectedMetrica={selectedMetricas[0] || 'Media_de_radianza'}
              multipleMunicipios={multipleMunicipios}
              showMarkers={showMarkers}
            />
          </div>
        )}
      </div>
      )}

      {activeTab === 'eda' && (
        <div className="eda-content">
          <h2>
            Análisis Exploratorio de Datos - Radianza
            {selectedMunicipios.length > 0 && selectedMunicipios.length < municipios.length && (
              <span className="municipio-filter-indicator">
                {' '}({selectedMunicipios.length} {selectedMunicipios.length === 1 ? 'municipio' : 'municipios'} seleccionado{selectedMunicipios.length === 1 ? '' : 's'})
              </span>
            )}
          </h2>
          
          {loading && !edaDataLoaded && (
            <div className="loading">Cargando datos para análisis exploratorio...</div>
          )}
          
          {!loading && radianzaData.length === 0 && edaDataLoaded && (
            <div className="no-data">No hay datos disponibles para el análisis exploratorio.</div>
          )}
          
          {radianzaStats && (
            <div className="stats-card">
              <h3>Estadísticas Descriptivas</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Número de registros:</span>
                  <span className="stat-value">{radianzaStats.count}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Media:</span>
                  <span className="stat-value">{radianzaStats.mean}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Mediana:</span>
                  <span className="stat-value">{radianzaStats.median}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Desviación Estándar:</span>
                  <span className="stat-value">{radianzaStats.stdDev}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Mínimo:</span>
                  <span className="stat-value">{radianzaStats.min}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Máximo:</span>
                  <span className="stat-value">{radianzaStats.max}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Q1 (Percentil 25):</span>
                  <span className="stat-value">{radianzaStats.q1}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Q3 (Percentil 75):</span>
                  <span className="stat-value">{radianzaStats.q3}</span>
                </div>
              </div>
            </div>
          )}

          <div className="chart-card">
            <h3>Distribución de Radianza (Histograma)</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={radianzaHistogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#764ba2" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Serie Temporal de Radianza</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={radianzaTimeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="promedio" stroke="#764ba2" strokeWidth={2} name="Radianza Promedio" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Distribución de {METRICAS.find(m => m.value === selectedMetrica)?.label || selectedMetrica} por Municipio</h3>
            <p className="chart-subtitle" style={{ fontStyle: 'italic', color: '#666', marginBottom: '1rem' }}>
              (No afectado por filtros de municipio o año)
            </p>
            <BoxPlot 
              data={boxPlotData}
              yAxisLabel={METRICAS.find(m => m.value === selectedMetrica)?.label || selectedMetrica}
              height={Math.max(500, boxPlotData.length * 40)}
            />
          </div>

          <div className="chart-card">
            <h3>Suma de Radianza por Año y Municipio</h3>
            <ResponsiveContainer width="100%" height={500}>
              <LineChart data={sumaRadianzaPorAnioMunicipio.chartData} margin={{ top: 20, right: 30, left: 80, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="año" 
                  type="number"
                  scale="linear"
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'Año', position: 'insideBottom', offset: -5 }}
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  label={{ value: 'Suma de Radianza', angle: -90, position: 'insideLeft' }}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                    return value.toString();
                  }}
                />
                <Tooltip 
                  formatter={(value, name) => {
                    if (value === null || value === undefined) return 'N/A';
                    return [`${value.toLocaleString('es-MX')}`, name];
                  }}
                  labelFormatter={(label) => `Año: ${label}`}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                />
                {sumaRadianzaPorAnioMunicipio.municipios.map((municipio, index) => {
                  const color = COLORS[index % COLORS.length];
                  return (
                    <Line
                      key={municipio}
                      type="monotone"
                      dataKey={municipio}
                      stroke={color}
                      strokeWidth={2}
                      name={municipio}
                      dot={false}
                      connectNulls={true}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}
        </>
      )}
    </div>
  );
};

export default Dashboard;

