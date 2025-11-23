# Web App Full-Stack con Flask + React

Una aplicación web full-stack creada con Flask (backend) y React (frontend) para practicar despliegue en Railway.

## 🚀 Características

- **Backend**: Flask API REST con CORS habilitado
- **Frontend**: React con Vite + Chart.js
- **Interfaz**: Moderna y responsive
- **Gráficas**: Interactivas con datos en tiempo real
- **Despliegue**: Lista para Railway

## 📋 Requisitos

- Python 3.8+
- Node.js 16+ y npm
- pip

## 📁 Estructura del Proyecto

```
.
├── app.py              # Backend Flask (API REST)
├── requirements.txt    # Dependencias Python
├── Procfile           # Configuración para Railway
├── railway.json       # Configuración avanzada de Railway
├── frontend/          # Frontend React
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── App.jsx        # Componente principal
│   │   └── App.css        # Estilos
│   ├── package.json
│   └── vite.config.js     # Configuración Vite
├── run.sh             # Script para ejecutar solo backend
└── README.md          # Este archivo
```

## 🛠️ Instalación y Ejecución Local

### Opción 1: Ejecutar Backend y Frontend Juntos (Recomendado)

```bash
# Instalar todas las dependencias (primera vez)
npm run install-all

# Ejecutar backend (puerto 5000) y frontend (puerto 3000) simultáneamente
npm run dev
```

Luego abre: `http://localhost:3000`

### Opción 2: Ejecutar por Separado

#### Backend (Terminal 1):
```bash
# Activar entorno virtual
source venv/bin/activate

# Instalar dependencias (si no lo has hecho)
pip install -r requirements.txt

# Ejecutar backend
python app.py
```
Backend estará en: `http://localhost:5000`

#### Frontend (Terminal 2):
```bash
cd frontend

# Instalar dependencias (si no lo has hecho)
npm install

# Ejecutar frontend
npm run dev
```
Frontend estará en: `http://localhost:3000`

### Opción 3: Solo Backend (con HTML antiguo)

```bash
./run.sh
```
Esto ejecuta solo el backend. Nota: El backend ya no sirve HTML, solo APIs.

## 🔌 Endpoints de la API

- `GET /api/info` - Información del sistema (JSON)
- `GET /api/health` - Estado de salud del servidor (JSON)
- `GET /api/chart-data` - Datos para la gráfica (JSON)

## 🚂 Despliegue en Railway

### Opción A: Desplegar Backend y Frontend Separados (Recomendado)

#### 1. Backend en Railway:

El proyecto ya está configurado con un `Dockerfile` que solo construye el backend Python.

1. Crea un nuevo proyecto en Railway
2. Conecta tu repositorio
3. Railway usará automáticamente el `Dockerfile` para construir el backend
4. El puerto se configura automáticamente mediante la variable `PORT`
5. Anota la URL del backend (ej: `https://tu-backend.railway.app`)

**Nota**: El `Dockerfile` y `.dockerignore` están configurados para ignorar el frontend y solo construir el backend.

#### 2. Frontend en Railway (Opcional):

1. Crea otro proyecto en Railway
2. Conecta el mismo repositorio pero configura:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx serve -s dist`
   - Instala `serve` primero: `npm install -g serve` o usa `npx serve`
3. Configura variable de entorno:
   - `VITE_API_URL`: URL de tu backend (ej: `https://tu-backend.railway.app/api`)

### Opción B: Desplegar Solo Backend (Frontend local o Vercel)

Puedes desplegar solo el backend en Railway y el frontend en otra plataforma como Vercel o Netlify.

1. Construye el frontend:
```bash
cd frontend
npm run build
```

2. Despliega el build en Vercel/Netlify
3. Configura `VITE_API_URL` apuntando a tu backend en Railway

### Configuración del Backend

El proyecto incluye:
- `Dockerfile`: Construcción del backend Python
- `.dockerignore`: Excluye frontend y archivos innecesarios
- `railway.json`: Configuración de Railway para usar Dockerfile
- `Procfile`: Comando alternativo de inicio (si no usas Dockerfile)

## 🔧 Configuración de Desarrollo

### Variables de Entorno

**Backend**: No requiere variables de entorno para desarrollo local.

**Frontend**: Crea `frontend/.env.local`:
```
VITE_API_URL=http://localhost:5000/api
```

O usa el proxy configurado en `vite.config.js` (ya configurado por defecto).

## 📝 Notas

- El backend usa Flask-CORS para permitir peticiones desde el frontend
- En desarrollo, Vite hace proxy automático de `/api` al backend
- El frontend está configurado para comunicarse con el backend mediante axios
- Para producción, asegúrate de configurar `VITE_API_URL` con la URL correcta

## 🎨 Personalización

### Backend:
- Modifica `app.py` para agregar nuevos endpoints
- Los datos actuales son de ejemplo (random), conéctate a una BD real

### Frontend:
- Modifica componentes en `frontend/src/components/`
- Estilos en `frontend/src/App.css`
- Agrega más gráficas o funcionalidades

## 🐛 Solución de Problemas

**Error de CORS**: Asegúrate de que Flask-CORS está instalado y configurado en `app.py`

**Frontend no conecta con backend**: 
- Verifica que el backend esté corriendo en puerto 5000
- Revisa la consola del navegador para ver errores
- Verifica `VITE_API_URL` en desarrollo

**Gráfica no se muestra**:
- Verifica que Chart.js esté instalado: `npm install chart.js react-chartjs-2`
- Revisa la consola del navegador

## 📚 Tecnologías Utilizadas

- **Backend**: Flask, Flask-CORS, Gunicorn
- **Frontend**: React, Vite, Chart.js, Axios
- **Despliegue**: Railway

¡Buena suerte con tu despliegue! 🚀
