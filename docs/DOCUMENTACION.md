# Documentación técnica — Iko · Icompras Sync

> Repositorio: `Roalcoma/Iko_Icompras`, rama `main`.
> Proyecto derivado de *APP Pedidos Droguería* (`Roalcoma/proyecto-drogueria`): reutiliza su conexión, su servicio de promociones y el formato de pedidos, pero solo conserva la integración de pedidos de iCompras/e-commerce.

## 1. Propósito y contexto de negocio

Servicio de sincronización para el cliente **Iko** sobre el ERP **ICG**. Toma los pedidos que deja la plataforma **iCompras** como archivos `.txt` en una carpeta, los importa a tablas de staging y los inserta **auto-aprobados** (estatus `AUTORIZADO`) en `CABECERA_PED` / `LINEA_PED`, de donde ICG los importa como pedidos de venta. En el camino:

- Resuelve el artículo por código de barras (o `CODARTICULO`) y el cliente por código o RIF.
- Toma el precio de la **tarifa del cliente** (`TARIFASCLIENTE.IDTARIFAV`; si no tiene, `tarifaBaseCatalogo`).
- Aplica descuentos: D1 del archivo, D2 por promociones vigentes (tablas `APP_PROMOCIONES*`) y D3 por **promociones de triangulación** por proveedor/marca.
- Separa en sub-pedidos (psicotrópicos `P`, sin descuento `SD`, no indexados `NI`, normal) y parte por `maxLineasPorPedido`.
- Recorta cantidades al stock del almacén.

Un pequeño panel web permite configurar la conexión, ver/autorizar/eliminar los pedidos importados, administrar las promociones de triangulación y actualizar la app desde GitHub.

## 2. Arquitectura y flujo de datos

```
iCompras ──► carpeta (RUTA en APP_ECOMMERCE_CONFIG) ── *.txt
                         │  escaneo cada intervaloEscaneo s (mín. 5)
                         ▼
Backend Express (puerto 9000) ── EcommerceService.escanearCarpeta()
   ├─ parsea .txt → APP_ECOMMERCE_PEDIDOS / APP_ECOMMERCE_LINEAS (staging)
   ├─ aprobarPedido(): cliente, tarifa, artículos, promos, triangulación, stock, partición
   ├─ INSERT CABECERA_PED + LINEA_PED (ESTATUS 'AUTORIZADO') + APP_PEDIDO_LOG, en una transacción
   └─ renombra el archivo a .done (ok) o .error (falló, con MENSAJE_ERROR)
                         │
                         ▼
SQL Server (base ICG) ──► proceso externo de ICG importa CABECERA_PED/LINEA_PED

Panel Vue (Vite, puerto 5173 en desarrollo / `serve` 9010) ──HTTP──► Backend
```

- Capas: `routers/` → `controllers/` → `services/` (SQL con `mssql`).
- `db/db.conection.ts`: copiado de Pedidos Droguería; tiene pools de producción, pruebas y rutero, pero aquí **no hay middleware de modo pruebas**: siempre se usa `dbName`.
- El escaneo es un `setTimeout` recursivo, así un cambio de `intervaloEscaneo` aplica sin reiniciar. Un flag `escaneando` evita solapes.
- El backend **no sirve** el frontend: son dos procesos.

## 3. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js, Express 5, TypeScript, `mssql`, `adm-zip`, `xlsx`, `multer`, `dotenv` |
| Frontend | Vue 3, Vuetify 4, Vue Router, Vite, TypeScript, axios |
| Base de datos | SQL Server (ERP ICG) |
| Servicio Windows | NSSM (opcional, para el actualizador) |

## 4. Estructura de carpetas

```
Iko_Icompras/
├── backend_icompras_iko_v1.0/
│   ├── src/
│   │   ├── index.ts                     # Arranque, rutas, initTablas, bucle de escaneo
│   │   ├── routers/                     # ecommerce, sistema, triangulacion, pedidosCtrl
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── ecommerce.service.ts     # Núcleo: parseo, staging, aprobación e inserción
│   │   │   ├── promociones.service.ts   # Copia del de Pedidos Droguería (solo se usa getVigentes)
│   │   │   ├── triangulacion.service.ts # Promos por proveedor/marca con escalas
│   │   │   ├── pedidosCtrl.service.ts   # Panel de control de pedidos EC-
│   │   │   ├── actualizador.service.ts  # Actualización desde ZIP de GitHub + NSSM
│   │   │   └── dbconfig.service.ts      # config/connections.json → .env
│   │   └── db/                          # db.conection.ts, init.general.sql (legado)
│   ├── config/                          # connections.json (NO versionado), facturas_config.json
│   └── scripts/                         # Scripts sueltos de diagnóstico (ts-node)
└── frontend_pedidos_drogueria_v1.2/     # Panel (el nombre de carpeta viene del proyecto original)
    └── src/
        ├── App.vue                      # Barra con navegación
        ├── router/index.ts
        └── pages/                       # ConfigView, PedidosCtrlView, TriangulacionView, ActualizadorView
```

