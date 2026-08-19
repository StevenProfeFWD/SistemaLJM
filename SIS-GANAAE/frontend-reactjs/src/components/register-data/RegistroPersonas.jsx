import React, { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import servicio from '../../services/personaServices';
import asignacionServ from '../../services/asignacionAsistenciaServices';
import { MATERIAS_CATALOGO_EVENT } from '../../lib/materiasCatalogEvents';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Select } from "../ui/select"
import { Textarea } from "../ui/textarea"
import { Checkbox } from "../ui/checkbox"
import { Button } from "../ui/button"
import { Alert, AlertDescription } from "../ui/alert"
import { useDialog } from '../../context/DialogContext'
import {
  notificarHaciendaIndisponible,
  MENSAJE_NOMBRE_MANUAL,
} from '../../utils/haciendaConsulta'

function msgErr(err) {
  if (!err) return 'Error desconocido'
  if (typeof err === 'string') return err
  return err.message || err.error || 'Error al procesar la solicitud'
}

function RegistroPersonas() {
  const { toast } = useDialog()
  const [persona, setPersona] = useState({
    nombre_completo: "",
    cedula: "",
    correo: "",
    telefono: "",
    direccion: "",
    fecha_nacimiento: "",
    nombre_rol: ""
  })

  /** IDs de materias para nuevo docente (regla 1: al menos una si rol docente) */
  const [materiasNuevoDocente, setMateriasNuevoDocente] = useState([])

  const [materiasCatalogo, setMateriasCatalogo] = useState([])

  const enviarPersona = (e) => {
    setPersona({
      ...persona,
      [e.target.name]: e.target.value
    })
  }

  const onCedulaChange = (e) => {
    setPersona((prev) => ({
      ...prev,
      cedula: e.target.value,
      nombre_completo: '',
    }))
    setConsultaCedula({ estado: null, mensaje: '' })
  }

  const [status, setStatus] = useState({ type: "", message: "" })
  const [loading, setLoading] = useState(false)
  const [buscandoCedula, setBuscandoCedula] = useState(false)
  const [consultaCedula, setConsultaCedula] = useState({ estado: null, mensaje: '' })

  const cargarCatalogos = useCallback(async () => {
    try {
      const cat = await asignacionServ.getCatalogos()
      setMateriasCatalogo(cat.materias || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    const onMateriasActualizadas = () => {
      cargarCatalogos()
    }
    window.addEventListener(MATERIAS_CATALOGO_EVENT, onMateriasActualizadas)
    return () => window.removeEventListener(MATERIAS_CATALOGO_EVENT, onMateriasActualizadas)
  }, [cargarCatalogos])

  useEffect(() => {
    if (persona.nombre_rol !== 'profesor') {
      setMateriasNuevoDocente([])
    }
  }, [persona.nombre_rol])

  const toggleMateriaNuevo = (idMateria) => {
    setMateriasNuevoDocente((prev) =>
      prev.includes(idMateria) ? prev.filter((id) => id !== idMateria) : [...prev, idMateria]
    )
  }

  const consultarCedulaIdentificacion = async () => {
    const cedula = persona.cedula.trim()
    if (cedula.length < 5) return

    setBuscandoCedula(true)
    setConsultaCedula({ estado: null, mensaje: '' })

    try {
      const data = await servicio.consultarCedula(cedula)

      if (data.existeInterno && data.persona) {
        const p = data.persona
        setPersona((prev) => ({
          ...prev,
          cedula: p.cedula || cedula,
          nombre_completo: p.nombre_completo || '',
        }))
        setConsultaCedula({
          estado: 'interno',
          mensaje: 'Esta identificación ya está registrada en el sistema. No puede volver a registrarse.',
        })
        return
      }

      if (data.encontradoExterno && data.persona) {
        const p = data.persona
        setPersona((prev) => ({
          ...prev,
          cedula: p.cedula || cedula,
          nombre_completo: p.nombre_completo || '',
        }))
        setConsultaCedula({
          estado: 'hacienda',
          mensaje: 'Nombre obtenido desde Hacienda. Complete correo, teléfono, dirección y demás datos.',
        })
        return
      }

      if (notificarHaciendaIndisponible(toast, data)) {
        setConsultaCedula({ estado: 'manual', mensaje: MENSAJE_NOMBRE_MANUAL })
      } else {
        setConsultaCedula({
          estado: 'no_encontrado',
          mensaje: data.mensaje || 'No se encontró en Hacienda. Ingrese el nombre completo manualmente.',
        })
      }
    } catch (error) {
      if (notificarHaciendaIndisponible(toast, null, error)) {
        setConsultaCedula({ estado: 'manual', mensaje: MENSAJE_NOMBRE_MANUAL })
      } else {
        setConsultaCedula({
          estado: 'manual',
          mensaje: `${msgErr(error)} Puede ingresar el nombre manualmente.`,
        })
      }
    } finally {
      setBuscandoCedula(false)
    }
  }

  const agregarPersonas = async () => {
    if (consultaCedula.estado === 'interno') {
      setStatus({
        type: 'error',
        message: 'La identificación ingresada ya pertenece a una persona registrada.',
      })
      return
    }
    try {
      setLoading(true)
      setStatus({ type: "", message: "" })
      const body = { ...persona }
      if (persona.nombre_rol === 'profesor') {
        body.materias_habilitadas = materiasNuevoDocente
      }
      await servicio.postPersonas(body)
      setStatus({ type: "success", message: "Persona registrada correctamente" })
      setPersona({
        nombre_completo: "",
        cedula: "",
        correo: "",
        telefono: "",
        direccion: "",
        fecha_nacimiento: "",
        nombre_rol: ""
      })
      setMateriasNuevoDocente([])
      setConsultaCedula({ estado: null, mensaje: '' })
      cargarCatalogos()
    } catch (error) {
      console.error("Error al registrar:", error)
      setStatus({ type: "error", message: msgErr(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent/10 p-6 flex flex-col items-center gap-8">
      <Card className="w-full max-w-2xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Registro de Personas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Registre docentes, orientadores y tutores legales. Los estudiantes se crean únicamente en Matrícula;
            los administradores operativos, desde el panel del Super Administrador.
            Para ajustar materias habilitadas de docentes ya registrados, use Asignación de Materias.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {status.message && (
            <Alert className={status.type === "error" ? "border-destructive/20 bg-destructive/5" : "border-emerald-500/20 bg-emerald-500/5"}>
              <AlertDescription className={status.type === "error" ? "text-destructive" : "text-emerald-700"}>
                {status.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Identificación (Cédula o DIMEX)</Label>
              <div className="relative">
                <Input
                  name="cedula"
                  value={persona.cedula}
                  onChange={onCedulaChange}
                  onBlur={consultarCedulaIdentificacion}
                  placeholder="Cédula o DIMEX"
                  required
                  disabled={buscandoCedula}
                />
                {buscandoCedula && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {consultaCedula.mensaje && (
                <p
                  className={`text-xs ${
                    consultaCedula.estado === 'interno'
                      ? 'text-destructive'
                      : consultaCedula.estado === 'hacienda'
                        ? 'text-emerald-700'
                        : 'text-muted-foreground'
                  }`}
                >
                  {consultaCedula.mensaje}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                name="nombre_completo"
                value={persona.nombre_completo}
                onChange={enviarPersona}
                placeholder={buscandoCedula ? 'Consultando Hacienda...' : 'Nombre completo'}
                required
                readOnly={consultaCedula.estado === 'hacienda'}
              />
            </div>
            <div className="space-y-2">
              <Label>Correo</Label>
              <Input name='correo' type='email' value={persona.correo} onChange={enviarPersona} placeholder='correo@ejemplo.com' required />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input name='telefono' type='text' value={persona.telefono} onChange={enviarPersona} placeholder='Número de teléfono' required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Dirección</Label>
              <Textarea
                name="direccion"
                id="direccion"
                maxLength={250}
                placeholder="Digite su dirección"
                value={persona.direccion}
                onChange={enviarPersona}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de nacimiento</Label>
              <Input name='fecha_nacimiento' type='date' value={persona.fecha_nacimiento} onChange={enviarPersona} required />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                name="nombre_rol"
                id="rol"
                value={persona.nombre_rol}
                onChange={enviarPersona}
                required
              >
                <option value="">Seleccione un rol</option>
                <option value="profesor">Docente</option>
                <option value="orientador">Orientador</option>
                <option value="padre_de_familia">Padre de familia / Tutor</option>
              </Select>
            </div>
          </div>

          {persona.nombre_rol === 'profesor' && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <Label className="text-base">Materias habilitadas (formación)</Label>
              <p className="text-xs text-muted-foreground">
                Obligatorio al menos una. Solo podrá asignársele carga en estas materias (regla estricta).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {materiasCatalogo.map((m) => (
                  <label key={m.id_materia} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={materiasNuevoDocente.includes(m.id_materia)}
                      onChange={() => toggleMateriaNuevo(m.id_materia)}
                    />
                    {m.nombre_materia}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button onClick={agregarPersonas} disabled={loading || buscandoCedula || consultaCedula.estado === 'interno'}>
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default RegistroPersonas
