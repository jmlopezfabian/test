import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';
import MultiMunicipioSelector from './MultiMunicipioSelector';
import MetricaSelector, { METRICAS } from './MetricaSelector';
import BoxPlot from './BoxPlot';
import './Dashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

// Paleta de colores para municipios
const COLORS = [
  '#667eea',  // Azul morado
  '#764ba2',  // Morado
  '#e74c3c',  // Rojo
  '#2ecc71',  // Verde
  '#f39c12',  // Naranja
  '#3498db',  // Azul
  '#9b59b6',  // Morado oscuro
  '#e67e22',  // Naranja oscuro
  '#1abc9c',  // Turquesa
  '#c0392b',  // Rojo oscuro
  '#16a085',  // Verde esmeralda
  '#d35400',  // Naranja rojizo
  '#2980b9',  // Azul oscuro
  '#8e44ad',  // Púrpura
  '#27ae60'   // Verde oscuro
];

const EDADashboard = () => {
  const [municipios, setMunicipios] = useState([]);
  const [selectedMunicipios, setSelectedMunicipios] = useState([]);
  const [selectedMetrica, setSelectedMetrica] = useState('Media_de_radianza');
  const [radianzaData, setRadianzaData] = useState([]);
  const [radianzaDataAll, setRadianzaDataAll] = useState([]); // Datos sin filtrar para box plot
  const [pibData, setPibData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('pib'); // 'pib', 'radianza', 'comparison'
  const [dataLoaded, setDataLoaded] = useState({
    pib: false,
    radianza: false,
    comparison: false
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  // Debounce para cambios de municipios
  useEffect(() => {
    if (municipios.length === 0) return;
    
    // Resetear flags de carga cuando cambian los municipios
    setDataLoaded({ pib: false, radianza: false, comparison: false });
    
    const timeoutId = setTimeout(() => {
      loadDataForActiveTab();
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMunicipios]);

  // Cargar datos cuando cambia la pestaña (solo si no están cargados)
  useEffect(() => {
    if (municipios.length > 0 && !dataLoaded[activeTab]) {
      loadDataForActiveTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataLoaded]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Cargar lista de municipios
      const [radianzaMunicipiosRes, pibMunicipiosRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/municipios`),
        axios.get(`${API_BASE_URL}/pib/municipios`)
      ]);

      // Combinar listas de municipios (usar los de radianza como base)
      const radianzaMunicipios = radianzaMunicipiosRes.data.success 
        ? radianzaMunicipiosRes.data.municipios 
        : [];
      const pibMunicipios = pibMunicipiosRes.data.success 
        ? pibMunicipiosRes.data.municipios 
        : [];
      
      // Unir ambas listas y eliminar duplicados
      const allMunicipios = [...new Set([...radianzaMunicipios, ...pibMunicipios])].sort();
      setMunicipios(allMunicipios);
      
      // Seleccionar todos por defecto
      setSelectedMunicipios(allMunicipios);
      
      setLoading(false);
    } catch (err) {
      console.error('Error cargando municipios:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Función auxiliar para construir parámetros
  const buildParams = (includeLimit = false) => {
    const params = new URLSearchParams();
    if (includeLimit) {
      // Reducir el límite para mejorar rendimiento
      params.append('limit', '5000');
    }
    if (selectedMunicipios.length > 0 && selectedMunicipios.length < municipios.length) {
      selectedMunicipios.forEach(municipio => {
        params.append('municipios', municipio);
      });
    }
    return params;
  };

  const loadDataForActiveTab = async () => {
    try {
      setLoading(true);
      
      const promises = [];
      
      // Cargar solo los datos necesarios según la pestaña activa
      if (activeTab === 'pib') {
        const pibParams = buildParams(true);
        promises.push(
          axios.get(`${API_BASE_URL}/pib/data?${pibParams.toString()}`)
            .then(res => {
              if (res.data.success) {
                setPibData(res.data.data);
                setDataLoaded(prev => ({ ...prev, pib: true }));
              }
            })
        );
      } else if (activeTab === 'radianza') {
        const radianzaParams = buildParams(true);
        // Cargar datos filtrados para otros gráficos
        promises.push(
          axios.get(`${API_BASE_URL}/data?${radianzaParams.toString()}`)
            .then(res => {
              if (res.data.success) {
                setRadianzaData(res.data.data);
                setDataLoaded(prev => ({ ...prev, radianza: true }));
              }
            })
        );
        // Cargar TODOS los datos sin filtrar para el box plot (no afectado por municipios/años)
        promises.push(
          axios.get(`${API_BASE_URL}/data`, { params: { limit: 10000 } })
            .then(res => {
              if (res.data.success) {
                setRadianzaDataAll(res.data.data);
              }
            })
            .catch(err => console.warn('Error cargando datos completos para box plot:', err))
        );
      } else if (activeTab === 'comparison') {
        // Para comparación, solo necesitamos los datos combinados
        const combinedParams = buildParams(false);
        
        promises.push(
          axios.get(`${API_BASE_URL}/eda/combined?${combinedParams.toString()}`)
            .then(res => {
              if (res.data.success) {
                setCombinedData(res.data.data);
              }
            })
            .catch(err => console.warn('No se pudieron cargar datos combinados:', err))
        );
        
        setDataLoaded(prev => ({ ...prev, comparison: true }));
      }
      
      // Ejecutar todas las peticiones en paralelo
      await Promise.all(promises);
      
      setLoading(false);
    } catch (err) {
      console.error('Error cargando datos:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Estadísticas descriptivas para PIB (optimizado)
  const pibStats = useMemo(() => {
    if (!pibData || pibData.length === 0 || activeTab !== 'pib') return null;
    
    const pibValues = pibData
      .map(d => parseFloat(d.pib_mun))
      .filter(v => !isNaN(v) && v > 0);
    
    if (pibValues.length === 0) return null;

    // Calcular estadísticas de forma más eficiente
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

  // Estadísticas descriptivas para Radianza (optimizado)
  const radianzaStats = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'radianza') return null;
    
    const radianzaValues = radianzaData
      .map(d => parseFloat(d.Media_de_radianza))
      .filter(v => !isNaN(v) && v > 0);
    
    if (radianzaValues.length === 0) return null;

    // Calcular estadísticas de forma más eficiente
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

  // Datos para histograma de PIB (optimizado)
  const pibHistogram = useMemo(() => {
    if (!pibData || pibData.length === 0 || activeTab !== 'pib') return [];
    
    // Usar un sample si hay muchos datos para mejorar rendimiento
    const sampleSize = Math.min(pibData.length, 2000);
    const sampledData = pibData.length > 2000 
      ? pibData.filter((_, i) => i % Math.ceil(pibData.length / sampleSize) === 0)
      : pibData;
    
    const pibValues = sampledData
      .map(d => parseFloat(d.pib_mun))
      .filter(v => !isNaN(v) && v > 0);
    
    if (pibValues.length === 0) return [];
    
    // Calcular min/max de forma más eficiente
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

  // Datos para histograma de Radianza (optimizado)
  const radianzaHistogram = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'radianza') return [];
    
    // Usar un sample si hay muchos datos para mejorar rendimiento
    const sampleSize = Math.min(radianzaData.length, 2000);
    const sampledData = radianzaData.length > 2000 
      ? radianzaData.filter((_, i) => i % Math.ceil(radianzaData.length / sampleSize) === 0)
      : radianzaData;
    
    const radianzaValues = sampledData
      .map(d => parseFloat(d.Media_de_radianza))
      .filter(v => !isNaN(v) && v > 0);
    
    if (radianzaValues.length === 0) return [];
    
    // Calcular min/max de forma más eficiente
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

  // Datos para serie temporal de PIB (optimizado)
  const pibTimeSeries = useMemo(() => {
    if (!pibData || pibData.length === 0 || activeTab !== 'pib') return [];
    
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

  // Datos para serie temporal de Radianza (optimizado)
  const radianzaTimeSeries = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'radianza') return [];
    
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

  // Datos para gráfica de Suma de Radianza por Año y Municipio
  const sumaRadianzaPorAnioMunicipio = useMemo(() => {
    if (!radianzaData || radianzaData.length === 0 || activeTab !== 'radianza') return { chartData: [], municipios: [] };
    
    // Agrupar por año y municipio, sumando todos los valores
    const grouped = new Map();
    const municipiosSet = new Set();
    
    for (let i = 0; i < radianzaData.length; i++) {
      const d = radianzaData[i];
      const fecha = d.Fecha?.split('T')[0] || d.Fecha || d.fecha;
      const municipio = (d.Municipio || d.municipio || '').toString().trim();
      const sumaRadianza = parseFloat(d.Suma_de_radianza);
      
      if (fecha && municipio && !isNaN(sumaRadianza) && sumaRadianza > 0) {
        // Extraer año de la fecha - intentar múltiples métodos
        let year = null;
        
        // Método 1: Intentar extraer año directamente del string (formato YYYY-MM-DD o similar)
        const yearMatch = fecha.toString().match(/(\d{4})/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }
        
        // Método 2: Si no se encontró o el año parece inválido, intentar con Date
        if (!year || year < 2000 || year > 2100) {
          try {
            const dateObj = new Date(fecha);
            if (!isNaN(dateObj.getTime())) {
              year = dateObj.getFullYear();
            }
          } catch (e) {
            // Ignorar error
          }
        }
        
        // Validar que el año sea razonable (no filtrar por rango estricto, solo validar que sea un año válido)
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
    
    // Convertir a estructura para el gráfico
    const municipios = Array.from(municipiosSet).sort();
    const años = [...new Set(Array.from(grouped.values()).map(d => d.año))].sort((a, b) => a - b);
    
    
    // Crear estructura de datos para el gráfico
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

  // Datos para scatter plot PIB vs Radianza agrupados por municipio
  const scatterDataByMunicipio = useMemo(() => {
    if (!combinedData || combinedData.length === 0 || activeTab !== 'comparison') return {};
    
    // Filtrar y procesar datos
    const validData = combinedData
      .map(d => ({
        pib: parseFloat(d.pib_mun),
        radianza: parseFloat(d.Media_de_radianza),
        municipio: (d.municipio || d.Municipio || '').toString().trim()
      }))
      .filter(d => !isNaN(d.pib) && !isNaN(d.radianza) && d.pib > 0 && d.radianza > 0 && d.municipio);
    
    // Agrupar por municipio
    const grouped = {};
    validData.forEach(d => {
      if (!grouped[d.municipio]) {
        grouped[d.municipio] = [];
      }
      grouped[d.municipio].push({ pib: d.pib, radianza: d.radianza });
    });
    
    // Limitar puntos por municipio si hay muchos datos
    const maxPointsPerMunicipio = 500;
    Object.keys(grouped).forEach(municipio => {
      if (grouped[municipio].length > maxPointsPerMunicipio) {
        const step = Math.ceil(grouped[municipio].length / maxPointsPerMunicipio);
        grouped[municipio] = grouped[municipio].filter((_, i) => i % step === 0);
      }
    });
    
    return grouped;
  }, [combinedData, activeTab]);

  // Obtener lista de municipios ordenados
  const municipiosInData = useMemo(() => {
    return Object.keys(scatterDataByMunicipio).sort();
  }, [scatterDataByMunicipio]);

  // Datos para Box Plot por Municipio (no afectado por filtros de municipio/año)
  const boxPlotData = useMemo(() => {
    if (!radianzaDataAll || radianzaDataAll.length === 0 || activeTab !== 'radianza') return [];
    
    // Agrupar datos por municipio
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
    
    // Calcular estadísticas de box plot para cada municipio
    const boxPlotStats = Object.keys(groupedByMunicipio).map(municipio => {
      const values = groupedByMunicipio[municipio].sort((a, b) => a - b);
      const n = values.length;
      
      if (n === 0) return null;
      
      const min = values[0];
      const max = values[n - 1];
      const q1 = values[Math.floor(n * 0.25)];
      const median = values[Math.floor(n * 0.5)];
      const q3 = values[Math.floor(n * 0.75)];
      
      // Calcular IQR y detectar outliers
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
    }).filter(Boolean).sort((a, b) => b.median - a.median); // Ordenar por mediana descendente
    
    return boxPlotStats;
  }, [radianzaDataAll, selectedMetrica, activeTab]);

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Cargando datos para análisis exploratorio...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-controls">
        <div className="controls-row">
          <MultiMunicipioSelector
            municipios={municipios}
            selectedMunicipios={selectedMunicipios}
            onSelectMunicipios={setSelectedMunicipios}
          />
          {activeTab === 'radianza' && (
            <MetricaSelector
              selectedMetrica={selectedMetrica}
              onSelectMetrica={setSelectedMetrica}
            />
          )}
        </div>
      </div>

      <div className="eda-tabs">
        <button
          className={`eda-tab ${activeTab === 'pib' ? 'active' : ''}`}
          onClick={() => setActiveTab('pib')}
        >
          Análisis de PIB
        </button>
        <button
          className={`eda-tab ${activeTab === 'radianza' ? 'active' : ''}`}
          onClick={() => setActiveTab('radianza')}
        >
          Análisis de Radianza
        </button>
        <button
          className={`eda-tab ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          PIB vs Radianza
        </button>
      </div>

      {activeTab === 'pib' && (
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

      {activeTab === 'radianza' && (
        <div className="eda-content">
          <h2>
            Análisis Exploratorio de Datos - Radianza
            {selectedMunicipios.length > 0 && selectedMunicipios.length < municipios.length && (
              <span className="municipio-filter-indicator">
                {' '}({selectedMunicipios.length} {selectedMunicipios.length === 1 ? 'municipio' : 'municipios'} seleccionado{selectedMunicipios.length === 1 ? '' : 's'})
              </span>
            )}
          </h2>
          
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

      {activeTab === 'comparison' && (
        <div className="eda-content">
          <h2>
            Análisis Comparativo: PIB vs Radianza
            {selectedMunicipios.length > 0 && selectedMunicipios.length < municipios.length && (
              <span className="municipio-filter-indicator">
                {' '}({selectedMunicipios.length} {selectedMunicipios.length === 1 ? 'municipio' : 'municipios'} seleccionado{selectedMunicipios.length === 1 ? '' : 's'})
              </span>
            )}
          </h2>

          <div className="chart-card">
            <h3>Scatter Plot: Radianza vs PIB</h3>
            <ResponsiveContainer width="100%" height={600}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number" 
                  dataKey="pib" 
                  name="PIB Municipal"
                  label={{ value: 'PIB Municipal', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="radianza" 
                  name="Radianza Media"
                  label={{ value: 'Radianza Media', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div style={{
                          backgroundColor: 'white',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          padding: '10px'
                        }}>
                          <p style={{ margin: 0, fontWeight: 'bold' }}>{data.municipio || 'Municipio'}</p>
                          <p style={{ margin: '5px 0 0 0' }}>PIB: {data.pib?.toFixed(2) || 'N/A'}</p>
                          <p style={{ margin: '5px 0 0 0' }}>Radianza: {data.radianza?.toFixed(2) || 'N/A'}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                {municipiosInData.map((municipio, index) => {
                  const color = COLORS[index % COLORS.length];
                  const data = scatterDataByMunicipio[municipio] || [];
                  return (
                    <Scatter
                      key={municipio}
                      name={municipio}
                      data={data.map(d => ({ ...d, municipio }))}
                      fill={color}
                    >
                      {data.map((entry, idx) => (
                        <Cell key={`cell-${municipio}-${idx}`} fill={color} />
                      ))}
                    </Scatter>
                  );
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default EDADashboard;

