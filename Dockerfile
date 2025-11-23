# Dockerfile multi-stage: construye frontend y backend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copiar archivos del frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./

# Construir el frontend
RUN npm run build

# Stage 2: Backend con Python
FROM python:3.11-slim

WORKDIR /app

# Copiar archivos del backend
COPY requirements.txt .
COPY app.py .

# Copiar los archivos construidos del frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Exponer puerto
EXPOSE 5000

# Variable de entorno para el puerto (Railway usa PORT automáticamente)
ENV PORT=5000

# Ejecutar con gunicorn
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 0 app:app
