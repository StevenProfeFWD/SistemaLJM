import apiClient from "../config/api";

const axiosInstance = apiClient;

async function getPersonas() {
    try {
        const response = await axiosInstance.get("/personas");
        return await response.data;
    } catch (error) {
        console.error("Error posting user:", error);
        if (error.response) {
        throw error.response.data;
        } else if (error.request) {
        throw { message: "No se obtuvo respuesta del servidor" };
        } else {
        throw { message: "Error en la petición" };
        }
    }
}

async function postPersonas(personasData) {
    try {
        const response = await axiosInstance.post("/personas", personasData);
        return await response.data;

    } catch (error) {
        console.error("Error posting user:", error);
        if (error.response) {
        throw error.response.data;
        } else if (error.request) {
        throw { message: "No se obtuvo respuesta del servidor" };
        } else {
        throw { message: "Error en la petición" };
        }
    }
}

async function getMateriasHabilitadasProfesor(idPersona) {
    try {
        const { data } = await axiosInstance.get(`/personas/${idPersona}/materias-habilitadas`);
        return data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function putMateriasHabilitadasProfesor(idPersona, id_materias) {
    try {
        const { data } = await axiosInstance.put(`/personas/${idPersona}/materias-habilitadas`, { id_materias });
        return data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function postUsuarios(correo, contrasena) {
    try {
     
        const userData = { 
          correo,
          contrasena
        };

        const response = await axiosInstance.post("/personas/login", userData);

        return await response.data;

    } catch (error) {
        console.error("Error posting user:", error);

        // Capturar errores del backend:
        if (error.response) {
        // Backend devolvió error con un status code
        throw error.response.data;
        } else if (error.request) {
        // No hubo respuesta del servidor
        throw { message: "No se obtuvo respuesta del servidor" };
        } else {
        // Error al construir la petición
        throw { message: "Error en la petición" };
        }
    }
}

async function updateUsuarios(informacion, id) 
{
    try {
        console.log('Esta es la info del update', informacion);
        
        const response = await axiosInstance.patch(`/personas/${id}/`, informacion);
         
        return await response.data;
    } catch (error) {
        console.error("Error posting user:", error);

        if (error.response) {
        throw error.response.data;
        } else if (error.request) {
        throw { message: "No se obtuvo respuesta del servidor" };
        } else {
        throw { message: "Error en la petición" };
        }
    }
}

async function getEstudiantes(params = {}) {
    try {
        const response = await axiosInstance.get("/estudiantes", { params });
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function updateEstudiante(id, body) {
    try {
        const response = await axiosInstance.put(`/estudiantes/${id}`, body);
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function buscarEncargados(q) {
    try {
        const response = await axiosInstance.get('/estudiantes/encargados/buscar', { params: { q } });
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function consultarCedula(cedula) {
    try {
        const encoded = encodeURIComponent(String(cedula || '').trim());
        const response = await axiosInstance.get(`/personas/consultar-cedula/${encoded}`);
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function getEstudianteDetalle(id) {
    try {
        const response = await axiosInstance.get(`/estudiantes/${id}`);
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function archiveEstudiante(id, activo = false) {
    try {
        const response = await axiosInstance.patch(`/estudiantes/${id}/archivar`, { activo });
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

async function reactivarEstudiante(id) {
    try {
        const response = await axiosInstance.patch(`/estudiantes/${id}/reactivar`);
        return response.data;
    } catch (error) {
        if (error.response) throw error.response.data;
        if (error.request) throw { message: "No se obtuvo respuesta del servidor" };
        throw { message: "Error en la petición" };
    }
}

// async function postUsuarios(correo, contrasena) {
//     try {
     
//         const userData = { 
//           correo,
//           contrasena
//         };

//         console.log("Esto devuelve el servicio en FE", userData);
        

//         const response = await fetch(API_URL + '/login', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify(userData)
//         });

//         return await response.json();

//     } catch (error) {
//         console.error('Error posting user:', error);
//         throw error;
//     }
// }

// async function updateUsuarios(informacion, id) 
// {
//     try {
//         console.log('Esta es la info del update', informacion);
        
//         const response = await fetch(API_URL+"/"+id+'/', {
//             method: 'PATCH',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(informacion)
//         });
     
//         return await response.json();
//     } catch (error) {
//         console.error('Error update user:', error);
//         throw error;
//     }
// }


// export const createPersona = (data) => axios.post(API_URL, data);

// export const updatePersona = (id, data) => axios.put(`${API_URL}/${id}`, data);

// export const deletePersona = (id) => axios.delete(`${API_URL}/${id}`);

export default {
  getPersonas,
  postPersonas,
  postUsuarios,
  updateUsuarios,
  getEstudiantes,
  getEstudianteDetalle,
  updateEstudiante,
  buscarEncargados,
  consultarCedula,
  archiveEstudiante,
  reactivarEstudiante,
  getMateriasHabilitadasProfesor,
  putMateriasHabilitadasProfesor,
}