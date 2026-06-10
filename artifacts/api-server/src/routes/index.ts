import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import emailAuthRouter from "./emailAuth";
import storageRouter from "./storage";
import usersRouter from "./users";
import postsRouter from "./posts";
import commentsRouter from "./comments";
import followsRouter from "./follows";
import storiesRouter from "./stories";
import chatsRouter from "./chats";
import groupsRouter from "./groups";
import channelsRouter from "./channels";
import notificationsRouter from "./notifications";
import searchRouter from "./search";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(emailAuthRouter);
router.use(storageRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(commentsRouter);
router.use(followsRouter);
router.use(storiesRouter);
router.use(chatsRouter);
router.use(groupsRouter);
router.use(channelsRouter);
router.use(notificationsRouter);
router.use(searchRouter);
router.use(adminRouter);

export default router;
