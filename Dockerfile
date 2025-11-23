# Dockerfile para backend Flask
FROM python:3.11-slim

WORKDIR /app

# Copiar solo los archivos necesarios para el backend
COPY requirements.txt .
COPY app.py .

# Instalar dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Exponer puerto
EXPOSE 5000

# Variable de entorno para el puerto
ENV PORT=5000

# Ejecutar con gunicorn
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 0 app:app

