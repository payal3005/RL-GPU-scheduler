import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, AlertTriangle, Cpu, Pause, Play, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { initialEvents, initialGpus, initialTasks, metricSeries, schedulerComparison } from './mockData';
import { createSimulationSocket } from './services/websocket';

const trafficOptions = ['Light', 'Heavy', 'Burst', 'Peak', 'Off Peak'];
const schedulerOptions = ['FCFS', 'Round Robin', 'Least Loaded', 'RL', 'MARL'];
const taskTypes = ['LLM', 'Image', 'Video'];

function getStatusStyle(status) {
  switch (status) {
    case 'Healthy':
      return 'text-emerald-400';
    case 'High Load':
      return 'text-amber-400';
    case 'Overloaded':
      return 'text-rose-500';
    default:
      return 'text-slate-400';
  }
}

function getLoadColor(value) {
  if (value < 40) return '#34d399';
  if (value < 75) return '#fbbf24';
  if (value < 90) return '#fb923c';
  return '#f43f5e';
}

export default function App() {
  const [trafficPattern, setTrafficPattern] = useState('Heavy');
  const [scheduler, setScheduler] = useState('MARL');
  const [tasks, setTasks] = useState(initialTasks);
  const [gpus, setGpus] = useState(initialGpus);
  const [events, setEvents] = useState(initialEvents);
  const [running, setRunning] = useState(true);
  const [step, setStep] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('Connecting');
  const [simState, setSimState] = useState(null);

  useEffect(() => {
    let socket;
    let isMounted = true;

    const syncState = async () => {
      try {
        const response = await fetch('http://localhost:8000/dashboard-state');
        if (response.ok && isMounted) {
          const payload = await response.json();
          setSimState(payload);
          setStep(payload.time_step || 0);
        }
      } catch (error) {
        console.error('Unable to fetch initial simulator state', error);
      }
    };

    syncState();

    socket = createSimulationSocket({
      onOpen: () => {
        if (!isMounted) return;
        setConnectionStatus('Connected');
        setRunning(true);
        fetch('http://localhost:8000/start', { method: 'POST' }).catch(() => {});
      },
      onState: (payload) => {
        if (!isMounted) return;
        setSimState(payload);
        setStep(payload.time_step || 0);
        setConnectionStatus('Streaming');
      },
      onClose: () => {
        if (!isMounted) return;
        setConnectionStatus('Disconnected');
      },
      onError: () => {
        if (!isMounted) return;
        setConnectionStatus('Connection Error');
      },
    });

    return () => {
      isMounted = false;
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!simState) return;

    const metrics = simState.metrics || {};
    const queued = metrics.total_queued_tasks || 0;
    const runningTasks = metrics.total_running_tasks || 0;
    const taskCount = Math.min(6, Math.max(2, queued + Math.floor(runningTasks / 2)));

    setTasks(
      Array.from({ length: taskCount }, (_, index) => ({
        id: `T-${simState.time_step}-${index + 1}`,
        type: taskTypes[index % taskTypes.length],
        memory: 2 + (index % 4),
        duration: 2 + (index % 4),
        priority: ['High', 'Medium', 'Critical'][index % 3],
      }))
    );

    setGpus(
      (simState.gpus || initialGpus).map((gpu) => ({
        id: gpu.id,
        memory: Math.round(gpu.memory),
        temperature: Math.round(gpu.temperature),
        utilization: Math.round(gpu.utilization),
        queue: gpu.queue_length,
        running: gpu.running_tasks,
        reward: Number((gpu.utilization / 10 + 4 + (gpu.temperature < 70 ? 0.5 : -0.5)).toFixed(1)),
        status: gpu.memory > 85 || gpu.utilization > 90 ? 'Overloaded' : gpu.memory > 70 || gpu.utilization > 70 ? 'High Load' : gpu.memory < 25 ? 'Idle' : 'Healthy',
        currentTask: gpu.running_tasks > 0 ? `Task ${gpu.id}` : 'Idle',
      }))
    );

    setEvents((current) => [
      {
        id: `${simState.time_step}-${Date.now()}`,
        time: `00:${String(Math.floor(simState.time_step / 60)).padStart(2, '0')}:${String(simState.time_step % 60).padStart(2, '0')}`,
        message: `Step ${simState.time_step} • ${metrics.completed || 0} completed • ${metrics.total_queued_tasks || 0} queued`,
        type: 'info',
      },
      ...current.slice(0, 7),
    ]);
  }, [simState]);

  const metrics = useMemo(() => {
    const metricsData = simState?.metrics || {};
    return {
      completed: metricsData.completed || 0,
      pending: metricsData.total_queued_tasks || 0,
      latency: Math.round(metricsData.latency || 0),
      throughput: Math.max(0, Math.round((metricsData.completed || 0) / Math.max(1, step || 1))),
      success: Math.round((metricsData.completed || 0) / Math.max(1, (metricsData.completed || 0) + (metricsData.total_queued_tasks || 0)) * 100),
      crashes: metricsData.crashes || 0,
      reward: Number((metricsData.marl_global_reward || 0).toFixed(1)),
      utilization: Math.round(metricsData.avg_memory_usage || 0),
    };
  }, [simState, step]);

  const handleStart = async () => {
    setRunning(true);
    try {
      await fetch('http://localhost:8000/start', { method: 'POST' });
    } catch (error) {
      console.error('Unable to start simulator', error);
    }
  };

  const handlePause = async () => {
    setRunning(false);
    try {
      await fetch('http://localhost:8000/pause', { method: 'POST' });
    } catch (error) {
      console.error('Unable to pause simulator', error);
    }
  };

  const handleReset = async () => {
    setRunning(false);
    setStep(0);
    setTasks(initialTasks);
    setGpus(initialGpus);
    setEvents(initialEvents);
    setSimState(null);
    try {
      await fetch('http://localhost:8000/reset', { method: 'POST' });
      const response = await fetch('http://localhost:8000/dashboard-state');
      if (response.ok) {
        const payload = await response.json();
        setSimState(payload);
        setStep(payload.time_step || 0);
      }
    } catch (error) {
      console.error('Unable to reset simulator', error);
    }
  };

  return (
    <div className="min-h-screen bg-transparent p-4 text-slate-100 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-cyan-300">
              <Sparkles size={16} />
              AI Cloud Control Room
            </div>
            <h1 className="text-3xl font-semibold text-white">AETHERGRID - AI GPU Orchestration Dashboard</h1>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="metric-card flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${connectionStatus === 'Connected' || connectionStatus === 'Streaming' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              System Status: {connectionStatus}
            </div>
            <div className="metric-card">Scheduler: {scheduler}</div>
            <div className="metric-card">Traffic: {trafficPattern}</div>
          </div>
        </motion.header>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <motion.aside initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Configuration Panel</h2>
              <Cpu className="text-cyan-400" />
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Traffic Pattern</span>
                <select value={trafficPattern} onChange={(e) => setTrafficPattern(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none">
                  {trafficOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Scheduler</span>
                <select value={scheduler} onChange={(e) => setScheduler(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none">
                  {schedulerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Number of Tasks</span>
                <input defaultValue={24} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Simulation Speed</span>
                <select defaultValue="Medium" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none">
                  <option>Slow</option>
                  <option>Medium</option>
                  <option>Fast</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleStart} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/20 px-3 py-3 text-sm font-semibold text-emerald-300">
                  <Play size={16} /> Start
                </button>
                <button onClick={handlePause} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/20 px-3 py-3 text-sm font-semibold text-amber-300">
                  <Pause size={16} /> Pause
                </button>
                <button onClick={handleReset} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold">
                  <RotateCcw size={16} /> Reset
                </button>
              </div>
            </div>
          </motion.aside>

          <div className="flex flex-col gap-6">
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">GPU Cluster Pulse</h2>
                <div className="flex items-center gap-2 text-sm text-cyan-300"><Activity size={16} /> Live telemetry</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {gpus.map((gpu) => (
                  <motion.div key={gpu.id} whileHover={{ y: -4, scale: 1.01 }} className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(45,255,182,0.08)]">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-400">GPU {gpu.id}</p>
                        <p className={`text-sm font-semibold ${getStatusStyle(gpu.status)}`}>{gpu.status}</p>
                      </div>
                      {gpu.status === 'Overloaded' && <AlertTriangle className="text-rose-500" size={16} />}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Memory</span><span>{gpu.memory}%</span></div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <motion.div initial={false} animate={{ width: `${gpu.memory}%` }} className="h-2 rounded-full" style={{ background: getLoadColor(gpu.memory) }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Utilization</span><span>{gpu.utilization}%</span></div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <motion.div initial={false} animate={{ width: `${gpu.utilization}%` }} className="h-2 rounded-full bg-cyan-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                        <div className="rounded-2xl bg-white/5 px-3 py-2">Temp: {gpu.temperature}°C</div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2">Queue: {gpu.queue}</div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2">Running: {gpu.running}</div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2">Reward: {gpu.reward}</div>
                      </div>
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200">Current task: {gpu.currentTask}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Live Task Stream</h2>
                  <Zap className="text-fuchsia-400" />
                </div>
                <div className="flex flex-wrap gap-3">
                  {tasks.map((task) => (
                    <motion.div key={task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="min-w-[140px] rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                        <span>{task.type}</span>
                        <span>{task.priority}</span>
                      </div>
                      <div className="text-sm font-semibold">{task.id}</div>
                      <div className="mt-2 text-xs text-slate-400">Mem {task.memory}GB • {task.duration}s</div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>

              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Scheduler Decision Flow</h2>
                  <Sparkles className="text-amber-400" />
                </div>
                <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                    <div className="rounded-full bg-cyan-500/20 px-3 py-2">Incoming Task</div>
                    <span>↓</span>
                    <div className="rounded-full bg-fuchsia-500/20 px-3 py-2">Coordinator</div>
                    <span>↓</span>
                    <div className="flex gap-2">
                      {gpus.map((gpu) => <div key={gpu.id} className="rounded-full bg-slate-800 px-3 py-2">GPU {gpu.id}</div>)}
                    </div>
                    <span>↓</span>
                    <div className="rounded-full bg-emerald-500/20 px-3 py-2">Winning GPU</div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-200">
                    {scheduler === 'MARL' ? 'MARL bidding in progress with weighted Q-value and cluster signals.' : scheduler === 'Round Robin' ? 'Sequential GPU rotation active.' : scheduler === 'Least Loaded' ? 'Least-loaded GPU selected to balance cluster pressure.' : 'Policy-driven routing is active.'}
                  </div>
                </div>
              </motion.section>
            </div>

            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Real-Time Metrics</h2>
                <div className="text-sm text-cyan-300">Updated live</div>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ['Completed Tasks', metrics.completed],
                  ['Pending Tasks', metrics.pending],
                  ['Average Latency', `${metrics.latency} ms`],
                  ['Throughput', `${metrics.throughput} tps`],
                  ['Success Rate', `${metrics.success}%`],
                  ['Crash Count', metrics.crashes],
                  ['Average Reward', metrics.reward.toFixed(1)],
                  ['Cluster Utilization', `${metrics.utilization}%`],
                ].map(([label, value]) => (
                  <div key={label} className="metric-card">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-2xl font-semibold text-white">{value}</motion.p>
                  </div>
                ))}
              </div>
            </motion.section>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <h2 className="mb-4 text-xl font-semibold">Performance Curves</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metricSeries}>
                      <defs>
                        <linearGradient id="completed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2dffb6" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#2dffb6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip />
                      <Area type="monotone" dataKey="completed" stroke="#2dffb6" fill="url(#completed)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <h2 className="mb-4 text-xl font-semibold">Scheduler Comparison</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={schedulerComparison}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip />
                      <Bar dataKey="completed" radius={[8, 8, 0, 0]} fill="#7b61ff" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <h2 className="mb-4 text-xl font-semibold">Cluster Heatmap</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {gpus.map((gpu) => (
                    <div key={gpu.id} className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                      <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
                        <span>GPU {gpu.id}</span>
                        <span>{gpu.memory}%</span>
                      </div>
                      <motion.div initial={false} animate={{ backgroundColor: getLoadColor(gpu.memory) }} className="h-20 rounded-2xl" />
                    </div>
                  ))}
                </div>
              </motion.section>
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <h2 className="mb-4 text-xl font-semibold">System Log</h2>
                <div className="max-h-72 space-y-2 overflow-auto pr-2">
                  <AnimatePresence initial={false}>
                    {events.map((event) => (
                      <motion.div key={event.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                          <span>{event.time}</span>
                          <span>{event.type}</span>
                        </div>
                        {event.message}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
