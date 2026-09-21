import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { PERMISSION_KEY, PermissionCode } from '../iam.constants';

export const RequirePermission = (permission: PermissionCode): CustomDecorator<string> =>
  SetMetadata(PERMISSION_KEY, permission);
