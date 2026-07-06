import random
from enum import Enum

class TaskType(Enum):
    LLM = "LLM"
    IMAGE = "Image"
    VIDEO = "Video"

class TaskGenerator:
    def __init__(self):
        # Define workload characteristics
        self.workload_profiles = {
            TaskType.LLM: {
                "memory_range": (4, 8),      # High memory: 4-8GB
                "time_range": (5, 10),       # Slow execution: 5-10 steps
                "description": "Large Language Model Processing",
                "priority": "high"
            },
            TaskType.IMAGE: {
                "memory_range": (1, 3),      # Low memory: 1-3GB
                "time_range": (1, 3),        # Fast execution: 1-3 steps
                "description": "Image Processing/Generation",
                "priority": "medium"
            },
            TaskType.VIDEO: {
                "memory_range": (2, 5),      # Medium memory: 2-5GB
                "time_range": (3, 6),        # Medium execution: 3-6 steps
                "description": "Video Processing/Rendering",
                "priority": "medium"
            }
        }
        
        # Task type weights for randomness
        self.task_weights = {
            TaskType.LLM: 0.4,      # 40% LLM tasks
            TaskType.IMAGE: 0.35,    # 35% Image tasks  
            TaskType.VIDEO: 0.25     # 25% Video tasks
        }
        
        # Statistics tracking
        self.generated_tasks = {task_type: 0 for task_type in TaskType}
        self.total_generated = 0

    def generate_task(self, task_type=None):
        """
        Generate a single task with specified or random type
        """
        if task_type is None:
            # Random task selection
            task_type = random.choices(
                list(TaskType),
                weights=list(self.task_weights.values())
            )[0]
        else:
            # Convert string to TaskType enum
            if isinstance(task_type, str):
                task_type = TaskType(task_type)
        
        # Get workload profile
        profile = self.workload_profiles[task_type]
        
        # Generate task characteristics
        memory_required = random.randint(*profile["memory_range"])
        execution_time = random.randint(*profile["time_range"])
        
        # Create enhanced task object
        task = EnhancedTask(
            task_type=task_type.value,
            memory_required=memory_required,
            execution_time=execution_time,
            description=profile["description"],
            priority=profile["priority"]
        )
        
        # Update statistics
        self.generated_tasks[task_type] += 1
        self.total_generated += 1
        
        return task
    
    def generate_batch(self, count, task_types=None):
        """
        Generate a batch of tasks
        """
        tasks = []
        for _ in range(count):
            task = self.generate_task()
            tasks.append(task)
        return tasks
    
    def generate_burst_workload(self, intensity="medium"):
        """
        Generate burst workload based on intensity
        """
        intensity_levels = {
            "low": (1, 3),
            "medium": (3, 8),
            "high": (5, 12),
            "extreme": (8, 20)
        }
        
        count_range = intensity_levels.get(intensity, (3, 8))
        task_count = random.randint(*count_range)
        
        return self.generate_batch(task_count)
    
    def get_workload_statistics(self):
        """
        Get statistics about generated tasks
        """
        stats = {
            "total_generated": self.total_generated,
            "task_distribution": {
                task_type.value: count for task_type, count in self.generated_tasks.items()
            },
            "percentages": {
                task_type.value: (count / max(1, self.total_generated)) * 100
                for task_type, count in self.generated_tasks.items()
            }
        }
        return stats
    
    def reset_statistics(self):
        """
        Reset generation statistics
        """
        self.generated_tasks = {task_type: 0 for task_type in TaskType}
        self.total_generated = 0

class EnhancedTask:
    """
    Enhanced task class with workload-specific properties
    """
    def __init__(self, task_type, memory_required, execution_time, description, priority):
        # Basic properties
        self.task_type = task_type
        self.memory_required = memory_required
        self.execution_time = execution_time
        self.description = description
        self.priority = priority
        
        # Execution tracking
        self.execution_progress = 0
        self.preempted = False
        self.preemption_count = 0
        self.original_execution_time = None
        
        # Workload-specific properties
        self.id = f"{task_type}_{random.randint(1000, 9999)}"
        self.created_time = None  # Will be set by environment
        
        # Performance characteristics based on task type
        self._set_performance_characteristics()
    
    def _set_performance_characteristics(self):
        """
        Set performance characteristics based on task type
        """
        characteristics = {
            "LLM": {
                "cpu_intensive": True,
                "memory_bandwidth": "high",
                "parallelizable": False,
                "interruptible": True
            },
            "Image": {
                "cpu_intensive": False,
                "memory_bandwidth": "medium",
                "parallelizable": True,
                "interruptible": True
            },
            "Video": {
                "cpu_intensive": True,
                "memory_bandwidth": "high",
                "parallelizable": False,
                "interruptible": False
            }
        }
        
        self.characteristics = characteristics.get(self.task_type, characteristics["Image"])
    
    def preempt(self):
        """
        Mark task as preempted with type-specific behavior
        """
        if self.characteristics["interruptible"]:
            self.preempted = True
            self.preemption_count += 1
            
            # Resume boost based on task type
            if self.original_execution_time is None:
                self.original_execution_time = self.execution_time
            
            # Different resume boosts for different task types
            if self.task_type == "LLM":
                # LLM tasks get smaller boost (context switching overhead)
                self.execution_time = max(1, self.execution_time - 0.5)
            elif self.task_type == "Image":
                # Image tasks get good boost (stateless)
                self.execution_time = max(1, self.execution_time - 1)
            else:  # Video
                # Video tasks get moderate boost
                self.execution_time = max(1, self.execution_time - 0.7)
            
            return True
        return False
    
    def resume(self):
        """
        Resume task after preemption
        """
        self.preempted = False
    
    def get_resource_intensity(self):
        """
        Get resource intensity score for scheduling decisions
        """
        memory_score = self.memory_required / 8.0  # Normalize to 8GB
        time_score = self.execution_time / 10.0  # Normalize to 10 steps
        
        # Weight based on task type
        type_weights = {"LLM": 1.2, "Image": 0.6, "Video": 1.0}
        type_weight = type_weights.get(self.task_type, 1.0)
        
        return (memory_score + time_score) * type_weight
    
    def __str__(self):
        return (f"Task({self.id}): {self.task_type} - "
                f"{self.memory_required}GB, {self.execution_time} steps, "
                f"Priority: {self.priority}")
    
    def __repr__(self):
        return self.__str__()
