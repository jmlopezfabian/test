from flask import Flask, jsonify, request, Response, send_from_directory
from flask_cors import CORS
from azure.storage.blob import BlobServiceClient
import pandas as pd
from io import StringIO
import os
import time
from config import (
    STORAGE_ACCOUNT_NAME, 
    STORAGE_ACCOUNT_KEY, 
    CONTAINER_NAME, 
    BLOB_NAME,
    CONNECTION_STRING,
    CORS_ORIGINS,
    CACHE_TTL_SECONDS,
    FLASK_ENV,
    FLASK_HOST,
    FLASK_PORT,
    FLASK_DEBUG
)

# Configurar Flask para servir archivos estáticos del frontend
static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist')
app = Flask(__name__, static_folder=static_folder, static_url_path='')

# Configurar modo de producción
app.config['ENV'] = FLASK_ENV
app.config['DEBUG'] = FLASK_DEBUG and FLASK_ENV != 'production'

# Logging de inicio
print(f"Starting Flask app in {FLASK_ENV} mode")
print(f"Host: {FLASK_HOST}, Port: {FLASK_PORT}")
print(f"Debug mode: {app.config['DEBUG']}")
print(f"Static folder: {static_folder}")
print(f"Static folder exists: {os.path.exists(static_folder)}")

# Configurar CORS con orígenes permitidos
if CORS_ORIGINS == ['*']:
    CORS(app)  # Permite peticiones desde cualquier origen (desarrollo)
else:
    CORS(app, origins=CORS_ORIGINS)  # Solo permite orígenes específicos (producción)

# Cache simple en memoria
_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS
_CACHED_DF = None
_CACHED_AT = 0.0

def get_blob_data():
    """Obtiene los datos del blob storage y los convierte a DataFrame"""
    try:
        # Validar que las credenciales estén configuradas
        if not STORAGE_ACCOUNT_KEY:
            raise ValueError(
                "STORAGE_ACCOUNT_KEY no está configurada. "
                "Por favor, configúrala como variable de entorno."
            )
        
        global _CACHED_DF, _CACHED_AT
        now = time.time()
        if _CACHED_DF is not None and (now - _CACHED_AT) < _CACHE_TTL_SECONDS:
            return _CACHED_DF

        blob_service_client = BlobServiceClient.from_connection_string(CONNECTION_STRING)
        print(f"Blob name: {BLOB_NAME}")
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=BLOB_NAME)
        
        stream = blob_client.download_blob()
        data = stream.readall().decode('utf-8')
        
        df = pd.read_csv(StringIO(data))
        
        # Asegurar que las columnas de fecha se manejen correctamente
        if 'Fecha' in df.columns:
            # Intentar convertir a datetime, pero mantener como string si falla
            try:
                df['Fecha'] = pd.to_datetime(df['Fecha'])
            except Exception:
                # Mantener como string si falla
                pass

        # Normalización ligera
        if 'Municipio' in df.columns:
            df['Municipio'] = df['Municipio'].astype(str)
        
        _CACHED_DF = df
        _CACHED_AT = now
        return _CACHED_DF
    except Exception as e:
        import traceback
        error_msg = f"Error al obtener datos del blob: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise Exception(error_msg)

