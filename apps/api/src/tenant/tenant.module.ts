import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { TenantProfileController } from './tenant-profile.controller';
import { ActiveTenantGuard } from './guards/active-tenant.guard';
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';

@Module({
  controllers: [PlatformTenantsController, TenantProfileController],
  providers: [TenantService, ActiveTenantGuard],
  exports: [TenantService, ActiveTenantGuard],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
