"""Simple in-memory task queue with worker threads."""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Deque, Dict, Optional, Tuple

STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_FINISHED = "finished"
STATUS_FAILED = "failed"
STATUS_CANCELED = "canceled"


@dataclass
class QueueJob:
    job_id: str
    status: str = STATUS_QUEUED
    enqueued_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    cancel_requested: bool = False
    queue_name: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "enqueued_at": self.enqueued_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "metadata": self.metadata,
            "cancel_requested": self.cancel_requested,
        }


class TaskQueue:
    def __init__(self, name: str = "task-queue", max_workers: int = 1):
        if max_workers < 1:
            raise ValueError("max_workers must be >= 1")
        self.name = name
        self.max_workers = max_workers
        self._queue: Deque[str] = deque()
        self._jobs: Dict[str, QueueJob] = {}
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._stop_event = threading.Event()
        self._workers = []
        for index in range(max_workers):
            worker = threading.Thread(
                target=self._worker_loop,
                name=f"{name}-worker-{index + 1}",
                daemon=True,
            )
            worker.start()
            self._workers.append(worker)

    def enqueue(
        self,
        job_id: str,
        task: Callable[..., Any],
        *args: Any,
        metadata: Optional[Dict[str, Any]] = None,
        pass_job: bool = False,
        **kwargs: Any,
    ) -> Tuple[QueueJob, Optional[int]]:
        with self._condition:
            existing = self._jobs.get(job_id)
            if existing:
                return existing, self.position(job_id)
            job = QueueJob(job_id=job_id, metadata=metadata or {}, queue_name=self.name)
            job._task = task
            job._args = args
            job._kwargs = kwargs
            job._pass_job = pass_job
            self._jobs[job_id] = job
            self._queue.append(job_id)
            position = len(self._queue)
            self._condition.notify()
            return job, position

    def get(self, job_id: str) -> Optional[QueueJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def position(self, job_id: str) -> Optional[int]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job.status == STATUS_QUEUED:
                try:
                    return list(self._queue).index(job_id) + 1
                except ValueError:
                    return None
            if job.status == STATUS_RUNNING:
                return 0
            return None

    def queued_count(self) -> int:
        with self._lock:
            return len(self._queue)

    def stats(self) -> Dict[str, int]:
        with self._lock:
            counts = {
                STATUS_QUEUED: 0,
                STATUS_RUNNING: 0,
                STATUS_FINISHED: 0,
                STATUS_FAILED: 0,
                STATUS_CANCELED: 0,
            }
            for job in self._jobs.values():
                counts[job.status] = counts.get(job.status, 0) + 1
            return counts

    def cancel(self, job_id: str) -> bool:
        with self._condition:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status == STATUS_QUEUED:
                try:
                    self._queue.remove(job_id)
                except ValueError:
                    pass
                job.status = STATUS_CANCELED
                job.cancel_requested = True
                job.finished_at = time.time()
                self._condition.notify()
                return True
            if job.status == STATUS_RUNNING:
                job.cancel_requested = True
                return True
            return False

    def shutdown(self, wait: bool = True) -> None:
        self._stop_event.set()
        with self._condition:
            self._condition.notify_all()
        if wait:
            for worker in self._workers:
                worker.join()

    def _worker_loop(self) -> None:
        while not self._stop_event.is_set():
            with self._condition:
                while not self._queue and not self._stop_event.is_set():
                    self._condition.wait(timeout=0.5)
                if self._stop_event.is_set():
                    break
                job_id = self._queue.popleft()
                job = self._jobs.get(job_id)
                if not job:
                    continue
                if job.status == STATUS_CANCELED:
                    job.finished_at = time.time()
                    continue
                job.status = STATUS_RUNNING
                job.started_at = time.time()
                task = job._task
                args = job._args
                kwargs = job._kwargs
                pass_job = job._pass_job
            try:
                if pass_job:
                    result = task(job, *args, **kwargs)
                else:
                    result = task(*args, **kwargs)
                with self._lock:
                    if job.cancel_requested:
                        job.status = STATUS_CANCELED
                    else:
                        job.status = STATUS_FINISHED
                    job.result = result
                    job.finished_at = time.time()
            except Exception as exc:
                with self._lock:
                    job.status = STATUS_FAILED
                    job.error = str(exc)
                    job.finished_at = time.time()
