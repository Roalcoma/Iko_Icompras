import { exec } from 'child_process';
import path from 'path';
import { getDbConfig } from './dbconfig.service';

const ROOT = path.resolve(process.cwd(), '..'); // raíz del repo (un nivel arriba del backend)

// Rutas comunes de git en Windows; si está en PATH se usa 'git' directamente
const GIT_PATHS = [
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
];

function run(cmd: string, cwd: string): Promise<string> {
    return new Promise((resolve) => {
        // Hereda el PATH del proceso e inyecta las rutas comunes de git
        const env = {
            ...process.env,
            PATH: [
                process.env.PATH,
                'C:\\Program Files\\Git\\cmd',
                'C:\\Program Files (x86)\\Git\\cmd',
            ].filter(Boolean).join(';'),
        };
        exec(cmd, { cwd, env }, (_err, stdout, stderr) => {
            resolve((stdout + stderr).trim());
        });
    });
}

export interface ResultadoActualizacion {
    gitPull:           string;
    cambiosDetectados: boolean;
    reiniciando:       boolean;
    mensaje:           string;
}

export async function ejecutarActualizacion(): Promise<ResultadoActualizacion> {
    // 1. git pull
    const gitPull = await run('git pull origin main', ROOT);
    const cambiosDetectados = !gitPull.includes('Already up to date') && !gitPull.includes('Ya está actualizado');

    if (!cambiosDetectados) {
        return {
            gitPull,
            cambiosDetectados: false,
            reiniciando: false,
            mensaje: 'El aplicativo ya está en la última versión.',
        };
    }

    // 2. Reiniciar con NSSM después de que la respuesta llegue al cliente
    const cfg = getDbConfig() as any;
    const servicioBackend  = cfg.nssmServicioBackend  || 'pedidos-backend';
    const servicioFrontend = cfg.nssmServicioFrontend || 'pedidos-frontend';

    setTimeout(async () => {
        // NSSM: reinicia los servicios registrados en Windows
        await run(`nssm restart "${servicioBackend}"`,  ROOT).catch(() => {});
        await run(`nssm restart "${servicioFrontend}"`, ROOT).catch(() => {});
    }, 2500);

    return {
        gitPull,
        cambiosDetectados: true,
        reiniciando: true,
        mensaje: `Actualización descargada. Reiniciando servicios NSSM "${servicioBackend}" y "${servicioFrontend}" en ~3 segundos. Si los nombres son distintos, configúralos en Administración → Configuración BD.`,
    };
}
