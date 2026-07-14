<template>
  <v-container fluid class="pa-6">

    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-shield-crown</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black">Administración de Accesos</h1>
        <span class="text-caption text-medium-emphasis">Gestión de visibilidad por usuario — sistema de bits</span>
      </div>
      <v-spacer />
      <v-btn color="warning" variant="elevated" prepend-icon="mdi-database-sync" :loading="inicializandoBD" @click="confirmarInicializarBD">
        Inicializar Base de Datos
      </v-btn>
    </div>

    <!-- Referencia de bits -->
    <v-card variant="tonal" color="info" class="mb-6 pa-4" rounded="lg">
      <div class="text-subtitle-2 font-weight-bold mb-2">Referencia de módulos (bitmask):</div>
      <div class="d-flex flex-wrap gap-2">
        <v-chip v-for="m in MODULOS" :key="m.bit" :prepend-icon="m.icono" size="small" color="primary" variant="tonal">
          <strong>{{ m.bit }}</strong> — {{ m.nombre }}
        </v-chip>
        <v-chip size="small" color="success" variant="tonal" prepend-icon="mdi-star">
          <strong>15871</strong> — Acceso total (todos los módulos)
        </v-chip>
      </div>
    </v-card>

    <!-- Tabla de usuarios -->
    <v-card rounded="xl" elevation="2">
      <!-- Cabecera: título + acción -->
      <div class="d-flex align-center px-5 pt-5 pb-3">
        <div class="d-flex align-center gap-2">
          <v-icon color="primary" size="22">mdi-account-group</v-icon>
          <span class="text-subtitle-1 font-weight-bold" style="color:#164E63;">Usuarios del sistema</span>
          <v-chip size="x-small" color="primary" variant="tonal" class="ml-1">{{ usuariosFiltrados.length }}</v-chip>
        </div>
        <v-spacer />
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" size="small" :loading="cargando" @click="cargarUsuarios">
          Recargar
        </v-btn>
      </div>

      <!-- Barra de filtros -->
      <div class="px-5 pb-4 d-flex align-end gap-3 flex-wrap">
        <div style="flex:1;min-width:180px;max-width:280px;">
          <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">Buscar</div>
          <v-text-field
            v-model="busquedaUsuario"
            placeholder="Nombre de usuario..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
          />
        </div>
        <div style="flex:1;min-width:180px;max-width:240px;">
          <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">Módulo</div>
          <v-select
            v-model="filtroModulo"
            :items="[{ title: 'Todos los módulos', value: null }, ...MODULOS.map(m => ({ title: m.nombre, value: m.bit }))]"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            hide-details
          />
        </div>
        <div style="flex:0 0 auto;min-width:150px;">
          <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">Acceso</div>
          <v-select
            v-model="filtroAcceso"
            :items="[{ title: 'Todos', value: null }, { title: 'Con acceso', value: 'con' }, { title: 'Sin acceso', value: 'sin' }]"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            hide-details
          />
        </div>
        <v-btn
          v-if="busquedaUsuario || filtroModulo || filtroAcceso"
          variant="text"
          size="small"
          color="grey"
          prepend-icon="mdi-close-circle"
          @click="busquedaUsuario = ''; filtroModulo = null; filtroAcceso = null"
          style="margin-bottom:1px;"
        >
          Limpiar
        </v-btn>
      </div>
      <v-divider />
      <v-data-table :headers="headers" :items="usuariosFiltrados" :loading="cargando" item-value="ID" hover>

        <!-- Visibilidad actual -->
        <template v-slot:item.VISIBILIDAD="{ item }">
          <div class="d-flex flex-wrap gap-1 py-1">
            <v-chip v-if="!item.VISIBILIDAD || item.VISIBILIDAD === 0" size="x-small" color="grey" variant="tonal">Sin acceso</v-chip>
            <template v-else>
              <v-chip
                v-for="m in modulosDeUsuario(item.VISIBILIDAD)"
                :key="m.bit"
                size="x-small"
                :color="m.codigo === 'BACKOFFICE' ? 'warning' : m.codigo === 'AUTORIZADOR' ? 'deep-orange' : 'primary'"
                variant="tonal"
                :prepend-icon="m.icono"
              >{{ m.nombre }}</v-chip>
            </template>
          </div>
        </template>

        <!-- Acciones -->
        <template v-slot:item.acciones="{ item }">
          <v-btn size="small" color="primary" variant="text" prepend-icon="mdi-pencil" @click="abrirEditor(item)">
            Editar
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog editor -->
    <v-dialog v-model="dialog.mostrar" max-width="500" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center">
          <v-icon class="mr-2" color="primary">mdi-account-key</v-icon>
          <span>{{ dialog.usuario }}</span>
        </v-card-title>

        <v-card-text class="pa-5 pt-2">

          <!-- Checkboxes de módulos -->
          <div class="text-subtitle-2 font-weight-bold mb-3">Módulos con acceso:</div>
          <div class="d-flex flex-column gap-1 mb-4">
            <v-checkbox
              v-for="m in MODULOS"
              :key="m.bit"
              v-model="dialog.bitsActivos"
              :value="m.bit"
              :label="m.nombre"
              :prepend-icon="m.icono"
              hide-details
              density="compact"
              color="primary"
            />
          </div>

          <!-- Preview del valor numérico -->
          <v-alert type="info" variant="tonal" density="compact">
            Valor VISIBILIDAD: <strong>{{ visibilidadCalculada }}</strong>
            <span class="ml-2 text-caption">({{ bitsDescripcion }})</span>
          </v-alert>

          <v-divider class="my-4" />

          <!-- Código de vendedor -->
          <div class="text-subtitle-2 font-weight-bold mb-2">Código de vendedor (CODVENDEDOR):</div>
          <div class="d-flex gap-2 align-center mb-1">
            <v-text-field
              v-model.number="dialog.codVendedor"
              label="Código"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="Sin asignar"
              clearable
            />
            <v-btn color="teal" variant="tonal" :loading="guardandoVendedor" icon="mdi-content-save" @click="guardarCodVendedor" />
          </div>
          <span class="text-caption text-grey">Se usará como vendedor en los pedidos generados por este usuario</span>

          <v-divider class="my-4" />

          <!-- Cambio de clave -->
          <div class="text-subtitle-2 font-weight-bold mb-2">Cambiar clave:</div>
          <div class="d-flex gap-2 align-center">
            <v-text-field
              v-model="dialog.nuevaClave"
              label="Nueva clave"
              :type="dialog.mostrarClave ? 'text' : 'password'"
              :append-inner-icon="dialog.mostrarClave ? 'mdi-eye-off' : 'mdi-eye'"
              variant="outlined"
              density="compact"
              hide-details
              @click:append-inner="dialog.mostrarClave = !dialog.mostrarClave"
            />
            <v-btn
              color="warning"
              variant="tonal"
              :loading="guardandoClave"
              :disabled="!dialog.nuevaClave"
              icon="mdi-key"
              @click="guardarClave"
            />
          </div>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-btn variant="text" @click="dialog.mostrar = false" :disabled="guardando">Cancelar</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" :loading="guardando" prepend-icon="mdi-content-save" @click="guardarVisibilidad">
            Guardar accesos
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Configuración de Base de Datos -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="teal" class="mr-2">mdi-database-cog</v-icon>
        <span class="font-weight-bold">Configuración de Base de Datos</span>
        <v-spacer />
        <v-chip v-if="estadoConexion" :color="estadoConexion.ok ? 'success' : 'error'" size="small" variant="tonal">
          {{ estadoConexion.mensaje }}
        </v-chip>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-4">
          Cambia la conexión sin tocar el archivo .env. La configuración se guarda en <code>config/connections.json</code>
          y se aplica inmediatamente reconectando los pools.
        </p>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field v-model="dbCfg.server"        label="Servidor"           variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="2">
            <v-text-field v-model.number="dbCfg.port"   label="Puerto" type="number" variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.user"          label="Usuario SQL"        variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.password"      label="Contraseña"         variant="outlined" density="compact" hide-details type="password" placeholder="Sin cambios" class="mb-2" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.dbName"        label="BD principal"       variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.dbGeneralName" label="BD de usuarios"     variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.dbPruebas"     label="BD de pruebas"      variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.dbRutero"      label="BD rutero"          variant="outlined" density="compact" hide-details class="mb-2" placeholder="ej: RUTERO" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="dbCfg.esquema"       label="Esquema SQL"        variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="(dbCfg as any).nssmServicioBackend"  label="Servicio NSSM — Backend"  placeholder="pedidos-backend"  variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="(dbCfg as any).nssmServicioFrontend" label="Servicio NSSM — Frontend" placeholder="pedidos-frontend" variant="outlined" density="compact" hide-details class="mb-2" />
          </v-col>
        </v-row>
        <div class="d-flex gap-2 mt-2">
          <v-btn color="teal" variant="tonal" :loading="probandoConexion" prepend-icon="mdi-connection" @click="probarConexionBD">
            Probar conexión
          </v-btn>
          <v-btn color="primary" variant="elevated" :loading="guardandoDbCfg" prepend-icon="mdi-content-save" @click="guardarDbConfigFn">
            Guardar y reconectar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Auto-actualizador GitHub -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="grey-darken-3" class="mr-2">mdi-github</v-icon>
        <span class="font-weight-bold">Actualizar Aplicativo desde GitHub</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Descarga el ZIP del repo desde GitHub y reemplaza los archivos del servidor. Reinicia automáticamente con NSSM si está configurado.
        </p>
        <v-btn color="grey-darken-3" variant="elevated" prepend-icon="mdi-source-pull" :loading="actualizando" @click="actualizarApp">
          Actualizar ahora
        </v-btn>
        <v-card v-if="resultadoActualizacion" class="mt-4 pa-3 rounded-lg" :class="resultadoActualizacion.success ? 'bg-grey-darken-4' : 'bg-red-darken-4'" elevation="0">
          <div class="d-flex align-center mb-2">
            <v-icon :color="resultadoActualizacion.success ? 'green-lighten-2' : 'red-lighten-2'" size="18" class="mr-2">
              {{ resultadoActualizacion.success ? 'mdi-check-circle' : 'mdi-alert-circle' }}
            </v-icon>
            <span class="text-caption font-weight-bold" :class="resultadoActualizacion.success ? 'text-green-lighten-2' : 'text-red-lighten-2'">
              {{ resultadoActualizacion.mensaje }}
            </span>
          </div>
          <pre class="text-caption text-grey-lighten-1 mt-2" style="white-space:pre-wrap;font-family:monospace;font-size:11px;">{{ (resultadoActualizacion.log ?? []).join('\n') }}</pre>
        </v-card>
      </v-card-text>
    </v-card>

    <!-- Contador secuencial de pedidos -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="teal-darken-2" class="mr-2">mdi-counter</v-icon>
        <span class="font-weight-bold">Contador de Pedidos</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Número secuencial interno de pedidos. El <strong>último número usado</strong> es
          <strong>{{ seqActual }}</strong> — el próximo pedido será el <strong>#{{ seqActual + 1 }}</strong>.
          Cambia el valor solo si necesitas saltar a un número específico.
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model.number="seqNuevo"
            label="Último número usado"
            type="number"
            min="0"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-numeric"
            style="max-width:220px;"
          />
          <v-btn color="teal-darken-2" variant="elevated" :loading="guardandoSeq" @click="guardarSeq">
            Actualizar
          </v-btn>
          <v-btn color="secondary" variant="tonal" prepend-icon="mdi-refresh" @click="cargarSeq">
            Recargar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Departamento psicotrópicos -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="deep-purple" class="mr-2">mdi-shield-alert</v-icon>
        <span class="font-weight-bold">Identificación de Psicotrópicos</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Número de departamento (<code>ARTICULOS.DPTO</code>) que identifica artículos psicotrópicos.
          Los pedidos con artículos de ese departamento nacen en estado "Aprobación Psicotrópicos".
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model.number="dptoPsicotropicos"
            label="Departamento psicotrópicos"
            type="number"
            min="1"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-numeric"
            style="max-width:220px;"
          />
          <v-btn color="deep-purple" variant="elevated" :loading="guardandoDpto" @click="guardarDptoPsicotropicos">
            Guardar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Tarifa base catálogo Excel -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="teal" class="mr-2">mdi-file-excel</v-icon>
        <span class="font-weight-bold">Tarifa Base — Catálogo Excel</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          ID de tarifa (<code>PRECIOSVENTA.IDTARIFAV</code>) que se usa como precio base al generar el catálogo Excel por segmentos.
          Los artículos con "No aplica descuento" quedan excluidos automáticamente.
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model.number="tarifaBaseCatalogo"
            label="ID de tarifa base"
            type="number"
            min="1"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-numeric"
            style="max-width:220px;"
          />
          <v-btn color="teal" variant="elevated" :loading="guardandoTarifa" @click="guardarTarifaCatalogo">
            Guardar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Almacén de stock -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="blue-grey" class="mr-2">mdi-warehouse</v-icon>
        <span class="font-weight-bold">Almacén de Stock</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Código del almacén (<code>STOCKS.CODALMACEN</code>) usado para calcular stock disponible, reservas y líneas de pedido.
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model="codAlmacen"
            label="Código de almacén"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-store"
            style="max-width:220px;"
          />
          <v-btn color="blue-grey" variant="elevated" :loading="guardandoAlmacen" @click="guardarCodAlmacen">
            Guardar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Máximo de líneas por pedido -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="orange-darken-2" class="mr-2">mdi-format-list-numbered</v-icon>
        <span class="font-weight-bold">Máximo de Líneas por Pedido</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Cantidad máxima de líneas (artículos distintos) por pedido. Si se supera, el pedido se divide automáticamente
          en partes con sufijo <code>-1</code>, <code>-2</code>, etc.
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model.number="maxLineasPorPedido"
            label="Máximo de líneas"
            type="number"
            min="1"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-numeric"
            style="max-width:220px;"
          />
          <v-btn color="orange-darken-2" variant="elevated" :loading="guardandoMaxLineas" @click="guardarMaxLineasFn">
            Guardar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Clave admin picking -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="deep-purple" class="mr-2">mdi-truck-fast</v-icon>
        <span class="font-weight-bold">Clave de Administrador — Picking</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Clave requerida para marcar un rutero como "En Ruta" cuando el picking no está completo.
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model="clavePickingAdmin"
            label="Clave de admin"
            type="password"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-lock"
            style="max-width:280px;"
          />
          <v-btn color="deep-purple" variant="elevated" :loading="guardandoClaveAdmin" @click="guardarClaveAdminFn">
            Guardar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Configuración integración Ecommerce -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-shopping</v-icon>
        <span class="font-weight-bold">Integración Icompras — Ruta de archivos</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-3">
          Carpeta donde Icompras deposita los archivos .txt de pedidos. El sistema la escanea cada 30 segundos
          automáticamente. Los archivos procesados se renombran a .txt.done.
        </p>
        <div class="d-flex align-center gap-3">
          <v-text-field
            v-model="rutaEcommerce"
            label="Ruta completa de la carpeta"
            placeholder="C:\integracion\pedidos"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-folder-outline"
            style="max-width:520px;"
          />
          <v-btn color="primary" variant="elevated" :loading="guardandoRuta" @click="guardarRutaEcommerce">
            Guardar
          </v-btn>
          <v-btn color="secondary" variant="tonal" :loading="escaneando" @click="escanearAhora">
            Escanear ahora
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Apariencia del sistema -->
    <v-card rounded="xl" elevation="2" class="mt-6">
      <v-card-title class="pa-4 d-flex align-center">
        <v-icon color="purple-darken-2" class="mr-2">mdi-palette</v-icon>
        <span class="font-weight-bold">Apariencia del Sistema</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-caption text-grey mb-4">
          Personaliza el logo y los colores principales del aplicativo. Los cambios se aplican a todos los usuarios inmediatamente.
        </p>
        <v-row dense align="center" class="mb-4">
          <v-col cols="12" sm="auto">
            <v-img :src="brandingLogoPreview" max-width="120" max-height="60" contain class="rounded border" />
          </v-col>
          <v-col>
            <v-btn variant="tonal" color="primary" prepend-icon="mdi-upload" @click="seleccionarLogo">
              Subir logo
            </v-btn>
            <input ref="inputLogo" type="file" accept="image/png,image/jpeg,image/svg+xml" class="d-none" @change="onLogoSeleccionado" />
            <v-btn v-if="brandingPreview.logoBase64" variant="text" color="error" class="ml-2" @click="brandingPreview.logoBase64 = null">
              Quitar logo
            </v-btn>
          </v-col>
        </v-row>
        <v-row dense class="mb-4">
          <v-col cols="12" sm="6">
            <div class="text-caption font-weight-medium mb-1">Color primario</div>
            <div class="d-flex align-center gap-2">
              <input type="color" v-model="brandingPreview.primary" style="width:44px;height:36px;border:none;cursor:pointer;border-radius:6px;" />
              <v-text-field v-model="brandingPreview.primary" variant="outlined" density="compact" hide-details style="max-width:130px;" />
            </div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="text-caption font-weight-medium mb-1">Color secundario</div>
            <div class="d-flex align-center gap-2">
              <input type="color" v-model="brandingPreview.secondary" style="width:44px;height:36px;border:none;cursor:pointer;border-radius:6px;" />
              <v-text-field v-model="brandingPreview.secondary" variant="outlined" density="compact" hide-details style="max-width:130px;" />
            </div>
          </v-col>
        </v-row>
        <v-btn color="purple-darken-2" variant="elevated" :loading="guardandoBranding" prepend-icon="mdi-content-save" @click="guardarBranding">
          Guardar apariencia
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Dialog: confirmar inicialización de BD -->
    <v-dialog v-model="modalInicializarBD" max-width="480" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center">
          <v-icon class="mr-2" color="warning">mdi-database-sync</v-icon>
          <span>Inicializar Base de Datos</span>
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          Esto crea (si faltan) las tablas y columnas que usa la app: promociones, grupos,
          reclamos y la columna de observaciones de pedidos. Es seguro ejecutarlo en cualquier
          momento — si ya existen, no se tocan ni se borran datos.
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-btn variant="text" @click="modalInicializarBD = false" :disabled="inicializandoBD">Cancelar</v-btn>
          <v-spacer />
          <v-btn color="warning" variant="elevated" :loading="inicializandoBD" @click="ejecutarInicializarBD">
            Inicializar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.mostrar" :color="snack.color" timeout="3000" location="bottom right">
      {{ snack.texto }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useBrandingStore } from '../stores/useBrandingStore';

