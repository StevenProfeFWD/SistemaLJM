import apiClient from "../config/api";

const axiosInstance = apiClient;

// Consultar datos de identificación en API Hacienda (solo autorrelleno de nombre completo)
async function consultarIdentificacion(identificacion) {
  try {
    const response = await axiosInstance.get(`/matriculas/consultar-identificacion/${identificacion}`);
    return response.data;
  } catch (error) {
    console.error("Error al consultar identificación:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Obtener todas las matrículas
async function getMatriculas() {
  try {
    const response = await axiosInstance.get("/matriculas");
    return response.data;
  } catch (error) {
    console.error("Error al obtener matrículas:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Obtener matrícula por ID
async function getMatriculaById(id) {
  try {
    const response = await axiosInstance.get(`/matriculas/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener matrícula:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Obtener matrículas de un estudiante específico
async function getMatriculasPorEstudiante(idEstudiante) {
  try {
    const response = await axiosInstance.get(`/matriculas/estudiante/${idEstudiante}`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener matrículas del estudiante:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Buscar tutor (persona local o Hacienda) para matrícula regular
async function buscarTutorParaMatriculaRegular(cedula) {
  try {
    const enc = encodeURIComponent(String(cedula || '').trim());
    const response = await axiosInstance.get(`/matriculas/buscar-tutor-matricula/${enc}`);
    return response.data;
  } catch (error) {
    console.error("Error al buscar tutor:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Buscar estudiante por cédula para matrícula regular
async function buscarEstudiantePorCedula(cedula) {
  try {
    const enc = encodeURIComponent(String(cedula || '').trim());
    const response = await axiosInstance.get(`/matriculas/buscar-estudiante/${enc}`);
    return response.data;
  } catch (error) {
    console.error("Error al buscar estudiante:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Crear matrícula de nuevo ingreso
async function crearMatriculaNuevoIngreso(payload) {
  try {
    const response = await axiosInstance.post("/matriculas/nuevo-ingreso", payload);
    return response.data;
  } catch (error) {
    console.error("Error al crear matrícula de nuevo ingreso:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Crear matrícula regular (ratificación)
async function crearMatriculaRegular(payload) {
  try {
    const response = await axiosInstance.post("/matriculas/regular", payload);
    return response.data;
  } catch (error) {
    console.error("Error al crear matrícula regular:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Crear matrícula por traslado
async function crearMatriculaTraslado(payload) {
  try {
    const response = await axiosInstance.post("/matriculas/traslado", payload);
    return response.data;
  } catch (error) {
    console.error("Error al crear matrícula por traslado:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

// Actualizar estado de matrícula
async function actualizarEstadoMatricula(id, estado) {
  try {
    const response = await axiosInstance.patch(`/matriculas/${id}/estado`, { estado });
    return response.data;
  } catch (error) {
    console.error("Error al actualizar estado de matrícula:", error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: "No se obtuvo respuesta del servidor" };
    } else {
      throw { message: "Error en la petición" };
    }
  }
}

async function getCursosLectivos() {
  try {
    const response = await axiosInstance.get('/matriculas/cursos-lectivos');
    return response.data;
  } catch (error) {
    console.error('Error al obtener cursos lectivos:', error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: 'No se obtuvo respuesta del servidor' };
    } else {
      throw { message: 'Error en la petición' };
    }
  }
}

async function postPrecargaMasiva(formData) {
  try {
    const response = await axiosInstance.post('/matriculas/precarga-masiva', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    console.error('Error en precarga masiva:', error);
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { message: 'No se obtuvo respuesta del servidor' };
    } else {
      throw { message: 'Error en la petición' };
    }
  }
}

export default {
  consultarIdentificacion,
  getMatriculas,
  getMatriculaById,
  getMatriculasPorEstudiante,
  buscarEstudiantePorCedula,
  buscarTutorParaMatriculaRegular,
  crearMatriculaNuevoIngreso,
  crearMatriculaRegular,
  crearMatriculaTraslado,
  actualizarEstadoMatricula,
  getCursosLectivos,
  postPrecargaMasiva,
};
