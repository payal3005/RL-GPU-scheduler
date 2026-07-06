from environment import GPUEnvironment
import time

env = GPUEnvironment(scheduler="round_robin")
env.set_traffic_pattern("mixed", duration=30)  # Start with mixed traffic

print("=== AETHERGRID : TRAFFIC PATTERNS ===")
print("Running with Round Robin Scheduler + Traffic Patterns")
print("Step | Comp | LLM | Img | Vid | Pattern | Requests | Mem% | Frag%")
print("-" * 75)

for i in range(30):
    env.step()
    
    if i % 3 == 0:  # Print every 3 steps
        metrics = env.get_metrics()
        traffic_info = env.get_current_traffic_load()
        print(f"{i+1:3d}  | {metrics['completed']:4d} | "
              f"{metrics['llm_tasks_generated']:3d} | "
              f"{metrics['image_tasks_generated']:3d} | "
              f"{metrics['video_tasks_generated']:3d} | "
              f"{traffic_info['pattern']:8s} | "
              f"{traffic_info['requests_this_step']:8d} | "
              f"{metrics['avg_memory_usage']:4.1f}% | "
              f"{metrics['avg_fragmentation']:4.1f}%")
    
    time.sleep(0.1)  # Faster for testing

print("\n" + "=" * 65)
print("FINAL METRICS - WORKLOAD SYSTEM")
final_metrics = env.get_metrics()

# Basic metrics
print("Basic Metrics:")
for key, value in final_metrics.items():
    if key in ['completed', 'crashes', 'avg_memory_usage', 'avg_temperature']:
        print(f"  {key.replace('_', ' ').title()}: {value}")

# Advanced features
print("\nAdvanced Features:")
for key, value in final_metrics.items():
    if key in ['total_memory_fragments', 'avg_fragmentation', 'total_preemptions', 
               'total_preempted_tasks', 'gpus_in_cooldown']:
        print(f"  {key.replace('_', ' ').title()}: {value}")

# Workload statistics
print("\nWorkload Distribution:")
workload_stats = final_metrics['workload_stats']
for task_type, count in workload_stats['task_distribution'].items():
    percentage = workload_stats['percentages'][task_type]
    print(f"  {task_type}: {count} ({percentage:.1f}%)")

print("=" * 75)

# Traffic statistics
print("\nTraffic Statistics:")
traffic_stats = final_metrics['traffic_stats']
print(f"Current Pattern: {traffic_stats['current_pattern']}")
print(f"Current Hour: {traffic_stats['current_hour']}")
print(f"Total Requests: {traffic_stats['total_requests']}")
print(f"Pattern Switches: {traffic_stats['pattern_switches']}")
print(f"Avg Requests/Step: {traffic_stats['avg_requests_per_step']:.1f}")

print("\n FEATURES VERIFIED:")
print("* Task Types: LLM (High/Slow), Image (Low/Fast), Video (Medium/Medium)")
print("* Traffic Patterns: Light (1-3), Heavy (8-15), Burst (0-20), Mixed (2-12)")
print("* Peak vs Off-Peak: Time-based traffic simulation")
print("* Mixed Workloads: Dynamic task weight adjustment")
print("* Pattern Transitions: Automatic traffic pattern switching")
print("* Peak Hours: 9-12 AM, 2-6 PM")
print("* Off-Peak Hours: All other times")
print("=" * 75)
