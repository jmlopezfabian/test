import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import MultiMunicipioSelector from './MultiMunicipioSelector';
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

const RadianzaVsPIBDashboard = () => {
  const [municipios, setMunicipios] = useState([]);
  const [selectedMunicipios, setSelectedMunicipios] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Debounce para cambios de municipios
  useEffect(() => {
    if (municipios.length === 0) return;
    
    setDataLoaded(false);
    
    const timeoutId = setTimeout(() => {
      loadCombinedData();
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMunicipios]);

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
      
      // Combinar y eliminar duplicados
      const allMunicipios = [...new Set([...radianzaMunicipios, ...pibMunicipios])].sort();
      setMunicipios(allMunicipios);
      
      if (allMunicipios.length > 0) {
        setSelectedMunicipios([allMunicipios[0]]);
      }
    } catch (err) {
      console.error('Error cargando municipios:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCombinedData = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (selectedMunicipios.length > 0) {
        selectedMunicipios.forEach(municipio => {
          params.append('municipios', municipio);
        });
      }
      
      const response = await axios.get(`${API_BASE_URL}/eda/combined?${params.toString()}`);
      
      if (response.data.success) {
        setCombinedData(response.data.data);
        setDataLoaded(true);
      } else {
        setError(response.data.error || 'Error al cargar datos combinados');
      }
    } catch (err) {
      console.error('Error cargando datos combinados:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Datos para scatter plot PIB vs Radianza agrupados por municipio
  const scatterDataByMunicipio = useMemo(() => {
    if (!combinedData || combinedData.length === 0) return {};
    
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
  }, [combinedData]);

  // Obtener lista de municipios ordenados
  const municipiosInData = useMemo(() => {
    return Object.keys(scatterDataByMunicipio).sort();
  }, [scatterDataByMunicipio]);

  if (loading && !dataLoaded) {
    return (
      <div className="dashboard-container">
        <div className="loading">Cargando datos para análisis comparativo...</div>
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
        </div>
      </div>

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
    </div>
  );
};

export default RadianzaVsPIBDashboard;

