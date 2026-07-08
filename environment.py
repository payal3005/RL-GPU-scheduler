import random
from agent import RLAgent
from gpu import GPU
from task import Task
import task
from workload.task_generator import TaskGenerator, EnhancedTask
from workload.traffic_patterns import TrafficManager, TrafficPattern
from marl_agent import MARLManager
from schedulers.traditional import BaselineComparison, FCFSScheduler, RoundRobinScheduler, LeastLoadedScheduler

class GPUEnvironment:
    def __init__(self, scheduler="random"):

        # 🔥 MULTI GPU SETUP with 8GB memory capacity as specified
        self.gpus = [
            GPU(1, 8),   # 8GB
            GPU(2, 8),   # 8GB  
            GPU(3, 8),   # 8GB
            GPU(4, 8)    # 8GB
        ]

        self.time_step = 0
        self.total_tasks = 0

        self.scheduler = scheduler
        self.rr_index = 0

        self.agent = RLAgent()
        
        # Phase 2 Step 3: Task Generator
        self.task_generator = TaskGenerator()
        self.workload_mode = "mixed"  # mixed, llm_heavy, image_heavy, video_heavy
        
        # Phase 2 Step 4: Traffic Patterns
        self.traffic_manager = TrafficManager()
        self.traffic_mode = "auto"  # auto, manual, peak_off_peak
        
        # MARL System
        self.marl_manager = MARLManager(num_gpus=len(self.gpus))
        
        # Phase 3 Step 5: Traditional Schedulers
        self.baseline_comparison = BaselineComparison()
        self.traditional_schedulers = {
            'fcfs': FCFSScheduler(),
            'round_robin': RoundRobinScheduler(),
            'least_loaded': LeastLoadedScheduler()
        }

    def generate_task(self, task_type=None):
        """Generate task using the new task generator"""
        return self.task_generator.generate_task(task_type)
    
    def generate_llm_task(self):
        """Legacy method - generates LLM task"""
        return self.task_generator.generate_task("LLM")
    
    def generate_workload_burst(self, intensity="medium"):
        """Generate burst workload"""
        return self.task_generator.generate_burst_workload(intensity)
    
    def set_workload_mode(self, mode):
        """Set workload generation mode"""
        if mode in ["mixed", "llm_heavy", "image_heavy", "video_heavy"]:
            self.workload_mode = mode
            # Adjust task generator weights
            if mode == "llm_heavy":
                self.task_generator.task_weights = {
                    "LLM": 0.7, "Image": 0.2, "Video": 0.1
                }
            elif mode == "image_heavy":
                self.task_generator.task_weights = {
                    "LLM": 0.2, "Image": 0.7, "Video": 0.1
                }
            elif mode == "video_heavy":
                self.task_generator.task_weights = {
                    "LLM": 0.2, "Image": 0.1, "Video": 0.7
                }
            else:  # mixed
                self.task_generator.task_weights = {
                    "LLM": 0.4, "Image": 0.35, "Video": 0.25
                }
    
    def get_workload_statistics(self):
        """Get workload generation statistics"""
        return self.task_generator.get_workload_statistics()
    
    def set_traffic_pattern(self, pattern, duration=10):
        """Set traffic pattern manually"""
        self.traffic_manager.set_pattern(pattern, duration)
        self.traffic_mode = "manual"
    
    def set_traffic_mode(self, mode):
        """Set traffic management mode"""
        if mode in ["auto", "manual", "peak_off_peak"]:
            self.traffic_mode = mode
            
    def get_traffic_statistics(self):
        """Get traffic pattern statistics"""
        return self.traffic_manager.get_traffic_statistics()
    
    def simulate_peak_off_peak(self, steps=24):
        """Simulate peak/off-peak traffic patterns"""
        self.traffic_mode = "peak_off_peak"
        return self.traffic_manager.simulate_day_cycle(steps)
    
    def get_current_traffic_load(self):
        """Get current traffic load information"""
        return {
            "pattern": self.traffic_manager.current_pattern.value,
            "hour": self.traffic_manager.current_hour,
            "requests_this_step": self.traffic_manager.get_current_requests(),
            "mode": self.traffic_mode
        }

    # -----------------------
    # SCHEDULERS
    # -----------------------

    def random_scheduler(self, task):
        random.choice(self.gpus).assign_task(task)

    def round_robin_scheduler(self, task):
        self.gpus[self.rr_index].assign_task(task)
        self.rr_index = (self.rr_index + 1) % len(self.gpus)

    def fcfs_scheduler(self, task):
        for gpu in self.gpus:
            if not gpu.crashed:
                gpu.assign_task(task)
                return

    def least_loaded_scheduler(self, task):
        # Consider both queue and running tasks for load balancing
        gpu = min(self.gpus, key=lambda g: g.get_total_load())
        gpu.assign_task(task)

    def rl_scheduler(self, task):
        state = self.agent.get_state(self.gpus)
        action = self.agent.choose_action(state, len(self.gpus))
        selected_gpu = self.gpus[action]
        
        # Check if assignment is possible
        if selected_gpu.crashed:
            # Try next available GPU
            for gpu in self.gpus:
                if not gpu.crashed:
                    gpu.assign_task(task)
                    selected_gpu = gpu
                    break
            else:
                return  # No available GPUs
        
        selected_gpu.assign_task(task)

        # 🔥 ENHANCED REWARD SYSTEM
        reward = 0

        # prefer less loaded GPU (considering both queue and running tasks)
        reward -= selected_gpu.get_total_load()

        # reward healthy GPU
        if not selected_gpu.crashed:
            reward += 5

        # penalize crash strongly
        if selected_gpu.crashed:
            reward -= 40
            
        # reward efficient memory usage
        memory_usage = selected_gpu.get_memory_usage_percentage()
        if memory_usage < 80:
            reward += 2
        elif memory_usage > 95:
            reward -= 10

        # encourage balance across all GPUs
        loads = [g.get_total_load() for g in self.gpus]
        reward -= (max(loads) - min(loads)) * 0.5
        
        # penalize high temperature
        if selected_gpu.temperature > 70:
            reward -= (selected_gpu.temperature - 70) * 0.2

        next_state = self.agent.get_state(self.gpus)
        self.agent.update(state, action, reward, next_state, len(self.gpus))
    
    def marl_scheduler(self, task):
        """MARL scheduler with separate agents for each GPU"""
        cluster_state = self.marl_manager.get_cluster_state(self.gpus)
        
        # Select best GPU using MARL coordination
        selected_gpu_id = self.marl_manager.select_gpu_for_task(task, self.gpus, cluster_state)
        
       # Assign task and calculate reward
        success = self.gpus[selected_gpu_id].assign_task(task)
        if not success:
            # Fallback to least loaded
            self.least_loaded_scheduler(task)
            return
        
        # Calculate reward for the selected agent
        reward = self.marl_manager.calculate_reward(self.gpus[selected_gpu_id], task, success)
        
        # Update the agent
        agent = self.marl_manager.agents[selected_gpu_id]
        state = agent.get_state(self.gpus[selected_gpu_id], cluster_state)
        next_cluster_state = self.marl_manager.get_cluster_state(self.gpus)
        next_state = agent.get_state(self.gpus[selected_gpu_id], next_cluster_state)
        
        # Use action 0 for task assignment (simplified)
        agent.update(state, 0, reward, next_state)
    
    def traditional_fcfs_scheduler(self, task):
        """Traditional FCFS scheduler"""
        scheduler = self.traditional_schedulers['fcfs']
        gpu_index = scheduler.select_gpu(self.gpus, task)
        if gpu_index is not None:
            self.gpus[gpu_index].assign_task(task)
    
    def traditional_round_robin_scheduler(self, task):
        """Traditional Round Robin scheduler"""
        scheduler = self.traditional_schedulers['round_robin']
        gpu_index = scheduler.select_gpu(self.gpus, task)
        if gpu_index is not None:
            self.gpus[gpu_index].assign_task(task)
    
    def traditional_least_loaded_scheduler(self, task):
        """Traditional Least Loaded scheduler"""
        scheduler = self.traditional_schedulers['least_loaded']
        gpu_index = scheduler.select_gpu(self.gpus, task)
        if gpu_index is not None:
            self.gpus[gpu_index].assign_task(task)
    
    def get_traditional_scheduler_stats(self):
        """Get statistics for traditional schedulers"""
        stats = {}
        for name, scheduler in self.traditional_schedulers.items():
            stats[name] = scheduler.get_stats()
        return stats
    
    def compare_traditional_schedulers(self, tasks=None):
        """Compare all traditional schedulers"""
        if tasks is None:
            # Generate test tasks
            tasks = []
            for _ in range(20):
                tasks.append(self.task_generator.generate_task())
        
        return self.baseline_comparison.compare_all(self.gpus, tasks)

    # -----------------------
    # STEP FUNCTION
    # -----------------------

    def step(self):
        self.time_step += 1

        # Phase 2 Step 4: Traffic Patterns - Get requests from traffic manager
        if self.traffic_mode == "peak_off_peak":
            # Use peak/off-peak simulation
            num_requests = self.traffic_manager.step()
        else:
            # Use traffic patterns
            num_requests = self.traffic_manager.step()
        
        # Update task generator weights based on traffic pattern
        mixed_weights = self.traffic_manager.get_mixed_workload_profile()
        self.task_generator.task_weights = {
            "LLM": mixed_weights["LLM"],
            "Image": mixed_weights["Image"], 
            "Video": mixed_weights["Video"]
        }

        for _ in range(num_requests):
            # Generate mixed workload using new task generator
            task = self.generate_task()  # Random task type
            self.total_tasks += 1

            if self.scheduler == "random":
                self.random_scheduler(task)

            elif self.scheduler == "round_robin":
                self.round_robin_scheduler(task)

            elif self.scheduler == "fcfs":
                self.fcfs_scheduler(task)

            elif self.scheduler == "least_loaded":
                self.least_loaded_scheduler(task)

            elif self.scheduler == "rl":
                self.rl_scheduler(task)
            elif self.scheduler == "marl":
                self.marl_scheduler(task)
            elif self.scheduler == "traditional_fcfs":
                self.traditional_fcfs_scheduler(task)
            elif self.scheduler == "traditional_round_robin":
                self.traditional_round_robin_scheduler(task)
            elif self.scheduler == "traditional_least_loaded":
                self.traditional_least_loaded_scheduler(task)

        # process tasks
        for gpu in self.gpus:
            gpu.process_tasks()

        self.agent.decay_epsilon()
        
        # Also decay MARL agents
        self.marl_manager.decay_all_epsilon()

    # -----------------------
    # METRICS
    # -----------------------

    def get_metrics(self):
        base_metrics = {
            "latency": sum(g.total_latency for g in self.gpus),
            "completed": sum(g.completed_tasks for g in self.gpus),
            "crashes": sum(int(g.crashed) for g in self.gpus),
            "avg_memory_usage": sum(g.get_memory_usage_percentage() for g in self.gpus) / len(self.gpus),
            "avg_temperature": sum(g.temperature for g in self.gpus) / len(self.gpus),
            "total_running_tasks": sum(g.get_running_tasks_count() for g in self.gpus),
            "total_queued_tasks": sum(g.get_queue_length() for g in self.gpus),
            # Advanced metrics - Step 2
            "total_memory_fragments": sum(g.get_memory_fragments_count() for g in self.gpus),
            "avg_fragmentation": sum(g.get_fragmentation_percentage() for g in self.gpus) / len(self.gpus),
            "total_preemptions": sum(g.total_preemptions for g in self.gpus),
            "total_preempted_tasks": sum(g.get_preempted_tasks_count() for g in self.gpus),
            "gpus_in_cooldown": sum(1 for g in self.gpus if g.is_in_cooldown())
        }
        
        # Add workload statistics - Phase 2 Step 3
        workload_stats = self.get_workload_statistics()
        base_metrics.update({
            "workload_stats": workload_stats,
            "llm_tasks_generated": workload_stats["task_distribution"].get("LLM", 0),
            "image_tasks_generated": workload_stats["task_distribution"].get("Image", 0),
            "video_tasks_generated": workload_stats["task_distribution"].get("Video", 0)
        })
        
        # Add traffic statistics - Phase 2 Step 4
        traffic_stats = self.get_traffic_statistics()
        base_metrics.update({
            "traffic_stats": traffic_stats,
            "current_traffic_pattern": traffic_stats["current_pattern"],
            "current_hour": traffic_stats["current_hour"],
            "total_traffic_requests": traffic_stats["total_requests"],
            "traffic_pattern_switches": traffic_stats["pattern_switches"],
            "avg_requests_per_step": traffic_stats["avg_requests_per_step"]
        })
        
        # Add MARL statistics
        marl_stats = self.marl_manager.get_global_stats()
        base_metrics.update({
            "marl_stats": marl_stats,
            "marl_global_reward": marl_stats["total_reward"],
            "marl_success_rate": marl_stats["global_success_rate"],
            "marl_avg_epsilon": marl_stats["avg_epsilon"],
            "marl_total_q_table_size": marl_stats["total_q_table_size"]
        })
        
        # Add traditional scheduler statistics
        traditional_stats = self.get_traditional_scheduler_stats()
        base_metrics.update({
            "traditional_stats": traditional_stats,
            "fcfs_assignment_rate": traditional_stats.get("fcfs", {}).get("assignment_rate", 0),
            "round_robin_assignment_rate": traditional_stats.get("round_robin", {}).get("assignment_rate", 0),
            "least_loaded_assignment_rate": traditional_stats.get("least_loaded", {}).get("assignment_rate", 0)
        })
        
        return base_metrics
