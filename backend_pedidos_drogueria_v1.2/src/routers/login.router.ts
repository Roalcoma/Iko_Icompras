import { Router } from "express";
import { loginController } from "../controllers/login.controller";

const loginRouter = Router()

loginRouter.get('/', loginController.login)

export default loginRouter