@app.route('/api/data', methods=['GET'])
def get_data():
    """Endpoint para obtener todos los datos"""
    try:
        df = get_blob_data().copy()

        # Parámetros de query
        limit = request.args.get('limit', type=int)
        columns = request.args.get('columns')  # coma separada
        municipio = request.args.get('municipio')
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        year = request.args.get('year', type=int)

        # Filtros
        if municipio and 'Municipio' in df.columns:
            df = df[df['Municipio'].str.lower() == municipio.lower()]
        if from_date and 'Fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['Fecha']):
            df = df[df['Fecha'] >= pd.to_datetime(from_date)]
        if to_date and 'Fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['Fecha']):
            df = df[df['Fecha'] <= pd.to_datetime(to_date)]
        # Filtro por año
        if year and 'Fecha' in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df['Fecha']):
                df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
            df = df[df['Fecha'].dt.year == year]
        # Orden por fecha si existe
        if 'Fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['Fecha']):
            df = df.sort_values('Fecha')

        # Selección de columnas
        if columns:
            cols = [c.strip() for c in columns.split(',') if c.strip() in df.columns]
            if cols:
                df = df[cols]

        # Límite
        if limit is not None and limit > 0:
            df = df.head(limit)
        
        # Convertir DataFrame a formato JSON
        # Manejar NaN y valores infinitos
        df = df.replace([float('inf'), float('-inf')], None)
        df = df.fillna('')
        
        # Convertir fechas a string para JSON
        if 'Fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['Fecha']):
            df['Fecha'] = df['Fecha'].dt.strftime('%Y-%m-%d')
        
        data = df.to_dict('records')
        
        return jsonify({
            'success': True,
            'data': data,
            'total_records': len(data)
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/years', methods=['GET'])
def get_years():
    """Endpoint para obtener lista de años únicos disponibles"""
    try:
        df = get_blob_data()
        
        if 'Fecha' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "Fecha" no existe en el CSV'
            }), 500
        
        # Convertir a datetime si no lo está
        if not pd.api.types.is_datetime64_any_dtype(df['Fecha']):
            df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
        
        # Extraer años
        df = df.dropna(subset=['Fecha'])
        years = df['Fecha'].dt.year.unique().tolist()
        years = [int(y) for y in years if not pd.isna(y)]
        years.sort(reverse=True)  # Más recientes primero
        
        return jsonify({
            'success': True,
            'years': years
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_years: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/municipios', methods=['GET'])
def get_municipios():
    """Endpoint para obtener lista de municipios únicos"""
    try:
        df = get_blob_data()
        
        if 'Municipio' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "Municipio" no existe en el CSV'
            }), 500
        
        municipios = df['Municipio'].dropna().astype(str).unique().tolist()
        municipios = [str(m) for m in municipios if m]  # Convertir a string y filtrar vacíos
        municipios.sort()
        
        return jsonify({
            'success': True,
            'municipios': municipios
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_municipios: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/municipio/<municipio>', methods=['GET'])
def get_municipio_data(municipio):
    """Endpoint para obtener datos de un municipio específico"""
    try:
        df = get_blob_data().copy()
        
        if 'Municipio' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "Municipio" no existe en el CSV'
            }), 500
        
        # Decodificar el nombre del municipio si viene codificado
        municipio_decoded = municipio.replace('%20', ' ').replace('+', ' ')
        municipio_data = df[df['Municipio'].str.lower() == municipio_decoded.lower()]

        # Filtros y límite
        limit = request.args.get('limit', default=None, type=int)
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        year = request.args.get('year', type=int)
        
        if 'Fecha' in municipio_data.columns:
            if not pd.api.types.is_datetime64_any_dtype(municipio_data['Fecha']):
                municipio_data['Fecha'] = pd.to_datetime(municipio_data['Fecha'], errors='coerce')
            municipio_data = municipio_data.sort_values('Fecha')
            if from_date:
                municipio_data = municipio_data[municipio_data['Fecha'] >= pd.to_datetime(from_date)]
            if to_date:
                municipio_data = municipio_data[municipio_data['Fecha'] <= pd.to_datetime(to_date)]
            # Filtro por año
            if year:
                municipio_data = municipio_data[municipio_data['Fecha'].dt.year == year]
        # Solo aplicar límite si se especifica explícitamente
        if limit and limit > 0:
            municipio_data = municipio_data.tail(limit)  # últimos N registros
        
        if municipio_data.empty:
            return jsonify({
                'success': False,
                'error': f'Municipio {municipio_decoded} no encontrado'
            }), 404
        
        # Manejar fechas y valores NaN
        if 'Fecha' in municipio_data.columns and pd.api.types.is_datetime64_any_dtype(municipio_data['Fecha']):
            municipio_data['Fecha'] = municipio_data['Fecha'].dt.strftime('%Y-%m-%d')
        
        # Reemplazar NaN e infinitos
        municipio_data = municipio_data.replace([float('inf'), float('-inf')], None)
        municipio_data = municipio_data.fillna('')
        
        data = municipio_data.to_dict('records')
        
        return jsonify({
            'success': True,
            'data': data,
            'municipio': municipio_decoded
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_municipio_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Endpoint para obtener estadísticas generales"""
    try:
        df = get_blob_data().copy()
        
        # Verificar que las columnas necesarias existan
        required_cols = ['Municipio', 'Media_de_radianza', 'Maximo_de_radianza', 'Minimo_de_radianza']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return jsonify({
                'success': False,
                'error': f'Columnas faltantes en el CSV: {missing_cols}'
            }), 500
        
        # Estadísticas por municipio
        try:
            # Calcular estadísticas individuales para evitar MultiIndex
            stats_by_municipio = df.groupby('Municipio').agg({
                'Media_de_radianza': ['mean', 'max', 'min'],
                'Suma_de_radianza': 'sum' if 'Suma_de_radianza' in df.columns else 'count',
                'Cantidad_de_pixeles': 'sum' if 'Cantidad_de_pixeles' in df.columns else 'count'
            }).round(2)
            
            # Aplanar el MultiIndex de columnas
            stats_by_municipio.columns = ['_'.join(col).strip() if isinstance(col, tuple) else col 
                                          for col in stats_by_municipio.columns.values]
            
            # Convertir a diccionario con claves string
            by_municipio_dict = {}
            for municipio, row in stats_by_municipio.iterrows():
                municipio_str = str(municipio)
                by_municipio_dict[municipio_str] = {}
                for col in stats_by_municipio.columns:
                    value = row[col]
                    # Convertir numpy types a tipos nativos de Python
                    if pd.isna(value):
                        by_municipio_dict[municipio_str][col] = None
                    elif isinstance(value, (int, float)):
                        by_municipio_dict[municipio_str][col] = float(value)
                    else:
                        # Intentar convertir a float si es posible
                        try:
                            by_municipio_dict[municipio_str][col] = float(value)
                        except (ValueError, TypeError):
                            by_municipio_dict[municipio_str][col] = str(value) if value is not None else None
        except Exception as e:
            import traceback
            print(f"Error al calcular stats por municipio: {str(e)}\n{traceback.format_exc()}")
            by_municipio_dict = {}
        
        # Estadísticas generales
        general_stats = {
            'total_records': len(df),
            'total_municipios': df['Municipio'].nunique() if 'Municipio' in df.columns else 0,
            'fecha_min': str(df['Fecha'].min()) if 'Fecha' in df.columns else 'N/A',
            'fecha_max': str(df['Fecha'].max()) if 'Fecha' in df.columns else 'N/A',
            'radianza_promedio': float(df['Media_de_radianza'].mean()) if 'Media_de_radianza' in df.columns else 0.0,
            'radianza_maxima': float(df['Maximo_de_radianza'].max()) if 'Maximo_de_radianza' in df.columns else 0.0,
            'radianza_minima': float(df['Minimo_de_radianza'].min()) if 'Minimo_de_radianza' in df.columns else 0.0
        }
        
        return jsonify({
            'success': True,
            'general': general_stats,
            'by_municipio': by_municipio_dict
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_stats: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/comparison', methods=['GET'])
def comparison():
    """Ranking de municipios por métrica agregada (promedio)."""
    try:
        metric = request.args.get('metric', default='Media_de_radianza')
        top_n = request.args.get('top', default=10, type=int)
        year = request.args.get('year', type=int)
        df = get_blob_data().copy()
        if 'Municipio' not in df.columns or metric not in df.columns:
            return jsonify({'success': False, 'error': 'Campos requeridos no existen'}), 400
        
        # Filtro por año
        if year and 'Fecha' in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df['Fecha']):
                df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
            df = df[df['Fecha'].dt.year == year]
        
        # Convertir métrica a numérico de forma segura
        df[metric] = pd.to_numeric(df[metric], errors='coerce')
        agg = (
            df.groupby('Municipio', as_index=False)[metric]
            .mean()
            .rename(columns={metric: 'promedio'})
            .sort_values('promedio', ascending=False)
            .head(top_n)
        )
        # Convertir tipos
        agg['Municipio'] = agg['Municipio'].astype(str)
        agg['promedio'] = agg['promedio'].astype(float).round(2)
        return jsonify({'success': True, 'data': agg.to_dict('records')})
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/download', methods=['GET'])
def download_data():
    """Endpoint para descargar datos filtrados como CSV"""
    try:
        df = get_blob_data().copy()
        
        # Aplicar los mismos filtros que en /api/data
        municipio = request.args.get('municipio')
        municipios = request.args.getlist('municipios')  # Lista de municipios
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        year = request.args.get('year', type=int)
        columns = request.args.get('columns')
        
        # Filtro por municipio(s)
        if municipios:
            if 'Municipio' in df.columns:
                df = df[df['Municipio'].str.lower().isin([m.lower() for m in municipios])]
        elif municipio and 'Municipio' in df.columns:
            df = df[df['Municipio'].str.lower() == municipio.lower()]
        
        # Filtros de fecha
        if 'Fecha' in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df['Fecha']):
                df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
            
            if from_date:
                df = df[df['Fecha'] >= pd.to_datetime(from_date)]
            if to_date:
                df = df[df['Fecha'] <= pd.to_datetime(to_date)]
            if year:
                df = df[df['Fecha'].dt.year == year]
            
            # Ordenar por fecha
            df = df.sort_values('Fecha')
        
        # Selección de columnas
        if columns:
            cols = [c.strip() for c in columns.split(',') if c.strip() in df.columns]
            if cols:
                df = df[cols]
        
        # Convertir fechas a string formato legible
        if 'Fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['Fecha']):
            df['Fecha'] = df['Fecha'].dt.strftime('%Y-%m-%d')
        
        # Reemplazar NaN y valores infinitos
        df = df.replace([float('inf'), float('-inf')], '')
        df = df.fillna('')
        
        # Convertir DataFrame a CSV
        output = StringIO()
        df.to_csv(output, index=False, encoding='utf-8-sig')  # utf-8-sig para Excel
        output.seek(0)
        
        # Generar nombre de archivo
        filename = 'datos_radianza'
        if municipios:
            filename += f"_{len(municipios)}_municipios"
        elif municipio:
            filename += f"_{municipio.replace(' ', '_')}"
        if year:
            filename += f"_{year}"
        filename += '.csv'
        
        # Crear respuesta con headers apropiados para descarga
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'text/csv; charset=utf-8-sig'
            }
        )
    except Exception as e:
        import traceback
        error_msg = f"Error en download_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Endpoint de verificación de salud"""
    return jsonify({
        'status': 'healthy',
        'service': 'Blob Storage API'
    })

@app.route('/api/debug', methods=['GET'])
def debug_info():
    """Endpoint de debug para verificar la conexión y estructura del CSV"""
    try:
        df = get_blob_data()
        
        debug_info = {
            'success': True,
            'columns': list(df.columns),
            'shape': df.shape,
            'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
            'sample_data': df.head(3).to_dict('records') if len(df) > 0 else [],
            'null_counts': df.isnull().sum().to_dict(),
            'static_folder': app.static_folder,
            'static_folder_exists': os.path.exists(app.static_folder) if app.static_folder else False
        }
        
        return jsonify(debug_info)
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

# Ruta para servir el index.html de React
@app.route('/')
def index():
    if not os.path.exists(app.static_folder):
        return jsonify({
            'status': 'ok',
            'service': 'Radianza API',
            'endpoints': {
                'health': '/api/health',
                'data': '/api/data',
                'years': '/api/years',
                'municipios': '/api/municipios',
                'stats': '/api/stats',
                'comparison': '/api/comparison',
                'download': '/api/download',
                'debug': '/api/debug'
            },
            'note': 'Frontend not built, serving API only'
        })
    
    index_path = os.path.join(app.static_folder, 'index.html')
    if not os.path.exists(index_path):
        return jsonify({
            'status': 'ok',
            'service': 'Radianza API',
            'endpoints': {
                'health': '/api/health',
                'data': '/api/data',
                'years': '/api/years',
                'municipios': '/api/municipios',
                'stats': '/api/stats',
                'comparison': '/api/comparison',
                'download': '/api/download',
                'debug': '/api/debug'
            },
            'note': 'index.html not found, serving API only'
        })
    
    return send_from_directory(app.static_folder, 'index.html')

# Ruta catch-all para servir archivos estáticos y React Router
@app.route('/<path:path>')
def serve(path):
    # No interceptar rutas de API
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    # Servir archivos estáticos si existen
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(app.static_folder, path)
    
    # Para cualquier otra ruta, servir index.html (para React Router)
    if os.path.exists(app.static_folder):
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
    
    return jsonify({'error': 'Not found'}), 404

if __name__ == '__main__':
    # Configuración para desarrollo local
    # En producción, usar gunicorn (ver Dockerfile CMD)
    # Asegurar que debug esté desactivado en producción
    debug_mode = FLASK_DEBUG and FLASK_ENV != 'production'
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=debug_mode)
