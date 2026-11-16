import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../backend-node/src/services/notificacionHistorialService.js', () => ({
  listarNotificaciones: vi.fn(async (q) => ({ pagination: { p: 1 }, data: [q], catalogos: { c: 1 }, filtros: { f: 1 }, extra: 'no-expuesto' })),
}));
const { getNotificaciones } = await import('../../../../backend-node/src/controllers/notificacionController.js');

describe('notificacionController.getNotificaciones', () => {
  it('envuelve el resultado con status success y no expone campos extra', async () => {
    const res = { json: vi.fn((x) => x) };
    await getNotificaciones({ query: { page: '2' } }, res);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      pagination: { p: 1 },
      data: [{ page: '2' }],
      catalogos: { c: 1 },
      filtros: { f: 1 },
    });
  });
});
