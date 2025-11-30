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
    BLOB_NAME_PIB,
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

# Cache simple en memoria para radianza
_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS
_CACHED_DF = None
_CACHED_AT = 0.0

# Cache para PIB
_CACHED_PIB_DF = None
_CACHED_PIB_AT = 0.0

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

def get_pib_data():
    """Obtiene los datos de PIB del blob storage y los convierte a DataFrame"""
    try:
        # Validar que las credenciales estén configuradas
        if not STORAGE_ACCOUNT_KEY:
            raise ValueError(
                "STORAGE_ACCOUNT_KEY no está configurada. "
                "Por favor, configúrala como variable de entorno."
            )
        
        global _CACHED_PIB_DF, _CACHED_PIB_AT
        now = time.time()
        if _CACHED_PIB_DF is not None and (now - _CACHED_PIB_AT) < _CACHE_TTL_SECONDS:
            return _CACHED_PIB_DF

        blob_service_client = BlobServiceClient.from_connection_string(CONNECTION_STRING)
        print(f"Blob name PIB: {BLOB_NAME_PIB}")
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=BLOB_NAME_PIB)
        
        stream = blob_client.download_blob()
        data = stream.readall().decode('utf-8')
        
        df = pd.read_csv(StringIO(data))
        
        # Asegurar que las columnas de fecha se manejen correctamente
        if 'fecha' in df.columns:
            try:
                df['fecha'] = pd.to_datetime(df['fecha'])
            except Exception:
                pass

        # Normalización ligera
        if 'municipio' in df.columns:
            df['municipio'] = df['municipio'].astype(str)
        if 'entidad_federativa' in df.columns:
            df['entidad_federativa'] = df['entidad_federativa'].astype(str)
        
        # Convertir columnas numéricas (pueden tener comas como separador decimal)
        numeric_cols = ['porc_pob', 'pibe', 'pib_mun']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = df[col].astype(str).str.replace(',', '.').astype(float, errors='ignore')
        
        _CACHED_PIB_DF = df
        _CACHED_PIB_AT = now
        return _CACHED_PIB_DF
    except Exception as e:
        import traceback
        error_msg = f"Error al obtener datos de PIB del blob: {str(e)}\n{traceback.format_exc()}"
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
        municipios = request.args.getlist('municipios')  # Lista de municipios
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        year = request.args.get('year', type=int)

        # Filtros
        if municipios and 'Municipio' in df.columns:
            df = df[df['Municipio'].str.lower().isin([m.lower() for m in municipios])]
        elif municipio and 'Municipio' in df.columns:
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

# ==================== ENDPOINTS PARA PIB ====================

