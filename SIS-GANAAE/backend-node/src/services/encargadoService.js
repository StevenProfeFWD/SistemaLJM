import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import * as haciendaService from './haciendaService.js';
import { parseNombreCompletoCr } from '../utils/nombrePersona.js';

function personaToDto(row) {
  const parsed = parseNombreCompletoCr(row.nombre_completo);
  return {
    id_persona: row.id_persona,
    cedula: row.cedula,
    correo: row.correo || '',
    telefono: row.telefono || '',
    direccion: row.direccion || '',
    fecha_nacimiento: row.fecha_nacimiento
      ? String(row.fecha_nacimiento).slice(0, 10)
      : '',
    nombre_rol: row.nombre_rol,
    nombre: parsed.nombre,
    apellido1: parsed.apellido1,
    apellido2: parsed.apellido2,
    nombre_completo: row.nombre_completo,
  };
}

export async function consultarCedulaEncargado(rawCedula) {
  const cedulaNorm = haciendaService.normalizarIdentificacion(rawCedula);
  const cedulaTrim = String(rawCedula || '').trim();

  if (!cedulaNorm || cedulaNorm.length < 5) {
    throw new AppError('Identificación no válida', 400, {
      legacyJson: { error: 'Identificación no válida' },
    });
  }

  const persona = await db('persona')
    .where((qb) => {
      qb.where('cedula', cedulaNorm).orWhere('cedula', cedulaTrim);
    })
    .first();

  if (persona) {
    if (persona.nombre_rol === 'estudiante') {
      return {
        existeInterno: false,
        encontradoExterno: false,
        mensaje: 'La cédula pertenece a un estudiante; no puede registrarse como encargado.',
      };
    }

    return {
      existeInterno: true,
      encontradoExterno: false,
      persona: personaToDto(persona),
    };
  }

  const hacienda = await haciendaService.consultarIdentificacion(rawCedula);

  if (hacienda.encontrado && hacienda.nombreCompleto) {
    const parsed = parseNombreCompletoCr(hacienda.nombreCompleto);
    return {
      existeInterno: false,
      encontradoExterno: true,
      persona: {
        cedula: hacienda.identificacion || cedulaNorm,
        nombre: parsed.nombre,
        apellido1: parsed.apellido1,
        apellido2: parsed.apellido2,
        nombre_completo: parsed.nombre_completo || hacienda.nombreCompleto,
      },
    };
  }

  return {
    existeInterno: false,
    encontradoExterno: false,
    mensaje: hacienda.mensaje || 'No se encontró la identificación en el sistema ni en Hacienda.',
  };
}
