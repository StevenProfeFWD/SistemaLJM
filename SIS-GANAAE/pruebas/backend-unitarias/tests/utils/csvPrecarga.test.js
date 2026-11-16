import { describe, it, expect } from 'vitest';
import {
  normalizeCsvHeader,
  detectCsvDelimiter,
  parseCsvLine,
  parseCsvText,
  extractPrecargaRow,
  parseFechaNacimiento,
  nombreSeccionToAnoACursar,
} from '../../../../backend-node/src/utils/csvPrecarga.js';

describe('normalizeCsvHeader', () => {
  it.each([
    ['Cédula', 'cedula'],
    ['  Primer   apellido ', 'primer_apellido'],
    ['SECCIÓN', 'seccion'],
    [null, ''],
    ['Año', 'ano'],
  ])('%j → %j', (a, b) => expect(normalizeCsvHeader(a)).toBe(b));
});

describe('detectCsvDelimiter', () => {
  it.each([
    ['a,b,c', ','],
    ['a;b;c', ';'],
    ['"a;b",c', ','],
    ['"a,b";c;d', ';'],
    ['sin separador', ','],
    ['', ','],
    [null, ','],
    ['a,b;c', ','], // empate → coma (primer elemento)
  ])('%j → %j', (l, d) => expect(detectCsvDelimiter(l)).toBe(d));
});

describe('parseCsvLine', () => {
  it('campos con comillas y separador dentro', () => {
    expect(parseCsvLine('1-111,"Mora, Ana", 7-1 ')).toEqual(['1-111', 'Mora, Ana', '7-1']);
  });
  it('punto y coma; delimitador desconocido cae a coma', () => {
    expect(parseCsvLine('a;b', ';')).toEqual(['a', 'b']);
    expect(parseCsvLine('a|b,c', '|')).toEqual(['a|b', 'c']);
  });
  it('campos vacíos y línea vacía', () => {
    expect(parseCsvLine(',,')).toEqual(['', '', '']);
    expect(parseCsvLine('')).toEqual(['']);
  });
  it('DEFECTO D-14b (menor): comillas escapadas RFC 4180 ("") se pierden', () => {
    expect(parseCsvLine('"Ana ""la Tica"" Mora",x')).toEqual(['Ana la Tica Mora', 'x']); // esperado: Ana "la Tica" Mora
  });
});

describe('parseCsvText', () => {
  it('vacío / solo BOM / solo líneas en blanco', () => {
    expect(parseCsvText('')).toEqual({ headers: [], rows: [], delimiter: ',' });
    expect(parseCsvText('﻿\r\n  \n')).toEqual({ headers: [], rows: [], delimiter: ',' });
  });

  it('plantilla del cliente con ; (Excel español), BOM y CRLF', () => {
    const t = '﻿Cédula;Primer apellido;Segundo apellido;Nombre;Sección;fecha_nacimiento\r\n1-1111-1111;Mora;Solís;Ana;7-1;01/02/2012\r\n\r\n2-2;Díaz;;Luis;8-2;2011-05-06\r\n';
    const r = parseCsvText(t);
    expect(r.delimiter).toBe(';');
    expect(r.headers).toEqual(['cedula', 'apellido1', 'apellido2', 'nombre', 'seccion', 'fecha_nacimiento']);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toEqual({ cedula: '2-2', apellido1: 'Díaz', apellido2: '', nombre: 'Luis', seccion: '8-2', fecha_nacimiento: '2011-05-06' });
  });

  it('encabezados legados, desconocidos, vacíos y duplicados (gana el primer valor no vacío)', () => {
    const t = 'Identificacion,Apellido Paterno,,DIMEX,Columna Extra\n1,Mora,ignorado,2,z\n,Solís,,3,';
    const r = parseCsvText(t);
    expect(r.headers).toEqual(['cedula', 'apellido1', '', 'cedula', 'columna_extra']);
    expect(r.rows[0]).toEqual({ cedula: '1', apellido1: 'Mora', columna_extra: 'z' });
    expect(r.rows[1].cedula).toBe('3'); // primero vacío → toma el siguiente
  });

  it('filas con menos celdas que encabezados → ""', () => {
    expect(parseCsvText('a,b,c\n1').rows[0]).toEqual({ a: '1', b: '', c: '' });
  });

  it('5 000 filas se procesan', () => {
    const t = ['cedula,nombre', ...Array.from({ length: 5000 }, (_, i) => `${i},N${i}`)].join('\n');
    expect(parseCsvText(t).rows).toHaveLength(5000);
  });

  it('__proto__ como encabezado no contamina Object.prototype', () => {
    parseCsvText('__proto__,b\n{"polluted":1},2');
    expect({}.polluted).toBeUndefined();
  });
});