@app.route('/api/pib/data', methods=['GET'])
def get_pib_data_endpoint():
    """Endpoint para obtener datos de PIB"""
    try:
        df = get_pib_data().copy()

        # Parámetros de query
        limit = request.args.get('limit', type=int)
        columns = request.args.get('columns')
        municipio = request.args.get('municipio')
        municipios = request.args.getlist('municipios')  # Lista de municipios
        entidad = request.args.get('entidad')
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        year = request.args.get('year', type=int)

        # Filtros
        if municipios and 'municipio' in df.columns:
            df = df[df['municipio'].str.lower().isin([m.lower() for m in municipios])]
        elif municipio and 'municipio' in df.columns:
            df = df[df['municipio'].str.lower() == municipio.lower()]
        if entidad and 'entidad_federativa' in df.columns:
            df = df[df['entidad_federativa'].str.lower() == entidad.lower()]
        if from_date and 'fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['fecha']):
            df = df[df['fecha'] >= pd.to_datetime(from_date)]
        if to_date and 'fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['fecha']):
            df = df[df['fecha'] <= pd.to_datetime(to_date)]
        if year and 'fecha' in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df['fecha']):
                df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
            df = df[df['fecha'].dt.year == year]
        
        # Orden por fecha si existe
        if 'fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['fecha']):
            df = df.sort_values('fecha')

        # Selección de columnas
        if columns:
            cols = [c.strip() for c in columns.split(',') if c.strip() in df.columns]
            if cols:
                df = df[cols]

        # Límite
        if limit is not None and limit > 0:
            df = df.head(limit)
        
        # Convertir DataFrame a formato JSON
        df = df.replace([float('inf'), float('-inf')], None)
        df = df.fillna('')
        
        # Convertir fechas a string para JSON
        if 'fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['fecha']):
            df['fecha'] = df['fecha'].dt.strftime('%Y-%m-%d')
        
        data = df.to_dict('records')
        
        return jsonify({
            'success': True,
            'data': data,
            'total_records': len(data)
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_pib_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/pib/municipios', methods=['GET'])
def get_pib_municipios():
    """Endpoint para obtener lista de municipios únicos de PIB"""
    try:
        df = get_pib_data()
        
        if 'municipio' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "municipio" no existe en el CSV'
            }), 500
        
        municipios = df['municipio'].dropna().astype(str).unique().tolist()
        municipios = [str(m) for m in municipios if m]
        municipios.sort()
        
        return jsonify({
            'success': True,
            'municipios': municipios
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_pib_municipios: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/pib/entidades', methods=['GET'])
def get_pib_entidades():
    """Endpoint para obtener lista de entidades federativas únicas"""
    try:
        df = get_pib_data()
        
        if 'entidad_federativa' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "entidad_federativa" no existe en el CSV'
            }), 500
        
        entidades = df['entidad_federativa'].dropna().astype(str).unique().tolist()
        entidades = [str(e) for e in entidades if e]
        entidades.sort()
        
        return jsonify({
            'success': True,
            'entidades': entidades
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_pib_entidades: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/pib/years', methods=['GET'])
def get_pib_years():
    """Endpoint para obtener lista de años únicos disponibles en PIB"""
    try:
        df = get_pib_data()
        
        if 'fecha' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "fecha" no existe en el CSV'
            }), 500
        
        if not pd.api.types.is_datetime64_any_dtype(df['fecha']):
            df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
        
        df = df.dropna(subset=['fecha'])
        years = df['fecha'].dt.year.unique().tolist()
        years = [int(y) for y in years if not pd.isna(y)]
        years.sort(reverse=True)
        
        return jsonify({
            'success': True,
            'years': years
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_pib_years: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/pib/municipio/<municipio>', methods=['GET'])
def get_pib_municipio_data(municipio):
    """Endpoint para obtener datos de PIB de un municipio específico"""
    try:
        df = get_pib_data().copy()
        
        if 'municipio' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'La columna "municipio" no existe en el CSV'
            }), 500
        
        municipio_decoded = municipio.replace('%20', ' ').replace('+', ' ')
        municipio_data = df[df['municipio'].str.lower() == municipio_decoded.lower()]

        limit = request.args.get('limit', default=None, type=int)
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        year = request.args.get('year', type=int)
        
        if 'fecha' in municipio_data.columns:
            if not pd.api.types.is_datetime64_any_dtype(municipio_data['fecha']):
                municipio_data['fecha'] = pd.to_datetime(municipio_data['fecha'], errors='coerce')
            municipio_data = municipio_data.sort_values('fecha')
            if from_date:
                municipio_data = municipio_data[municipio_data['fecha'] >= pd.to_datetime(from_date)]
            if to_date:
                municipio_data = municipio_data[municipio_data['fecha'] <= pd.to_datetime(to_date)]
            if year:
                municipio_data = municipio_data[municipio_data['fecha'].dt.year == year]
        
        if limit and limit > 0:
            municipio_data = municipio_data.tail(limit)
        
        if municipio_data.empty:
            return jsonify({
                'success': False,
                'error': f'Municipio {municipio_decoded} no encontrado'
            }), 404
        
        if 'fecha' in municipio_data.columns and pd.api.types.is_datetime64_any_dtype(municipio_data['fecha']):
            municipio_data['fecha'] = municipio_data['fecha'].dt.strftime('%Y-%m-%d')
        
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
        error_msg = f"Error en get_pib_municipio_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/pib/stats', methods=['GET'])
