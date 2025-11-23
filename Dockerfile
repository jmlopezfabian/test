# Dockerfile multi-stage: construye frontend y backend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copiar archivos del frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./

# Construir el frontend
RUN npm run build

# Verificar que el build fue exitoso
RUN ls -la dist/ && echo "✓ Build completed" || echo "✗ Build failed!"
RUN test -f dist/index.html && echo "✓ index.html created" || echo "✗ index.html NOT created!"

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

# Verificar que los archivos del frontend están presentes
RUN echo "=== Verificando archivos copiados ===" && \
    ls -la frontend/ && \
    ls -la frontend/dist/ && \
    test -f frontend/dist/index.html && echo "✓✓✓ index.html found ✓✓✓" || echo "✗✗✗ index.html NOT found ✗✗✗"

# Exponer puerto (Railway proporciona PORT automáticamente)
EXPOSE 5000

# Copiar script de inicio
COPY start.sh .
RUN chmod +x start.sh

# Ejecutar con el script de inicio que incluye debugging
CMD ["./start.sh"]
