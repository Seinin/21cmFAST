#!/usr/bin/env python3
"""
Mars 集群管理工具 — 启动/停止本地 Mars 集群，用于 21cmFAST 分布式采样

Usage:
    python train/mars_cluster.py start    # 启动本地集群（1 scheduler + N workers）
    python train/mars_cluster.py stop     # 停止集群
    python train/mars_cluster.py status   # 查看集群状态

多机部署:
    调度节点:  mars-scheduler -H <ip> -p 7103
    工作节点:  mars-worker -s <scheduler_ip>:7103 -p 7104 --cpus <n>
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

MARS_SCHEDULER_PORT = 7103
MARS_WORKER_PORT = 7104
MARS_WEB_PORT = 7105
PID_DIR = Path(__file__).resolve().parent / ".mars_pids"


def start_cluster(n_workers: int = None, cpus_per_worker: int = None):
    """启动本地 Mars 集群。"""
    import multiprocessing as mp

    if n_workers is None:
        n_workers = max(1, mp.cpu_count() // 2)
    if cpus_per_worker is None:
        cpus_per_worker = max(1, mp.cpu_count() // n_workers)

    PID_DIR.mkdir(exist_ok=True)

    print(f"启动 Mars 集群...")
    print(f"  Workers: {n_workers} × {cpus_per_worker} CPUs")
    print(f"  Scheduler port: {MARS_SCHEDULER_PORT}")
    print(f"  Web UI: http://localhost:{MARS_WEB_PORT}")

    # 启动 scheduler
    sched_cmd = [
        sys.executable, "-m", "mars.deploy.oscar.supervisor",
        "-H", "0.0.0.0",
        "-p", str(MARS_SCHEDULER_PORT),
        "-w", str(MARS_WEB_PORT),
    ]
    sched_proc = subprocess.Popen(
        sched_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        preexec_fn=os.setsid,
    )
    with open(PID_DIR / "scheduler.pid", "w") as f:
        f.write(str(sched_proc.pid))
    print(f"  Scheduler PID: {sched_proc.pid}")

    time.sleep(3)  # 等待 scheduler 就绪

    # 启动 workers
    worker_pids = []
    for i in range(n_workers):
        worker_cmd = [
            sys.executable, "-m", "mars.deploy.oscar.worker",
            "-s", f"localhost:{MARS_SCHEDULER_PORT}",
            "-p", str(MARS_WORKER_PORT + i),
            "--cpus", str(cpus_per_worker),
        ]
        wproc = subprocess.Popen(
            worker_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid,
        )
        worker_pids.append(wproc.pid)
        print(f"  Worker {i} PID: {wproc.pid}")

    with open(PID_DIR / "workers.pid", "w") as f:
        f.write("\n".join(map(str, worker_pids)))

    time.sleep(2)
    print(f"\n✓ Mars 集群已启动 ({n_workers} workers)")
    print(f"  Web UI: http://localhost:{MARS_WEB_PORT}")
    print(f"\n连接字符串:  http://localhost:{MARS_SCHEDULER_PORT}")
    print(f"在采样脚本中使用:  mars.new_session('http://localhost:{MARS_SCHEDULER_PORT}')")


def stop_cluster():
    """停止本地 Mars 集群。"""
    killed = 0
    for pid_file in ["workers.pid", "scheduler.pid"]:
        path = PID_DIR / pid_file
        if path.exists():
            with open(path) as f:
                for line in f:
                    try:
                        pid = int(line.strip())
                        os.killpg(os.getpgid(pid), signal.SIGTERM)
                        killed += 1
                    except (ProcessLookupError, OSError):
                        pass
            path.unlink()

    PID_DIR.rmdir() if PID_DIR.exists() else None
    print(f"✓ 已停止 {killed} 个 Mars 进程")


def show_status():
    """显示集群状态。"""
    import socket

    sched_running = False
    try:
        s = socket.create_connection(("localhost", MARS_SCHEDULER_PORT), timeout=2)
        s.close()
        sched_running = True
    except Exception:
        pass

    if sched_running:
        print(f"✓ Mars Scheduler 正在运行 (port {MARS_SCHEDULER_PORT})")
        print(f"  Web UI: http://localhost:{MARS_WEB_PORT}")
    else:
        print("✗ Mars 集群未运行")

    # 检查是否有 worker 进程
    worker_path = PID_DIR / "workers.pid"
    if worker_path.exists():
        with open(worker_path) as f:
            pids = [int(l.strip()) for l in f if l.strip()]
        alive = 0
        for pid in pids:
            try:
                os.kill(pid, 0)
                alive += 1
            except OSError:
                pass
        print(f"  Workers: {alive}/{len(pids)} 存活")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mars 集群管理")
    parser.add_argument("action", choices=["start", "stop", "status"], help="操作")
    parser.add_argument("--n-workers", type=int, default=None, help="Worker 数量")
    parser.add_argument("--cpus", type=int, default=None, help="每个 worker 的 CPU 数")
    args = parser.parse_args()

    if args.action == "start":
        start_cluster(args.n_workers, args.cpus)
    elif args.action == "stop":
        stop_cluster()
    elif args.action == "status":
        show_status()
