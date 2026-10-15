# CLAUDE.md — Iko · Icompras Sync

Servicio que importa los pedidos de **iCompras** (archivos `.txt` en una carpeta) a la base del ERP **ICG** del cliente Iko: los inserta auto-aprobados en `CABECERA_PED`/`LINEA_PED` con tarifa del cliente, promociones, triangulación y partición por tipo. Incluye un panel Vue para configuración, control de pedidos, promos de triangulación y actualizador. Derivado de *APP Pedidos Droguería*.

Documentación completa: @docs/DOCUMENTACION.md

## Comandos

```bash
# Backend (backend_icompras_iko_v1.0/) — puerto 9000
npm run dev          # nodemon + ts-node
npm run build        # tsc → dist/
npm start            # node dist/index.js

# Frontend (frontend_pedidos_drogueria_v1.2/) — Vite 5173
npm run dev
npm run build-only   # compila dist/ (no versionado)
npm start            # serve -s dist -l 9010
```

Sin tests. Verificar con `npx tsc --noEmit` (backend) y `npm run build-only` (frontend).

## Mapa de arquitectura

| Archivo | Rol |
|---|---|
| `backend…/src/index.ts` | Rutas, `initTablas()`, bucle de escaneo (`setTimeout` recursivo con `intervaloEscaneo`) |
| `backend…/src/services/ecommerce.service.ts` | Núcleo: `parsearArchivo`, `escanearCarpeta`, `aprobarPedido` (cliente, tarifa, artículos, D1/D2/D3, stock, grupos P/SD/NI, chunks, transacción) |
| `backend…/src/services/triangulacion.service.ts` | Promos por proveedor/marca (`APP_TRI_PROMO`, `APP_TRI_ESCALA`) → D3 |
| `backend…/src/services/promociones.service.ts` | Copia del proyecto original; aquí solo se usa `getVigentes()` → D2 |
| `backend…/src/services/pedidosCtrl.service.ts` | Panel: agrupa `EC-%`, autoriza, elimina y re-encola el `.txt` |
| `backend…/src/services/actualizador.service.ts` | ZIP de `githubZipUrl` + `nssm restart` |
| `backend…/src/services/dbconfig.service.ts` | `config/connections.json` → `.env` |
| `backend…/src/db/db.conection.ts` | Pool `mssql` (siempre `dbName`; no hay modo pruebas activo) |
| `frontend…/src/pages/` | `ConfigView`, `PedidosCtrlView`, `TriangulacionView`, `ActualizadorView` |

## Convenciones

- Capas `routers/` → `controllers/` → `services/`; SQL parametrizado con `mssql` (`.input(...)`).
- Lecturas de ICG con `WITH (NOLOCK)`; precios con `PRECIOSVENTA ... TALLA = '.' AND COLOR = '.'`.
- Tablas propias `APP_*`, creadas en `initTablas()` con `IF NOT EXISTS` (cambios solo aditivos).
- Esquema: `process.env.DB_ESQUEMA || 'dbo'`.
- La lógica de separación P/SD/NI debe coincidir con la de `CarritoView.vue` de Pedidos Droguería.
- ORDERID `EC-{numero}{sufijo}`; sufijo `-N` solo si el grupo se parte en más de un chunk.
- Comentarios `ponytail:` marcan simplificaciones deliberadas; respetarlos.
- Código y mensajes en español.

## Trampas

- El escaneo **inserta directo como `AUTORIZADO`**: probar contra una base de producción crea pedidos reales que ICG importará. Usar una copia y una carpeta de prueba.
- Los archivos procesados se renombran a `.done` (ok) o `.error` (ver `APP_ECOMMERCE_PEDIDOS.MENSAJE_ERROR`). Eliminar desde el panel los vuelve a `.txt` para reprocesar.
- La cantidad usada es la **despachada** (campo 19), no la solicitada; líneas con 0 se ignoran.
- `NODTOAPLICABLE` es BIT: comparar con `1`/`true`.
- `VED` en `.env` es el **código de vendedor por defecto**, no una moneda (distinto que en Pedidos Droguería).
- `initTablas()` agrega columnas a `LINEA_PED` (tabla del ERP).
- La API no tiene autenticación: no exponer el puerto fuera de la red interna.
- El actualizador no respalda, no compila ni instala dependencias.

## Qué NO hacer

- No subir `config/connections.json` ni `.env`, ni copiar sus valores.
- No usar `git add .` / `-A`; agregar rutas explícitas.
- No cambiar el formato de ORDERID ni los sufijos: el panel y el reprocesado dependen de `^EC-(\d+)`.
- No borrar pedidos de `CABECERA_PED` que ICG ya importó.
- No hacer cambios destructivos en tablas ICG ni en las `APP_*` compartidas con Pedidos Droguería.