## 5. Endpoints

**Ninguna ruta exige autenticación** (ver §11).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Salud: `Icompras sync API`. |
| GET | `/ecommerce/config` | Ruta de la carpeta de pedidos. |
| PUT | `/ecommerce/config` | Guarda la ruta (`APP_ECOMMERCE_CONFIG.RUTA`). |
| POST | `/ecommerce/escanear` | Escaneo inmediato de la carpeta. |
| GET | `/ecommerce/pedidos` | Pedidos en staging (búsqueda y paginación). |
| GET | `/ecommerce/pedidos/:id/lineas` | Líneas en staging. |
| PATCH | `/ecommerce/pedidos/:id/procesado` | Marca/desmarca procesado. |
| POST | `/ecommerce/pedidos/:id/aprobar` | Ejecuta la aprobación (inserta en `CABECERA_PED`). |
| GET | `/pedidos-ctrl` | Pedidos `EC-%` agrupados por número base con sus sub-pedidos. |
| GET | `/pedidos-ctrl/:orderId/lineas` | Líneas de `LINEA_PED` con descuentos. |
| POST | `/pedidos-ctrl/:orderId/autorizar` | `PENDIENTE → AUTORIZADO` + log. |
| DELETE | `/pedidos-ctrl/:orderId` | Borra todos los sub-pedidos del número base, su staging y su log, y renombra el `.done`/`.error` a `.txt` para reprocesar. |
| GET | `/triangulacion` | Promociones de triangulación con escalas. |
| POST | `/triangulacion` | Crea promoción. |
| PUT | `/triangulacion/:id` | Actualiza. |
| DELETE | `/triangulacion/:id` | Elimina (escalas en cascada). |
| POST | `/triangulacion/:idPromo/escalas` | Agrega escala. |
| DELETE | `/triangulacion/escalas/:id` | Elimina escala. |
| GET | `/triangulacion/buscar/proveedores?q=` | Busca en `PROVEEDORES`. |
| GET | `/triangulacion/buscar/marcas?q=` | Busca en `MARCA`. |
| GET | `/sistema/db-config` | Configuración (clave enmascarada). |
| POST | `/sistema/db-config/probar` | Prueba una conexión. |
| POST | `/sistema/db-config/guardar` | Guarda `connections.json` y reconecta. |
| POST | `/sistema/actualizar` | Actualiza desde el ZIP configurado y reinicia NSSM. |

## 6. Pantallas del frontend

| Ruta | Vista | Qué hace |
|---|---|---|
| `/` | `ConfigView` | Conexión SQL, ruta de carpeta, intervalo de escaneo, máx. líneas por pedido, sección de psicotrópicos, URL del ZIP y servicios NSSM; probar conexión y escanear ahora. |
| `/pedidos` | `PedidosCtrlView` | Pedidos `EC-` agrupados, detalle de líneas, autorizar y eliminar/reprocesar. |
| `/triangulacion` | `TriangulacionView` | CRUD de promociones por proveedor/marca y sus escalas. |
| `/actualizador` | `ActualizadorView` | Lanza la actualización y muestra el log. |

Todas las vistas llaman a `import.meta.env.VITE_API_URL`.

## 7. Formato del archivo `.txt`

Campos separados por `|`. Una línea es **cabecera** si el campo 2 empieza con fecha `YYYY-MM-DD`; el resto son líneas de detalle.

