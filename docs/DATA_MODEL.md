# Data Model (living document)

> AI: keep in sync with prisma/schema.prisma — entity, purpose, key fields, PII class, retention.
> Initial conceptual model: SYSTEM_DESIGN.md §2.5

| Entity         | Module   | Purpose                                                        | PII  | Retention               | Added in task |
| -------------- | -------- | -------------------------------------------------------------- | ---- | ----------------------- | ------------- |
| `Tenant`       | `tenant` | Tenant identity, status, plan and global configurations        | None | Contract lifetime + 30d | 0.4           |
| `TenantConfig` | `tenant` | Tenant-scoped key-value configuration and RLS isolation anchor | None | Contract lifetime       | 0.4           |
