<template>
  <v-app>
    <v-app-bar elevation="1" color="primary">
      <v-app-bar-title class="font-weight-bold text-white">Iko — Icompras Sync</v-app-bar-title>
      <template v-slot:append>
        <v-btn variant="text" color="white" to="/" exact>
          <v-icon start>mdi-cog-outline</v-icon>
          Configuración
        </v-btn>
        <v-btn variant="text" color="white" to="/actualizador">
          <v-icon start>mdi-update</v-icon>
          Actualizador
        </v-btn>
      </template>
    </v-app-bar>
    <v-main class="bg-background">
      <router-view />
    </v-main>
  </v-app>
</template>
