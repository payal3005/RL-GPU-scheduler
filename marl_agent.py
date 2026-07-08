import numpy as np
import random
from collections import defaultdict

class MARLAgent:
    """Multi-Agent RL Agent for individual GPU management"""
    
    def __init__(self, gpu_id, state_size=16, action_size=4, learning_rate=0.001):
        self.gpu_id = gpu_id
        self.state_size = state_size
        self.action_size = action_size
        self.learning_rate = learning_rate
        
        # Enhanced exploration parameters for better early training
        self.epsilon = 1.0  # Start with maximum exploration
        self.epsilon_min = 0.05  # Higher minimum for continued exploration
        self.epsilon_decay = 0.997  # Slower decay for more exploration
        self.training_steps = 0  # Track training progress
        
        # Adaptive exploration schedule
        self.initial_exploration_phase = 100  # First 100 steps high exploration
        self.learning_phase = 500  # Main learning phase
        
        # Q-table for this specific GPU
        self.q_table = defaultdict(lambda: np.zeros(action_size))
        
        # Performance tracking
        self.total_reward = 0
        self.tasks_assigned = 0
        self.successful_assignments = 0
        
    def get_state(self, gpu, cluster_state):
        """Extract state for this specific GPU with shared cluster context."""
        state = [
            # Local GPU state
            gpu.get_memory_usage_percentage() / 100.0,
            gpu.temperature / 100.0,
            len(gpu.task_queue) / 10.0,
            len(gpu.running_tasks) / 3.0,
            gpu.get_fragmentation_percentage() / 100.0,
            1.0 if gpu.crashed else 0.0,
            1.0 if gpu.is_in_cooldown() else 0.0,
            gpu.get_preempted_tasks_count() / 5.0,

            # Shared cluster context
            cluster_state['avg_memory_usage'] / 100.0,
            cluster_state['avg_queue_length'] / 10.0,
            cluster_state['idle_gpu_count'] / max(1, self.state_size // 4),
            cluster_state['overloaded_gpu_count'] / max(1, self.state_size // 4),
            cluster_state['total_cluster_utilization'] / 100.0,
            cluster_state['available_cluster_memory'] / 32.0,
            cluster_state['gpus_in_cooldown'] / 4.0,
            cluster_state['avg_fragmentation'] / 100.0,

            # Task context
            cluster_state.get('current_task_memory', 0) / 8.0,
            cluster_state.get('current_task_time', 0) / 10.0
        ]

        return tuple(state[:self.state_size])
    
    def choose_action(self, state, available_actions=None):
        """Choose action using epsilon-greedy policy"""
        if available_actions is None:
            available_actions = list(range(self.action_size))
        
        if random.random() <= self.epsilon:
            return random.choice(available_actions)
        
        # Get Q-values for current state
        q_values = self.q_table[state]
        
        # Filter to available actions
        masked_q_values = np.array([q_values[action] if action in available_actions else -np.inf 
                                   for action in range(self.action_size)])
        
        return np.argmax(masked_q_values)
    
    def update(self, state, action, reward, next_state):
        """Update Q-table using Q-learning"""
        # Q-learning update rule
        old_value = self.q_table[state][action]
        next_max = np.max(self.q_table[next_state])
        
        # Bellman equation
        new_value = old_value + self.learning_rate * (reward + 0.95 * next_max - old_value)
        self.q_table[state][action] = new_value
        
        # Track performance
        self.total_reward += reward
        self.tasks_assigned += 1
        if reward > 0:
            self.successful_assignments += 1
    
    def decay_epsilon(self):
        """Adaptive epsilon decay with enhanced exploration"""
        self.training_steps += 1
        
        # Adaptive exploration schedule
        if self.training_steps < self.initial_exploration_phase:
            # High exploration phase - very slow decay
            self.epsilon = max(self.epsilon_min, self.epsilon * 0.998)
        elif self.training_steps < self.learning_phase:
            # Learning phase - moderate decay
            self.epsilon = max(self.epsilon_min, self.epsilon * 0.995)
        else:
            # Mature phase - faster decay to exploitation
            self.epsilon = max(self.epsilon_min, self.epsilon * 0.992)
        
        # Ensure epsilon doesn't go below minimum
        self.epsilon = max(self.epsilon_min, self.epsilon)
    
    def get_performance_stats(self):
        """Get performance statistics for this agent"""
        success_rate = self.successful_assignments / max(1, self.tasks_assigned)
        return {
            'gpu_id': self.gpu_id,
            'total_reward': self.total_reward,
            'tasks_assigned': self.tasks_assigned,
            'success_rate': success_rate,
            'epsilon': self.epsilon,
            'q_table_size': len(self.q_table)
        }

class MARLManager:
    """Multi-Agent RL Manager for coordinating multiple GPU agents"""
    
    def __init__(self, num_gpus=4):
        self.num_gpus = num_gpus
        # Fine-tuned learning parameters
        self.agents = [MARLAgent(i, learning_rate=0.002) for i in range(num_gpus)]  # Slightly higher learning rate
        self.global_step = 0
        self.total_reward = 0
        
        # Coordination metrics
        self.coordination_history = []
        self.load_balancing_score = 0
        
        # Enhanced coordination parameters
        self.coordination_frequency = 5  # Coordinate every 5 steps
        self.exploration_boost_threshold = 100  # Boost exploration if performance is low
        self.performance_window = 20  # Track performance over last 20 steps
        
    def get_cluster_state(self, gpus):
        """Get cluster-level state for coordination"""
        total_memory_capacity = sum(g.memory_capacity for g in gpus)
        current_cluster_memory = sum(g.current_memory for g in gpus)
        total_cluster_utilization = sum(g.get_total_load() for g in gpus)
        idle_gpu_count = sum(1 for g in gpus if g.get_total_load() == 0)
        overloaded_gpu_count = sum(1 for g in gpus if g.get_total_load() >= 4)

        return {
            'avg_memory_usage': sum(g.get_memory_usage_percentage() for g in gpus) / len(gpus),
            'avg_temperature': sum(g.temperature for g in gpus) / len(gpus),
            'total_queued_tasks': sum(g.get_queue_length() for g in gpus),
            'total_running_tasks': sum(g.get_running_tasks_count() for g in gpus),
            'avg_queue_length': sum(g.get_queue_length() for g in gpus) / len(gpus),
            'idle_gpu_count': idle_gpu_count,
            'overloaded_gpu_count': overloaded_gpu_count,
            'total_cluster_utilization': (total_cluster_utilization / max(1, len(gpus) * 6)) * 100.0,
            'available_cluster_memory': max(0.0, total_memory_capacity - current_cluster_memory),
            'gpus_in_cooldown': sum(1 for g in gpus if g.is_in_cooldown()),
            'avg_fragmentation': sum(g.get_fragmentation_percentage() for g in gpus) / len(gpus),
            'total_preemptions': sum(g.total_preemptions for g in gpus)
        }
    
    def compute_bid_score(self, gpu, task, agent, cluster_state):
        """Compute a cooperative bid score for a GPU using MARL Q-values and load signals."""
        state = agent.get_state(gpu, cluster_state)
        q_values = agent.q_table[state]
        q_value = float(np.max(q_values)) if len(q_values) else 0.0

        if gpu.crashed or gpu.is_in_cooldown():
            return -np.inf

        if gpu.current_memory + task.memory_required > gpu.memory_capacity * 1.2:
            return -np.inf

        memory_headroom = max(0.0, 1.0 - ((gpu.current_memory + task.memory_required) / gpu.memory_capacity))
        queue_penalty = min(1.0, len(gpu.task_queue) / 10.0)
        temp_penalty = min(1.0, max(0.0, (gpu.temperature - 50.0) / 50.0))
        running_penalty = min(1.0, len(gpu.running_tasks) / 3.0)
        fragmentation_penalty = min(1.0, gpu.get_fragmentation_percentage() / 100.0)

        memory_component = memory_headroom * 0.10
        queue_component = (1.0 - queue_penalty) * 0.08
        temperature_component = (1.0 - temp_penalty) * 0.05
        running_component = (1.0 - running_penalty) * 0.04
        fragmentation_component = (1.0 - fragmentation_penalty) * 0.03

        return (q_value * 0.70) + memory_component + queue_component + temperature_component + running_component + fragmentation_component

    def select_gpu_for_task(self, task, gpus, cluster_state):
        """Select best GPU for task using cooperative bidding with MARL coordination."""
        task_context = {
            'current_task_memory': task.memory_required,
            'current_task_time': task.execution_time
        }
        cluster_state.update(task_context)

        gpu_scores = []
        for i, (gpu, agent) in enumerate(zip(gpus, self.agents)):
            bid_score = self.compute_bid_score(gpu, task, agent, cluster_state)
            gpu_scores.append((i, bid_score))

        gpu_scores.sort(key=lambda x: x[1], reverse=True)

        for gpu_id, score in gpu_scores:
            if np.isfinite(score):
                return gpu_id

        # Fallback to least loaded if all agents reject
        return min(range(len(gpus)), key=lambda i: (len(gpus[i].task_queue), gpus[i].get_total_load()))
    
    def update_agents(self, gpus, tasks_assigned, rewards):
        """Update all agents after task assignment with adaptive coordination"""
        cluster_state = self.get_cluster_state(gpus)
        
        # Performance monitoring
        avg_performance = 0
        for agent in self.agents:
            stats = agent.get_performance_stats()
            avg_performance += stats['success_rate']
        avg_performance /= len(self.agents)
        
        # Adaptive exploration boost if performance is low
        if avg_performance < 0.3 and self.global_step < self.exploration_boost_threshold:
            for agent in self.agents:
                agent.epsilon = min(1.0, agent.epsilon * 1.1)  # Boost exploration
        
        for i, (gpu, agent) in enumerate(zip(gpus, self.agents)):
            state = agent.get_state(gpu, cluster_state)
            next_cluster_state = self.get_cluster_state(gpus)
            next_state = agent.get_state(gpu, next_cluster_state)
            
            # Update with received reward
            action = tasks_assigned[i]
            reward = rewards.get(i, 0)
            agent.update(state, action, reward, next_state)
        
        # Periodic coordination and parameter adjustment
        if self.global_step % self.coordination_frequency == 0:
            self.coordinate_agents(gpus)
        
        self.global_step += 1
    
    def coordinate_agents(self, gpus):
        """Coordinate agents and adjust parameters based on performance"""
        # Get current performance metrics
        agent_performances = []
        for agent in self.agents:
            stats = agent.get_performance_stats()
            agent_performances.append(stats['success_rate'])
        
        avg_performance = sum(agent_performances) / len(agent_performances)
        
        # Adjust learning parameters based on performance
        for i, agent in enumerate(self.agents):
            # Boost struggling agents
            if agent_performances[i] < avg_performance * 0.8:
                agent.learning_rate = min(0.005, agent.learning_rate * 1.1)
                agent.epsilon = min(0.8, agent.epsilon * 1.05)
            # Penalize overperforming agents slightly to encourage exploration
            elif agent_performances[i] > avg_performance * 1.2:
                agent.learning_rate = max(0.0005, agent.learning_rate * 0.9)
                agent.epsilon = max(agent.epsilon * 0.95, agent.epsilon_min)
        
        # Update coordination history
        self.coordination_history.append({
            'step': self.global_step,
            'avg_performance': avg_performance,
            'agent_epsilons': [agent.epsilon for agent in self.agents],
            'agent_learning_rates': [agent.learning_rate for agent in self.agents]
        })
    
    def calculate_reward(self, gpu, task, success):
        """Bounded reward focused on assignment outcomes and overload safety."""
        if not success:
            return -20.0

        reward = 4.0

        # Reward successful assignments directly.
        reward += 3.0

        # Penalize severe overload and queue growth.
        queue_length = len(gpu.task_queue)
        if queue_length >= 5:
            reward -= 5.0
        elif queue_length >= 3:
            reward -= 2.0
        elif queue_length <= 1:
            reward += 1.0

        # Penalize excessive running-task pressure.
        running_tasks = len(gpu.running_tasks)
        if running_tasks >= 3:
            reward -= 2.5
        elif running_tasks == 2:
            reward -= 0.5
        elif running_tasks == 1:
            reward += 0.5

        # Mildly reward moderate memory usage; avoid overfitting to low-memory states.
        memory_usage_ratio = gpu.current_memory / gpu.memory_capacity
        if memory_usage_ratio > 0.85:
            reward -= 1.5
        elif memory_usage_ratio > 0.6:
            reward += 0.5
        else:
            reward += 0.25

        # Keep temperature influence mild and bounded.
        if gpu.temperature > 80:
            reward -= 1.5
        elif gpu.temperature > 70:
            reward -= 0.5
        elif gpu.temperature <= 65:
            reward += 0.25

        # Heavy penalties for unsafe states.
        if gpu.crashed:
            reward -= 20.0
        if gpu.is_in_cooldown():
            reward -= 8.0

        # Keep rewards bounded and stable.
        return float(max(-20.0, min(12.0, reward)))
    
    def decay_all_epsilon(self):
        """Decay exploration rate for all agents"""
        for agent in self.agents:
            agent.decay_epsilon()
    
    def get_global_stats(self):
        """Get global MARL statistics"""
        total_reward = sum(agent.total_reward for agent in self.agents)
        total_tasks = sum(agent.tasks_assigned for agent in self.agents)
        total_successful = sum(agent.successful_assignments for agent in self.agents)
        
        return {
            'global_step': self.global_step,
            'total_reward': total_reward,
            'total_tasks_assigned': total_tasks,
            'global_success_rate': total_successful / max(1, total_tasks),
            'avg_epsilon': sum(agent.epsilon for agent in self.agents) / len(self.agents),
            'total_q_table_size': sum(len(agent.q_table) for agent in self.agents),
            'agent_stats': [agent.get_performance_stats() for agent in self.agents]
        }
    
    def save_models(self, filepath):
        """Save MARL models"""
        import pickle
        models = {f'agent_{i}': agent.q_table for i, agent in enumerate(self.agents)}
        with open(filepath, 'wb') as f:
            pickle.dump(models, f)
    
    def load_models(self, filepath):
        """Load MARL models"""
        import pickle
        try:
            with open(filepath, 'rb') as f:
                models = pickle.load(f)
            for i, agent in enumerate(self.agents):
                if f'agent_{i}' in models:
                    agent.q_table = defaultdict(lambda: np.zeros(self.agents[0].action_size))
                    agent.q_table.update(models[f'agent_{i}'])
            return True
        except:
            return False
