/** Etiquetas oficiales institucionales para marcas de asistencia. */

export const ESTADO_ASISTENCIA_OFICIAL = {
  presente: 'Presente',
  tardanza: 'Tardía',
  justificado: 'Ausencia Justificada',
  ausente: 'Ausencia Injustificada',
  permiso_especial: 'Permiso Especial',
  suspendido: 'Suspendido',
  expulsado: 'Expulsado',
};

export function etiquetaEstadoOficial(estadoRaw) {
  const key = String(estadoRaw || '').trim().toLowerCase();
  return ESTADO_ASISTENCIA_OFICIAL[key] || estadoRaw || 'Sin clasificar';
}

export function calcularResumenAsistencia(registros) {
  const resumen = {
    total_registros: registros.length,
    presentes: 0,
    tardias: 0,
    ausencias_justificadas: 0,
    ausencias_injustificadas: 0,
    permisos_especiales: 0,
    suspendidos: 0,
    expulsados: 0,
    ausencias_totales: 0,
    nivel_asistencia_pct: 100,
  };

  for (const r of registros) {
    const e = String(r.estado || '').toLowerCase();
    if (e === 'presente') resumen.presentes += 1;
    else if (e === 'tardanza') resumen.tardias += 1;
    else if (e === 'justificado') resumen.ausencias_justificadas += 1;
    else if (e === 'ausente') resumen.ausencias_injustificadas += 1;
    else if (e === 'permiso_especial') resumen.permisos_especiales += 1;
    else if (e === 'suspendido') resumen.suspendidos += 1;
    else if (e === 'expulsado') resumen.expulsados += 1;
  }

  resumen.ausencias_totales =
    resumen.ausencias_justificadas +
    resumen.ausencias_injustificadas +
    resumen.suspendidos +
    resumen.expulsados;

  if (resumen.total_registros > 0) {
    resumen.nivel_asistencia_pct = Math.round(
      (resumen.presentes / resumen.total_registros) * 100
    );
  }

  return resumen;
}

/** Conteos crudos desde filas con campo `estado`. */
export function contarEstadosAsistencia(registros) {
  const conteos = {
    total: 0,
    presentes: 0,
    tardias: 0,
    ausencias_justificadas: 0,
    ausencias_injustificadas: 0,
  };

  for (const r of registros) {
    conteos.total += 1;
    const e = String(r.estado || '').toLowerCase();
    if (e === 'presente') conteos.presentes += 1;
    else if (e === 'tardanza') conteos.tardias += 1;
    else if (e === 'justificado') conteos.ausencias_justificadas += 1;
    else if (e === 'ausente') conteos.ausencias_injustificadas += 1;
  }

  return conteos;
}

/**
 * Métricas analíticas (fórmulas tesis / panel administrativo).
 * Nivel general: ((Total - Ausencias Injustificadas) / Total) * 100
 */
export function calcularMetricasAnaliticas(conteos) {
  const total = conteos.total || 0;
  const presentes = conteos.presentes || 0;
  const tardias = conteos.tardias || 0;
  const aj = conteos.ausencias_justificadas || 0;
  const ai = conteos.ausencias_injustificadas || 0;
  const ausenciasTotales = aj + ai;

  const puntualidadPct = total > 0 ? Math.round((presentes / total) * 100) : 100;
  const tardiasPct = total > 0 ? Math.round((tardias / total) * 100) : 0;
  const nivelAsistenciaPct = total > 0 ? Math.round(((total - ai) / total) * 100) : 100;

  return {
    total_registros: total,
    presentes,
    tardias,
    ausencias_justificadas: aj,
    ausencias_injustificadas: ai,
    ausencias_totales: ausenciasTotales,
    puntualidad_pct: puntualidadPct,
    tardias_pct: tardiasPct,
    nivel_asistencia_pct: nivelAsistenciaPct,
    distribucion_ausencias: {
      justificadas: aj,
      injustificadas: ai,
      justificadas_pct: ausenciasTotales > 0 ? Math.round((aj / ausenciasTotales) * 100) : 0,
      injustificadas_pct: ausenciasTotales > 0 ? Math.round((ai / ausenciasTotales) * 100) : 0,
    },
  };
}