const API = `${import.meta.env.VITE_API_URL}/auth`;

const MODULOS = [
  { bit: 1,  codigo: 'CATALOGO',   nombre: 'Catálogo',        icono: 'mdi-store-search' },
  { bit: 2,  codigo: 'CARRITO',    nombre: 'Carrito',          icono: 'mdi-cart'         },
  { bit: 4,  codigo: 'ESTATUS',    nombre: 'Control Estatus',  icono: 'mdi-list-status'  },
  { bit: 8,  codigo: 'EDICION',    nombre: 'Edición Pedidos',  icono: 'mdi-file-edit'    },
  { bit: 16, codigo: 'BACKOFFICE', nombre: 'Administración',   icono: 'mdi-shield-crown' },
  { bit: 32, codigo: 'PROMOCIONES', nombre: 'Promociones',     icono: 'mdi-sale' },
  { bit: 64, codigo: 'CLIENTES',   nombre: 'Gestión Clientes', icono: 'mdi-account-group' },
  { bit: 128, codigo: 'APROBACION_PSICO', nombre: 'Aprobación Psicotrópicos', icono: 'mdi-shield-alert' },
  { bit: 256, codigo: 'RECLAMOS',   nombre: 'Reclamos',           icono: 'mdi-comment-alert' },
  { bit: 1024, codigo: 'AUDITORIA',   nombre: 'Auditoría',                icono: 'mdi-clipboard-text-clock' },
  { bit: 2048, codigo: 'AUTORIZADOR', nombre: 'Puede autorizar pedidos',  icono: 'mdi-check-decagram'       },
  { bit: 4096, codigo: 'RUTERO',              nombre: 'Rutero de Entrega',        icono: 'mdi-truck-delivery' },
];

