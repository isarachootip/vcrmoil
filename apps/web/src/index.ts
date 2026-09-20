import { AgentStatus } from '@vcrm/shared';

export const APP_NAME = 'vCRM Web';

export function getInitialAgentStatus(): AgentStatus {
  return AgentStatus.OFFLINE;
}
