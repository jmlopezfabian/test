"""
Configuración de la aplicación usando variables de entorno.
Las variables se pueden definir en un archivo .env o como variables de entorno del sistema.
"""
import os
from dotenv import load_dotenv

# Cargar variables de entorno desde archivo .env si existe
load_dotenv()

# Configuración de Azure Blob Storage
STORAGE_ACCOUNT_NAME = os.getenv('STORAGE_ACCOUNT_NAME', 'trabajoterminal')
STORAGE_ACCOUNT_KEY = os.getenv('STORAGE_ACCOUNT_KEY', '')
CONTAINER_NAME = os.getenv('CONTAINER_NAME', 'radianza')
BLOB_NAME = os.getenv('BLOB_NAME', 'municipios_completos_limpio.csv')

# Configuración de Flask
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
# Railway usa PORT, pero mantenemos FLASK_PORT como fallback para compatibilidad
FLASK_PORT = int(os.getenv('PORT', os.getenv('FLASK_PORT', 5000)))
FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

# Configuración de CORS
CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')

# Configuración de cache
CACHE_TTL_SECONDS = int(os.getenv('CACHE_TTL_SECONDS', 300))  # 5 minutos por defecto

# Validar que las credenciales críticas estén configuradas
# No lanzar excepción aquí para permitir que la app inicie (fallará al usar blob storage)
if not STORAGE_ACCOUNT_KEY:
    import warnings
    warnings.warn(
        "STORAGE_ACCOUNT_KEY no está configurada. "
        "La aplicación iniciará pero las funciones de blob storage fallarán."
    )

# Construir connection string
CONNECTION_STRING = (
    f"DefaultEndpointsProtocol=https;"
    f"AccountName={STORAGE_ACCOUNT_NAME};"
    f"AccountKey={STORAGE_ACCOUNT_KEY};"
    f"EndpointSuffix=core.windows.net"
)

