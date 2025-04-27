# dys-api-stock

Microservicio para consulta y actualización de stock, con notificaciones automáticas a Telegram.

## Requisitos

- Node.js 20
- MongoDB (URI en variable de entorno)
- Bot de Telegram (TOKEN y CHAT_ID en variables de entorno)

## Instalación y uso en local

1. Clonar el repositorio:
   ```bash
   git clone <url-repo> dys-api-stock
   cd dys-api-stock

2. Instalar dependencias:
   ```bash 
   npm install
3. Ejecutar en modo desarrollo:
   ```bash 
   npm run start-dev

4. Probar endpoints:
   ```bash 
   GET /api/stock/:sku
   GET /api/batch/sku?skus=111,222,333
   POST /api/sku con JSON { sku, stock, location }