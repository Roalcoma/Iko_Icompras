import Express from "express";
import cors from "cors";
import ecommerceRouter from "./routers/ecommerce.router";
import sistemaRouter   from "./routers/sistema.router";
import { PromocionesService } from "./services/promociones.service";
import { EcommerceService }   from "./services/ecommerce.service";
import { getDbConfig }        from "./services/dbconfig.service";

process.on('uncaughtException',  (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const app  = Express();
const port = process.env.PORT || 9000;

app.use(Express.json({ limit: '5mb' }));
app.use(cors());

app.get('/', (_req, res) => { res.json({ success: true, message: 'Icompras sync API' }); });

app.use('/ecommerce', ecommerceRouter);
app.use('/sistema',   sistemaRouter);

app.listen(port, async () => {
    console.log(`Servidor en http://localhost:${port}`);
    await PromocionesService.initTablas();
    await EcommerceService.initTablas();
    // ponytail: recursive setTimeout so interval changes take effect without restart
    const scanLoop = async () => {
        await EcommerceService.escanearCarpeta().catch(console.error);
        const ms = Math.max(5, getDbConfig().intervaloEscaneo) * 1000;
        setTimeout(scanLoop, ms);
    };
    setTimeout(scanLoop, 5000);
});
