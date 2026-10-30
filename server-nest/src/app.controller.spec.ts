import { describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller.js';

// The controller imports the service only for its type: a bare class is enough
vi.mock('./app.service.js', () => ({ AppService: class AppService {} }));

function setup(database: 'up' | 'down') {
  const service = {
    getHello: vi.fn().mockReturnValue('Server is Live!'),
    checkHealth: vi.fn().mockResolvedValue({ database }),
  };
  const res = { status: vi.fn() };
  const controller = new AppController(service as never);
  return { controller, res };
}

describe('GET /', () => {
  it('answers the plain text', () => {
    const { controller } = setup('up');

    expect(controller.getHello()).toBe('Server is Live!');
  });
});

describe('GET /api/health', () => {
  it('answers ok (and leaves the status 200) when the database is up', async () => {
    const { controller, res } = setup('up');

    const body = await controller.getHealth(res as never);

    expect(body).toEqual({ status: 'ok', database: 'up' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 with an error status when the database is down', async () => {
    const { controller, res } = setup('down');

    const body = await controller.getHealth(res as never);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(body).toEqual({ status: 'error', database: 'down' });
  });
});
