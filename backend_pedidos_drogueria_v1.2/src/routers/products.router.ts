import { Router } from "express";
import { ProductsController } from "../controllers/products.controller";

const productsRouter = Router();

productsRouter.get('/get-products', ProductsController.getProducts);

productsRouter.get('/get-stocks', ProductsController.getStock)

productsRouter.get('/get-prices', ProductsController.getPrices)

productsRouter.get('/catalogo-segmentos', ProductsController.getCatalogoSegmentos)

export default productsRouter;