def get_pib_stats():
    """Endpoint para obtener estadísticas de PIB"""
    try:
        df = get_pib_data().copy()
        
        # Estadísticas generales
        general_stats = {
            'total_records': len(df),
            'total_municipios': df['municipio'].nunique() if 'municipio' in df.columns else 0,
            'total_entidades': df['entidad_federativa'].nunique() if 'entidad_federativa' in df.columns else 0,
            'fecha_min': str(df['fecha'].min()) if 'fecha' in df.columns else 'N/A',
            'fecha_max': str(df['fecha'].max()) if 'fecha' in df.columns else 'N/A',
            'pib_mun_promedio': float(df['pib_mun'].mean()) if 'pib_mun' in df.columns else 0.0,
            'pib_mun_maximo': float(df['pib_mun'].max()) if 'pib_mun' in df.columns else 0.0,
            'pib_mun_minimo': float(df['pib_mun'].min()) if 'pib_mun' in df.columns else 0.0,
            'pibe_promedio': float(df['pibe'].mean()) if 'pibe' in df.columns else 0.0
        }
        
        return jsonify({
            'success': True,
            'general': general_stats
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_pib_stats: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/pib/download', methods=['GET'])
def download_pib_data():
    """Endpoint para descargar datos de PIB filtrados como CSV"""
    try:
        df = get_pib_data().copy()
        
        # Aplicar los mismos filtros que en /api/pib/data
        municipio = request.args.get('municipio')
        municipios = request.args.getlist('municipios')  # Lista de municipios
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        columns = request.args.get('columns')
        
        # Filtro por municipio(s)
        if municipios:
            if 'municipio' in df.columns:
                df = df[df['municipio'].str.lower().isin([m.lower() for m in municipios])]
        elif municipio and 'municipio' in df.columns:
            df = df[df['municipio'].str.lower() == municipio.lower()]
        
        # Filtros de fecha
        if 'fecha' in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df['fecha']):
                df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
            
            if from_date:
                df = df[df['fecha'] >= pd.to_datetime(from_date)]
            if to_date:
                df = df[df['fecha'] <= pd.to_datetime(to_date)]
            
            # Ordenar por fecha
            df = df.sort_values('fecha')
        
        # Selección de columnas - solo PIB municipal
        # Incluir solo: fecha, municipio, entidad_federativa, pib_mun
        pib_mun_columns = ['fecha', 'municipio', 'entidad_federativa', 'pib_mun']
        available_columns = [col for col in pib_mun_columns if col in df.columns]
        if available_columns:
            df = df[available_columns]
        
        # Convertir fechas a string formato legible
        if 'fecha' in df.columns and pd.api.types.is_datetime64_any_dtype(df['fecha']):
            df['fecha'] = df['fecha'].dt.strftime('%Y-%m-%d')
        
        # Reemplazar NaN y valores infinitos
        df = df.replace([float('inf'), float('-inf')], '')
        df = df.fillna('')
        
        # Convertir DataFrame a CSV
        output = StringIO()
        df.to_csv(output, index=False, encoding='utf-8-sig')  # utf-8-sig para Excel
        output.seek(0)
        
        # Generar nombre de archivo
        filename = 'datos_pib'
        if municipios:
            filename += f"_{len(municipios)}_municipios"
        elif municipio:
            filename += f"_{municipio.replace(' ', '_')}"
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
        error_msg = f"Error en download_pib_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/eda/combined', methods=['GET'])
def get_combined_data():
    """Endpoint para obtener datos combinados de PIB y Radianza para análisis EDA"""
    try:
        # Obtener parámetros de filtro
        municipios = request.args.getlist('municipios')
        
        # Obtener datos de radianza
        df_radianza = get_blob_data().copy()
        
        # Filtrar por municipios si se especifican
        if municipios and 'Municipio' in df_radianza.columns:
            df_radianza = df_radianza[
                df_radianza['Municipio'].str.lower().isin([m.lower() for m in municipios])
            ]
        
        # Obtener datos de PIB
        df_pib = get_pib_data().copy()
        
        # Filtrar por municipios si se especifican
        if municipios and 'municipio' in df_pib.columns:
            df_pib = df_pib[
                df_pib['municipio'].str.lower().isin([m.lower() for m in municipios])
            ]
        
        # Normalizar nombres de columnas para el merge
        # Radianza usa 'Municipio' y 'Fecha', PIB usa 'municipio' y 'fecha'
        if 'Municipio' in df_radianza.columns:
            df_radianza['municipio_normalized'] = df_radianza['Municipio'].str.lower().str.strip()
        if 'Fecha' in df_radianza.columns:
            if not pd.api.types.is_datetime64_any_dtype(df_radianza['Fecha']):
                df_radianza['Fecha'] = pd.to_datetime(df_radianza['Fecha'], errors='coerce')
            df_radianza['fecha'] = df_radianza['Fecha'].dt.date if pd.api.types.is_datetime64_any_dtype(df_radianza['Fecha']) else df_radianza['Fecha']
        
        if 'municipio' in df_pib.columns:
            df_pib['municipio_normalized'] = df_pib['municipio'].str.lower().str.strip()
        if 'fecha' in df_pib.columns:
            if not pd.api.types.is_datetime64_any_dtype(df_pib['fecha']):
                df_pib['fecha'] = pd.to_datetime(df_pib['fecha'], errors='coerce')
            df_pib['fecha'] = df_pib['fecha'].dt.date if pd.api.types.is_datetime64_any_dtype(df_pib['fecha']) else df_pib['fecha']
        
        # Hacer merge por municipio y fecha
        # Primero intentar merge exacto por municipio y fecha
        merged = pd.merge(
            df_radianza,
            df_pib[['municipio_normalized', 'fecha', 'pib_mun', 'pibe', 'porc_pob']],
            left_on=['municipio_normalized', 'fecha'],
            right_on=['municipio_normalized', 'fecha'],
            how='inner'
        )
        
        # Si no hay suficientes datos con merge exacto, intentar solo por municipio (promedio)
        if len(merged) < 100:
            # Agrupar PIB por municipio (promedio)
            pib_avg = df_pib.groupby('municipio_normalized').agg({
                'pib_mun': 'mean',
                'pibe': 'mean',
                'porc_pob': 'mean'
            }).reset_index()
            
            # Merge solo por municipio
            merged = pd.merge(
                df_radianza,
                pib_avg,
                on='municipio_normalized',
                how='inner'
            )
        
        # Seleccionar columnas relevantes
        result_columns = []
        if 'Municipio' in merged.columns:
            result_columns.append('Municipio')
        elif 'municipio' in merged.columns:
            result_columns.append('municipio')
        if 'Media_de_radianza' in merged.columns:
            result_columns.append('Media_de_radianza')
        if 'pib_mun' in merged.columns:
            result_columns.append('pib_mun')
        if 'pibe' in merged.columns:
            result_columns.append('pibe')
        if 'porc_pob' in merged.columns:
            result_columns.append('porc_pob')
        if 'Fecha' in merged.columns:
            result_columns.append('Fecha')
        elif 'fecha' in merged.columns:
            result_columns.append('fecha')
        
        merged = merged[result_columns]
        
        # Limpiar datos
        merged = merged.replace([float('inf'), float('-inf')], None)
        merged = merged.fillna('')
        
        # Convertir fechas a string
        for col in ['Fecha', 'fecha']:
            if col in merged.columns:
                if pd.api.types.is_datetime64_any_dtype(merged[col]):
                    merged[col] = merged[col].dt.strftime('%Y-%m-%d')
                else:
                    merged[col] = merged[col].astype(str)
        
        data = merged.to_dict('records')
        
        return jsonify({
            'success': True,
            'data': data,
            'total_records': len(data)
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_combined_data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

@app.route('/api/eda/quarterly', methods=['GET'])
def get_quarterly_combined_data():
    """Endpoint para obtener datos combinados de PIB y Radianza agregados por trimestre"""
    try:
        # Obtener parámetros de filtro
        municipios = request.args.getlist('municipios')
        
        # Obtener datos de radianza
        df_radianza = get_blob_data().copy()
        
        # Filtrar por municipios si se especifican
        if municipios and 'Municipio' in df_radianza.columns:
            df_radianza = df_radianza[
                df_radianza['Municipio'].str.lower().isin([m.lower() for m in municipios])
            ]
        
        # Obtener datos de PIB
        df_pib = get_pib_data().copy()
        
        # Filtrar por municipios si se especifican
        if municipios and 'municipio' in df_pib.columns:
            df_pib = df_pib[
                df_pib['municipio'].str.lower().isin([m.lower() for m in municipios])
            ]
        
        # Preparar datos de radianza
        if 'Fecha' in df_radianza.columns:
            if not pd.api.types.is_datetime64_any_dtype(df_radianza['Fecha']):
                df_radianza['Fecha'] = pd.to_datetime(df_radianza['Fecha'], errors='coerce')
            df_radianza = df_radianza.dropna(subset=['Fecha'])
            df_radianza['quarter'] = df_radianza['Fecha'].dt.to_period('Q').astype(str)
        
        # Preparar datos de PIB
        if 'fecha' in df_pib.columns:
            if not pd.api.types.is_datetime64_any_dtype(df_pib['fecha']):
                df_pib['fecha'] = pd.to_datetime(df_pib['fecha'], errors='coerce')
            df_pib = df_pib.dropna(subset=['fecha'])
            df_pib['quarter'] = df_pib['fecha'].dt.to_period('Q').astype(str)
        
        # Convertir columnas numéricas de radianza a tipo numérico
        radianza_numeric_cols = [
            'Cantidad_de_pixeles', 'total_pixeles', 'Suma_de_radianza', 
            'Media_de_radianza', 'Desviacion_estandar_de_radianza',
            'Maximo_de_radianza', 'Minimo_de_radianza',
            'Percentil_25_de_radianza', 'Percentil_50_de_radianza', 'Percentil_75_de_radianza'
        ]
        
        for col in radianza_numeric_cols:
            if col in df_radianza.columns:
                # Convertir a numérico, reemplazando comas por puntos y manejando errores
                df_radianza[col] = pd.to_numeric(
                    df_radianza[col].astype(str).str.replace(',', '.'), 
                    errors='coerce'
                )
        
        # Agrupar radianza por trimestre
        radianza_agg_cols = {}
        
        # Verificar qué columnas existen y agregarlas
        if 'Cantidad_de_pixeles' in df_radianza.columns:
            radianza_agg_cols['Cantidad_de_pixeles'] = 'median'
        elif 'total_pixeles' in df_radianza.columns:
            radianza_agg_cols['total_pixeles'] = 'median'
        
        if 'Suma_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Suma_de_radianza'] = ['sum', 'median', 'std', 'mean']
        
        if 'Media_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Media_de_radianza'] = 'mean'
        
        if 'Desviacion_estandar_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Desviacion_estandar_de_radianza'] = 'mean'
        
        if 'Maximo_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Maximo_de_radianza'] = 'max'
        
        if 'Minimo_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Minimo_de_radianza'] = 'min'
        
        if 'Percentil_25_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Percentil_25_de_radianza'] = 'mean'
        
        if 'Percentil_50_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Percentil_50_de_radianza'] = 'mean'
        
        if 'Percentil_75_de_radianza' in df_radianza.columns:
            radianza_agg_cols['Percentil_75_de_radianza'] = 'mean'
        
        # Agrupar radianza por trimestre
        if radianza_agg_cols and 'quarter' in df_radianza.columns:
            mont_trend_quarter = df_radianza.groupby('quarter').agg(radianza_agg_cols).reset_index()
            
            # Aplanar MultiIndex si existe
            if isinstance(mont_trend_quarter.columns, pd.MultiIndex):
                mont_trend_quarter.columns = ['_'.join(col).strip('_') if col[1] else col[0] 
                                             for col in mont_trend_quarter.columns.values]
        else:
            mont_trend_quarter = pd.DataFrame(columns=['quarter'])
        
        # Convertir columnas numéricas de PIB a tipo numérico
        pib_numeric_cols = ['pib_mun', 'pibe', 'porc_pob']
        
        import re
        for col in pib_numeric_cols:
            if col in df_pib.columns:
                # Función para extraer el primer número válido de un string
                def extract_first_number(val):
                    if pd.isna(val) or val == '':
                        return None
                    val_str = str(val).replace(',', '.')
                    # Buscar el primer número válido (puede tener decimales)
                    match = re.search(r'^(\d+\.?\d*)', val_str)
                    if match:
                        try:
                            return float(match.group(1))
                        except:
                            return None
                    return None
                
                # Primero intentar convertir directamente
                df_pib[col] = pd.to_numeric(
                    df_pib[col].astype(str).str.replace(',', '.'), 
                    errors='coerce'
                )
                
                # Si todavía hay valores no numéricos (objeto), extraer el primer número
                if df_pib[col].dtype == 'object':
                    df_pib[col] = df_pib[col].apply(extract_first_number)
                    df_pib[col] = pd.to_numeric(df_pib[col], errors='coerce')
        
        # Agrupar PIB por trimestre
        pib_agg_cols = {}
        if 'pib_mun' in df_pib.columns:
            pib_agg_cols['pib_mun'] = ['mean', 'median', 'sum', 'std']
        if 'pibe' in df_pib.columns:
            pib_agg_cols['pibe'] = ['mean', 'median']
        if 'porc_pob' in df_pib.columns:
            pib_agg_cols['porc_pob'] = 'mean'
        
        if pib_agg_cols and 'quarter' in df_pib.columns:
            # Filtrar solo las filas donde las columnas numéricas no sean NaN antes de agrupar
            pib_trend = df_pib.groupby('quarter').agg(pib_agg_cols).reset_index()
            
            # Aplanar MultiIndex si existe
            if isinstance(pib_trend.columns, pd.MultiIndex):
                pib_trend.columns = ['_'.join(col).strip('_') if col[1] else col[0] 
                                    for col in pib_trend.columns.values]
        else:
            pib_trend = pd.DataFrame(columns=['quarter'])
        
        # Hacer merge por trimestre
        if len(mont_trend_quarter) > 0 and len(pib_trend) > 0:
            merged_quarter = pd.merge(
                mont_trend_quarter,
                pib_trend,
                on='quarter',
                how='inner',
                suffixes=('_luz', '_pib')
            )
        else:
            merged_quarter = pd.DataFrame()
        
        # Limpiar datos
        if len(merged_quarter) > 0:
            merged_quarter = merged_quarter.replace([float('inf'), float('-inf')], None)
            merged_quarter = merged_quarter.fillna(0)
            
            # Convertir a dict para JSON
            data = merged_quarter.to_dict('records')
        else:
            data = []
        
        return jsonify({
            'success': True,
            'data': data,
            'total_records': len(data)
        })
    except Exception as e:
        import traceback
        error_msg = f"Error en get_quarterly_combined_data: {str(e)}\n{traceback.format_exc()}"
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

