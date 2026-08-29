const WS_BASE_URL = 'ws://localhost:8000/ws/simulation';

export function createSimulationSocket({ onState, onOpen, onClose, onError, reconnectDelay = 1000 }) {
  let socket = null;
  let reconnectTimer = null;
  let manuallyClosed = false;

  const connect = () => {
    if (manuallyClosed) return;

    socket = new WebSocket(WS_BASE_URL);

    socket.addEventListener('open', () => {
      if (onOpen) onOpen();
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (onState) onState(payload);
      } catch (error) {
        if (onError) onError(error);
      }
    });

    socket.addEventListener('close', () => {
      if (onClose) onClose();
      if (!manuallyClosed) {
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
      }
    });

    socket.addEventListener('error', (event) => {
      if (onError) onError(event);
    });
  };

  connect();

  return {
    close() {
      manuallyClosed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    },
  };
}
