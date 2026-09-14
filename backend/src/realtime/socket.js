import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { childLogger } from "../config/logger.js";
import { waManager } from "../whatsapp/manager.js";

const log = childLogger({ mod: "realtime" });

class Realtime {
  constructor() {
    /** @type {Server | null} */
    this.io = null;
  }

  attach(httpServer) {
    this.io = new Server(httpServer, {
      cors: { origin: env.frontendUrl, credentials: true },
      path: "/socket.io",
      serveClient: false,
      maxHttpBufferSize: 1e6,
    });

    this.io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");
      if (!token) return next(new Error("unauthorized"));
      try {
        const payload = jwt.verify(token, env.jwtSecret);
        socket.data.userId = payload.sub;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    this.io.on("connection", (socket) => {
      const userId = socket.data.userId;
      socket.join(`user:${userId}`);
      log.debug({ userId, socketId: socket.id }, "client connected");

      socket.on("subscribe", (room) => {
        if (typeof room === "string" && room.length < 128) socket.join(room);
      });

      socket.on("unsubscribe", (room) => {
        if (typeof room === "string") socket.leave(room);
      });

      socket.on("disconnect", () => {
        log.debug({ socketId: socket.id }, "client disconnected");
      });
    });

    // Fan out WhatsApp manager events to the owning user room
    waManager.onEvent(async (event) => {
      try {
        const device = await waManager
          .get(event.deviceId)
          ?.device;
        const ownerId = device?.userId;
        if (ownerId) this.io.to(`user:${ownerId}`).emit("device.status", event);
        this.io.to(`device:${event.deviceId}`).emit("device.status", event);
      } catch (err) {
        log.warn({ err: err.message }, "event fanout failed");
      }
    });

    return this.io;
  }

  emitToRoom(room, event, payload) {
    this.io?.to(room).emit(event, payload);
  }

  emitToUser(userId, event, payload) {
    this.io?.to(`user:${userId}`).emit(event, payload);
  }

  async close() {
    if (this.io) await this.io.close();
    this.io = null;
  }
}

export const realtime = new Realtime();
