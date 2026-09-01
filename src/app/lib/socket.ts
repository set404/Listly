import { io, type Socket } from "socket.io-client";
import { API_BASE, getAccessToken } from "./api";

// A single shared connection for the whole app session. `auth` is a function
// so every (re)connect attempt picks up the current access token, including
// after a silent refresh — the socket doesn't need to know when that happens.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: false,
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

export function joinGroupRoom(groupId: string): void {
  getSocket().emit("join-group", { groupId });
}

export function leaveGroupRoom(groupId: string): void {
  getSocket().emit("leave-group", { groupId });
}
