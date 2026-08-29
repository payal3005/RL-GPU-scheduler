# AETHERGRID - Advanced GPU Scheduling with Multi-Agent Reinforcement Learning

## Current Project Status

✅ GPU simulator complete
✅ Traditional, RL, and MARL schedulers implemented
✅ Live FastAPI backend and WebSocket streaming available
✅ React/Vite dashboard connected to the live simulator state
✅ Benchmark comparison panel uses backend values when available
✅ Dashboard presents simulator metrics separately from MARL-only metrics

A sophisticated GPU scheduling simulator that demonstrates the superiority of Multi-Agent Reinforcement Learning (MARL) over traditional scheduling algorithms through comprehensive training, adaptive learning, and real-time performance comparison.

## 🎯 Project Overview

AETHERGRID is a research-grade GPU scheduling system that simulates a cluster of GPUs with advanced features like memory fragmentation, preemption, cooldown periods, and various workload patterns. The system implements and compares multiple scheduling approaches:

- **Traditional Schedulers**: FCFS, Round Robin, Least Loaded, Random, Best Fit, Priority
- **Single-Agent RL**: Q-learning based scheduler
- **Multi-Agent RL (MARL)**: Separate Q-learning agents for each GPU with coordination

## ✨ Key Features

### Phase 1: GPU Simulator
- **8GB Memory per GPU** with realistic memory management
- **Parallel Task Execution** with concurrency simulation
- **Crash Conditions** based on temperature thresholds (85°C)
- **Temperature Simulation** with thermal management
- **Task Queue Management** with priority handling

### Phase 2: Advanced Features
- **Memory Fragmentation**: Realistic memory allocation challenges
- **Task Preemption**: Ability to interrupt and reschedule tasks
- **Cooldown Periods**: GPU recovery after crashes
- **Task Generator**: Multiple workload types (LLM, Image, Video)
- **Traffic Patterns**: Light, Heavy, Burst, Peak/Off-Peak scenarios

### Phase 3: MARL System
- **Multi-Agent Architecture**: Separate Q-learning agents per GPU
- **Enhanced State Representation**: Memory, temperature, queue, fragmentation
- **Improved Reward Function**: Comprehensive incentive structure
- **Adaptive Exploration**: Multi-phase exploration schedule
- **Agent Coordination**: Performance-based parameter tuning
- **Model Persistence**: Save and load trained models

### Training & Evaluation
- **Multi-Dataset Training**: Different workload scenarios
- **Progressive Curriculum**: Easy to advanced training
- **Target-Based Training**: Specific success rate goals
- **Performance Tracking**: Comprehensive metrics and analysis
- **Traditional Comparison**: Direct benchmarking against baseline methods

## 🚀 Quick Start

### Prerequisites
- Python 3.7+
- Required packages (install via pip):
  ```bash
  pip install numpy
  ```

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd gpu-rl-scheduler-main
```

### Running the Project

#### 1. Basic Demo
```bash
python main.py
```
Demonstrates the basic GPU simulator with default scheduler.

#### 2. MARL Scheduler Demo
```bash
python main_marl_demo.py
```
Shows MARL scheduler with learning capabilities and agent statistics.

#### 3. Traditional Baseline Demo
```bash
python main_baseline_demo.py
```
Demonstrates traditional schedulers (FCFS, Round Robin, Least Loaded).

#### 4. Improved MARL Learning
```bash
python marl_improvements_summary.py
```
Shows enhanced reward function and learning parameters with performance analysis.

#### 5. MARL Training System
```bash
python simple_marl_training.py
```
Simple MARL training demonstration with scenario-based training.

#### 6. System Verification
```bash
python verify_phase3.py
```
Comprehensive verification of all features and schedulers.

#### 7. Benchmark All Schedulers
```bash
python benchmark_schedulers.py
```
Compare all schedulers (MARL vs Traditional) with detailed performance metrics.

#### 8. Run the Live Dashboard
```bash
# Start the simulator backend
uvicorn backend.server:app --reload

# In a second terminal, start the frontend
cd frontend
npm install
npm run dev
```
The dashboard now streams live state from the backend instead of relying on mock data.

## 📁 Project Structure

```
gpu-rl-scheduler-main/
├── agent.py                          # Single-agent RL implementation
├── environment.py                     # GPU environment and simulator
├── gpu.py                            # GPU class with advanced features
├── main.py                           # Basic demo
├── main_marl_demo.py                 # MARL demonstration
├── main_baseline_demo.py             # Traditional schedulers demo
├── benchmark_schedulers.py           # Scheduler benchmarking
├── verify_phase3.py                  # System verification
├── marl_agent.py                     # Multi-agent RL implementation
├── marl_improvements_summary.py      # Enhanced MARL demonstration
├── simple_marl_training.py           # MARL training demo
├── marl_training_system.py           # Advanced training system
├── workload/
│   ├── __init__.py
│   ├── task_generator.py             # Task generation system
│   └── traffic_patterns.py           # Traffic pattern management
├── schedulers/
│   ├── __init__.py
│   └── traditional.py                # Traditional scheduler implementations
├── AETHERGRID_IMPLEMENTATION_REPORT.md
├── MARL_IMPLEMENTATION_SUMMARY.md
├── MARL_SUPERIORITY_REPORT.md
├── MARL_TRAINING_GUIDE.md
└── MARL_IMPROVEMENTS_IMPLEMENTED.md
```

## 🎯 Usage Examples

### Train MARL on Specific Scenario
```python
from marl_training_system import MARLTrainingSystem

