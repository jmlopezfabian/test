#!/bin/bash
set -e

echo "=== Starting Application ==="
echo "PORT: ${PORT:-5000}"
echo "RAILWAY_ENVIRONMENT: ${RAILWAY_ENVIRONMENT:-not set}"
echo "Current directory: $(pwd)"
echo "Files in current directory:"
ls -la

echo ""
echo "Checking frontend/dist:"
if [ -d "frontend/dist" ]; then
    echo "✓ frontend/dist exists"
    ls -la frontend/dist/ | head -10
    if [ -f "frontend/dist/index.html" ]; then
        echo "✓ index.html found"
    else
        echo "✗ index.html NOT found"
    fi
else
    echo "✗ frontend/dist does NOT exist"
fi

echo ""
echo "Starting Gunicorn..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 8 --timeout 0 --access-logfile - --error-logfile - --log-level info app:app

