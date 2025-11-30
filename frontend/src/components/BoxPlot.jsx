import React, { useState } from 'react';
import { ResponsiveContainer } from 'recharts';

const BoxPlot = ({ data, yAxisLabel, height = 500 }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (!data || !Array.isArray(data) || data.length === 0) {
    return <div className="no-data">No hay datos disponibles</div>;
  }

  // Calcular dimensiones
  const margin = { top: 20, right: 30, bottom: 60, left: 120 };
  const chartHeight = Math.max(height, data.length * 40);
  const chartWidth = 800;
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  
  // Encontrar el rango de valores
  const allValues = data.flatMap(d => [d.min, d.max, ...(d.outliers || [])]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valueRange = maxValue - minValue || 1;
  
  // Función para convertir valor a posición X
  const valueToX = (value) => ((value - minValue) / valueRange) * plotWidth;
  
  // Altura de cada box
  const boxHeight = Math.min(30, plotHeight / data.length * 0.6);
  const spacing = plotHeight / data.length;

  const handleMouseEnter = (e, index) => {
    setHoveredIndex(index);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible' }}>
        {/* Eje Y con nombres de municipios */}
        {data.map((d, i) => {
          const y = margin.top + (i + 0.5) * spacing;
          return (
            <text
              key={`label-${i}`}
              x={margin.left - 10}
              y={y}
              textAnchor="end"
              fontSize="11"
              fill="#666"
              alignmentBaseline="middle"
            >
              {d.municipio}
            </text>
          );
        })}

        {/* Eje X */}
        <line
          x1={margin.left}
          y1={margin.top + plotHeight}
          x2={margin.left + plotWidth}
          y2={margin.top + plotHeight}
          stroke="#333"
          strokeWidth="2"
        />

        {/* Ticks del eje X */}
        {[0, 0.25, 0.5, 0.75, 1].map(tick => {
          const value = minValue + tick * valueRange;
          const x = margin.left + tick * plotWidth;
          return (
            <g key={`tick-${tick}`}>
              <line
                x1={x}
                y1={margin.top + plotHeight}
                x2={x}
                y2={margin.top + plotHeight + 5}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={x}
                y={margin.top + plotHeight + 20}
                textAnchor="middle"
                fontSize="10"
                fill="#666"
              >
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Label del eje X */}
        <text
          x={margin.left + plotWidth / 2}
          y={chartHeight - 10}
          textAnchor="middle"
          fontSize="12"
          fill="#333"
          fontWeight="500"
        >
          {yAxisLabel}
        </text>

        {/* Box plots */}
        {data.map((d, i) => {
          const y = margin.top + (i + 0.5) * spacing;
          const boxY = y - boxHeight / 2;
          
          const xMin = margin.left + valueToX(d.min);
          const xQ1 = margin.left + valueToX(d.q1);
          const xMedian = margin.left + valueToX(d.median);
          const xQ3 = margin.left + valueToX(d.q3);
          const xMax = margin.left + valueToX(d.max);
          const boxWidth = xQ3 - xQ1;

          return (
            <g 
              key={`box-${i}`}
              onMouseEnter={(e) => handleMouseEnter(e, i)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: 'pointer' }}
            >
              {/* Whisker inferior (línea vertical desde min hasta Q1) */}
              <line
                x1={xMin}
                y1={y}
                x2={xMin}
                y2={boxY}
                stroke="#333"
                strokeWidth="1.5"
              />
              <line
                x1={xMin - 5}
                y1={y}
                x2={xMin + 5}
                y2={y}
                stroke="#333"
                strokeWidth="1.5"
              />

              {/* Caja (Q1 a Q3) */}
              <rect
                x={xQ1}
                y={boxY}
                width={boxWidth}
                height={boxHeight}
                fill="#764ba2"
                fillOpacity="0.7"
                stroke="#764ba2"
                strokeWidth="1.5"
              />

              {/* Línea de mediana */}
              <line
                x1={xMedian}
                y1={boxY}
                x2={xMedian}
                y2={boxY + boxHeight}
                stroke="#fff"
                strokeWidth="2"
              />

              {/* Whisker superior (línea vertical desde Q3 hasta max) */}
              <line
                x1={xMax}
                y1={y}
                x2={xMax}
                y2={boxY}
                stroke="#333"
                strokeWidth="1.5"
              />
              <line
                x1={xMax - 5}
                y1={y}
                x2={xMax + 5}
                y2={y}
                stroke="#333"
                strokeWidth="1.5"
              />

              {/* Outliers */}
              {d.outliers && d.outliers.map((outlier, oIdx) => {
                const xOutlier = margin.left + valueToX(outlier);
                return (
                  <circle
                    key={`outlier-${i}-${oIdx}`}
                    cx={xOutlier}
                    cy={y}
                    r="3"
                    fill="#e74c3c"
                    stroke="#c0392b"
                    strokeWidth="1"
                  />
                );
              })}
            </g>
          );
        })}
        </svg>
      </ResponsiveContainer>
      
      {/* Tooltip */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPos.x + 10}px`,
            top: `${tooltipPos.y + 10}px`,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            pointerEvents: 'none',
            fontSize: '12px'
          }}
        >
          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14px' }}>
            {data[hoveredIndex].municipio}
          </p>
          <p style={{ margin: '8px 0 0 0' }}>Mínimo: {data[hoveredIndex].min?.toFixed(2)}</p>
          <p style={{ margin: '4px 0 0 0' }}>Q1: {data[hoveredIndex].q1?.toFixed(2)}</p>
          <p style={{ margin: '4px 0 0 0', fontWeight: 'bold' }}>
            Mediana: {data[hoveredIndex].median?.toFixed(2)}
          </p>
          <p style={{ margin: '4px 0 0 0' }}>Q3: {data[hoveredIndex].q3?.toFixed(2)}</p>
          <p style={{ margin: '4px 0 0 0' }}>Máximo: {data[hoveredIndex].max?.toFixed(2)}</p>
          {data[hoveredIndex].outliers && data[hoveredIndex].outliers.length > 0 && (
            <p style={{ margin: '8px 0 0 0', color: '#e74c3c' }}>
              Outliers: {data[hoveredIndex].outliers.length}
            </p>
          )}
          <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#666' }}>
            N: {data[hoveredIndex].count} registros
          </p>
        </div>
      )}
    </div>
  );
};

export default BoxPlot;

