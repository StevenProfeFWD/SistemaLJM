/**
 * Caja blanca de tokenRevocationService (archivo propio: el módulo guarda estado
 * interno `tablaLista`/`ultimaLimpiezaMs`, por eso el ORDEN de las pruebas importa).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import * as TR from '../../../../backend-node/src/services/tokenRevocationService.js';

beforeEach(() => {
  DB.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('tokenRevocationService', () => {
  it('firmarTokenAcceso genera jti único hex de 32', () => {
    const a = TR.firmarTokenAcceso({ id: 1 });
    const b = TR.firmarTokenAcceso({ id: 1 });
    const jti = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).jti;
    expect(jti(a)).toMatch(/^[0-9a-f]{32}$/);
    expect(jti(a)).not.toBe(jti(b));
  });

  it('(1º) si CREATE TABLE falla se registra el error, la consulta sigue y se reintenta en la siguiente llamada', async () => {
    DB.setRawHandler(() => {
      throw new Error('sin permisos DDL');
    });
    DB.setResolver(() => undefined);
    expect(await TR.tokenEstaRevocado('a')).toBe(false);
    expect(console.error).toHaveBeenCalled();
    await TR.tokenEstaRevocado('a');
    expect(DB.rawLlamadas).toHaveLength(2); // 1 intento fallido por llamada
  });

  it('(2º) tokenEstaRevocado: jti vacío → false sin tocar BD; la tabla se crea solo una vez', async () => {
    expect(await TR.tokenEstaRevocado(null)).toBe(false);
    expect(DB.rawLlamadas).toHaveLength(0);
    DB.setResolver(() => undefined);
    await TR.tokenEstaRevocado('a');
    await TR.tokenEstaRevocado('b');
    expect(DB.rawLlamadas).toHaveLength(2); // CREATE TABLE + CREATE INDEX, una sola vez
  });

  it('tokenEstaRevocado devuelve true si existe la fila', async () => {
    DB.setResolver(() => ({ jti: 'a' }));
    expect(await TR.tokenEstaRevocado(123)).toBe(true);
    expect(DB.argsDe(DB.llamadas[0], 'where')).toEqual([[{ jti: '123' }]]);
  });

  it('revocarJti inserta con onConflict(jti).ignore(); id no numérico → null; sin jti no hace nada', async () => {
    await TR.revocarJti(null, 1);
    expect(DB.llamadas).toHaveLength(0);
    DB.setResolver(() => 1);
    const exp = new Date('2030-01-01T00:00:00Z');
    await TR.revocarJti('abc', 'x', exp);
    const ins = DB.llamadas.find((l) => l.tabla === 'jwt_revocado');
    expect(DB.argsDe(ins, 'insert')[0][0]).toEqual({ jti: 'abc', id_persona: null, expira_en: exp });
    expect(DB.argsDe(ins, 'onConflict')).toEqual([['jti']]);
    await TR.revocarJti('def', '7', '2030-01-01T00:00:00Z');
    const ins2 = DB.llamadas.filter((l) => l.tabla === 'jwt_revocado')[1];
    expect(DB.argsDe(ins2, 'insert')[0][0].id_persona).toBe(7);
    expect(DB.argsDe(ins2, 'insert')[0][0].expira_en).toBeInstanceOf(Date);
  });

  it('revocarJti: error de BD se captura', async () => {
    DB.setResolver(() => {
      throw new Error('x');
    });
    await expect(TR.revocarJti('a', 1)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('revocarDecoded usa exp del token o +1h', async () => {
    DB.setResolver(() => 1);
    await TR.revocarDecoded({});
    expect(DB.llamadas).toHaveLength(0);
    await TR.revocarDecoded({ jti: 'j', id: 3, exp: 2000000000 });
    const ins = DB.llamadas.find((l) => l.tabla === 'jwt_revocado');
    expect(DB.argsDe(ins, 'insert')[0][0].expira_en.getTime()).toBe(2000000000 * 1000);
    const antes = Date.now();
    await TR.revocarDecoded({ jti: 'k', id: 3 });
    const ins2 = DB.llamadas.filter((l) => l.tabla === 'jwt_revocado')[1];
    expect(DB.argsDe(ins2, 'insert')[0][0].expira_en.getTime()).toBeGreaterThanOrEqual(antes + 3600000 - 5);
  });

  it('limpiarRevocadosExpirados: throttle de 15 min salvo force; devuelve número o 0', async () => {
    DB.setResolver(() => 5);
    expect(await TR.limpiarRevocadosExpirados()).toBe(5);
    expect(await TR.limpiarRevocadosExpirados()).toBe(0); // throttle
    expect(await TR.limpiarRevocadosExpirados({ force: true })).toBe(5);
    DB.setResolver(() => 'no-numero');
    expect(await TR.limpiarRevocadosExpirados({ force: true })).toBe(0);
    DB.setResolver(() => {
      throw new Error('x');
    });
    expect(await TR.limpiarRevocadosExpirados({ force: true })).toBe(0);
  });
});
