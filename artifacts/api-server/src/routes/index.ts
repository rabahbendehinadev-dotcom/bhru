import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import platformRouter from "./platform";
import generalSettingsRouter from "./general-settings";
import publicWebsiteRouter from "./public-website";
import commerceRouter from "./commerce";
import domainsRouter from "./domains";
import clientsRouter from "./clients";
import clientFinanceRouter from "./client-finance";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(platformRouter);
router.use(generalSettingsRouter);
router.use(publicWebsiteRouter);
router.use(commerceRouter);
router.use(domainsRouter);
router.use(clientsRouter);
router.use(clientFinanceRouter);
router.use(paymentsRouter);

export default router;
