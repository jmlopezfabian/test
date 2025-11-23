from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import os
import random
from datetime import datetime

# Configurar Flask para servir archivos estáticos
app = Flask(__name__, static_folder='frontend/dist', static_url_path='')
CORS(app)  # Permitir peticiones desde el frontend React

@app.route('/api/info')
def info():
    return jsonify({
        'message': '¡Hola desde Railway!',
        'environment': os.getenv('RAILWAY_ENVIRONMENT', 'local'),
        'python_version': os.sys.version.split()[0]
    })

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'}), 200

@app.route('/api/chart-data')
def chart_data():
    # Genera datos de ejemplo para la gráfica
    # En una app real, estos datos vendrían de una base de datos
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

# Ruta para servir el index.html de React
@app.route('/')
def index():
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
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