| Tipo | Campo | Uso |
|---|---|---|
| Cabecera | 0 | Número de pedido |
| Cabecera | 1 | Código de cliente |
| Cabecera | 2 | Fecha |
| Cabecera | 3 | Estatus |
| Cabecera | 10 / 11 | Nombre / RIF del cliente |
| Cabecera | 16 / 17 | Total bruto / monto de descuento (→ `DESCUENTO_PCT`) |
| Detalle | 2 | Código de barras o artículo |
| Detalle | 3 | Descripción |
| Detalle | 5 | Precio unitario (informativo; se usa la tarifa del sistema) |
| Detalle | 19 | Cantidad despachada (contada); si es ≤ 0 la línea se ignora |
| Detalle | 24 | Lote (`N/A` → lote más próximo a vencer en `ARTICULOSLIN`) |
| Detalle | 47 / 51 | Descuento 1 (se usa 47; si es 0, 51) |

## 8. Lógica de aprobación (`EcommerceService.aprobarPedido`)

1. Carga el pedido de staging y evita duplicados en `CABECERA_PED`.
2. Busca el cliente por `CODCLIENTE` o `CIF` (= código o RIF del archivo).
3. Tarifa: `TARIFASCLIENTE.IDTARIFAV` del cliente, o `tarifaBaseCatalogo`.
4. Resuelve artículos por `CODBARRAS` y, si no, por `CODARTICULO`; precio de `PRECIOSVENTA` con `TALLA='.'` y `COLOR='.'` (evita duplicados).
5. D2 = mayor porcentaje de las promociones vigentes que apliquen al cliente y artículo (escala por unidades o monto).
6. Separa en grupos: `P` (sección = `dptoPsicotropicos`), `SD` (`NODTOAPLICABLE`), `NI` (`DIASPROTECCION > 0`), normal.
7. Por grupo: consolida por artículo + lote, resuelve lotes, consulta `STOCKS` del `codAlmacen`, recorta la cantidad al stock y descarta líneas sin stock.
8. D3 = triangulación (`TriangulacionService.calcularDescPorArticulo`).
9. Parte en bloques de `maxLineasPorPedido` (sufijo `-N` solo si hay más de uno).
10. Inserta `CABECERA_PED` (estatus `AUTORIZADO`, vendedor de `CLIENTESCAMPOSLIBRES.CODVENDEDOR` o, si no hay, el valor de `VED`) y `LINEA_PED`, más `APP_PEDIDO_LOG`, todo en **una transacción**.
11. Marca el staging como procesado. Los artículos con `NODTOAPLICABLE` quedan sin descuentos.

ORDERID: `EC-{numero}{sufijo}` (`EC-589`, `EC-589P`, `EC-589SD`, `EC-589NI`, `EC-589-1`…).

## 9. Base de datos

### Tablas ICG — lectura

`CLIENTES`, `CLIENTESCAMPOSLIBRES`, `TARIFASCLIENTE`, `ARTICULOS`, `ARTICULOSCAMPOSLIBRES`, `ARTICULOSLIN`, `PRECIOSVENTA`, `STOCKS`, `PROVEEDORES`, `MARCA` (con `WITH (NOLOCK)`).

### Tablas ICG — escritura y cambios de estructura

| Tabla | Qué hace la app |
|---|---|
| `CABECERA_PED`, `LINEA_PED` | Inserta pedidos; el panel autoriza y borra pedidos `EC-`. |
| `LINEA_PED` | Al arrancar **agrega columnas** `LOTE`, `TOTAL_BRUTO`, `TOTAL_DESCUENTO` si no existen. |

### Tablas propias (creadas al arrancar)

| Tabla | Contenido |
|---|---|
| `APP_ECOMMERCE_CONFIG` | Fila única con `RUTA` de la carpeta. |
| `APP_ECOMMERCE_PEDIDOS`, `APP_ECOMMERCE_LINEAS` | Staging de archivos (`PROCESADO`, `MENSAJE_ERROR`, `DESCUENTO_PCT`). |
| `APP_PEDIDO_LOG` | Historial de estatus. |
| `APP_TRI_PROMO`, `APP_TRI_ESCALA` | Promociones de triangulación. |
| `APP_PROMOCIONES`, `APP_PROMOCIONES_ESCALAS`, `APP_PEDIDO_PROMOCIONES`, `APP_PROMOCIONES_GRUPOS_*`, `APP_GRUPOS_ARTICULOS*`, `APP_GRUPOS_CLIENTES*` | Promociones (mismo esquema que Pedidos Droguería; aquí no hay pantallas para editarlas). |

`src/db/init.general.sql` es legado del proyecto original y no se usa.

## 10. Configuración

### `backend_icompras_iko_v1.0/config/connections.json` (prioridad sobre `.env`; se edita desde Configuración)

