import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AgentStatus } from '@vcrm/shared';

export class CreateUserDto {
  @ApiProperty({ example: 'somchai@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Somchai Jaidee' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Role ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  roleId!: string;

  @ApiPropertyOptional({ description: 'Team ID (UUID)' })
  @IsUUID()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ enum: AgentStatus, default: AgentStatus.OFFLINE })
  @IsEnum(AgentStatus)
  @IsOptional()
  status?: AgentStatus = AgentStatus.OFFLINE;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxConcurrentChats?: number = 3;
}
