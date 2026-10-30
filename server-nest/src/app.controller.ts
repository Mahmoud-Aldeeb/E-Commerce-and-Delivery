import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppService } from './app.service.js';

@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Liveness: the server runs. It touches nothing else, so it is always fast
  // GET / -> "Server is Live!"
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Readiness: the server AND its database work. For uptime monitors.
  // GET /api/health -> 200 {"status":"ok","database":"up"} or 503 {"status":"error","database":"down"}
  // The 503 is set on the response (not thrown) on purpose: a thrown 5xx would be reported to Sentry
  // on every ping of the monitor
  @Get('health')
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const health = await this.appService.checkHealth();
    if (health.database === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: health.database === 'up' ? 'ok' : 'error', ...health };
  }
}
