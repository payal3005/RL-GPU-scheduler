import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from typing import List

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from environment import GPUEnvironment


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        payload = json.dumps(message)
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.append(connection)
        for connection in dead_connections:
            self.disconnect(connection)


manager = ConnectionManager()
env = GPUEnvironment()
simulation_running = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="AETHERGRID Simulator API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/start")
def start_simulation():
    global simulation_running
    simulation_running = True
    return {"status": "started"}


@app.post("/pause")
def pause_simulation():
    global simulation_running
    simulation_running = False
    return {"status": "paused"}


@app.post("/reset")
def reset_simulation():
    global env, simulation_running
    env = GPUEnvironment()
    simulation_running = False
    return {"status": "reset"}


@app.get("/dashboard-state")
def get_dashboard_state():
    return env.get_dashboard_state()


@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            if simulation_running:
                env.step()
                state = env.get_dashboard_state()
                await manager.broadcast(state)
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
