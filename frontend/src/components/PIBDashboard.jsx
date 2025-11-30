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
import DateRangeSlider from './DateRangeSlider';
import RadianzaChart from './RadianzaChart';

// Usar /api en producción o variable de entorno (adaptado para Vite)
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

// Métrica fija: solo PIB Municipal
const SELECTED_METRICA = 'pib_mun';

const PIBDashboard = () => {
  const [activeTab, setActiveTab] = useState('visualizacion'); // 'visualizacion' o 'eda'
  const [municipios, setMunicipios] = useState([]);
  const [selectedMunicipios, setSelectedMunicipios] = useState([]);
  const [municipioData, setMunicipioData] = useState([]);
  const [pibData, setPibData] = useState([]); // Para EDA
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [edaDataLoaded, setEdaDataLoaded] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedMunicipios.length > 0) {
      loadMultipleMunicipioData(selectedMunicipios);
    }
  }, [selectedMunicipios]);

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
      
      try {
        await axios.get(`${API_BASE_URL}/health`);
      } catch (healthErr) {
        setError('El backend no está disponible. Asegúrate de que esté ejecutándose en http://localhost:5000');
        setLoading(false);
        return;
      }

      const municipiosRes = await axios.get(`${API_BASE_URL}/pib/municipios`);

      if (municipiosRes.data.success) {
        setMunicipios(municipiosRes.data.municipios);
        if (municipiosRes.data.municipios.length > 0) {
          setSelectedMunicipios([municipiosRes.data.municipios[0]]);
        }
      } else {
        console.error('Error en municipios:', municipiosRes.data.error);
        setError(`Error al cargar municipios: ${municipiosRes.data.error}`);
      }

    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Error desconocido';
      setError(`Error al cargar los datos: ${errorMessage}`);
      console.error('Error completo:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMultipleMunicipioData = async (municipiosList) => {
    try {
      // Cargar todos los años (sin filtro)
      const promises = municipiosList.map(municipio => {
        return axios.get(`${API_BASE_URL}/pib/municipio/${encodeURIComponent(municipio)}`);
      });
      
      const responses = await Promise.all(promises);
      const allData = responses
        .filter(res => res.data.success)
        .flatMap(res => res.data.data.map(item => ({
          ...item,
          Fecha: item.fecha, // Normalizar nombre de columna para el gráfico
          Municipio: item.municipio,
          [SELECTED_METRICA]: item[SELECTED_METRICA] // Asegurar que la métrica esté disponible
        })));
      
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
      const fecha = item.fecha || item.Fecha;
      if (!fecha) return false;
      
      const itemDate = new Date(fecha);
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      
      return itemDate >= startDate && itemDate <= endDate;
    });
  }, [municipioData, dateRange]);

  const loadEdaData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedMunicipios.length > 0) {
        selectedMunicipios.forEach(municipio => {
          params.append('municipios', municipio);
        });
      }
      
      const response = await axios.get(`${API_BASE_URL}/pib/data?${params.toString()}`);
      
      if (response.data.success) {
        setPibData(response.data.data);
        setEdaDataLoaded(true);
      }
    } catch (err) {
      console.error('Error cargando datos EDA:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
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
      const response = await axios.get(`${API_BASE_URL}/pib/download`, {
        params: params,
        responseType: 'blob'
      });
      
      // Crear URL temporal y descargar
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Obtener nombre de archivo del header Content-Disposition o usar uno por defecto
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'datos_pib.csv';
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

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Cargando datos de PIB...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  const multipleMunicipios = selectedMunicipios.length > 1;

  // Estadísticas descriptivas para PIB (EDA)
  const pibStats = useMemo(() => {
    if (!pibData || pibData.length === 0 || activeTab !== 'eda') return null;
    
    const pibValues = pibData
      .map(d => parseFloat(d.pib_mun))
      .filter(v => !isNaN(v) && v > 0);
    
    if (pibValues.length === 0) return null;

    const sorted = pibValues.slice().sort((a, b) => a - b);
    const sum = pibValues.reduce((a, b) => a + b, 0);
    const mean = sum / pibValues.length;
    const variance = pibValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pibValues.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: pibValues.length,
      mean: mean.toFixed(2),
      median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
      stdDev: stdDev.toFixed(2),
      min: sorted[0].toFixed(2),
      max: sorted[sorted.length - 1].toFixed(2),
      q1: sorted[Math.floor(sorted.length * 0.25)].toFixed(2),
      q3: sorted[Math.floor(sorted.length * 0.75)].toFixed(2)
    };
  }, [pibData, activeTab]);

  // Histograma de PIB (EDA)
  const pibHistogram = useMemo(() => {
    if (!pibData || pibData.length === 0 || activeTab !== 'eda') return [];
    
    const sampleSize = Math.min(pibData.length, 2000);
    const sampledData = pibData.length > 2000 
      ? pibData.filter((_, i) => i % Math.ceil(pibData.length / sampleSize) === 0)
      : pibData;
    
    const pibValues = sampledData
      .map(d => parseFloat(d.pib_mun))
      .filter(v => !isNaN(v) && v > 0);
    
    if (pibValues.length === 0) return [];
    
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pibValues.length; i++) {
      const val = pibValues[i];
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
    
    pibValues.forEach(val => {
      const binIndex = Math.min(Math.floor((val - min) / binWidth), bins - 1);
      histogram[binIndex].count++;
    });
    
    return histogram;
  }, [pibData, activeTab]);

  // Serie temporal de PIB (EDA)
  const pibTimeSeries = useMemo(() => {
    if (!pibData || pibData.length === 0 || activeTab !== 'eda') return [];
    
    const grouped = new Map();
    for (let i = 0; i < pibData.length; i++) {
      const d = pibData[i];
      const fecha = d.fecha?.split('T')[0] || d.fecha;
      const pib = parseFloat(d.pib_mun);
      if (fecha && !isNaN(pib) && pib > 0) {
        const existing = grouped.get(fecha);
        if (existing) {
          existing.sum += pib;
          existing.count += 1;
        } else {
          grouped.set(fecha, { fecha, sum: pib, count: 1 });
        }
      }
    }
    
    return Array.from(grouped.values())
      .map(d => ({ fecha: d.fecha, promedio: d.sum / d.count }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [pibData, activeTab]);

  return (
    <div className="dashboard-container">
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

      <div className="dashboard-controls">
        <div className="controls-row">
          <MultiMunicipioSelector
            municipios={municipios}
            selectedMunicipios={selectedMunicipios}
            onSelectMunicipios={setSelectedMunicipios}
          />
        </div>
        {activeTab === 'visualizacion' && municipioData.length > 0 && (
          <div className="date-range-control">
            <DateRangeSlider 
              data={municipioData.map(item => ({ Fecha: item.fecha || item.Fecha }))} 
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

      {activeTab === 'visualizacion' && (
        <div className="charts-grid">
        <div className="chart-card">
          <h2>PIB Municipal</h2>
          {multipleMunicipios && (
            <p className="chart-subtitle">
              Municipios: {selectedMunicipios.join(', ')}
            </p>
          )}
          <RadianzaChart 
            data={filteredMunicipioData.map(item => ({
              Fecha: item.fecha || item.Fecha,
              Municipio: item.municipio || item.Municipio,
              [SELECTED_METRICA]: item[SELECTED_METRICA]
            }))} 
            selectedMetrica={SELECTED_METRICA}
            multipleMunicipios={multipleMunicipios}
            showMarkers={showMarkers}
          />
        </div>
      </div>
      )}

      {activeTab === 'eda' && (
        <div className="eda-content">
          <h2>
            Análisis Exploratorio de Datos - PIB
            {selectedMunicipios.length > 0 && selectedMunicipios.length < municipios.length && (
              <span className="municipio-filter-indicator">
                {' '}({selectedMunicipios.length} {selectedMunicipios.length === 1 ? 'municipio' : 'municipios'} seleccionado{selectedMunicipios.length === 1 ? '' : 's'})
              </span>
            )}
          </h2>
          
          {pibStats && (
            <div className="stats-card">
              <h3>Estadísticas Descriptivas</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Número de registros:</span>
                  <span className="stat-value">{pibStats.count}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Media:</span>
                  <span className="stat-value">{pibStats.mean}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Mediana:</span>
                  <span className="stat-value">{pibStats.median}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Desviación Estándar:</span>
                  <span className="stat-value">{pibStats.stdDev}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Mínimo:</span>
                  <span className="stat-value">{pibStats.min}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Máximo:</span>
                  <span className="stat-value">{pibStats.max}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Q1 (Percentil 25):</span>
                  <span className="stat-value">{pibStats.q1}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Q3 (Percentil 75):</span>
                  <span className="stat-value">{pibStats.q3}</span>
                </div>
              </div>
            </div>
          )}

          <div className="chart-card">
            <h3>Distribución de PIB (Histograma)</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={pibHistogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#667eea" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Serie Temporal de PIB</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={pibTimeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="promedio" stroke="#667eea" strokeWidth={2} name="PIB Promedio" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PIBDashboard;

