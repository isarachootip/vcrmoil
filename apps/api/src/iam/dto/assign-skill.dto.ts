import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsUUID, Max, Min } from 'class-validator';

export class AssignSkillDto {
  @ApiProperty({ description: 'Skill ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  skillId!: string;

  @ApiProperty({
    description: 'Skill proficiency level 1 to 5',
    minimum: 1,
    maximum: 5,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  level!: number;
}
