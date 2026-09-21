import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TenantStatus } from '@vcrm/shared';

export class UpdateTenantStatusDto {
  @ApiProperty({
    description: 'Tenant lifecycle status',
    enum: TenantStatus,
    example: TenantStatus.ACTIVE,
  })
  @IsEnum(TenantStatus)
  @IsNotEmpty()
  status!: TenantStatus;
}