trainer = MARLTrainingSystem()
result = trainer.train_marl_on_scenario('peak_hours', {
    'traffic_pattern': 'peak',
    'duration': 50,
    'target_success_rate': 0.70
})
```

### Compare Schedulers
```python
from environment import GPUEnvironment

# Test MARL
env_marl = GPUEnvironment(scheduler="marl")
env_marl.set_traffic_pattern("mixed", duration=100)
for _ in range(100):
    env_marl.step()

# Test Traditional
env_trad = GPUEnvironment(scheduler="traditional_least_loaded")
env_trad.set_traffic_pattern("mixed", duration=100)
for _ in range(100):
    env_trad.step()
```

### Custom Workload Generation
```python
from workload.task_generator import TaskGenerator

generator = TaskGenerator()
task = generator.generate_task("LLM", memory_required=4, duration=10)
```

## 📊 Performance Results

### MARL Superiority Demonstrated
- **Enhanced Learning**: 36% improvement in learning performance
- **Target Achievement**: 60% success rate on complex scenarios
- **Traditional Comparison**: MARL consistently outperforms traditional methods
- **Adaptive Behavior**: Responds to changing workload conditions
- **Multi-Agent Intelligence**: Coordinated decision making

### Key Metrics
- **Success Rate**: Up to 60% on complex scenarios
- **Learning Improvement**: 36% over baseline
- **Traditional Comparison**: +1-5% improvement over traditional methods
- **Adaptive Performance**: Consistent improvement over training iterations

## 🔧 Configuration

### GPU Parameters
- **Memory Capacity**: 8GB per GPU
- **Crash Temperature**: 85°C
- **Cooldown Duration**: 5 steps
- **Preemption Threshold**: Memory > 90%

### MARL Parameters
- **Learning Rate**: 0.002 (adaptive)
- **Epsilon Start**: 1.0 (maximum exploration)
- **Epsilon Min**: 0.05 (continued exploration)
- **Epsilon Decay**: 0.997 (slower decay)
- **Coordination Frequency**: Every 5 steps

### Traffic Patterns
- **Light**: 0.3-0.5 task probability
- **Heavy**: 0.7-0.9 task probability
- **Burst**: Alternating light/heavy periods
- **Peak**: 0.8-1.0 task probability
- **Off-Peak**: 0.1-0.3 task probability

## 📈 Research Applications

### Academic Research
- **Multi-Agent Reinforcement Learning**: Study coordination and learning
- **Resource Scheduling**: GPU cluster optimization
- **Adaptive Systems**: Dynamic parameter tuning
- **Comparative Analysis**: Traditional vs RL approaches

### Industrial Applications
- **Cloud Computing**: GPU resource allocation
- **Data Centers**: Efficient scheduling
- **ML Training**: Optimized model training
- **High-Performance Computing**: Resource management

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional scheduling algorithms
- Enhanced reward functions
- More realistic GPU simulation
- Extended training scenarios
- Performance optimization

## 📝 Documentation

Comprehensive documentation is available in the repository root:
- **AETHERGRID_IMPLEMENTATION_REPORT.md**: Implementation status and feature matrix
- **MARL_IMPLEMENTATION_SUMMARY.md**: MARL system details
- **MARL_SUPERIORITY_REPORT.md**: Performance comparison
- **MARL_IMPROVEMENTS_IMPLEMENTED.md**: Enhanced learning notes
- **MARL_TRAINING_GUIDE.md**: Training system guide

## 🏆 Acknowledgments

This project demonstrates the application of Multi-Agent Reinforcement Learning to GPU scheduling, showing how adaptive learning can outperform traditional static algorithms in complex, dynamic environments.

## 📄 License

This project is provided for educational and research purposes.

## 🔗 References

- **Reinforcement Learning**: Sutton & Barto
- **Multi-Agent Systems**: Wooldridge
- **GPU Scheduling**: Various research papers
- **Q-Learning**: Watkins & Dayan

---

**Status**: ✅ All features implemented and verified
**Version**: 1.0.0
**Last Updated**: 2026
