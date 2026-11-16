/** Datos de prueba sintéticos (no provienen de la BD real). */
export function totales(p = 90, t = 5, aj = 3, ai = 2) {
  const total = p + t + aj + ai;
  return {
    presentes: p, tardias: t, ausencias_justificadas: aj, ausencias_injustificadas: ai, total,
    porcentaje_asistencia: total ? Math.round(((p + t) / total) * 10000) / 100 : 0,
  };
}

export const CATALOGOS = {
  secciones: [
    { id_seccion: 1, nombre_seccion: '7-1' },
    { id_seccion: 2, nombre_seccion: '8-2' },
  ],
  materias: [
    { id_materia: 10, nombre_materia: 'Matemáticas' },
    { id_materia: 11, nombre_materia: 'Español' },
  ],
};

export function seccion(id, nombre, materias = [['Matemáticas', 10], ['Español', 11]], tot = totales()) {
  return {
    id_seccion: id,
    nombre_seccion: nombre,
    totales: tot,
    materias: materias.map(([n, idm], i) => ({ id_materia: idm, nombre_materia: n, totales: totales(40 + i, 2, 1, 1) })),
  };
}

export function reporte(over = {}) {
  const secciones = over.secciones ?? [
    seccion(1, '7-1', undefined, totales(95, 0, 3, 2)),   // 95%  -> verde
    seccion(2, '8-2', [['Ciencias', 12]], totales(80, 5, 5, 10)), // 85% -> amarillo
  ];
  return {
    filtros: {
      periodo: 'mensual', periodo_label: 'Mensual',
      fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30',
      nombre_seccion: null, nombre_materia: null, nombre_estudiante: null,
      ...(over.filtros || {}),
    },
    resumen_general: over.resumen_general ?? totales(175, 5, 8, 12),
    secciones,
    catalogos: over.catalogos ?? CATALOGOS,
  };
}

export const ESTUDIANTES_7_1 = {
  estudiantes: [
    { id_estudiante: 501, nombre_completo: 'Ana Prueba Uno', cedula: '100000001' },
    { id_estudiante: 502, nombre_completo: 'Beto Prueba Dos', cedula: null },
  ],
};
export const ESTUDIANTES_8_2 = {
  estudiantes: [{ id_estudiante: 601, nombre_completo: 'Carla Prueba Tres', cedula: '100000003' }],
};

export function generarGrande(nSecciones = 40, nMaterias = 10) {
  const secciones = Array.from({ length: nSecciones }, (_, i) =>
    seccion(i + 1, `S-${i + 1}`, Array.from({ length: nMaterias }, (_, j) => [`Materia ${j + 1}`, 1000 + j]), totales(80 + (i % 20), 3, 2, 1)),
  );
  return reporte({ secciones });
}
