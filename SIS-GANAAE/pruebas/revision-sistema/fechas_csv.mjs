import { parseFechaNacimiento } from '../../backend-node/src/utils/csvPrecarga.js';
const casos = ['2010-01-01','2010-02-31','31/02/2010','29/02/2012','29/02/2011','2010-01-01 00:00:00','2010-01-01T00:00:00.000Z','2010-01-01T00:00:00-06:00','2010-01-01T00:00:00+00:00','1/1/2010','01-13-2010','0000-01-01','2010-01-01 12:00:00 a. m.',' 2010-01-01 '];
for (const c of casos) console.log(JSON.stringify(c), '=>', parseFechaNacimiento(c));
