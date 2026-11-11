// client/src/socket.js
import { io } from "socket.io-client";

const URL =
  import.meta.env.VITE_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5001";

export const socket = io(URL, {
  autoConnect: false,
});

// The payer page and the merchant's notification bell share
// this socket. Count users so one page closing does not
// disconnect the other (e.g. the merchant previews a link).
let users = 0;

export function connectSocket() {
  users += 1;
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  users = Math.max(0, users - 1);
  if (users === 0) socket.disconnect();
}
