import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

// Long enough for a database that is waking up (Neon can pause an idle database)
const DATABASE_TIMEOUT_MS = 5000;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Server is Live!';
  }

  // Asks the database the lightest possible question. It never throws: "down" is an answer
  async checkHealth(): Promise<{ database: 'up' | 'down' }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer within ${DATABASE_TIMEOUT_MS} ms`)),
        DATABASE_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return { database: 'up' };
    } catch (error) {
      this.logger.error(
        `The database check failed: ${(error as Error).message}`,
      );
      return { database: 'down' };
    } finally {
      clearTimeout(timer);
    }
  }
}
