import dotenv from 'dotenv';

dotenv.config();

const configJWT = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
};

if (!configJWT.jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  configJWT.jwtSecret = 'clave-jwt';
}

export default configJWT;
