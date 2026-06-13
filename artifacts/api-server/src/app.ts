import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/api/socket.io",
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  socket.on("join", (userId: string) => {
    socket.join(`user:${userId}`);
    logger.info({ socketId: socket.id, userId }, "Socket joined user room");
  });

  socket.on("join_chat", (chatId: string) => {
    socket.join(`chat:${chatId}`);
  });

  socket.on("join_group", (groupId: string) => {
    socket.join(`group:${groupId}`);
  });

  socket.on("typing", ({ chatId, userId }: { chatId: string; userId: string }) => {
    socket.to(`chat:${chatId}`).emit("typing", { userId });
  });

  socket.on("stop_typing", ({ chatId, userId }: { chatId: string; userId: string }) => {
    socket.to(`chat:${chatId}`).emit("stop_typing", { userId });
  });

  socket.on("live:join", (sessionId: string) => {
    socket.join(`live:${sessionId}`);
    logger.info({ socketId: socket.id, sessionId }, "Socket joined live room");
  });

  socket.on("live:leave", (sessionId: string) => {
    socket.leave(`live:${sessionId}`);
  });

  socket.on("live:chat", ({ sessionId, message, userName }: { sessionId: string; message: string; userName: string }) => {
    io.to(`live:${sessionId}`).emit("live:chat", {
      message,
      userName,
      timestamp: Date.now(),
    });
    logger.info({ sessionId, userName }, "Live chat message sent");
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });
});

export default app;