const headers = [
  { title: 'Usuario',     key: 'USUARIO',      sortable: true  },
  { title: 'Accesos',     key: 'VISIBILIDAD',  sortable: false },
  { title: 'Acciones',    key: 'acciones',     sortable: false },
];

const usuarios     = ref<any[]>([]);
const cargando     = ref(false);
const busquedaUsuario = ref('');
const filtroModulo    = ref<number | null>(null);
const filtroAcceso    = ref<string | null>(null);

const usuariosFiltrados = computed(() => {
  return usuarios.value.filter(u => {
    const nombre = (u.USUARIO ?? '').toLowerCase();
    const vis    = Number(u.VISIBILIDAD ?? 0);
    if (busquedaUsuario.value && !nombre.includes(busquedaUsuario.value.toLowerCase())) return false;
    if (filtroModulo.value !== null && !(vis & filtroModulo.value)) return false;
    if (filtroAcceso.value === 'con' && vis === 0) return false;
    if (filtroAcceso.value === 'sin' && vis !== 0) return false;
    return true;
  });
});
const guardando       = ref(false);
const guardandoClave  = ref(false);
const guardandoVendedor = ref(false);
const snack        = ref({ mostrar: false, texto: '', color: 'success' });

const dialog = ref({
  mostrar: false,
  id: 0,
  usuario: '',
  bitsActivos: [] as number[],
  nuevaClave: '',
  mostrarClave: false,
  codVendedor: null as number | null,
});

