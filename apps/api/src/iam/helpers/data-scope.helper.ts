import { DataScope, UserContext } from '@vcrm/shared';

export interface DataScopeFilterOptions {
  userField?: string;
  teamField?: string;
}

export class DataScopeHelper {
  /**
   * Constructs a Prisma-compatible filter condition based on user's assigned data scope
   */
  static buildFilter(
    user: UserContext,
    scope: DataScope | string = DataScope.ALL,
    options: DataScopeFilterOptions = {},
  ): Record<string, unknown> {
    const userField = options.userField || 'created_by';
    const teamField = options.teamField || 'team_id';

    switch (scope) {
      case DataScope.OWN:
        return {
          [userField]: user.id,
        };

      case DataScope.TEAM:
        return {
          [teamField]: user.teamId || '00000000-0000-0000-0000-000000000000',
        };

      case DataScope.ALL:
      default:
        return {};
    }
  }
}
