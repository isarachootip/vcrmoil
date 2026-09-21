import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSkillDto {
  @ApiProperty({ example: 'Thai Language Support' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ example: 'Fluency in Thai customer support' })
  @IsString()
  @IsOptional()
  description?: string;
}
