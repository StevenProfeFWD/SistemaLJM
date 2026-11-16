// Variables de entorno SOLO de prueba. Nunca se usa backend-node/.env.
process.env.NODE_ENV = process.env.NODE_ENV_TEST || 'test';
process.env.JWT_SECRET = 'secreto-de-prueba-epi-qa';
process.env.COOKIE_ENCRYPTION_KEY = 'clave-cifrado-cookie-de-prueba-qa-0123456789';
process.env.DATABASE_URL = 'postgres://nunca:usar@127.0.0.1:1/no_existe';
