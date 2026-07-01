import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { exec } from 'child_process';
import { getDbConfig } from './dbconfig.service';

const ROOT        = path.resolve(process.cwd(), '..'); // raíz del repo
const ZIP_URL     = 'https://github.com/Roalcoma/proyecto-drogueria/archive/refs/heads/main.zip';
const ZIP_TMP     = path.join(ROOT, '_update_tmp.zip');
const EXTRACT_TMP = path.join(ROOT, '_update_tmp');

// Rutas que nunca se tocan al copiar
const PROTEGIDOS = [
    'node_modules',
    'dist',
    '.env',
    '.env.production',
    path.join('config', 'connections.json'),
    '_update_tmp.zip',
    '_update_tmp',
    '.git',
];

function descargarZip(url: string, destino: string, redireccionesRestantes = 5): Promise<void> {
    return new Promise((resolve, reject) => {
        if (redireccionesRestantes === 0) return reject(new Error('Demasiadas redirecciones'));

        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'pedidos-drogueria-updater' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                return descargarZip(res.headers.location!, destino, redireccionesRestantes - 1)
                    .then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} al descargar ZIP`));
            }
            const file = fs.createWriteStream(destino);
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
            file.on('error', reject);
        }).on('error', reject);
    });
}

function copiarRecursivo(origen: string, destino: string, rutaRelativa = '') {
    const entradas = fs.readdirSync(origen);
    for (const entrada of entradas) {
        const relativa = rutaRelativa ? `${rutaRelativa}/${entrada}` : entrada;
        // Saltar protegidos
        if (PROTEGIDOS.some(p => relativa === p || relativa.startsWith(p + '/'))) continue;

        const src = path.join(origen, entrada);
        const dst = path.join(destino, entrada);
        const stat = fs.statSync(src);

        if (stat.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            copiarRecursivo(src, dst, relativa);
        } else {
            fs.copyFileSync(src, dst);
        }
    }
}

function limpiar() {
    try { fs.rmSync(ZIP_TMP,     { force: true }); } catch {}
    try { fs.rmSync(EXTRACT_TMP, { recursive: true, force: true }); } catch {}
}

function run(cmd: string, cwd: string): Promise<string> {
    const env = {
        ...process.env,
        PATH: [process.env.PATH, 'C:\\Program Files\\Git\\cmd'].filter(Boolean).join(';'),
    };
    return new Promise((resolve) => {
        exec(cmd, { cwd, env }, (_err, stdout, stderr) => resolve((stdout + stderr).trim()));
    });
}

export interface ResultadoActualizacion {
    descarga:          string;
    archivosCopiados:  number;
    reiniciando:       boolean;
    mensaje:           string;
}

export async function ejecutarActualizacion(): Promise<ResultadoActualizacion> {
    limpiar(); // limpia restos de una actualización anterior fallida

    // 1. Descargar ZIP desde GitHub
    await descargarZip(ZIP_URL, ZIP_TMP);

    // 2. Extraer
    fs.mkdirSync(EXTRACT_TMP, { recursive: true });
    const zip = new AdmZip(ZIP_TMP);
    zip.extractAllTo(EXTRACT_TMP, true);

    // GitHub extrae en una subcarpeta del tipo "proyecto-drogueria-main/"
    const [subDir] = fs.readdirSync(EXTRACT_TMP);
    const origenReal = path.join(EXTRACT_TMP, subDir);

    // 3. Copiar archivos al proyecto, respetando los protegidos
    let archivosCopiados = 0;
    const copiarContando = (origen: string, destino: string, rel = '') => {
        for (const entrada of fs.readdirSync(origen)) {
            const relativa = rel ? `${rel}/${entrada}` : entrada;
            if (PROTEGIDOS.some(p => relativa === p || relativa.startsWith(p + '/'))) continue;
            const src = path.join(origen, entrada);
            const dst = path.join(destino, entrada);
            if (fs.statSync(src).isDirectory()) {
                fs.mkdirSync(dst, { recursive: true });
                copiarContando(src, dst, relativa);
            } else {
                fs.copyFileSync(src, dst);
                archivosCopiados++;
            }
        }
    };
    copiarContando(origenReal, ROOT);

    // 4. Limpiar temporales
    limpiar();

    // 5. Reiniciar con NSSM si está configurado
    const cfg = getDbConfig() as any;
    const servicioBackend  = (cfg.nssmServicioBackend  || '').trim();
    const servicioFrontend = (cfg.nssmServicioFrontend || '').trim();

    if (!servicioBackend && !servicioFrontend) {
        return {
            descarga: ZIP_URL,
            archivosCopiados,
            reiniciando: false,
            mensaje: `${archivosCopiados} archivos actualizados. No hay servicios NSSM configurados — reinicia el backend manualmente para aplicar los cambios.`,
        };
    }

    setTimeout(async () => {
        if (servicioBackend)  await run(`nssm restart "${servicioBackend}"`,  ROOT).catch(() => {});
        if (servicioFrontend) await run(`nssm restart "${servicioFrontend}"`, ROOT).catch(() => {});
    }, 2500);

    return {
        descarga: ZIP_URL,
        archivosCopiados,
        reiniciando: true,
        mensaje: `${archivosCopiados} archivos actualizados. Reiniciando servicios NSSM en ~3 segundos.`,
    };
}
