-- 29: Revocación de JWT (logout / invalidación anticipada de sesión)
CREATE TABLE IF NOT EXISTS jwt_revocado (
    jti VARCHAR(64) PRIMARY KEY,
    id_persona INTEGER REFERENCES persona(id_persona) ON DELETE SET NULL,
    revocado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_en TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jwt_revocado_expira_en ON jwt_revocado (expira_en);
