import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../iam/decorators/current-user.decorator';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ') && !req.user) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          const user = await this.authService.verifyToken(token);
          req.user = user;
        } catch {
          // Leave req.user undefined; JwtAuthGuard or PermissionGuard will handle rejection
        }
      }
    }
    next();
  }
}