| Clave | Para qué sirve |
|---|---|
| `server`, `port`, `user`, `password`, `dbName`, `esquema` | Conexión SQL Server. |
| `intervaloEscaneo` | Segundos entre escaneos de la carpeta (mín. 5, def. 30). |
| `maxLineasPorPedido` | Máximo de líneas por pedido antes de partir (def. 50). |
| `dptoPsicotropicos` | Sección de psicotrópicos (def. 6). |
| `tarifaBaseCatalogo` | Tarifa si el cliente no tiene una asignada (def. 2). |
| `codAlmacen` | Almacén para validar stock. |
| `githubZipUrl` | URL del ZIP que descarga el actualizador. |
| `nssmServicioBackend`, `nssmServicioFrontend` | Servicios que reinicia el actualizador. |
| `dbPruebas`, `dbRutero`, `dbGeneralName`, `clavePickingAdmin` | Heredados del proyecto original, sin uso real. |

### `.env` del backend

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto HTTP (def. 9000). |
| `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_ESQUEMA` (y `DB_PRUEBAS`, `DB_RUTERO`, `DB_GENERAL_NAME`) | Fallback si no hay `connections.json`; `DB_ESQUEMA` se lee directo en los servicios. |
| `VED` | Código de vendedor por defecto para los pedidos cuando el cliente no tiene vendedor en `CLIENTESCAMPOSLIBRES`. |

### `.env` del frontend

| Variable | Para qué sirve |
|---|---|
| `VITE_API_URL` | URL del backend (p. ej. `http://localhost:9000`). Se incrusta al compilar. |

## 11. Instalación, ejecución y despliegue

```bash
git clone https://github.com/Roalcoma/Iko_Icompras.git
cd Iko_Icompras/backend_icompras_iko_v1.0 && npm install
cd ../frontend_pedidos_drogueria_v1.2 && npm install
```

| Tarea | Comando |
|---|---|
| Backend desarrollo | `npm run dev` (nodemon, puerto 9000) |
| Backend compilar / producción | `npm run build` → `npm start` |
| Frontend desarrollo | `npm run dev` (Vite, 5173) |
| Frontend compilar | `npm run build-only` |
| Frontend producción | `npm start` (`serve -s dist -l 9010`) |

Producción en Windows: dos servicios NSSM (backend `node dist/index.js` y frontend `serve`), con sus nombres en `nssmServicioBackend` / `nssmServicioFrontend`.

**Actualizador** (`POST /sistema/actualizar`): descarga `githubZipUrl`, extrae y copia sobre la raíz del repo excepto `node_modules`, `dist`, `.env`, `.env.production`, `config/connections.json` y `.git`; después reinicia NSSM. **No** hace respaldo, ni `npm install`, ni compila backend o frontend (y `dist/` no se versiona en este repo), así que tras actualizar hay que compilar a mano.

## 12. Problemas conocidos y deuda técnica

- **API sin autenticación ni CORS restringido** (`cors()` abierto): cualquiera con acceso de red al puerto puede leer pedidos, borrarlos, cambiar la conexión a la base o lanzar el actualizador (que descarga y ejecuta código y reinicia servicios).
- Los pedidos se insertan directamente como **`AUTORIZADO`**, y el stock se valida solo contra `STOCKS` (no descuenta lo reservado por otros pedidos), así que puede sobre-comprometer stock.
- `DELETE /pedidos-ctrl/:orderId` borra de `CABECERA_PED`/`LINEA_PED` sin transacción ni verificar estatus (puede borrar pedidos ya importados por ICG).
- Al arrancar altera la estructura de `LINEA_PED` (columnas nuevas) en la base del ERP.
- `VED` se usa como código de vendedor por defecto (en Pedidos Droguería `VED` es un código de moneda): nombre confuso.
- `clavePickingAdmin` con valor por defecto fijo y expuesto en `/sistema/db-config` (heredado, sin uso).
- Mucho código heredado sin uso: `promociones.service.ts` (~1000 líneas, solo se usa `getVigentes`), pools de pruebas/rutero, `init.general.sql`, scripts de diagnóstico.
- La carpeta del frontend conserva el nombre `frontend_pedidos_drogueria_v1.2` y su `README.md`/`AGENTS.md` son plantillas de Vuetify.
- `.env.example` del frontend apunta a `http://localhost:3001`, que no coincide con el puerto del backend (9000).
- Sin pruebas automáticas.
