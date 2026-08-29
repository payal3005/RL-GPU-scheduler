import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, AlertTriangle, Cpu, Info, Pause, Play, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

function normalizeSchedulerName(value) {
  const mapping = {
    fcfs: 'FCFS',
    round_robin: 'Round Robin',
    least_loaded: 'Least Loaded',
    rl: 'RL',
    marl: 'MARL',
  };
  return mapping[value] || value || 'MARL';
}

function formatMetricValue(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

export default function App() {
  const [trafficPattern, setTrafficPattern] = useState('Heavy');
  const [scheduler, setScheduler] = useState('MARL');
  const [tasks, setTasks] = useState([]);
  const [gpus, setGpus] = useState([]);
  const [events, setEvents] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [chartData, setChartData] = useState({ reward: [], memory: [], temperature: [], queue: [], scheduler_comparison: [] });
  const [running, setRunning] = useState(true);
  const [step, setStep] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('Connecting');
  const [simState, setSimState] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [schedulerSetting, setSchedulerSetting] = useState(false);
  const schedulerSettingRef = useRef(schedulerSetting);

  useEffect(() => { schedulerSettingRef.current = schedulerSetting; }, [schedulerSetting]);

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
        if (schedulerSettingRef.current) {
          const iv = setInterval(() => {
            if (!schedulerSettingRef.current) {
              clearInterval(iv);
              fetch('http://localhost:8000/start', { method: 'POST' }).catch(() => {});
            }
          }, 100);
        } else {
          fetch('http://localhost:8000/start', { method: 'POST' }).catch(() => {});
        }
      },
      onState: (payload) => {
        if (!isMounted) return;
        setSimState(payload);
        setStep(payload.time_step || 0);
        setScheduler(normalizeSchedulerName(payload.scheduler));
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

    // fetch cached benchmark results if available
    fetchBenchmarks().catch(() => {});
    return () => {
      isMounted = false;
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!simState) return;

    const metrics = simState.metrics || {};
    const queueTasks = Array.isArray(simState.task_queue) ? simState.task_queue : [];
    const runningTaskList = Array.isArray(simState.running_tasks) ? simState.running_tasks : [];
    const completedTaskList = Array.isArray(simState.recent_completed_tasks) ? simState.recent_completed_tasks : [];
    const eventList = Array.isArray(simState.events) ? simState.events : [];
    const historyList = Array.isArray(simState.history) ? simState.history : [];
    const chartState = simState.chart_data || {};

    const liveTasks = queueTasks.length > 0 ? queueTasks : runningTaskList;

    setTasks(liveTasks.map((task, index) => ({
      id: task.id || `T-${simState.time_step}-${index + 1}`,
      type: task.task_type || taskTypes[index % taskTypes.length],
      memory: task.memory_required || 2,
      duration: task.execution_time || 2,
      priority: task.priority || 'Medium',
      gpuId: task.gpu_id,
    })));

    setGpus(
      (simState.gpus || []).map((gpu) => ({
        id: gpu.id,
        memory: Math.round(gpu.memory),
        temperature: Math.round(gpu.temperature),
        utilization: Math.round(gpu.utilization),
        queue: gpu.queue_length,
        running: gpu.running_tasks,
        reward: Number((gpu.utilization / 10 + 4 + (gpu.temperature < 70 ? 0.5 : -0.5)).toFixed(1)),
        fragmentation: gpu.fragmentation,
        status: gpu.crashed ? 'Overloaded' : gpu.memory > 85 || gpu.utilization > 90 ? 'Overloaded' : gpu.memory > 70 || gpu.utilization > 70 ? 'High Load' : gpu.memory < 25 ? 'Idle' : 'Healthy',
        currentTask: gpu.running_tasks > 0 ? `GPU ${gpu.id}` : 'Idle',
      }))
    );

    setCompletedTasks(completedTaskList);
    setHistory(historyList);
    setChartData({
      reward: chartState.reward || [],
      memory: chartState.memory || [],
      temperature: chartState.temperature || [],
      queue: chartState.queue || [],
      scheduler_comparison: chartState.scheduler_comparison || [],
    });
    setEvents(eventList.map((event) => ({
      id: event.id,
      time: event.time,
      message: event.message,
      type: event.type || 'info',
    })));
  }, [simState]);

  const metrics = useMemo(() => {
    const metricsData = simState?.metrics || {};
    const taskSuccessRate = Math.round((metricsData.completed || 0) / Math.max(1, (metricsData.completed || 0) + (metricsData.total_queued_tasks || 0)) * 100);
    return {
      completed: metricsData.completed || 0,
      pending: metricsData.total_queued_tasks || 0,
      latency: Math.round(metricsData.latency || 0),
      throughput: Math.max(0, Math.round((metricsData.completed || 0) / Math.max(1, step || 1))),
      success: taskSuccessRate,
      crashes: metricsData.crashes || 0,
      reward: scheduler === 'MARL' ? Number((metricsData.marl_global_reward || 0).toFixed(1)) : null,
      utilization: Math.round(metricsData.avg_memory_usage || 0),
      marlStats: metricsData.marl_stats || {},
      traditionalStats: metricsData.traditional_stats || {},
    };
  }, [simState, step, scheduler]);

  const benchmarkRows = useMemo(() => {
    const rows = Array.isArray(benchmarks) ? benchmarks.map((b) => ({ name: (b.Scheduler || '').toString(), completed: Math.round(b.Mean_Completed || 0) })) : (Array.isArray(chartData.scheduler_comparison) ? chartData.scheduler_comparison : []);
    const nameMap = new Map(rows.map((row) => [String(row.name || '').toLowerCase(), row]));
    const schedulerDefinitions = [
      { label: 'Random', key: 'random' },
      { label: 'Round Robin', key: 'round robin' },
      { label: 'FCFS', key: 'fcfs' },
      { label: 'Least Loaded', key: 'least loaded' },
      { label: 'RL', key: 'rl' },
      { label: 'MARL', key: 'marl' },
    ];

    return schedulerDefinitions.map(({ label, key }) => {
      const lookupKeys = [key.toLowerCase(), key.replace(/ /g, '_').toLowerCase(), label.toLowerCase()];
      const match = lookupKeys.map((lookup) => nameMap.get(lookup)).find(Boolean);
      const completedValue = match && Number.isFinite(match.completed) ? match.completed : null;
      return {
        name: label,
        completed: completedValue,
      };
    });
  }, [chartData, benchmarks]);

  const performanceSeries = useMemo(() => {
    const rewardSeries = chartData.reward || [];
    const memorySeries = chartData.memory || [];
    const temperatureSeries = chartData.temperature || [];
    const queueSeries = chartData.queue || [];
    const maxLength = Math.max(rewardSeries.length, memorySeries.length, temperatureSeries.length, queueSeries.length);

    return Array.from({ length: maxLength }, (_, index) => ({
      time_step: rewardSeries[index]?.time_step ?? memorySeries[index]?.time_step ?? temperatureSeries[index]?.time_step ?? queueSeries[index]?.time_step ?? index + 1,
      reward: rewardSeries[index]?.value ?? 0,
      memory: memorySeries[index]?.value ?? 0,
      temperature: temperatureSeries[index]?.value ?? 0,
      queue: queueSeries[index]?.value ?? 0,
    }));
  }, [chartData]);

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
    setTasks([]);
    setGpus([]);
    setEvents([]);
    setCompletedTasks([]);
    setHistory([]);
    setChartData({ reward: [], memory: [], temperature: [], queue: [], scheduler_comparison: [] });
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

  const fetchBenchmarks = async () => {
    try {
      const res = await fetch('http://localhost:8000/benchmarks');
      if (!res.ok) throw new Error('fetch failed');
      const payload = await res.json();
      if (payload.available) setBenchmarks(payload.results);
      else setBenchmarks(null);
    } catch (e) {
      console.error('Unable to fetch benchmarks', e);
      setBenchmarks(null);
    }
  };

  const runBenchmarks = async () => {
    setBenchRunning(true);
    try {
      const res = await fetch('http://localhost:8000/run-benchmarks', { method: 'POST' });
      if (!res.ok) throw new Error('run failed');
      // Poll for results
      await new Promise((r) => setTimeout(r, 500));
      await fetchBenchmarks();
    } catch (e) {
      console.error('Unable to run benchmarks', e);
    } finally {
      setBenchRunning(false);
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
                <select value={scheduler} disabled={schedulerSetting} onChange={async (e) => {
                    const sel = e.target.value;
                    const prev = scheduler;
                    // Immediately update UI to reflect user's selection
                    setScheduler(sel);
                    const map = { 'FCFS': 'fcfs', 'Round Robin': 'round_robin', 'Least Loaded': 'least_loaded', 'RL': 'rl', 'MARL': 'marl' };
                    const key = map[sel] || 'marl';
                    setSchedulerSetting(true);
                    try {
                      const res = await fetch('http://localhost:8000/set-scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduler: key }) });
                      if (!res.ok) throw new Error('set-scheduler failed');
                      // authoritative state from backend
                      const ds = await fetch('http://localhost:8000/dashboard-state');
                      if (ds.ok) {
                        const payload = await ds.json();
                        setSimState(payload);
                        setStep(payload.time_step || 0);
                        setScheduler(normalizeSchedulerName(payload.scheduler));
                      }
                    } catch (err) {
                      console.error('set scheduler failed', err);
                      // revert UI to previous scheduler on failure
                      setScheduler(prev);
                    } finally {
                      setSchedulerSetting(false);
                    }
                  }} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none">
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
                <button onClick={handleStart} disabled={schedulerSetting} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/20 px-3 py-3 text-sm font-semibold text-emerald-300">
                  <Play size={16} /> Start
                </button>
                <button onClick={handlePause} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/20 px-3 py-3 text-sm font-semibold text-amber-300">
                  <Pause size={16} /> Pause
                </button>
                <button onClick={handleReset} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold">
                  <RotateCcw size={16} /> Reset
                </button>
                <button onClick={runBenchmarks} disabled={benchRunning} className="col-span-2 mt-2 flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold">
                  {benchRunning ? 'Running Benchmarks...' : 'Run Benchmarks'}
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
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            Memory
                            <Info size={12} className="text-slate-500" title="GPU Memory: live percentage of GPU memory in use from the backend." />
                          </span>
                          <span>{gpu.memory}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <motion.div initial={false} animate={{ width: `${gpu.memory}%` }} className="h-2 rounded-full" style={{ background: getLoadColor(gpu.memory) }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            Utilization
                            <Info size={12} className="text-slate-500" title="GPU Utilization: live percent of GPU compute capacity currently used." />
                          </span>
                          <span>{gpu.utilization}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <motion.div initial={false} animate={{ width: `${gpu.utilization}%` }} className="h-2 rounded-full bg-cyan-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                        <div className="rounded-2xl bg-white/5 px-3 py-2">
                          <div className="flex items-center gap-1 text-slate-400">
                            Temp
                            <Info size={12} className="text-slate-500" title="Temperature: live GPU temperature from the backend." />
                          </div>
                          <div className="mt-1 font-semibold text-white">{gpu.temperature}°C</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2">
                          <div className="flex items-center gap-1 text-slate-400">
                            Queue
                            <Info size={12} className="text-slate-500" title="Queue: number of tasks waiting on this GPU." />
                          </div>
                          <div className="mt-1 font-semibold text-white">{gpu.queue}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2">
                          <div className="flex items-center gap-1 text-slate-400">
                            Running
                            <Info size={12} className="text-slate-500" title="Running Tasks: active tasks currently assigned to this GPU." />
                          </div>
                          <div className="mt-1 font-semibold text-white">{gpu.running}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 px-3 py-2">
                          <div className="flex items-center gap-1 text-slate-400">
                            Fragmentation
                            <Info size={12} className="text-slate-500" title="Fragmentation: live fragmentation level reported by the backend." />
                          </div>
                          <div className="mt-1 font-semibold text-white">{gpu.fragmentation ?? 0}%</div>
                        </div>
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
                    {scheduler === 'FCFS' ? 'FCFS is selecting the next eligible task in arrival order.' : scheduler === 'Round Robin' ? 'Round Robin is rotating through GPUs to spread load evenly.' : scheduler === 'Least Loaded' ? 'Least Loaded is choosing the GPU with the lightest queue and lowest pressure.' : scheduler === 'RL' ? 'RL is using its learned policy to select a GPU.' : scheduler === 'MARL' ? 'MARL is using coordinated bidding and reward-based selection.' : 'The selected scheduler is not currently mapped to a live decision-flow label.'}
                  </div>
                </div>
              </motion.section>
            </div>

            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Simulator Metrics</h2>
                <div className="text-sm text-cyan-300">Source: live /dashboard-state and /ws/simulation</div>
              </div>
              <div className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-400">Live values from the active backend simulation state</div>
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ['Completed Tasks', metrics.completed, 'Live completed work from the simulator.'],
                  ['Pending Tasks', metrics.pending, 'Current queued tasks reported by the backend.'],
                  ['Average Latency', `${metrics.latency} ms`, 'Average latency reported by GPUEnvironment.'],
                  ['Throughput', `${metrics.throughput} tps`, 'Completed work per elapsed simulation step.'],
                  ['Task Success Rate', `${metrics.success}%`, 'Task completion rate for the live run.'],
                  ['Crash Count', metrics.crashes, 'Reported simulator crash count.'],
                  ['Cluster Utilization', `${metrics.utilization}%`, 'Average cluster utilization reported by the backend.'],
                  ['MARL Reward', scheduler === 'MARL' ? `${metrics.reward ?? 'N/A'}` : 'N/A', 'MARL reward is only shown when MARL is selected.'],
                ].map(([label, value, helpText]) => (
                  <div key={label} className="metric-card">
                    <div className="flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                      {label}
                      <Info size={12} className="text-slate-500" title={helpText} />
                    </div>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-2xl font-semibold text-white">{formatMetricValue(value)}</motion.p>
                  </div>
                ))}
              </div>
              {scheduler === 'MARL' ? (
                <div className="mt-4 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-cyan-200">MARL-specific Metrics</h3>
                    <span className="text-xs uppercase tracking-[0.2em] text-cyan-300">Source: live MARL stats</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    {[
                      ['Global Reward', metrics.reward ?? 'N/A'],
                      ['Agent Success Rate', `${metrics.marlStats?.global_success_rate ?? 'N/A'}`],
                      ['Average Epsilon', `${metrics.marlStats?.avg_epsilon ?? 'N/A'}`],
                      ['Q-Table Size', metrics.marlStats?.total_q_table_size ?? 'N/A'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
                        <div className="mt-1 font-semibold text-white">{formatMetricValue(value)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-white">MARL Bid Details</span>
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Backend availability</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {[
                        ['Incoming Task', 'N/A'],
                        ['Candidate GPUs', 'N/A'],
                        ['Winning GPU', 'N/A'],
                        ['Bid Score', 'N/A'],
                        ['Reason for Selection', 'N/A'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 px-3 py-2">
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
                          <div className="mt-1 font-semibold text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-white">MARL-specific Metrics</h3>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Not applicable</span>
                  </div>
                  <p className="text-slate-400">MARL reward and MARL training statistics are not displayed for non-MARL schedulers.</p>
                </div>
              )}
            </motion.section>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <h2 className="mb-4 text-xl font-semibold">Performance Curves</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceSeries}>
                      <defs>
                        <linearGradient id="completed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2dffb6" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#2dffb6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="time_step" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip />
                      <Area type="monotone" dataKey="reward" stroke="#2dffb6" fill="url(#completed)" />
                      <Area type="monotone" dataKey="memory" stroke="#38bdf8" fill="transparent" />
                      <Area type="monotone" dataKey="temperature" stroke="#f59e0b" fill="transparent" />
                      <Area type="monotone" dataKey="queue" stroke="#f472b6" fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Benchmark Comparison</h2>
                  <div className="text-sm text-cyan-300">Live backend comparison values</div>
                </div>
                <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Uses real values from /dashboard-state when available; unavailable schedulers are shown as N/A.</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={benchmarkRows.filter((row) => row.completed !== null)}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip />
                      <Bar dataKey="completed" radius={[8, 8, 0, 0]} fill="#7b61ff" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {benchmarkRows.map((row) => (
                    <div key={row.name} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>{row.name}</span>
                        <span className="font-semibold text-white">{row.completed === null ? 'N/A' : row.completed}</span>
                      </div>
                    </div>
                  ))}
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
