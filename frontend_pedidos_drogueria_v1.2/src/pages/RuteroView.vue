<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <div class="d-flex align-center mb-6">
      <v-icon size="36" color="primary" class="mr-3">mdi-truck-delivery</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black text-on-surface">Rutero de Entrega</h1>
        <p class="text-body-2 text-grey-darken-1 mb-0">Gestión de rutas y confirmación de entregas</p>
      </div>
    </div>

    <!-- Filtro zona -->
    <v-card rounded="xl" elevation="2" class="mb-4 pa-4">
      <v-row density="comfortable" align="center">
        <v-col cols="12" sm="5">
          <v-autocomplete
            v-model="zonaSeleccionada"
            :items="zonas"
            item-title="display"
            item-value="zona"
            label="Zona / Ruta"
            prepend-inner-icon="mdi-map-marker"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            return-object
            @keyup.enter="buscar"
          />
        </v-col>
        <v-col cols="auto">
          <v-btn icon="mdi-format-list-bulleted" variant="tonal" color="primary" title="Ver todas las zonas" @click="modalZonas = true" />
        </v-col>
        <v-col cols="auto">
          <v-btn color="primary" :loading="cargando" prepend-icon="mdi-magnify" @click="buscar">Buscar</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Modal zonas -->
    <v-dialog v-model="modalZonas" max-width="420" scrollable>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon start color="primary">mdi-map-marker-multiple</v-icon>
          Zonas disponibles
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-2" style="max-height:420px">
          <v-list density="compact" lines="one">
            <v-list-item
              v-for="z in zonas"
              :key="z.zona"
              :title="z.display"
              prepend-icon="mdi-map-marker"
              rounded="lg"
              class="mb-1"
              @click="() => { zonaSeleccionada = z; modalZonas = false; buscar(); }"
            />
            <v-list-item v-if="!zonas.length" title="No hay zonas disponibles" disabled />
          </v-list>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer /><v-btn variant="text" @click="modalZonas = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Tabs -->
    <v-card rounded="xl" elevation="2">
      <v-tabs v-model="tab" color="primary" class="border-b">
        <v-tab value="oficina"><v-icon start>mdi-office-building</v-icon>Oficina</v-tab>
        <v-tab value="documentos"><v-icon start>mdi-file-document-multiple</v-icon>Documentos</v-tab>
        <v-tab value="ruteros" @click="cargarRuteros">
          <v-icon start>mdi-clipboard-list</v-icon>
          Ruteros Activos
          <v-badge v-if="ruteros.length" :content="ruteros.length" color="primary" inline class="ml-2" />
        </v-tab>
        <v-tab value="picking" @click="cargarSesionPicking">
          <v-icon start>mdi-barcode-scan</v-icon>
          Mi Picking
          <v-badge v-if="sesionPicking.length" :content="sesionPicking.length" color="deep-purple" inline class="ml-2" />
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="tab">

        <!-- TAB OFICINA -->
        <v-tabs-window-item value="oficina">
          <div v-if="facturas.length" class="pa-3 d-flex align-center gap-3 flex-wrap">
            <v-btn
              size="small" variant="tonal"
              :color="todasSeleccionadas ? 'grey' : 'primary'"
              :prepend-icon="todasSeleccionadas ? 'mdi-checkbox-multiple-blank-outline' : 'mdi-checkbox-multiple-marked'"
              @click="toggleTodas"
            >{{ todasSeleccionadas ? 'Deseleccionar todas' : 'Seleccionar todas' }}</v-btn>
            <span class="text-caption text-grey-darken-1">{{ seleccionadas.size }} de {{ facturas.length }} seleccionadas</span>
            <v-spacer />
            <v-btn
              color="success" variant="elevated"
              prepend-icon="mdi-clipboard-check-outline"
              :disabled="!seleccionadas.size"
              :loading="creando"
              @click="crearRutero"
            >
              Crear Rutero y PDF ({{ seleccionadas.size }})
            </v-btn>
          </div>
          <v-data-table
            :headers="headersOficina"
            :items="facturas"
            density="compact"
            :loading="cargando"
            no-data-text="Busca una zona para ver las facturas pendientes"
            class="rounded-b-xl"
          >
            <template #item.sel="{ item }">
              <v-checkbox-btn
                :model-value="seleccionadas.has(clave(item))"
                color="primary"
                @update:model-value="toggleSel(item)"
              />
            </template>
            <template #item.TOTAL="{ item }">
              <span class="font-weight-bold">${{ Number(item.TOTAL).toFixed(2) }}</span>
            </template>
            <template #item.BULTOS="{ item }">
              <v-chip size="x-small" color="blue-darken-1" variant="tonal">{{ item.BULTOS ?? 0 }}</v-chip>
            </template>
          </v-data-table>

          <!-- Agregar factura manualmente -->
          <v-divider />
          <div class="pa-3 d-flex align-center gap-3 flex-wrap">
            <v-icon color="grey-darken-1" size="20">mdi-plus-circle-outline</v-icon>
            <span class="text-caption text-medium-emphasis">Agregar manualmente:</span>
            <v-text-field v-model="manualSerie" label="Serie" variant="outlined" density="compact"
              hide-details style="max-width:120px" @keyup.enter="agregarFacturaManual" />
            <v-text-field v-model="manualNum" label="N° Factura" type="number" variant="outlined" density="compact"
              hide-details style="max-width:140px" @keyup.enter="agregarFacturaManual" />
            <v-btn size="small" color="primary" variant="tonal" :loading="buscandoManual"
              :disabled="!manualSerie || !manualNum" @click="agregarFacturaManual">
              Agregar
            </v-btn>
          </div>
        </v-tabs-window-item>

        <!-- TAB DOCUMENTOS -->
        <v-tabs-window-item value="documentos">
          <div class="pa-4">
            <p class="text-caption text-medium-emphasis mb-4">
              Crea un rutero con documentos ingresados manualmente (facturas de viajes anteriores, etc.).
              Requiere tener una zona seleccionada arriba.
            </p>

            <!-- Formulario de entrada -->
            <div class="d-flex align-center gap-3 flex-wrap mb-4">
              <v-text-field v-model="docSerie" label="Serie" variant="outlined" density="compact"
                hide-details style="max-width:120px" @keyup.enter="agregarDocManual" />
              <v-text-field v-model="docNum" label="N° Documento" type="number" variant="outlined" density="compact"
                hide-details style="max-width:150px" @keyup.enter="agregarDocManual" />
              <v-btn color="primary" variant="tonal" :loading="buscandoDoc"
                :disabled="!docSerie || !docNum" @click="agregarDocManual" prepend-icon="mdi-plus">
                Agregar
              </v-btn>
              <v-spacer />
              <v-btn color="success" variant="elevated" prepend-icon="mdi-clipboard-check-outline"
                :disabled="!docsManual.length || !zonaSeleccionada" :loading="creandoDocs"
                @click="crearRuteroDocumentos">
                Crear Rutero ({{ docsManual.length }})
              </v-btn>
            </div>

            <!-- Lista de documentos agregados -->
            <v-data-table
              :headers="headersDocsManual"
              :items="docsManual"
              density="compact"
              :no-data-text="'Agrega documentos con el formulario de arriba'"
            >
              <template #item.TOTAL="{ item }">
                <span class="font-weight-bold">${{ Number(item.TOTAL).toFixed(2) }}</span>
              </template>
              <template #item.quitar="{ item }">
                <v-btn icon="mdi-close" size="x-small" variant="text" color="error"
                  @click="docsManual = docsManual.filter(d => clave(d) !== clave(item))" />
              </template>
            </v-data-table>
          </div>
        </v-tabs-window-item>

        <!-- TAB RUTEROS ACTIVOS -->
        <v-tabs-window-item value="ruteros">
          <div class="pa-3 d-flex flex-wrap gap-3 align-center border-b">
            <v-text-field
              v-model="filtroRuteros.numero"
              label="N° Rutero"
              prepend-inner-icon="mdi-clipboard-list"
              variant="outlined" density="compact" hide-details clearable
              style="min-width:140px;max-width:180px"
              @keyup.enter="buscarRuteros"
              @click:clear="buscarRuteros"
            />
            <v-text-field
              v-model="filtroRuteros.factura"
              label="N° Factura"
              prepend-inner-icon="mdi-file-document"
              variant="outlined" density="compact" hide-details clearable
              style="min-width:140px;max-width:180px"
              @keyup.enter="buscarRuteros"
              @click:clear="buscarRuteros"
            />
            <v-text-field
              v-model="filtroRuteros.pedido"
              label="N° Pedido"
              prepend-inner-icon="mdi-package-variant"
              variant="outlined" density="compact" hide-details clearable
              style="min-width:140px;max-width:180px"
              @keyup.enter="buscarRuteros"
              @click:clear="buscarRuteros"
            />
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-magnify" @click="buscarRuteros">Buscar</v-btn>
            <v-btn variant="text" color="grey" prepend-icon="mdi-close" @click="limpiarFiltrosRuteros">Limpiar</v-btn>
          </div>
          <div class="pa-4">
            <div v-if="cargandoRuteros" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>
            <div v-else-if="!ruteros.length" class="text-center pa-8 text-grey-darken-1">
              <v-icon size="48" class="mb-2">mdi-clipboard-check-outline</v-icon>
              <div>No hay ruteros activos</div>
            </div>
            <v-expansion-panels v-else variant="accordion">
              <v-expansion-panel
                v-for="r in ruteros"
                :key="r.ID"
                @group:selected="(ev) => { if (ev.value) { cargarFacturasRutero(r.ID); filtroPickingEstado.value = 'todos'; } }"
              >
                <v-expansion-panel-title>
                  <div class="d-flex align-center gap-3 w-100 flex-wrap">
                    <v-chip color="primary" size="small" variant="tonal" class="font-weight-bold">{{ r.NUMERO }}</v-chip>
                    <v-chip v-if="r.ESTADO === 'EN_RUTA'" color="blue-darken-3" size="x-small" variant="elevated" prepend-icon="mdi-truck-fast">En Viaje</v-chip>
                    <span class="font-weight-medium">{{ r.CODRUTA }} - {{ r.NOMBRE_RUTA }}</span>
                    <v-spacer />
                    <v-chip
                      size="x-small"
                      :color="r.ENTREGADAS >= r.TOTAL_FACTURAS ? 'success' : 'warning'"
                      variant="tonal"
                    >
                      {{ r.ENTREGADAS }}/{{ r.TOTAL_FACTURAS }} entregadas
                    </v-chip>
                    <span class="text-caption text-grey-darken-1">{{ r.FECHA }}</span>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="d-flex justify-space-between align-center mb-3 flex-wrap gap-2">
                    <v-btn
                      size="small" variant="tonal" color="primary"
                      prepend-icon="mdi-file-pdf-box"
                      @click.stop="imprimirRutero(r)"
                    >Reimprimir PDF</v-btn>
                    <!-- Botón picking: solo para ruteros PENDIENTE -->
                    <template v-if="r.ESTADO === 'PENDIENTE'">
                      <template v-if="!r.PICKING_USUARIO">
                        <v-btn
                          size="small" variant="tonal" color="deep-purple"
                          prepend-icon="mdi-barcode-scan"
                          :loading="agregandoPicking === r.ID"
                          @click.stop="agregarAPicking(r)"
                        >Agregar al picking</v-btn>
                      </template>
                      <template v-else-if="r.PICKING_USUARIO === authStore.usuario?.usuario">
                        <v-chip
                          size="small" color="deep-purple" variant="tonal"
                          prepend-icon="mdi-check-circle"
                          class="cursor-pointer"
                          @click.stop="() => { tab = 'picking'; cargarSesionPicking(); }"
                        >En mi sesión</v-chip>
                      </template>
                      <template v-else>
                        <v-chip size="small" color="orange" variant="tonal" prepend-icon="mdi-lock">
                          Contando: {{ r.PICKING_USUARIO }}
                        </v-chip>
                      </template>
                    </template>
                    <v-btn
                      size="small" color="success" variant="elevated"
                      prepend-icon="mdi-check-all"
                      :loading="confirmandoRutero === r.ID"
                      :disabled="r.ENTREGADAS >= r.TOTAL_FACTURAS"
                      @click.stop="confirmarRuteroCompleto(r.ID)"
                    >
                      Confirmar todo
                    </v-btn>
                  </div>

                  <div v-if="!facturasRutero[r.ID]" class="text-center pa-4">
                    <v-progress-circular indeterminate size="24" color="primary" />
                  </div>
                  <div v-if="facturasRutero[r.ID]">
                    <!-- Filtro picking -->
                    <div class="d-flex align-center gap-2 px-2 pt-2 pb-1 flex-wrap">
                      <v-btn-toggle v-model="filtroPickingEstado" mandatory density="compact" rounded="xl" variant="outlined" style="height:28px">
                        <v-btn value="todos"        size="x-small">Todos</v-btn>
                        <v-btn value="checkeado"    size="x-small" color="deep-purple">Pick. listo</v-btn>
                        <v-btn value="pendiente"    size="x-small" color="orange">Pick. pend.</v-btn>
                        <v-btn value="entregado"    size="x-small" color="success">Entregado</v-btn>
                        <v-btn value="no_entregado" size="x-small" color="grey">No entregado</v-btn>
                      </v-btn-toggle>
                      <span class="text-caption text-grey-darken-1 ml-2">{{ filtrarFacturasRutero(r.ID).length }} facturas</span>
                    </div>
                  <v-data-table
                    :headers="headersRutero"
                    :items="filtrarFacturasRutero(r.ID)"
                    density="compact"
                    hide-default-footer
                    :items-per-page="-1"
                  >
                    <template #item.estado="{ item }">
                      <div class="d-flex gap-1 align-center">
                        <v-icon :color="item.CHECKEADO ? 'deep-purple' : (item.TOTAL_CAJAS ? 'orange' : 'grey-lighten-2')" size="18" :title="item.CHECKEADO ? 'Picking listo' : 'Picking pendiente'">
                          {{ item.CHECKEADO ? 'mdi-package-check' : 'mdi-package-variant-closed' }}
                        </v-icon>
                        <v-icon :color="item.FECHARECIBIDO ? 'success' : 'grey-lighten-2'" size="18" :title="item.FECHARECIBIDO ? 'Entregado' : 'Pendiente'">
                          {{ item.FECHARECIBIDO ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                        </v-icon>
                      </div>
                    </template>
                    <template #item.PEDIDO="{ item }">
                      <span v-if="item.PEDIDO" class="text-caption font-weight-medium text-blue-darken-2">{{ item.PEDIDO }}</span>
                      <span v-else class="text-caption text-grey-lighten-1">—</span>
                    </template>
                    <template #item.BULTOS="{ item }">
                      <v-chip size="x-small" color="blue-darken-1" variant="tonal">{{ item.BULTOS ?? 0 }}</v-chip>
                    </template>
                    <template #item.TOTAL="{ item }">
                      <span>${{ Number(item.TOTAL).toFixed(2) }}</span>
                    </template>
                    <template #item.actions="{ item }">
                      <div class="d-flex gap-1">
                        <v-btn
                          v-if="!item.FECHARECIBIDO"
                          size="x-small" color="success" variant="tonal"
                          icon="mdi-check"
                          :loading="confirmandoFactura === clave(item)"
                          @click.stop="abrirDialogFecha(r, item)"
                        />
                        <v-btn
                          v-if="r.ESTADO === 'PENDIENTE' && !item.FECHARECIBIDO"
                          size="x-small" color="error" variant="tonal"
                          icon="mdi-delete-outline"
                          :loading="quitandoFactura === clave(item)"
                          @click.stop="quitarFacturaDeRutero(r, item)"
                        />
                        <span v-if="item.FECHARECIBIDO" class="text-caption text-grey-darken-1">{{ item.FECHARECIBIDO?.toString().substring(0,10) }}</span>
                      </div>
                    </template>
                  </v-data-table>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <div v-if="totalRuteros > limitRuteros" class="d-flex justify-center pt-4">
              <v-pagination
                v-model="paginaRuteros"
                :length="Math.ceil(totalRuteros / limitRuteros)"
                :total-visible="7"
                density="compact"
                @update:model-value="cargarRuteros"
              />
            </div>
          </div>
        </v-tabs-window-item>

        <!-- TAB MI PICKING -->
        <v-tabs-window-item value="picking">
          <div class="pa-4">

            <!-- Sin sesión activa -->
            <div v-if="!cargandoSesion && !sesionPicking.length" class="text-center pa-8 text-grey-darken-1">
              <v-icon size="48" class="mb-2">mdi-barcode-scan</v-icon>
              <div>No tienes ruteros en tu sesión de picking.</div>
              <div class="text-caption mt-1">Ve a "Ruteros Activos" y haz clic en "Agregar al picking".</div>
            </div>

            <template v-else>

              <!-- Input de escaneo global -->
              <v-card rounded="xl" elevation="2" class="mb-6 overflow-hidden">
                <div class="pa-4">
                  <div class="d-flex align-center gap-2 mb-3">
                    <v-icon color="deep-purple" size="20">mdi-barcode-scan</v-icon>
                    <span class="text-subtitle-2 font-weight-bold">Escanear caja</span>
                    <v-spacer />
                    <span class="text-caption text-grey-darken-1">
                      {{ registroPicking.length }} escaneos en esta sesión
                    </span>
                  </div>
                  <v-text-field
                    ref="barcodeGlobalRef"
                    v-model="pickingBarcodeGlobal"
                    placeholder="Escanea el código de la caja..."
                    prepend-inner-icon="mdi-barcode"
                    variant="outlined"
                    density="compact"
                    hide-details
                    :loading="escaneandoGlobal"
                    :disabled="escaneandoGlobal"
                    autofocus
                    clearable
                    @keyup.enter="escanearCajaGlobal"
                  />
                </div>

                <!-- Último resultado del escaneo -->
                <v-expand-transition>
                  <div v-if="ultimoResultadoGlobal">
                    <v-divider />
                    <v-alert
                      :type="ultimoResultadoGlobal.tipo"
                      variant="tonal"
                      density="compact"
                      :title="ultimoResultadoGlobal.titulo"
                      rounded="0"
                      class="pa-3"
                    >
                      <template v-if="ultimoResultadoGlobal.detalle">
                        <div class="text-caption mt-1">{{ ultimoResultadoGlobal.detalle }}</div>
                      </template>
                    </v-alert>
                  </div>
                </v-expand-transition>
              </v-card>

              <!-- Ruteros en sesión -->
              <p class="text-overline text-grey-darken-2 mb-2 px-1">Ruteros en esta sesión</p>
              <v-row class="mb-3" dense>
                <v-col v-for="r in sesionPicking" :key="r.ID" cols="6" sm="4" md="3">
                  <v-card rounded="xl" variant="tonal" color="deep-purple" class="pa-3" style="cursor:pointer" @click="abrirPendientesRutero(r)">
                    <div class="d-flex align-center gap-2 mb-2">
                      <v-chip size="x-small" color="deep-purple" variant="elevated" class="font-weight-bold">{{ r.NUMERO }}</v-chip>
                      <span class="text-caption font-weight-medium flex-grow-1">{{ r.NOMBRE_RUTA }}</span>
                      <v-btn
                        icon="mdi-close" size="x-small" variant="text" color="error"
                        :loading="liberandoPicking === r.ID"
                        @click.stop="liberarDeSesion(r)"
                      />
                    </div>
                    <div class="text-caption text-grey-darken-2">
                      {{ r.CAJAS_ESCANEADAS ?? 0 }}/{{ r.TOTAL_CAJAS ?? '?' }} cajas · {{ r.TOTAL_FACTURAS }} fact.
                    </div>
                  </v-card>
                </v-col>
              </v-row>
              <div class="d-flex justify-end mb-6">
                <v-btn
                  color="success" variant="elevated"
                  prepend-icon="mdi-truck-fast"
                  :loading="iniciandoViaje"
                  :disabled="!sesionPicking.length"
                  @click="iniciarViajeSession"
                >Iniciar Viaje</v-btn>
              </div>

              <!-- Log de escaneos -->
              <p class="text-overline text-grey-darken-2 mb-2 px-1">Registro de escaneos</p>
              <v-card rounded="xl" elevation="1">
                <div class="d-flex align-center px-3 pt-3">
                  <v-spacer />
                  <v-btn size="x-small" variant="text" color="deep-purple" prepend-icon="mdi-refresh" @click="cargarRegistroPicking">
                    Actualizar
                  </v-btn>
                </div>
                <v-data-table
                  :headers="headersRegistro"
                  :items="registroPicking"
                  density="compact"
                  :loading="cargandoRegistro"
                  :items-per-page="20"
                  no-data-text="Aún no hay escaneos en esta sesión"
                >
                  <template #item.caja="{ item }">
                    <span class="font-weight-bold">{{ item.POSICION }}/{{ item.NCAJAS }}</span>
                  </template>
                  <template #item.factura="{ item }">
                    {{ item.NUMSERIE }}-{{ item.NUMFACTURA }}
                  </template>
                  <template #item.rutero="{ item }">
                    <v-chip size="x-small" color="deep-purple" variant="tonal">{{ item.RUTERO_NUMERO }}</v-chip>
                  </template>
                  <template #item.FECHAESCAN="{ item }">
                    <span class="text-caption text-grey-darken-1">{{ item.FECHAESCAN }}</span>
                  </template>
                </v-data-table>
              </v-card>

            </template>
          </div>
        </v-tabs-window-item>

      </v-tabs-window>
    </v-card>

    <!-- Dialog Picking -->
    <v-dialog v-model="pickingDialog" max-width="700" scrollable persistent>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center pa-4 pb-2">
          <v-icon start color="deep-purple">mdi-barcode-scan</v-icon>
          Picking — Rutero {{ pickingRutero?.NUMERO }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="pickingDialog = false" />
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-4">
          <!-- Progreso global -->
          <div class="d-flex align-center gap-4 mb-4">
            <div class="text-center">
              <div class="text-h5 font-weight-black" :class="pickingCompleto ? 'text-success' : 'text-primary'">
                {{ pickingEstado.cajasEscaneadas }} / {{ pickingEstado.totalCajas }}
              </div>
              <div class="text-caption text-grey-darken-1">Cajas escaneadas</div>
            </div>
            <v-progress-linear
              :model-value="pickingEstado.totalCajas ? (pickingEstado.cajasEscaneadas / pickingEstado.totalCajas) * 100 : 0"
              :color="pickingCompleto ? 'success' : 'deep-purple'"
              height="12" rounded class="flex-grow-1"
            />
            <v-icon v-if="pickingCompleto" color="success" size="32">mdi-check-circle</v-icon>
          </div>

          <!-- Último resultado -->
          <v-alert
            v-if="pickingUltimoRes"
            :type="pickingUltimoRes.tipo"
            variant="tonal"
            density="compact"
            class="mb-3"
            closable
            @click:close="pickingUltimoRes = null"
          >{{ pickingUltimoRes.mensaje }}</v-alert>

          <!-- Input barcode -->
          <v-text-field
            ref="barcodeInputRef"
            v-model="pickingBarcode"
            label="Escanear código de caja"
            prepend-inner-icon="mdi-barcode"
            variant="outlined"
            density="compact"
            hide-details
            :loading="escaneando"
            :disabled="escaneando"
            autofocus
            clearable
            class="mb-4"
            @keyup.enter="escanearCaja"
          />

          <!-- Tabla de líneas por factura/conteo -->
          <v-data-table
            :headers="headersPicking"
            :items="pickingEstado.lineas"
            density="compact"
            hide-default-footer
            :items-per-page="-1"
            :loading="cargandoPicking"
            no-data-text="Sin datos de conteo"
          >
            <template #item.progreso="{ item }">
              <v-chip
                size="x-small"
                :color="item.escaneadas >= item.ncajas ? 'success' : 'warning'"
                variant="tonal"
              >{{ item.escaneadas }}/{{ item.ncajas }}</v-chip>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Dialog clave admin para En Ruta -->
    <v-dialog v-model="dialogEnRuta.show" max-width="380" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-4 d-flex align-center gap-2">
          <v-icon color="warning">mdi-lock-alert</v-icon>
          Clave de Administrador
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <p class="text-body-2 mb-3">
            Uno o más ruteros tienen picking incompleto.
            Ingresa la clave de administrador para iniciar el viaje de todas formas.
          </p>
          <v-text-field
            v-model="dialogEnRuta.clave"
            label="Clave de administrador"
            type="password"
            variant="outlined"
            density="compact"
            hide-details
            autofocus
            @keyup.enter="confirmarEnRutaConClave"
          />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogEnRuta.show = false">Cancelar</v-btn>
          <v-btn color="warning" variant="elevated" :loading="dialogEnRuta.cargando" @click="confirmarEnRutaConClave">
            <v-icon start>mdi-truck-fast</v-icon>
            Iniciar Viaje
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog fecha entrega -->
    <v-dialog v-model="dialogFecha.show" max-width="360" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-4">Confirmar entrega</v-card-title>
        <v-card-text class="pa-4 pt-0">
          <p class="text-body-2 mb-3 text-grey-darken-2">
            {{ dialogFecha.item?.FACTURA_VISUAL }} · {{ dialogFecha.item?.CLIENTE }}
          </p>
          <v-text-field
            v-model="dialogFecha.fecha"
            label="Fecha de entrega"
            type="date"
            :min="dialogFecha.minFecha"
            :max="hoyISO"
            variant="outlined"
            density="compact"
          />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogFecha.show = false">Cancelar</v-btn>
          <v-btn color="success" variant="elevated" :loading="!!confirmandoFactura" @click="confirmarFacturaConFecha">
            <v-icon start>mdi-check</v-icon>
            Confirmar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog facturas pendientes de picking -->
    <v-dialog v-model="dialogPendientes.show" max-width="520" scrollable>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center pa-4 pb-2">
          <v-icon start color="orange">mdi-package-variant-closed</v-icon>
          Pendientes — Rutero {{ dialogPendientes.rutero?.NUMERO }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="dialogPendientes.show = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div v-if="dialogPendientes.loading" class="text-center pa-6">
            <v-progress-circular indeterminate color="deep-purple" />
          </div>
          <div v-else-if="!dialogPendientes.lineas.length" class="text-center text-success pa-6">
            <v-icon size="40" class="mb-2">mdi-check-circle</v-icon>
            <div class="font-weight-bold">Todo completado</div>
            <div class="text-caption text-grey-darken-1">Todas las cajas han sido escaneadas.</div>
          </div>
          <v-list v-else density="compact" lines="two">
            <v-list-item
              v-for="l in dialogPendientes.lineas"
              :key="`${l.numserie}-${l.numfactura}`"
              class="px-0"
            >
              <template #prepend>
                <v-chip size="x-small" color="orange" variant="tonal" class="mr-3 font-weight-bold">
                  {{ l.escaneadas }}/{{ l.ncajas }}
                </v-chip>
              </template>
              <v-list-item-title class="text-body-2 font-weight-medium">{{ l.numserie }}-{{ l.numfactura }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ l.cliente }}
                <span v-if="l.idconteo" class="ml-2 text-blue-darken-2">· {{ l.idconteo }}</span>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" rounded="pill" timeout="4000">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, nextTick, watch } from 'vue';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useBrandingStore } from '../stores/useBrandingStore';
import { useAuthStore } from '../stores/useAuthStore';

const authStore = useAuthStore();

const API = import.meta.env.VITE_API_URL;

const tab              = ref('oficina');
const zonaSeleccionada = ref<{ zona: string; display: string } | null>(null);
const zonas            = ref<{ zona: string; display: string }[]>([]);
const modalZonas       = ref(false);
const facturas         = ref<any[]>([]);
const cargando         = ref(false);
const creando          = ref(false);
const seleccionadas    = ref<Set<string>>(new Set());
const snackbar         = ref({ show: false, text: '', color: '' });

// Manual add (oficina tab)
const manualSerie    = ref('');
const manualNum      = ref('');
const buscandoManual = ref(false);

// Documentos tab
const docsManual  = ref<any[]>([]);
const docSerie    = ref('');
const docNum      = ref('');
const buscandoDoc = ref(false);
const creandoDocs = ref(false);

watch(zonaSeleccionada, () => {
  facturas.value     = [];
  seleccionadas.value = new Set();
});

// TTS — Web Speech API nativa
const hablar = (texto: string, rate = 0.92) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u  = new SpeechSynthesisUtterance(texto);
  u.lang   = 'es-VE';
  u.rate   = rate;
  window.speechSynthesis.speak(u);
};
const hablarRapido = (texto: string) => hablar(texto, 1.3);

// Ruteros activos
const ruteros           = ref<any[]>([]);
const cargandoRuteros   = ref(false);
const facturasRutero    = reactive<Record<number, any[]>>({});
const confirmandoRutero = ref<number | null>(null);
const confirmandoFactura = ref<string | null>(null);
const quitandoFactura   = ref<string | null>(null);
const filtroRuteros     = ref({ numero: '', factura: '', pedido: '' });
const paginaRuteros     = ref(1);
const totalRuteros      = ref(0);
const limitRuteros      = 15;
const filtroPickingEstado = ref<string>('todos');
const buscarRuteros = () => { paginaRuteros.value = 1; cargarRuteros(); };
const limpiarFiltrosRuteros = () => { filtroRuteros.value = { numero: '', factura: '', pedido: '' }; paginaRuteros.value = 1; cargarRuteros(); };
const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

const filtrarFacturasRutero = (id: number) => {
  const lista = facturasRutero[id] ?? [];
  switch (filtroPickingEstado.value) {
    case 'checkeado':    return lista.filter((f: any) => f.CHECKEADO);
    case 'pendiente':    return lista.filter((f: any) => !f.CHECKEADO);
    case 'entregado':    return lista.filter((f: any) => f.FECHARECIBIDO);
    case 'no_entregado': return lista.filter((f: any) => !f.FECHARECIBIDO);
    default:             return lista;
  }
};

const dialogFecha = ref({ show: false, idrutero: 0, item: null as any, fecha: hoyISO, minFecha: '' });

const abrirDialogFecha = (r: any, item: any) => {
  dialogFecha.value = {
    show: true,
    idrutero: r.ID,
    item,
    fecha: hoyISO,
    minFecha: (r.FECHA ?? '').substring(0, 10),
  };
};

// Sesión de picking
const sesionPicking             = ref<any[]>([]);
const cargandoSesion            = ref(false);
const agregandoPicking          = ref<number | null>(null);
const liberandoPicking          = ref<number | null>(null);
const pickingCompletoAnunciado  = ref(false);

const verificarPickingCompleto = () => {
  if (pickingCompletoAnunciado.value) return;
  if (!sesionPicking.value.length) return;
  const completo = sesionPicking.value.every(
    r => Number(r.TOTAL_CAJAS) > 0 && Number(r.CAJAS_ESCANEADAS) >= Number(r.TOTAL_CAJAS)
  );
  if (completo) {
    pickingCompletoAnunciado.value = true;
    hablar('Picking completado, quedó bello');
  }
};

const cargarSesionPicking = async () => {
  cargandoSesion.value = true;
  try {
    const [sesRes] = await Promise.all([
      axios.get(`${API}/rutero/ruteros/picking/sesion`),
      cargarRegistroPicking(),
    ]);
    sesionPicking.value = sesRes.data.data ?? [];
    pickingCompletoAnunciado.value = false;
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error al cargar sesión', 'error');
  } finally {
    cargandoSesion.value = false;
    await nextTick();
    barcodeGlobalRef.value?.focus();
  }
};

const agregarAPicking = async (r: any) => {
  agregandoPicking.value = r.ID;
  try {
    const res = await axios.post(`${API}/rutero/ruteros/${r.ID}/picking/iniciar`);
    if (res.data.success) {
      r.PICKING_USUARIO = authStore.usuario?.usuario;
      notify(`Rutero ${r.NUMERO} agregado a tu sesión de picking`, 'success');
    } else {
      notify(`Bloqueado por ${res.data.bloqueadoPor}`, 'warning');
    }
    pickingCompletoAnunciado.value = false;
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error', 'error');
  } finally {
    agregandoPicking.value = null;
  }
};

const iniciandoViaje = ref(false);
const dialogEnRuta   = ref({ show: false, clave: '', cargando: false });

const iniciarViajeSession = async () => {
  hablar('Iniciando Viaje');
  iniciandoViaje.value = true;
  try {
    const res = await axios.post(`${API}/rutero/ruteros/picking/iniciar-viaje`);
    if (res.data.success) {
      sesionPicking.value = [];
      notify(res.data.message || 'Viaje iniciado', 'success');
    } else if (res.data.requireAdminKey) {
      dialogEnRuta.value = { show: true, clave: '', cargando: false };
    } else {
      notify(res.data.message || 'Error', 'error');
    }
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error', 'error');
  } finally {
    iniciandoViaje.value = false;
  }
};

const confirmarEnRutaConClave = async () => {
  if (!dialogEnRuta.value.clave.trim()) return;
  dialogEnRuta.value.cargando = true;
  try {
    const res = await axios.post(`${API}/rutero/ruteros/picking/iniciar-viaje`, { claveAdmin: dialogEnRuta.value.clave });
    if (res.data.success) {
      sesionPicking.value = [];
      hablar('Iniciando Viaje');
      notify(res.data.message || 'Viaje iniciado', 'success');
      dialogEnRuta.value.show = false;
    } else {
      notify(res.data.message || 'Clave incorrecta', 'error');
    }
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error', 'error');
  } finally {
    dialogEnRuta.value.cargando = false;
  }
};

const liberarDeSesion = async (r: any) => {
  liberandoPicking.value = r.ID;
  try {
    await axios.post(`${API}/rutero/ruteros/${r.ID}/picking/liberar`);
    sesionPicking.value = sesionPicking.value.filter(x => x.ID !== r.ID);
    // También actualizar en la lista de ruteros activos si está cargada
    const enLista = ruteros.value.find(x => x.ID === r.ID);
    if (enLista) enLista.PICKING_USUARIO = null;
    notify(`Rutero ${r.NUMERO} liberado`, 'info');
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error', 'error');
  } finally {
    liberandoPicking.value = null;
  }
};

// Picking generalizado (escaneo global de sesión)
const pickingBarcodeGlobal  = ref('');
const escaneandoGlobal      = ref(false);
const barcodeGlobalRef      = ref<any>(null);
const registroPicking       = ref<any[]>([]);
const cargandoRegistro      = ref(false);
const ultimoResultadoGlobal = ref<{ tipo: 'success' | 'warning' | 'error'; titulo: string; detalle?: string } | null>(null);

const headersRegistro = [
  { title: 'Caja',    key: 'caja',      sortable: false, width: '80px' },
  { title: 'Factura', key: 'factura',   sortable: false },
  { title: 'Cliente', key: 'CLIENTE',   sortable: false },
  { title: 'Rutero',  key: 'rutero',    sortable: false },
  { title: 'Hora',    key: 'FECHAESCAN', sortable: false },
];

const cargarRegistroPicking = async () => {
  cargandoRegistro.value = true;
  try {
    const res = await axios.get(`${API}/rutero/ruteros/picking/registro`);
    registroPicking.value = res.data.data ?? [];
  } catch { /* silencioso */ } finally {
    cargandoRegistro.value = false;
  }
};

const escanearCajaGlobal = async () => {
  const barcode = pickingBarcodeGlobal.value.trim();
  if (!barcode || escaneandoGlobal.value) return;
  escaneandoGlobal.value      = true;
  ultimoResultadoGlobal.value = null;
  try {
    const res = await axios.post(`${API}/rutero/ruteros/picking/escanear`, { barcode });
    if (res.data.success) {
      hablarRapido('Bulto Cargado');
      ultimoResultadoGlobal.value = {
        tipo:   'success',
        titulo: `Caja ${res.data.posicion}/${res.data.ncajas} — ${res.data.factura}`,
        detalle: `${res.data.cliente}  ·  Rutero ${res.data.ruteroNumero}  ·  ${res.data.ruteroRuta}`,
      };
      registroPicking.value.unshift({
        POSICION: res.data.posicion, NCAJAS: res.data.ncajas,
        NUMSERIE: res.data.factura?.split('-')[0], NUMFACTURA: res.data.factura?.split('-')[1],
        CLIENTE: res.data.cliente, RUTERO_NUMERO: res.data.ruteroNumero,
        FECHAESCAN: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' }),
      });
      const r = sesionPicking.value.find(x => x.ID === res.data.ruteroId);
      if (r) r.CAJAS_ESCANEADAS = (r.CAJAS_ESCANEADAS ?? 0) + 1;
      verificarPickingCompleto();
    } else if (res.data.duplicado) {
      hablarRapido('Bulto Cargado Anteriormente');
      ultimoResultadoGlobal.value = {
        tipo:   'warning',
        titulo: res.data.message,
        detalle: `${res.data.cliente}  ·  Rutero ${res.data.ruteroNumero}`,
      };
    } else {
      hablarRapido('Bulto no Encontrado');
      ultimoResultadoGlobal.value = { tipo: 'error', titulo: res.data.message };
    }
  } catch (e: any) {
    hablarRapido('Bulto no Encontrado');
    ultimoResultadoGlobal.value = { tipo: 'error', titulo: e.response?.data?.message || 'Error al escanear' };
  } finally {
    escaneandoGlobal.value       = false;
    pickingBarcodeGlobal.value   = '';
    await nextTick();
    barcodeGlobalRef.value?.focus();
  }
};

// Dialog facturas pendientes de rutero en sesión
const dialogPendientes = ref<{ show: boolean; rutero: any; loading: boolean; lineas: any[] }>({
  show: false, rutero: null, loading: false, lineas: [],
});

const abrirPendientesRutero = async (r: any) => {
  dialogPendientes.value = { show: true, rutero: r, loading: true, lineas: [] };
  try {
    const res = await axios.get(`${API}/rutero/ruteros/${r.ID}/picking`);
    dialogPendientes.value.lineas = (res.data.data?.lineas ?? []).filter((l: any) => l.escaneadas < l.ncajas);
  } catch { /* silencioso */ } finally {
    dialogPendientes.value.loading = false;
  }
};

// Picking (dialog de escaneo por rutero — secundario)
const pickingDialog    = ref(false);
const pickingRutero    = ref<any>(null);
const pickingBarcode   = ref('');
const escaneando       = ref(false);
const cargandoPicking  = ref(false);
const barcodeInputRef  = ref<any>(null);
const pickingEstado    = ref<{ totalCajas: number; cajasEscaneadas: number; lineas: any[] }>({ totalCajas: 0, cajasEscaneadas: 0, lineas: [] });
const pickingUltimoRes = ref<{ tipo: 'success' | 'warning' | 'error'; mensaje: string } | null>(null);
const pickingCompleto  = computed(() => pickingEstado.value.totalCajas > 0 && pickingEstado.value.cajasEscaneadas >= pickingEstado.value.totalCajas);

const headersPicking = [
  { title: 'Factura',  key: 'numfactura', sortable: false },
  { title: 'Cliente',  key: 'cliente',    sortable: false },
  { title: 'Conteo',   key: 'idconteo',   sortable: false },
  { title: 'Progreso', key: 'progreso',   sortable: false, align: 'center' as const },
];

const abrirPicking = async (r: any) => {
  pickingRutero.value    = r;
  pickingBarcode.value   = '';
  pickingUltimoRes.value = null;
  pickingEstado.value    = { totalCajas: 0, cajasEscaneadas: 0, lineas: [] };
  pickingDialog.value    = true;
  await nextTick();
  barcodeInputRef.value?.focus();
  cargarEstadoPicking(r.ID);
};

const cargarEstadoPicking = async (idrutero: number) => {
  cargandoPicking.value = true;
  try {
    const res = await axios.get(`${API}/rutero/ruteros/${idrutero}/picking`);
    pickingEstado.value = res.data.data;
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error al cargar estado de picking', 'error');
  } finally {
    cargandoPicking.value = false;
  }
};

const escanearCaja = async () => {
  const barcode = pickingBarcode.value.trim();
  if (!barcode || !pickingRutero.value || escaneando.value) return;
  escaneando.value = true;
  pickingUltimoRes.value = null;
  try {
    const res = await axios.post(`${API}/rutero/ruteros/${pickingRutero.value.ID}/escanear`, { barcode });
    if (res.data.duplicate) {
      pickingUltimoRes.value = { tipo: 'warning', mensaje: `Caja ya escaneada: ${barcode}` };
    } else {
      pickingUltimoRes.value = { tipo: 'success', mensaje: res.data.message || `Caja registrada: ${barcode}` };
      await cargarEstadoPicking(pickingRutero.value.ID);
    }
  } catch (e: any) {
    const msg = e.response?.data?.message || e.message || 'Error al escanear';
    pickingUltimoRes.value = { tipo: 'error', mensaje: msg };
  } finally {
    escaneando.value    = false;
    pickingBarcode.value = '';
    await nextTick();
    barcodeInputRef.value?.focus();
  }
};

const todasSeleccionadas = computed(() =>
  facturas.value.length > 0 && facturas.value.every(f => seleccionadas.value.has(clave(f)))
);

const headersOficina = [
  { title: '',        key: 'sel',           sortable: false, width: '48px' },
  { title: 'Factura', key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Cliente', key: 'CLIENTE' },
  { title: 'Ruta',    key: 'NOMBRE_RUTA' },
  { title: 'Bultos',  key: 'BULTOS',  align: 'center' as const },
  { title: 'Total',   key: 'TOTAL',   align: 'end'    as const },
];

const headersRutero = [
  { title: '',        key: 'estado',        sortable: false, width: '48px' },
  { title: 'Factura', key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Pedido',  key: 'PEDIDO',        sortable: false },
  { title: 'Cliente', key: 'CLIENTE' },
  { title: 'Bultos',  key: 'BULTOS',  align: 'center' as const },
  { title: 'Total',   key: 'TOTAL',   align: 'end'    as const },
  { title: '',        key: 'actions', sortable: false, width: '100px' },
];

const headersDocsManual = [
  { title: 'Factura', key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Cliente', key: 'CLIENTE' },
  { title: 'Ruta',    key: 'NOMBRE_RUTA' },
  { title: 'Total',   key: 'TOTAL', align: 'end' as const },
  { title: '',        key: 'quitar', sortable: false, width: '48px' },
];

const clave = (f: any) => `${f.NUMSERIE}-${f.NUMFACTURA}`;
const notify = (text: string, color: string) => snackbar.value = { show: true, text, color };

const toggleSel = (item: any) => {
  const s = new Set(seleccionadas.value);
  const k = clave(item);
  if (s.has(k)) s.delete(k); else s.add(k);
  seleccionadas.value = s;
};

const toggleTodas = () => {
  if (todasSeleccionadas.value) {
    seleccionadas.value = new Set();
  } else {
    seleccionadas.value = new Set(facturas.value.map(clave));
  }
};

onMounted(async () => {
  try {
    const res = await axios.get(`${API}/rutero/zonas`);
    zonas.value = res.data.data ?? [];
  } catch { /* silencioso */ }
});

const fetchFactura = async (serie: string, num: number): Promise<any | null> => {
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/rutero/buscar-factura`, {
      params: { numserie: serie.toUpperCase().trim(), numfactura: num },
    });
    return res.data.success ? res.data.data : null;
  } catch (e: any) {
    notify(e.response?.data?.message || 'Factura no encontrada', 'error');
    return null;
  }
};

const agregarFacturaManual = async () => {
  const num = Number(manualNum.value);
  if (!manualSerie.value || !num) return;
  buscandoManual.value = true;
  try {
    const factura = await fetchFactura(manualSerie.value, num);
    if (!factura) return;
    if (facturas.value.some(f => clave(f) === clave(factura))) {
      notify('Esa factura ya está en el listado', 'warning'); return;
    }
    facturas.value = [...facturas.value, factura];
    const s = new Set(seleccionadas.value);
    s.add(clave(factura));
    seleccionadas.value = s;
    manualSerie.value = '';
    manualNum.value   = '';
    notify(`Factura ${factura.FACTURA_VISUAL} agregada`, 'success');
  } finally { buscandoManual.value = false; }
};

const agregarDocManual = async () => {
  const num = Number(docNum.value);
  if (!docSerie.value || !num) return;
  buscandoDoc.value = true;
  try {
    const factura = await fetchFactura(docSerie.value, num);
    if (!factura) return;
    if (docsManual.value.some(d => clave(d) === clave(factura))) {
      notify('Ese documento ya está en el listado', 'warning'); return;
    }
    docsManual.value = [...docsManual.value, factura];
    docSerie.value = '';
    docNum.value   = '';
  } finally { buscandoDoc.value = false; }
};

const crearRuteroDocumentos = async () => {
  if (!docsManual.value.length || !zonaSeleccionada.value) return;
  const zona = zonaSeleccionada.value;
  creandoDocs.value = true;
  try {
    const res = await axios.post(`${import.meta.env.VITE_API_URL}/rutero/crear`, {
      codruta:    parseInt(zona.zona),
      nombreRuta: zona.display,
      facturas:   docsManual.value.map(f => ({ numserie: f.NUMSERIE, numfactura: f.NUMFACTURA })),
    });
    const { numero } = res.data.data;
    notify(`Rutero de documentos ${numero} creado`, 'success');
    generarPDF(numero, zona.display, docsManual.value);
    docsManual.value = [];
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error al crear rutero', 'error');
  } finally { creandoDocs.value = false; }
};

const buscar = async () => {
  const zona = (zonaSeleccionada.value?.zona ?? '').trim();
  if (!zona) { notify('Ingresa una zona', 'warning'); return; }
  cargando.value = true;
  seleccionadas.value = new Set();
  try {
    const res = await axios.get(`${API}/rutero/facturas`, { params: { zona } });
    facturas.value = res.data.data ?? [];
    seleccionadas.value = new Set(facturas.value.map(clave));
    if (!facturas.value.length) notify('No hay facturas pendientes para esa zona', 'info');
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error desconocido', 'error');
  } finally {
    cargando.value = false;
  }
};

const crearRutero = async () => {
  if (!seleccionadas.value.size) return;
  const zona = zonaSeleccionada.value;
  if (!zona) return;

  const lista = facturas.value.filter(f => seleccionadas.value.has(clave(f)));
  creando.value = true;
  try {
    const res = await axios.post(`${API}/rutero/crear`, {
      codruta:   parseInt(zona.zona),
      nombreRuta: zona.display,
      facturas:  lista.map(f => ({ numserie: f.NUMSERIE, numfactura: f.NUMFACTURA })),
    });
    const { id, numero } = res.data.data;
    notify(`Rutero ${numero} creado`, 'success');
    generarPDF(numero, zona.display, lista);
    // Refresh: las facturas asignadas ya no aparecen
    await buscar();
    // Recargar la lista de ruteros activos
    await cargarRuteros();
    // Cargar el detalle del rutero recién creado
    await cargarFacturasRutero(id);
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al crear rutero', 'error');
  } finally {
    creando.value = false;
  }
};

const cargarRuteros = async () => {
  cargandoRuteros.value = true;
  try {
    const codruta = zonaSeleccionada.value?.zona ? parseInt(zonaSeleccionada.value.zona) : undefined;
    const params: any = { page: paginaRuteros.value, limit: limitRuteros };
    if (codruta)                        params.codruta       = codruta;
    if (filtroRuteros.value.numero)     params.buscarNumero  = filtroRuteros.value.numero;
    if (filtroRuteros.value.factura)    params.buscarFactura = filtroRuteros.value.factura;
    if (filtroRuteros.value.pedido)     params.buscarPedido  = filtroRuteros.value.pedido;
    const res = await axios.get(`${API}/rutero/ruteros`, { params });
    ruteros.value    = res.data.data  ?? [];
    totalRuteros.value = res.data.total ?? 0;
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al cargar ruteros', 'error');
  } finally {
    cargandoRuteros.value = false;
  }
};

const cargarFacturasRutero = async (idrutero: number) => {
  if (facturasRutero[idrutero]) return; // ya cargado
  try {
    const res = await axios.get(`${API}/rutero/ruteros/${idrutero}/facturas`);
    facturasRutero[idrutero] = res.data.data ?? [];
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al cargar facturas', 'error');
  }
};

const confirmarFactura = async (idrutero: number, item: any, fechaEntrega?: string) => {
  const k = clave(item);
  confirmandoFactura.value = k;
  try {
    await axios.put(`${API}/rutero/confirmar-factura`, {
      idrutero,
      numserie:    item.NUMSERIE,
      numfactura:  item.NUMFACTURA,
      fechaEntrega: fechaEntrega ?? undefined,
    });
    item.FECHARECIBIDO = fechaEntrega ?? new Date().toISOString();
    const r = ruteros.value.find(x => x.ID === idrutero);
    if (r) r.ENTREGADAS = (r.ENTREGADAS || 0) + 1;
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al confirmar', 'error');
  } finally {
    confirmandoFactura.value = null;
  }
};

const confirmarFacturaConFecha = async () => {
  const { idrutero, item, fecha } = dialogFecha.value;
  dialogFecha.value.show = false;
  await confirmarFactura(idrutero, item, fecha);
};

const quitarFacturaDeRutero = async (r: any, item: any) => {
  const k = clave(item);
  quitandoFactura.value = k;
  try {
    await axios.delete(`${API}/rutero/ruteros/${r.ID}/facturas`, {
      data: { numserie: item.NUMSERIE, numfactura: item.NUMFACTURA }
    });
    facturasRutero[r.ID] = (facturasRutero[r.ID] ?? []).filter(f => clave(f) !== k);
    notify('Factura quitada del rutero', 'success');
  } catch (e: any) {
    notify(e.response?.data?.message || e.message || 'Error al quitar factura', 'error');
  } finally {
    quitandoFactura.value = null;
  }
};

const confirmarRuteroCompleto = async (id: number) => {
  confirmandoRutero.value = id;
  try {
    await axios.put(`${API}/rutero/ruteros/${id}/confirmar`);
    notify('Rutero marcado como entregado', 'success');
    // Remove from list
    ruteros.value = ruteros.value.filter(r => r.ID !== id);
    delete facturasRutero[id];
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al confirmar rutero', 'error');
  } finally {
    confirmandoRutero.value = null;
  }
};

const imprimirRutero = async (r: any) => {
  let lista = facturasRutero[r.ID];
  if (!lista) {
    try {
      const res = await axios.get(`${API}/rutero/ruteros/${r.ID}/facturas`);
      lista = res.data.data ?? [];
      facturasRutero[r.ID] = lista;
    } catch { notify('No se pudo cargar las facturas', 'error'); return; }
  }
  generarPDF(r.NUMERO, `${r.CODRUTA} - ${r.NOMBRE_RUTA}`, lista);
};

// ─── PDF ──────────────────────────────────────────────────────────────────────
const generarPDF = (numero: string, zonaDisplay: string, lista: any[]) => {
  const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Caracas' });
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const logo  = new Image();
  logo.src    = useBrandingStore().logo;

  const build = () => {
    const addHeader = (pageNum: number, totalPages: number) => {
      try { doc.addImage(logo, 'PNG', 10, 6, 28, 13); } catch { /* sin logo */ }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(31, 78, 121);
      doc.text('DROGUERIA INTERCONTINENTAL, C.A.', 105, 11, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text('RIF: J-501590192', 105, 15.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(31, 78, 121);
      doc.text('REPARTO A CLIENTE', 105, 20, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(50, 50, 50);
      const infoLine = `Nro: ${numero}    Ruta: ${zonaDisplay}    Fecha: ${fecha}    Pág. ${pageNum} de ${totalPages}`;
      doc.text(infoLine, 105, 24.5, { align: 'center' });

      doc.setDrawColor(31, 78, 121);
      doc.setLineWidth(0.5);
      doc.line(10, 27, 205, 27);
    };

    // ── Agrupa por cliente ──────────────────────────────────────────────────
    const grouped = new Map<string, { cod: string; nombre: string; items: any[] }>();
    for (const f of lista) {
      const key = `${f.CODCLIENTE}`;
      if (!grouped.has(key)) grouped.set(key, { cod: f.CODCLIENTE ?? '', nombre: f.CLIENTE ?? '', items: [] });
      grouped.get(key)!.items.push(f);
    }

    const body: any[] = [];
    let totalDocs   = 0;
    let totalBultos = 0;
    const totalClientes = grouped.size;

    for (const { cod, nombre, items } of grouped.values()) {
      const subtotalBultos = items.reduce((s, f) => s + (Number(f.TOTAL_CAJAS ?? f.BULTOS) || 0), 0);
      totalDocs   += items.length;
      totalBultos += subtotalBultos;

      // Fila cabecera de cliente
      body.push([
        { content: `(${cod}) ${nombre}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [208, 228, 248] } },
        { content: `BULTOS: ${subtotalBultos}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [208, 228, 248] } },
      ]);

      // Filas de facturas
      for (const f of items) {
        const facturaText = f.FACTURA_VISUAL ?? `${f.NUMSERIE}-${f.NUMFACTURA}`;
        const pedidoText  = f.PEDIDO ? `Ped: ${f.PEDIDO}` : '';
        body.push([
          { content: pedidoText ? `${facturaText}\n${pedidoText}` : facturaText, styles: { fontSize: 7 } },
          { content: String(f.TOTAL_CAJAS ?? f.BULTOS ?? 0), styles: { halign: 'center' } },
          { content: '1', styles: { halign: 'center' } },
          { content: '0', styles: { halign: 'center' } },
          '',
        ]);
      }
    }

    // Fila totales
    body.push([
      {
        content: `Recibí Conforme: _______________________     Nro. Documentos: ${totalDocs}     Nro. Renglones: ${totalClientes}     Cant. Bultos/Cestas: ${totalBultos}     Encomiendas: 0`,
        colSpan: 5,
        styles: { fontStyle: 'bold', fontSize: 7.5, halign: 'left', fillColor: [240, 240, 240] },
      },
    ]);

    autoTable(doc, {
      startY: 29,
      head: [['FACTURA', 'B/C', 'DOCS.', 'CESTAS', 'FIRMA / RECIBIDO']],
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, valign: 'middle' },
      headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 99.9, minCellHeight: 8 },
      },
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        const pageNum   = (doc as any).internal.getCurrentPageInfo().pageNumber;
        const totalPgs  = (doc as any).internal.getNumberOfPages();
        addHeader(pageNum, totalPgs);
      },
    });

    // Corregir cabeceras en páginas ya generadas
    const totalPgs = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPgs; p++) {
      doc.setPage(p);
      addHeader(p, totalPgs);
    }

    doc.save(`${numero}_${zonaDisplay.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    notify(`PDF ${numero} generado`, 'success');
  };

  if (logo.complete && logo.naturalWidth > 0) {
    build();
  } else {
    logo.onload  = build;
    logo.onerror = build;
  }
};
</script>
