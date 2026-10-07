import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import platformRouter from "./platform";
import generalSettingsRouter from "./general-settings";
import publicWebsiteRouter from "./public-website";
import commerceRouter from "./commerce";
import domainsRouter from "./domains";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(platformRouter);
router.use(generalSettingsRouter);
router.use(publicWebsiteRouter);
router.use(commerceRouter);
router.use(domainsRouter);

export default router;
