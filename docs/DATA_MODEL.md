# Data Model (living document)

> AI: keep in sync with prisma/schema.prisma — entity, purpose, key fields, PII class, retention.
> Initial conceptual model: SYSTEM_DESIGN.md §2.5

| Entity           | Module   | Purpose                                                         | PII                  | Retention                      | Added in task |
| ---------------- | -------- | --------------------------------------------------------------- | -------------------- | ------------------------------ | ------------- |
| `Tenant`         | `tenant` | Tenant identity, status, plan and global configurations         | None                 | Contract lifetime + 30d        | 0.4           |
| `TenantConfig`   | `tenant` | Tenant-scoped key-value configuration and RLS isolation anchor  | None                 | Contract lifetime              | 0.4           |
| `User`           | `iam`    | User account, role assignment, status, chat concurrency         | Masked (name, email) | Contract lifetime              | 0.6           |
| `Team`           | `iam`    | Team/group hierarchy for routing and data scope filtering       | None                 | Contract lifetime              | 0.6           |
| `Role`           | `iam`    | System and tenant-level RBAC role definitions                   | None                 | Indefinite / Contract lifetime | 0.6           |
| `Permission`     | `iam`    | System permission catalog (`module.action`)                     | None                 | Indefinite                     | 0.6           |
| `RolePermission` | `iam`    | Role to permission binding with data scope (`own`/`team`/`all`) | None                 | Indefinite                     | 0.6           |
| `Skill`          | `iam`    | Channel and routing skills (e.g., Thai Voice, Escalations)      | None                 | Contract lifetime              | 0.6           |
| `UserSkill`      | `iam`    | Agent skill proficiency levels (1–5) for routing engine         | None                 | Contract lifetime              | 0.6           |
