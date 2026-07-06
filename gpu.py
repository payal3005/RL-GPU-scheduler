import random
import time

class GPU:
    def __init__(self, gpu_id, memory_capacity=8):  # Default 8GB as specified
        self.id = gpu_id
        self.memory_capacity = memory_capacity  # in GB
        self.current_memory = 0  # in GB
        self.utilization = 0  # percentage
        self.temperature = 30  # Celsius
        self.task_queue = []
        self.running_tasks = []  # For parallel execution
        self.crashed = False
        self.total_latency = 0
        self.completed_tasks = 0
        
        # New features
        self.warm_up_delay = 2  # time steps for warm-up
        self.time_steps_active = 0
        self.is_warmed_up = False
        self.max_parallel_tasks = 3  # Max tasks can run in parallel
        self.crash_threshold_temp = 85  # Crash at 85°C
        self.memory_overload_factor = 1.2  # Crash at 120% memory usage
        
        # Advanced features - Step 2
        self.memory_fragments = []  # List of memory fragments
        self.preempted_tasks = []  # Tasks that were paused
        self.crash_cooldown_timer = 0  # Cooldown after crash
        self.total_preemptions = 0  # Track preemption count
        self.high_realism_mode = True  # Enable high realism features

    def assign_task(self, task):
        if self.crashed:
            return False
        
        # Check crash cooldown
        if self.crash_cooldown_timer > 0:
            return False
        
        # Memory fragmentation simulation
        if self.high_realism_mode:
            available_memory = self.memory_capacity - self.current_memory
            fragmentation_penalty = len(self.memory_fragments) * 0.1  # 10% penalty per fragment
            
            # Fragmentation can cause allocation failure even with enough memory
            if available_memory >= task.memory_required:
                if random.random() < fragmentation_penalty:
                    # Allocation failed due to fragmentation
                    self.memory_fragments.append(task.memory_required * 0.3)  # Create fragment
                    return False
        
        # Check memory capacity - only crash if exceeding overload factor
        if self.current_memory + task.memory_required > self.memory_capacity * self.memory_overload_factor:
            self.crashed = True
            return False
            
        self.task_queue.append(task)
        self.current_memory += task.memory_required

        # Memory fragmentation - create fragments when tasks complete
        if self.high_realism_mode and random.random() < 0.3:  # 30% chance
            fragment_size = task.memory_required * random.uniform(0.1, 0.4)
            self.memory_fragments.append(fragment_size)

        # increase utilization based on current load
        load_factor = len(self.task_queue) / 10.0
        self.utilization = min(100, self.utilization + random.randint(5, 12) + int(load_factor * 10))

        # increase temperature more with load
        temp_increase = random.randint(1, 4) + len(self.task_queue) // 2
        self.temperature += temp_increase

        # latency increases with queue size and fragmentation
        fragmentation_latency = len(self.memory_fragments) * 0.5
        self.total_latency += len(self.task_queue) * (1 + len(self.running_tasks) * 0.5 + fragmentation_latency)
        
        return True

    def process_tasks(self):
        # Handle crash cooldown
        if self.crashed:
            self.crash_cooldown_timer -= 1
            if self.crash_cooldown_timer <= 0:
                # Reset from crash with high realism boost
                self.temperature = max(30, self.temperature - 20)  # Big cooldown
                self.crashed = False
                self.current_memory *= 0.7  # Memory cleanup
                self.memory_fragments = []  # Defragmentation
                # Resume preempted tasks
                if self.high_realism_mode and self.preempted_tasks:
                    resume_count = min(2, len(self.preempted_tasks))  # Resume up to 2 tasks
                    for _ in range(resume_count):
                        task = self.preempted_tasks.pop(0)
                        self.task_queue.append(task)
            return
            
        # Handle warm-up delay
        self.time_steps_active += 1
        if not self.is_warmed_up and self.time_steps_active >= self.warm_up_delay:
            self.is_warmed_up = True
        elif not self.is_warmed_up:
            # Reduced processing during warm-up
            return
            
        # Check crash conditions
        if self.temperature >= self.crash_threshold_temp:
            self.crashed = True
            self.crash_cooldown_timer = 5  # 5 step cooldown
            # Preempt running tasks
            if self.high_realism_mode:
                for task in self.running_tasks:
                    task.preempted = True
                    self.preempted_tasks.append(task)
                self.running_tasks = []
            return
            
        # Task preemption logic (high realism)
        if self.high_realism_mode and len(self.running_tasks) > 0:
            # Preempt tasks under high load or temperature
            if self.temperature > 75 or len(self.running_tasks) == self.max_parallel_tasks:
                if random.random() < 0.2:  # 20% chance of preemption
                    task_to_preempt = random.choice(self.running_tasks)
                    self.running_tasks.remove(task_to_preempt)
                    task_to_preempt.preempted = True
                    self.preempted_tasks.append(task_to_preempt)
                    self.total_preemptions += 1
                    # Immediate cooldown from preemption
                    self.temperature = max(30, self.temperature - 5)
            
        # Multi-task parallel execution
        available_slots = self.max_parallel_tasks - len(self.running_tasks)
        tasks_to_start = min(available_slots, len(self.task_queue))
        
        # Start tasks in parallel
        for _ in range(tasks_to_start):
            if self.task_queue:
                task = self.task_queue.pop(0)
                task.execution_progress = 0
                self.running_tasks.append(task)
        
        # Process running tasks
        completed_tasks = []
        for task in self.running_tasks:
            task.execution_progress += 1
            if task.execution_progress >= task.execution_time:
                completed_tasks.append(task)
                
        # Remove completed tasks
        for task in completed_tasks:
            self.running_tasks.remove(task)
            self.current_memory -= task.memory_required
            self.completed_tasks += 1

            # Memory fragmentation cleanup
            if self.high_realism_mode and self.memory_fragments:
                # Clean some fragments when tasks complete
                if random.random() < 0.4:  # 40% chance
                    self.memory_fragments.pop(0)

            # decrease utilization
            self.utilization = max(0, self.utilization - random.randint(4, 8))

            # cool down
            self.temperature = max(30, self.temperature - random.randint(2, 5))
            
        # Natural temperature increase with running tasks
        if self.running_tasks:
            self.temperature += len(self.running_tasks) * 0.5

    def get_queue_length(self):
        return len(self.task_queue)
        
    def get_running_tasks_count(self):
        return len(self.running_tasks)
        
    def get_total_load(self):
        return len(self.task_queue) + len(self.running_tasks)
        
    def get_memory_usage_percentage(self):
        return (self.current_memory / self.memory_capacity) * 100
        
    def is_available_for_task(self, task_memory):
        return (not self.crashed and 
                self.current_memory + task_memory <= self.memory_capacity * self.memory_overload_factor and
                len(self.running_tasks) < self.max_parallel_tasks)
                
    def get_memory_fragments_count(self):
        """Return number of memory fragments"""
        return len(self.memory_fragments)
        
    def get_preempted_tasks_count(self):
        """Return number of preempted tasks"""
        return len(self.preempted_tasks)
        
    def get_fragmentation_percentage(self):
        """Calculate memory fragmentation percentage"""
        if not self.memory_fragments:
            return 0.0
        total_fragmented = sum(self.memory_fragments)
        return (total_fragmented / self.memory_capacity) * 100
        
    def is_in_cooldown(self):
        """Check if GPU is in crash cooldown"""
        return self.crashed and self.crash_cooldown_timer > 0
        
    def get_cooldown_remaining(self):
        """Get remaining cooldown steps"""
        return max(0, self.crash_cooldown_timer)
        
    def defragment_memory(self):
        """Manual memory defragmentation"""
        if self.memory_fragments:
            self.memory_fragments = []
            # Small performance penalty for defragmentation
            self.temperature += 2
            return True
        return False
        
    def reset(self):
        """Reset GPU state for new simulation"""
        self.current_memory = 0
        self.utilization = 0
        self.temperature = 30
        self.task_queue = []
        self.running_tasks = []
        self.crashed = False
        self.total_latency = 0
        self.completed_tasks = 0
        self.time_steps_active = 0
        self.is_warmed_up = False
        
        # Reset advanced features
        self.memory_fragments = []
        self.preempted_tasks = []
        self.crash_cooldown_timer = 0
        self.total_preemptions = 0
