import json
import time
from pathlib import Path

from utils.task_queue import STATUS_FAILED, STATUS_FINISHED, TaskQueue


def test_task_queue_persists_finished_job(tmp_path):
    state_path = tmp_path / 'queue-state.json'

    queue = TaskQueue(name='test-queue', max_workers=1, persistence_path=str(state_path))
    queue.enqueue('job-1', lambda: {'ok': True})

    # wait for worker
    for _ in range(50):
        job = queue.get('job-1')
        if job and job.status == STATUS_FINISHED:
            break
        time.sleep(0.02)
    queue.shutdown(wait=True)

    assert state_path.exists()
    payload = json.loads(state_path.read_text(encoding='utf-8'))
    jobs = {item['job_id']: item for item in payload['jobs']}
    assert jobs['job-1']['status'] == STATUS_FINISHED


def test_task_queue_recovers_non_terminal_job_as_failed(tmp_path):
    state_path = tmp_path / 'queue-state.json'
    state_payload = {
        'queue_name': 'test-queue',
        'saved_at': 1,
        'jobs': [
            {
                'job_id': 'job-running',
                'status': 'running',
                'enqueued_at': 1,
                'started_at': 2,
                'finished_at': None,
                'metadata': {},
                'cancel_requested': False,
                'queue_name': 'test-queue',
            }
        ],
    }
    state_path.write_text(json.dumps(state_payload), encoding='utf-8')

    queue = TaskQueue(name='test-queue', max_workers=1, persistence_path=str(state_path))
    recovered = queue.get('job-running')
    queue.shutdown(wait=True)

    assert recovered is not None
    assert recovered.status == STATUS_FAILED
    assert 'Recovered after restart' in (recovered.error or '')