// Calcula el valor numérico sumando los bits seleccionados
const visibilidadCalculada = computed(() =>
  dialog.value.bitsActivos.reduce((sum, bit) => sum | bit, 0)
);

const bitsDescripcion = computed(() => {
  if (visibilidadCalculada.value === 0) return 'Sin acceso';
  return MODULOS
    .filter(m => (visibilidadCalculada.value & m.bit) !== 0)
    .map(m => m.nombre)
    .join(' + ');
});

// Retorna los módulos que tiene activos un usuario dado su valor numérico
const modulosDeUsuario = (vis: number) =>
  MODULOS.filter(m => (Number(vis) & m.bit) !== 0);

const cargarUsuarios = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/usuarios`);
    if (res.data.success) usuarios.value = res.data.usuarios;
  } catch {
    mostrarSnack('Error al cargar usuarios', 'error');
  } finally {
    cargando.value = false;
  }
};

const abrirEditor = (item: any) => {
  const vis = Number(item.VISIBILIDAD ?? 0);
  dialog.value = {
    mostrar: true,
    id: item.ID,
    usuario: item.USUARIO,
    bitsActivos: MODULOS.filter(m => (vis & m.bit) !== 0).map(m => m.bit),
    nuevaClave: '',
    mostrarClave: false,
    codVendedor: item.CODVENDEDOR ?? null,
  };
};

const guardarVisibilidad = async () => {
  guardando.value = true;
  try {
    await axios.patch(`${API}/usuarios/${dialog.value.id}/visibilidad`, {
      visibilidad: visibilidadCalculada.value
    });
    mostrarSnack('Accesos actualizados correctamente', 'success');
    dialog.value.mostrar = false;
    await cargarUsuarios();
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al guardar', 'error');
  } finally {
    guardando.value = false;
  }
};

const guardarCodVendedor = async () => {
  guardandoVendedor.value = true;
  try {
    await axios.patch(`${API}/usuarios/${dialog.value.id}/codvendedor`, {
      codVendedor: dialog.value.codVendedor ?? null
    });
    mostrarSnack('Código de vendedor actualizado', 'success');
    await cargarUsuarios();
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al actualizar código de vendedor', 'error');
  } finally {
    guardandoVendedor.value = false;
  }
};

const guardarClave = async () => {
  guardandoClave.value = true;
  try {
    await axios.patch(`${API}/usuarios/${dialog.value.id}/password`, { nuevaClave: dialog.value.nuevaClave });
    mostrarSnack('Clave actualizada correctamente', 'success');
    dialog.value.nuevaClave = '';
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al actualizar clave', 'error');
  } finally {
    guardandoClave.value = false;
  }
};

const modalInicializarBD = ref(false);
const inicializandoBD = ref(false);
const confirmarInicializarBD = () => { modalInicializarBD.value = true; };
const ejecutarInicializarBD = async () => {
  inicializandoBD.value = true;
  try {
    const res = await axios.post(`${import.meta.env.VITE_API_URL}/sistema/inicializar-bd`);
    mostrarSnack(res.data.message ?? 'Base de datos inicializada', 'success');
    modalInicializarBD.value = false;
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al inicializar la base de datos', 'error');
  } finally {
    inicializandoBD.value = false;
  }
};

const mostrarSnack = (texto: string, color: string) => {
  snack.value = { mostrar: true, texto, color };
};

// --- Ecommerce config ---
const API_ECO = `${import.meta.env.VITE_API_URL}/ecommerce`;
const rutaEcommerce  = ref('');
const guardandoRuta  = ref(false);
const escaneando     = ref(false);

const cargarRutaEcommerce = async () => {
  try {
    const res = await axios.get(`${API_ECO}/config`);
    if (res.data.success) rutaEcommerce.value = res.data.ruta;
  } catch { /* silencioso */ }
};

const guardarRutaEcommerce = async () => {
  guardandoRuta.value = true;
  try {
    await axios.put(`${API_ECO}/config`, { ruta: rutaEcommerce.value });
    mostrarSnack('Ruta guardada correctamente', 'success');
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al guardar ruta', 'error');
  } finally { guardandoRuta.value = false; }
};

const escanearAhora = async () => {
  escaneando.value = true;
  try {
    const res = await axios.post(`${API_ECO}/escanear`);
    const d = res.data;
    if (d.mensaje && d.importados === 0 && d.errores === 0) {
      mostrarSnack(d.mensaje, 'warning');
    } else {
      const color = d.errores > 0 ? 'warning' : 'success';
      mostrarSnack(`Escaneo completo — Importados: ${d.importados}, Errores: ${d.errores}`, color);
    }
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al escanear', 'error');
  } finally { escaneando.value = false; }
};

// ─── Configuración BD ─────────────────────────────────────────
const API_SIS = `${import.meta.env.VITE_API_URL}/sistema`;
const dbCfg = ref({ server: '', port: 1433, user: '', password: '', dbName: '', dbGeneralName: '', dbPruebas: '', dbRutero: '', esquema: 'dbo' });
const probandoConexion  = ref(false);
const guardandoDbCfg    = ref(false);
const estadoConexion    = ref<{ ok: boolean; mensaje: string } | null>(null);

const cargarDbConfig = async () => {
  try {
    const res = await axios.get(`${API_SIS}/db-config`);
    if (res.data.success) {
      const c = res.data.config;
      dbCfg.value = { server: c.server, port: c.port, user: c.user, password: '', dbName: c.dbName, dbGeneralName: c.dbGeneralName, dbPruebas: c.dbPruebas, dbRutero: c.dbRutero ?? '', esquema: c.esquema };
    }
  } catch { /* silencioso */ }
};

const probarConexionBD = async () => {
  probandoConexion.value = true;
  estadoConexion.value   = null;
  try {
    const res = await axios.post(`${API_SIS}/db-config/probar`, {
      server: dbCfg.value.server, user: dbCfg.value.user,
      password: dbCfg.value.password, dbName: dbCfg.value.dbName, port: dbCfg.value.port,
    });
    estadoConexion.value = { ok: res.data.success, mensaje: res.data.message };
  } catch (e: any) {
    estadoConexion.value = { ok: false, mensaje: e.response?.data?.message ?? 'Error' };
  } finally { probandoConexion.value = false; }
};

const guardarDbConfigFn = async () => {
  guardandoDbCfg.value = true;
  try {
    await axios.post(`${API_SIS}/db-config/guardar`, dbCfg.value);
    mostrarSnack('Configuración guardada y conexiones restablecidas', 'success');
    dbCfg.value.password = '';
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al guardar configuración', 'error');
  } finally { guardandoDbCfg.value = false; }
};

// ─── Contador secuencial de pedidos ──────────────────────────
const seqActual   = ref(0);
const seqNuevo    = ref(0);
const guardandoSeq = ref(false);

const cargarSeq = async () => {
  try {
    const res = await axios.get(`${API_SIS}/seq-pedidos`);
    if (res.data.success) { seqActual.value = res.data.ultimoId; seqNuevo.value = res.data.ultimoId; }
  } catch { /* silencioso */ }
};

const guardarSeq = async () => {
  guardandoSeq.value = true;
  try {
    const res = await axios.post(`${API_SIS}/seq-pedidos`, { ultimoId: seqNuevo.value });
    if (res.data.success) {
      seqActual.value = seqNuevo.value;
      mostrarSnack(res.data.message, 'success');
    }
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al actualizar', 'error');
  } finally { guardandoSeq.value = false; }
};

// ─── Departamento psicotrópicos ───────────────────────────────
const dptoPsicotropicos = ref<number>(9);
const guardandoDpto = ref(false);

const cargarDptoPsicotropicos = async () => {
  try {
    const res = await axios.get(`${API_SIS}/psicotropicos`);
    if (res.data.success) dptoPsicotropicos.value = res.data.dptoPsicotropicos;
  } catch { /* silencioso */ }
};

const guardarDptoPsicotropicos = async () => {
  guardandoDpto.value = true;
  try {
    await axios.post(`${API_SIS}/psicotropicos`, { dptoPsicotropicos: dptoPsicotropicos.value });
    mostrarSnack(`Departamento de psicotrópicos actualizado a ${dptoPsicotropicos.value}`, 'success');
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoDpto.value = false; }
};

// ─── Almacén de stock ────────────────────────────────────────
const codAlmacen = ref<string>('ZAV');
const guardandoAlmacen = ref(false);

const cargarCodAlmacen = async () => {
  try {
    const res = await axios.get(`${API_SIS}/cod-almacen`);
    if (res.data.success) codAlmacen.value = res.data.codAlmacen;
  } catch { /* silencioso */ }
};

const guardarCodAlmacen = async () => {
  guardandoAlmacen.value = true;
  try {
    await axios.post(`${API_SIS}/cod-almacen`, { codAlmacen: codAlmacen.value });
    mostrarSnack(`Almacén actualizado a ${codAlmacen.value}`, 'success');
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoAlmacen.value = false; }
};

// ─── Tarifa base catálogo ─────────────────────────────────────
const tarifaBaseCatalogo = ref<number>(2);
const guardandoTarifa = ref(false);

const cargarTarifaCatalogo = async () => {
  try {
    const res = await axios.get(`${API_SIS}/tarifa-catalogo`);
    if (res.data.success) tarifaBaseCatalogo.value = res.data.tarifaBaseCatalogo;
  } catch { /* silencioso */ }
};

const guardarTarifaCatalogo = async () => {
  guardandoTarifa.value = true;
  try {
    await axios.post(`${API_SIS}/tarifa-catalogo`, { tarifaBaseCatalogo: tarifaBaseCatalogo.value });
    mostrarSnack(`Tarifa base del catálogo actualizada a ${tarifaBaseCatalogo.value}`, 'success');
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoTarifa.value = false; }
};

// ─── Máximo de líneas por pedido ─────────────────────────────
const maxLineasPorPedido = ref<number>(50);
const guardandoMaxLineas = ref(false);

const cargarMaxLineas = async () => {
  try {
    const res = await axios.get(`${API_SIS}/max-lineas`);
    if (res.data.success) maxLineasPorPedido.value = res.data.maxLineasPorPedido;
  } catch { /* silencioso */ }
};

const guardarMaxLineasFn = async () => {
  guardandoMaxLineas.value = true;
  try {
    await axios.post(`${API_SIS}/max-lineas`, { maxLineasPorPedido: maxLineasPorPedido.value });
    mostrarSnack(`Máximo de líneas actualizado a ${maxLineasPorPedido.value}`, 'success');
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoMaxLineas.value = false; }
};

// ─── Clave admin picking ──────────────────────────────────────
const clavePickingAdmin   = ref('');
const guardandoClaveAdmin = ref(false);

const cargarClavePickingAdmin = async () => {
  try {
    const res = await axios.get(`${API_SIS}/clave-picking-admin`);
    if (res.data.success) clavePickingAdmin.value = res.data.clavePickingAdmin;
  } catch { /* silencioso */ }
};

const guardarClaveAdminFn = async () => {
  guardandoClaveAdmin.value = true;
  try {
    await axios.post(`${API_SIS}/clave-picking-admin`, { clavePickingAdmin: clavePickingAdmin.value });
    mostrarSnack('Clave de administrador actualizada', 'success');
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoClaveAdmin.value = false; }
};

// ─── Auto-actualizador ────────────────────────────────────────
const actualizando          = ref(false);
const resultadoActualizacion = ref<any>(null);

const actualizarApp = async () => {
  actualizando.value = true;
  resultadoActualizacion.value = null;
  try {
    const res = await axios.post(`${API_SIS}/actualizar`);
    resultadoActualizacion.value = res.data;
  } catch (e: any) {
    // El backend ya devuelve { success: false, mensaje, log } incluso en errores
    resultadoActualizacion.value = e.response?.data ?? {
      success: false,
      mensaje: e.message,
      log: ['No se pudo contactar al backend.'],
    };
  } finally { actualizando.value = false; }
};

// ─── Apariencia del sistema ───────────────────────────────────
const brandingStore   = useBrandingStore();
const inputLogo       = ref<HTMLInputElement | null>(null);
const guardandoBranding = ref(false);
const brandingPreview = ref({
  primary:    brandingStore.primary,
  secondary:  brandingStore.secondary,
  logoBase64: brandingStore.logoBase64 as string | null,
});

const brandingLogoPreview = computed<string>(() => brandingPreview.value.logoBase64 ?? brandingStore.logo);

const seleccionarLogo = () => inputLogo.value?.click();

const onLogoSeleccionado = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { brandingPreview.value.logoBase64 = reader.result as string; };
  reader.readAsDataURL(file);
  (e.target as HTMLInputElement).value = '';
};

const guardarBranding = async () => {
  guardandoBranding.value = true;
  try {
    await brandingStore.update({
      primary:    brandingPreview.value.primary,
      secondary:  brandingPreview.value.secondary,
      logoBase64: brandingPreview.value.logoBase64,
    });
    mostrarSnack('Apariencia guardada correctamente', 'success');
  } catch {
    mostrarSnack('Error al guardar apariencia', 'error');
  } finally { guardandoBranding.value = false; }
};

onMounted(async () => {
  await cargarUsuarios();
  await cargarRutaEcommerce();
  await cargarDbConfig();
  await cargarDptoPsicotropicos();
  await cargarCodAlmacen();
  await cargarTarifaCatalogo();
  await cargarSeq();
  await cargarMaxLineas();
  await cargarClavePickingAdmin();
});
</script>