@app.route('/api/info', methods=['GET'])
def info():
    """Endpoint de información del sistema (compatibilidad con frontend antiguo)"""
    return jsonify({
        'message': '¡Hola desde Railway!',
        'environment': os.getenv('RAILWAY_ENVIRONMENT', os.getenv('FLASK_ENV', 'local')),
        'python_version': os.sys.version.split()[0]
    })

@app.route('/api/chart-data', methods=['GET'])
def chart_data():
    """Endpoint para datos de gráfica (compatibilidad con frontend antiguo)"""
    try:
        # Intentar obtener datos reales del blob storage
        df = get_blob_data()
        
        # Si hay datos de fecha, usar los últimos 7 registros
        if 'Fecha' in df.columns and len(df) > 0:
            df_sorted = df.sort_values('Fecha') if pd.api.types.is_datetime64_any_dtype(df['Fecha']) else df
            df_sample = df_sorted.tail(7)
            
            # Usar fecha como labels si es posible
            if pd.api.types.is_datetime64_any_dtype(df_sample['Fecha']):
                labels = df_sample['Fecha'].dt.strftime('%Y-%m-%d').tolist()
            else:
                labels = df_sample['Fecha'].astype(str).tolist()
            
            # Usar Media_de_radianza si existe, sino usar el primer valor numérico
            if 'Media_de_radianza' in df_sample.columns:
                data = df_sample['Media_de_radianza'].fillna(0).tolist()
            else:
                # Buscar primera columna numérica
                numeric_cols = df_sample.select_dtypes(include=['number']).columns
                if len(numeric_cols) > 0:
                    data = df_sample[numeric_cols[0]].fillna(0).tolist()
                else:
                    data = [0] * len(labels)
        else:
            # Fallback: datos de ejemplo
            import random
            labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
            data = [random.randint(10, 100) for _ in range(7)]
        
        # Determinar el label correcto
        label = 'Radianza Media'
        try:
            if 'Media_de_radianza' in df.columns:
                label = 'Radianza Media'
            else:
                label = 'Visitas'
        except:
            label = 'Visitas'
        
        return jsonify({
            'labels': labels,
            'datasets': [{
                'label': label,
                'data': data,
                'backgroundColor': 'rgba(102, 126, 234, 0.5)',
                'borderColor': 'rgba(102, 126, 234, 1)',
                'borderWidth': 2
            }]
        })
    except Exception as e:
        # Si falla, devolver datos de ejemplo
        import random
    labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    data = [random.randint(10, 100) for _ in range(7)]
    
    return jsonify({
        'labels': labels,
        'datasets': [{
            'label': 'Visitas',
            'data': data,
            'backgroundColor': 'rgba(102, 126, 234, 0.5)',
            'borderColor': 'rgba(102, 126, 234, 1)',
            'borderWidth': 2
        }]
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
