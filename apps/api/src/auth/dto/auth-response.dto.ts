import { ApiProperty } from '@nestjs/swagger';
import { UserContext } from '@vcrm/shared';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token (15m validity)' })
  accessToken!: string;

  @ApiProperty({ description: 'Refresh token (7d validity)' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token expiration in seconds' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: 'User context and permissions' })
  user!: UserContext;
}

export class TokenRefreshResponseDto {
  @ApiProperty({ description: 'New JWT access token (15m validity)' })
  accessToken!: string;

  @ApiProperty({ description: 'Rotated refresh token (7d validity)' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token expiration in seconds' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
}
