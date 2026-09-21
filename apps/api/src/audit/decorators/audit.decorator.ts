import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { AUDIT_METADATA_KEY, AUDIT_PII_VIEW_KEY } from '../audit.constants';

export interface AuditOptions {
  entity: string;
  action?: string;
  extractEntityId?: (req: unknown, res: unknown) => string | undefined;
}

export interface AuditPiiViewOptions {
  entity: string;
  piiFields?: string[];
  purpose?: string;
  extractEntityId?: (req: unknown, res: unknown) => string | undefined;
}

export const Audited = (options: AuditOptions): CustomDecorator<string> =>
  SetMetadata(AUDIT_METADATA_KEY, options);

export const AuditPiiView = (options: AuditPiiViewOptions): CustomDecorator<string> =>
  SetMetadata(AUDIT_PII_VIEW_KEY, options);
