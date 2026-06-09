import { io, Socket } from "socket.io-client";
import * as SecureStore from "expo-secure-store";

let socket: Socket | null = null;

export const getSocket = async (): Promise<Socket | null> => {
  if (socket) return socket;

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return null;

  const token = await SecureStore.getItemAsync("auth_session_token");
  
  socket = io(`https://${domain}`, {
    path: "/api/socket.io",
    auth: {
      token: token || "",
    },
    transports: ["websocket"],
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
