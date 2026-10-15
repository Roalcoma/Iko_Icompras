# Iko · Icompras Sync

Servicio de integración que importa automáticamente los pedidos de **iCompras** al ERP **ICG** del cliente Iko. Lee los archivos `.txt` que deja iCompras en una carpeta, calcula precios y descuentos con las reglas del sistema y los inserta como pedidos autorizados en `CABECERA_PED` / `LINEA_PED`, listos para que ICG los importe. Incluye un panel web de configuración y control.

Documentación técnica completa: [`docs/DOCUMENTACION.md`](docs/DOCUMENTACION.md).

## Funcionalidades

- **Importación automática** de pedidos `.txt` desde una carpeta (local o de red) con intervalo configurable.
- **Precios por tarifa del cliente** (`TARIFASCLIENTE`), con tarifa base de respaldo.
- **Descuentos**: D1 del archivo, D2 por promociones vigentes y D3 por **promociones de triangulación** por proveedor o marca con escalas por unidades o monto.
- **Separación de pedidos**: psicotrópicos (`P`), sin descuento (`SD`), no indexados (`NI`) y normales; partición por máximo de líneas.
- **Validación de stock** del almacén y resolución de lotes.
- **Panel de control**: ver pedidos agrupados, detalle de líneas, autorizar y eliminar/reprocesar.
- **Actualizador** desde GitHub con reinicio de servicios NSSM.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js, Express 5, TypeScript, `mssql` |
| Frontend | Vue 3, Vuetify 4, Vue Router, Vite, TypeScript |
| Base de datos | SQL Server (ERP ICG) |
| Servicio | NSSM (Windows) |

## Requisitos

- Node.js 22 y npm.
- SQL Server con la base de ICG y un usuario con lectura/escritura y permiso para crear tablas y columnas.
- Acceso a la carpeta donde iCompras deja los pedidos.
- NSSM (opcional) para correr como servicio y usar el actualizador.

## Instalación

```bash
git clone https://github.com/Roalcoma/Iko_Icompras.git
cd Iko_Icompras/backend_icompras_iko_v1.0
npm install
cd ../frontend_pedidos_drogueria_v1.2
npm install
```

## Variables de entorno

### Backend — `backend_icompras_iko_v1.0/.env`

```env
PORT=9000

# Conexión (se usa solo si no existe config/connections.json)
DB_SERVER=localhost
DB_PORT=1433
DB_USER=usuario_sql
DB_PASSWORD=cambiar
DB_NAME=BASE_ICG
DB_ESQUEMA=dbo

# Código de vendedor por defecto si el cliente no tiene uno asignado
VED=1
```

### Backend — `backend_icompras_iko_v1.0/config/connections.json`

Tiene prioridad sobre `.env` y se edita desde la pantalla **Configuración**. No se sube al repositorio.

```json
{
  "server": "localhost",
  "port": 1433,
  "user": "usuario_sql",
  "password": "cambiar",
  "dbName": "BASE_ICG",
  "esquema": "dbo",
  "codAlmacen": "ALM",
  "tarifaBaseCatalogo": 2,
  "dptoPsicotropicos": 6,
  "maxLineasPorPedido": 50,
  "intervaloEscaneo": 30,
  "githubZipUrl": "https://github.com/usuario/repo/archive/refs/heads/main.zip",
  "nssmServicioBackend": "",
  "nssmServicioFrontend": ""
}
```

La ruta de la carpeta de pedidos se guarda en la base (`APP_ECOMMERCE_CONFIG`) desde la misma pantalla.

### Frontend — `frontend_pedidos_drogueria_v1.2/.env`

```env
VITE_API_URL=http://localhost:9000
```

## Ejecución

```bash
# Backend (desarrollo)
cd backend_icompras_iko_v1.0 && npm run dev

# Frontend (desarrollo)
cd frontend_pedidos_drogueria_v1.2 && npm run dev
```

Al arrancar, el backend crea las tablas `APP_*` que falten y empieza a escanear la carpeta.

> ⚠️ Los pedidos se insertan directamente como **AUTORIZADO**. Para probar, usar una copia de la base y una carpeta de prueba.

## Despliegue

1. Backend: `npm run build` y servicio NSSM con `node dist/index.js` (directorio `backend_icompras_iko_v1.0`).
2. Frontend: `npm run build-only` y servicio NSSM con `npm start` (`serve -s dist -l 9010`).
3. Cargar los nombres de los servicios en Configuración para que el actualizador pueda reiniciarlos.

El actualizador (pantalla **Actualizador**) descarga el ZIP configurado y copia los archivos sin tocar `.env`, `connections.json`, `node_modules` ni `dist`. **No compila ni instala dependencias**: después de actualizar, ejecutar `npm install` y los builds en el servidor.

> La API no tiene autenticación: publicarla solo dentro de la red interna.

## Estructura

```
├── backend_icompras_iko_v1.0/
│   ├── src/
│   │   ├── index.ts          # Arranque y bucle de escaneo
│   │   ├── routers/          # ecommerce, sistema, triangulacion, pedidos-ctrl
│   │   ├── controllers/
│   │   ├── services/         # ecommerce (núcleo), triangulacion, promociones, pedidosCtrl, actualizador
│   │   └── db/               # Conexión a SQL Server
│   ├── config/               # connections.json — NO se sube
│   └── scripts/              # Diagnóstico
├── frontend_pedidos_drogueria_v1.2/
│   └── src/pages/            # Configuración, Pedidos, Promos (triangulación), Actualizador
├── docs/DOCUMENTACION.md
└── CLAUDE.md
```
