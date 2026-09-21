import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({
    description: 'Tenant organization name',
    example: 'Acme Thailand Co., Ltd.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description: 'Unique tenant subdomain slug',
    example: 'acme',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(63)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
  })
  slug!: string;

  @ApiPropertyOptional({
    description: 'Subscription plan',
    example: 'standard',
    default: 'standard',
  })
  @IsString()
  @IsOptional()
  plan?: string = 'standard';

  @ApiProperty({
    description: 'Administrator email address',
    example: 'admin@acme.com',
  })
  @IsEmail()
  @IsNotEmpty()
  adminEmail!: string;

  @ApiPropertyOptional({
    description: 'Administrator full name',
    example: 'Somchai Jaidee',
  })
  @IsString()
  @IsOptional()
  adminName?: string;

  @ApiPropertyOptional({
    description: 'Tenant-level configuration settings',
    example: { timezone: 'Asia/Bangkok', locale: 'th' },
  })
  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;
}
