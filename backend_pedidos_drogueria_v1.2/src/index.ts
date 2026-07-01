import Express from "express";
import morgan from "morgan";
import cors from "cors";
import productsRouter from "./routers/products.router";
import pedidosRouter  from "./routers/pedidos.router";
import clientesRouter from "./routers/clientes.router";
import authRouter     from "./routers/auth.router";
import promocionesRouter from "./routers/promociones.router";
import reclamosRouter from "./routers/reclamos.router";
import sistemaRouter    from "./routers/sistema.router";
import ecommerceRouter  from "./routers/ecommerce.router";
import { ExchangeService }    from "./services/exchange.service";
import { AuthService }        from "./services/auth.service";
import { PromocionesService } from "./services/promociones.service";
import { PedidosServices }    from "./services/pedidos.service";
import { ReclamosService }    from "./services/reclamos.service";
import { EcommerceService }   from "./services/ecommerce.service";
import { dbModeMiddleware } from "./db/dbMode.middleware";

const app  = Express();
const port = process.env.PORT || 3001;

app.use(morgan("dev"));
app.use(Express.json());
app.use(cors());
app.use(dbModeMiddleware);

app.get('/', (_req, res) => {
    res.status(200).json({ success: true, message: "API funcionando correctamente!" });
});

app.post('/api/eventos', (_req, res) => res.status(200).send('OK'));

app.get("/api/tasa", async (_req, res) => {
    try {
        const tasa = await ExchangeService.getCotizacion();
        res.status(200).json({ success: true, tasa: tasa || 0 });
    } catch {
        res.status(500).json({ success: false, message: "Error al obtener la cotización" });
    }
});

app.use('/products', productsRouter);
app.use('/pedidos',  pedidosRouter);
app.use('/clientes', clientesRouter);
app.use('/auth',     authRouter);
app.use('/promociones', promocionesRouter);
app.use('/reclamos',   reclamosRouter);
app.use('/sistema',    sistemaRouter);
app.use('/ecommerce',  ecommerceRouter);

app.listen(port, async () => {
    console.log(`Servidor en http://localhost:${port}`);
    // Solo verifica/agrega columna VISIBILIDAD si falta en la tabla usuarios existente
    await AuthService.initTablas();
    await PromocionesService.initTablas();
    await PedidosServices.initTablas();
    await ReclamosService.initTablas();
    await EcommerceService.initTablas();
    // Cron: escanear carpeta ecommerce cada 60 segundos
    setInterval(() => EcommerceService.escanearCarpeta().catch(console.error), 60_000);
});
