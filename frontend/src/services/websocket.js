const WS_BASE_URL = 'ws://localhost:8000/ws/simulation';

export function createSimulationSocket({ onState, onOpen, onClose, onError }) {
  const socket = new WebSocket(WS_BASE_URL);

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
  });

  socket.addEventListener('error', (event) => {
    if (onError) onError(event);
  });

  return socket;
}
