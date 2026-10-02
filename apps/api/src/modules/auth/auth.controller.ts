import type {
  ChangePasswordResponse,
  LoginResponse,
  MeResponse,
  RevokeSessionResponse,
  SessionsListResponse,
} from '@hms/shared';
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  Public,
  Authenticated,
  AllowPasswordChange,
  CurrentUser,
  NoCacheInterceptor,
} from '../../common';

import { AuthService } from './auth.service';
import {
  LoginRequestDto,
  ChangePasswordRequestDto,
  SessionIdParamDto,
} from './dto/auth.dto';

@Controller('auth')
@UseInterceptors(NoCacheInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: {} })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LoginRequestDto,
  ): Promise<LoginResponse['data']> {
    return this.authService.login(req, res, dto.username, dto.password);
  }

  @Post('logout')
  @Authenticated()
  @AllowPasswordChange()
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId: string,
    @CurrentUser('username') username: string,
    @CurrentUser('sessionId') sessionId: string,
  ): Promise<{ success: true }> {
    await this.authService.logout(req, res, userId, username, sessionId);
    return { success: true };
  }

  @Get('me')
  @Authenticated()
  @AllowPasswordChange()
  async me(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string,
  ): Promise<MeResponse['data']> {
    return this.authService.me(userId, sessionId);
  }

  @Post('change-password')
  @Authenticated()
  @AllowPasswordChange()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: {} })
  async changePassword(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string,
    @Body() dto: ChangePasswordRequestDto,
  ): Promise<ChangePasswordResponse['data']> {
    return this.authService.changePassword(
      req,
      res,
      userId,
      currentSessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('sessions')
  @Authenticated()
  async listSessions(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string,
  ): Promise<SessionsListResponse['data']> {
    return this.authService.listSessions(userId, currentSessionId);
  }

  @Delete('sessions/:id')
  @Authenticated()
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId: string,
    @CurrentUser('username') username: string,
    @CurrentUser('sessionId') currentSessionId: string,
    @Param() param: SessionIdParamDto,
  ): Promise<RevokeSessionResponse['data']> {
    await this.authService.revokeSession(
      req,
      res,
      userId,
      username,
      currentSessionId,
      param.id,
    );
    return { success: true };
  }
}
