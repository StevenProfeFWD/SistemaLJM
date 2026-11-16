// Stub de dotenv: impide cargar backend-node/.env (credenciales de BD reales) durante las pruebas.
export const config = () => ({ parsed: {} });
export default { config };
