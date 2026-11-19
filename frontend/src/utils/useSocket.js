import { useEffect, useRef } from "react";

export function useChatSocket(onMessage) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const token = localStorage.getItem("dms_token") || sessionStorage.getItem("dms_token");
    if (!token) return;

    let socket = null;
    let reconnectTimeout = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname === "localhost" ? "localhost:5000" : window.location.host;
      const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

      try {
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: "auth", token }));
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (onMessageRef.current) {
              onMessageRef.current(payload);
            }
          } catch (e) {
            console.warn("[WebSocket] Could not parse message frame", e);
          }
        };

        socket.onclose = () => {
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        socket.onerror = () => {
          try { socket.close(); } catch {}
        };
      } catch (err) {
        console.warn("[WebSocket] Connection attempt error", err);
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 4000);
        }
      }
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        try { socket.close(); } catch {}
      }
    };
  }, []);

  return wsRef;
}
