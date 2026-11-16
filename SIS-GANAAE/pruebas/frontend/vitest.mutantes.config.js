// Configuración para "mutation testing" manual: sustituye la página EPI por un mutante (copia en ./mutantes).
import path from 'node:path';
import base from './vitest.config.js';
const m = process.env.MUTANTE;
if (!m) throw new Error('Defina MUTANTE=M1..M8');
export default {
  ...base,
  resolve: {
    ...base.resolve,
    alias: [
      { find: /^lucide-react$/, replacement: path.resolve(process.cwd(), '../../frontend-reactjs/node_modules/lucide-react/dist/esm/lucide-react.js') },
      { find: /^@\/pages\/epi\/ReportesAsistenciaEpi$/, replacement: path.resolve(process.cwd(), `mutantes/${m}.jsx`) }, ...base.resolve.alias],
  },
};
