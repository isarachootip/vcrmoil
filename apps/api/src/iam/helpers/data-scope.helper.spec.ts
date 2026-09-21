import { DataScopeHelper } from './data-scope.helper';
import { AgentStatus, DataScope, UserContext } from '@vcrm/shared';

describe('DataScopeHelper', () => {
  const user: UserContext = {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'agent@vcrm.local',
    name: 'Somchai',
    role: 'Agent',
    teamId: 'team-support-1',
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 3,
    permissions: [],
  };

  it('returns empty filter for ALL data scope', () => {
    const filter = DataScopeHelper.buildFilter(user, DataScope.ALL);
    expect(filter).toEqual({});
  });

  it('filters by team_id for TEAM data scope', () => {
    const filter = DataScopeHelper.buildFilter(user, DataScope.TEAM);
    expect(filter).toEqual({
      team_id: 'team-support-1',
    });
  });

  it('filters by user id for OWN data scope', () => {
    const filter = DataScopeHelper.buildFilter(user, DataScope.OWN);
    expect(filter).toEqual({
      created_by: 'user-001',
    });
  });

  it('allows custom user and team field mappings', () => {
    const filter = DataScopeHelper.buildFilter(user, DataScope.OWN, {
      userField: 'assignee_id',
    });
    expect(filter).toEqual({
      assignee_id: 'user-001',
    });
  });
});
