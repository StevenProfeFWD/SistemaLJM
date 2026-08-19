import dotenv from 'dotenv';
dotenv.config();

function connectionFromEnv() {
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

const shared = {
  client: 'pg',
  connection: connectionFromEnv(),
  migrations: {
    directory: './src/migrations',
  },
  seeds: {
    directory: './src/seeds',
  },
  pool: {
    min: 0,
    max: 10,
  },
};

const config = {
  development: { ...shared },
  production: {
    ...shared,
    pool: {
      min: 2,
      max: 20,
    },
  },
};

export default config;
