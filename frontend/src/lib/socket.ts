"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getToken, SOCKET_URL } from "./api";
import type { DeviceStatus } from "./types";

export interface DeviceStatusEvent {
  type: string;
  deviceId: string;
  status: DeviceStatus;
  qr: string | null;
  phoneNumber: string | null;
  error: string | null;
}

export interface BroadcastProgressEvent {
  broadcastId: string;
  status?: string;
  sent?: number;
  failed?: number;
  pending?: number;
  lastPhone?: string;
  lastStatus?: "sent" | "failed";
  lastError?: string;
}

/** Single shared socket per page using a global ref to avoid duplicate connections. */
let sharedSocket: Socket | null = null;

function getSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    });
  }
  return sharedSocket;
}

/** Subscribe to live WhatsApp connection status for the current user. */
export function useDeviceStatus(onEvent?: (event: DeviceStatusEvent) => void) {
  const [events, setEvents] = useState<Record<string, DeviceStatusEvent>>({});
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (event: DeviceStatusEvent) => {
      setEvents((prev) => ({ ...prev, [event.deviceId]: event }));
      callbackRef.current?.(event);
    };

    socket.on("device.status", handler);
    return () => {
      socket.off("device.status", handler);
    };
  }, []);

  return events;
}

/** Subscribe to broadcast progress; call with the active broadcast id. */
export function useBroadcastProgress(
  broadcastId: string | null,
  onProgress?: (event: BroadcastProgressEvent) => void,
) {
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    if (!broadcastId) return;
    const socket = getSocket();
    if (!socket) return;

    const room = `broadcast:${broadcastId}`;
    socket.emit("subscribe", room);

    const handler = (event: BroadcastProgressEvent) => {
      if (event.broadcastId === broadcastId) callbackRef.current?.(event);
    };
    socket.on("broadcast.progress", handler);

    return () => {
      socket.off("broadcast.progress", handler);
      socket.emit("unsubscribe", room);
    };
  }, [broadcastId]);
}

export function disconnectSocket() {
  sharedSocket?.disconnect();
  sharedSocket = null;
}
