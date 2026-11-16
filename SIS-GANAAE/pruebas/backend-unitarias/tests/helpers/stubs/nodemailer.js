// Stub de nodemailer: nunca abre conexiones SMTP. Registra los correos "enviados".
export const enviados = [];
export const transportes = [];
let falla = null;
export function setFalla(err) {
  falla = err;
}
export function createTransport(opts) {
  transportes.push(opts);
  return {
    sendMail: async (msg) => {
      if (falla) throw falla;
      enviados.push(msg);
      return { messageId: `<prueba-${enviados.length}@local>` };
    },
  };
}
export default { createTransport };
