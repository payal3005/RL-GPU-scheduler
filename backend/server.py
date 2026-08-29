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
from benchmark_schedulers import benchmark_all_schedulers
from pydantic import BaseModel


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
benchmark_results = None
benchmark_lock = asyncio.Lock()
last_selected_scheduler = env.scheduler if hasattr(env, 'scheduler') else 'random'


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="AETHERGRID Simulator API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def broadcast_dashboard_state():
    state = env.get_dashboard_state()
    await manager.broadcast(state)


@app.post("/start")
async def start_simulation():
    global simulation_running
    print(f"ENV SCHEDULER BEFORE START = {env.scheduler}")
    simulation_running = True
    await broadcast_dashboard_state()
    print(f"ENV SCHEDULER AFTER START = {env.scheduler}")
    return {"status": "started"}


@app.post("/pause")
async def pause_simulation():
    global simulation_running
    simulation_running = False
    await broadcast_dashboard_state()
    return {"status": "paused"}


@app.post("/reset")
async def reset_simulation():
    global env, simulation_running, last_selected_scheduler
    # Recreate environment but preserve last selected scheduler so UI selection survives reset
    print(f"ENV SCHEDULER BEFORE RESET = {env.scheduler}")
    env = GPUEnvironment(scheduler=last_selected_scheduler)
    print(f"ENV SCHEDULER AFTER RESET = {env.scheduler}")
    simulation_running = False
    await broadcast_dashboard_state()
    return {"status": "reset"}


class SchedulerRequest(BaseModel):
    scheduler: str


@app.post('/set-scheduler')
async def set_scheduler(req: SchedulerRequest):
    """Set the environment scheduler to one of: random, round_robin, fcfs, least_loaded, rl, marl.
    Accepts JSON body: {"scheduler": "fcfs"}
    """
    global env, last_selected_scheduler
    scheduler = req.scheduler
    allowed = {"random", "round_robin", "fcfs", "least_loaded", "rl", "marl", "traditional_fcfs", "traditional_round_robin", "traditional_least_loaded"}
    if scheduler not in allowed:
        return {"status": "error", "message": "invalid scheduler"}
    # Debug print to trace scheduler flow
    print(f"SET SCHEDULER REQUEST = {scheduler}")
    last_selected_scheduler = scheduler
    env.scheduler = scheduler
    print(f"ENV SCHEDULER AFTER SET = {env.scheduler}")
    return {"status": "ok", "scheduler": env.scheduler}


@app.get("/dashboard-state")
def get_dashboard_state():
    print(f"ENV SCHEDULER ON DASHBOARD-STATE = {env.scheduler}")
    return env.get_dashboard_state()


@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text(json.dumps(env.get_dashboard_state()))
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


@app.post("/run-benchmarks")
async def run_benchmarks(steps: int = 50, runs: int = 10, seed: int = 42):
    """Run the benchmark suite (blocking) and cache results for retrieval."""
    global benchmark_results
    async with benchmark_lock:
        # Run in thread to avoid blocking event loop
        results = await asyncio.to_thread(benchmark_all_schedulers, steps, runs, seed)
        benchmark_results = results
    return {"status": "completed", "schedulers": [r.get('Scheduler') for r in (benchmark_results or [])]}


@app.get("/benchmarks")
async def get_benchmarks():
    """Return the last-run benchmark results, or a hint message if none exist."""
    if benchmark_results is None:
        return {"available": False, "message": "No benchmark results available. POST /run-benchmarks to run benchmarks."}
    return {"available": True, "results": benchmark_results}


if __name__ == "__main__":
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
