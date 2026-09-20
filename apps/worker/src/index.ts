export const WORKER_NAME = 'vCRM Worker';

export function getWorkerStatus(): { status: string; queues: string[] } {
  return {
    status: 'idle',
    queues: ['outbox-dispatch', 'sla-monitor', 'survey-send'],
  };
}
