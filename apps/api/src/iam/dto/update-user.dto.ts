import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AgentStatus } from '@vcrm/shared';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  roleId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ enum: AgentStatus })
  @IsEnum(AgentStatus)
  @IsOptional()
  status?: AgentStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxConcurrentChats?: number;
}