describe('extractPrecargaRow', () => {
  it('construye nombre completo en orden Nombre + apellidos', () => {
    expect(extractPrecargaRow({ cedula: ' 1 ', nombre: 'Ana', apellido1: 'Mora', apellido2: '' })).toMatchObject({
      cedula: '1',
      nombreCompleto: 'Ana Mora',
    });
  });
  it('OBSERVACIÓN O-03: orden distinto a buildNombreCompletoCr (Apellido1 Apellido2 Nombre)', () => {
    expect(extractPrecargaRow({ nombre: 'Ana', apellido1: 'Mora', apellido2: 'Solís' }).nombreCompleto).toBe('Ana Mora Solís');
  });
  it('nombre_completo explícito tiene prioridad; campos ausentes → ""', () => {
    expect(extractPrecargaRow({ nombre_completo: 'X Y', nombre: 'Z' }).nombreCompleto).toBe('X Y');
    expect(extractPrecargaRow({})).toEqual({ cedula: '', nombre: '', apellido1: '', apellido2: '', nombreCompleto: '', fechaNacimiento: '', seccion: '' });
  });
});

describe('parseFechaNacimiento', () => {
  it.each([
    ['2012-02-01', '2012-02-01'],
    ['01/02/2012', '2012-02-01'],
    ['1-2-2012', '2012-02-01'],
    ['  05/11/2010 ', '2010-11-05'],
    ['', null],
    [null, null],
    ['2012/02/01', null],
    ['01.02.2012', null],
    ['1/2/12', null],
  ])('%j → %j', (a, b) => expect(parseFechaNacimiento(a)).toBe(b));

  it('CORREGIDO D-14: rechaza fechas imposibles (31/02/2010, 2010-13-45, 99/99/2010) y basura tras la fecha ISO', () => {
    expect(parseFechaNacimiento('31/02/2010')).toBeNull();
    expect(parseFechaNacimiento('2010-13-45')).toBeNull();
    expect(parseFechaNacimiento('2010-01-01xyz')).toBeNull();
    expect(parseFechaNacimiento('99/99/2010')).toBeNull();
    // Sigue aceptando fechas reales, incluida una hora opcional de exportaciones y el 29/02 de año bisiesto
    expect(parseFechaNacimiento('2010-01-01 00:00:00')).toBe('2010-01-01');
    expect(parseFechaNacimiento('2012-02-29T00:00:00.000Z')).toBe('2012-02-29');
    expect(parseFechaNacimiento('29/02/2012')).toBe('2012-02-29');
  });

  it('CORREGIDO D-14 (expectativa correcta): 31/02/2010 debería devolver null', () => {
    expect(parseFechaNacimiento('31/02/2010')).toBeNull();
  });
});

describe('nombreSeccionToAnoACursar', () => {
  it.each([
    ['7-1', 'septimo'],
    ['8-2', 'octavo'],
    ['9-10', 'noveno'],
    ['10-1', 'decimo'],
    [' 11-3 ', 'undecimo'],
    ['07-1', 'septimo'],
    ['12-1', null],
    ['6-1', null],
    ['7', null],
    ['A-1', null],
    [null, null],
  ])('%j → %j', (a, b) => expect(nombreSeccionToAnoACursar(a)).toBe(b));
});
