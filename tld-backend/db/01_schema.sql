-- =====================================================================
-- EIF402 - Proyecto Integrador (parte 2)
-- Script de creacion de base de datos - PostgreSQL 15+
-- Migracion del diseno original en Oracle (Parte 1) a PostgreSQL,
-- segun indicacion del profesor de trabajar de forma local.
--
-- Equivalencias usadas en la migracion Oracle -> PostgreSQL:
--   NUMBER GENERATED ALWAYS AS IDENTITY -> INTEGER GENERATED ALWAYS AS IDENTITY
--   VARCHAR2(n)                         -> VARCHAR(n)
--   NUMBER(p,s)                         -> NUMERIC(p,s)
--   NUMBER(1)                           -> SMALLINT
--   DATE (con hora, uso interno Oracle) -> TIMESTAMP
--   DATE (fecha pura, ej. fecha_auditoria) -> DATE
--   DEFAULT SYSDATE                     -> DEFAULT CURRENT_TIMESTAMP / CURRENT_DATE
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROL
-- ---------------------------------------------------------------------
CREATE TABLE ROL (
    id_rol      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_rol  VARCHAR(60) NOT NULL,
    descripcion VARCHAR(200),
    CONSTRAINT uq_rol_nombre UNIQUE (nombre_rol)
);

-- ---------------------------------------------------------------------
-- 2. USUARIO
-- ---------------------------------------------------------------------
CREATE TABLE USUARIO (
    id_usuario       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_rol           INTEGER NOT NULL REFERENCES ROL (id_rol),
    nombre_completo  VARCHAR(120) NOT NULL,
    correo           VARCHAR(120) NOT NULL,
    usuario_login    VARCHAR(50)  NOT NULL,
    contrasena_hash  VARCHAR(255) NOT NULL,
    estado           VARCHAR(15)  NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_usuario_correo UNIQUE (correo),
    CONSTRAINT uq_usuario_login UNIQUE (usuario_login),
    CONSTRAINT ck_usuario_estado CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);
CREATE INDEX ix_usuario_rol ON USUARIO (id_rol);

-- ---------------------------------------------------------------------
-- 3. ORGANIZACION
-- ---------------------------------------------------------------------
CREATE TABLE ORGANIZACION (
    id_organizacion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    sector          VARCHAR(80),
    ubicacion       VARCHAR(150),
    estado          VARCHAR(15) NOT NULL DEFAULT 'ACTIVA',
    CONSTRAINT ck_organizacion_estado CHECK (estado IN ('ACTIVA', 'INACTIVA'))
);

-- ---------------------------------------------------------------------
-- 4. CONTACTO_ORGANIZACION
-- ---------------------------------------------------------------------
CREATE TABLE CONTACTO_ORGANIZACION (
    id_contacto     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_organizacion INTEGER NOT NULL REFERENCES ORGANIZACION (id_organizacion),
    nombre          VARCHAR(120) NOT NULL,
    cargo           VARCHAR(80),
    correo          VARCHAR(120),
    telefono        VARCHAR(20)
);
CREATE INDEX ix_contacto_org_org ON CONTACTO_ORGANIZACION (id_organizacion);

-- ---------------------------------------------------------------------
-- 5. DOMINIO_ISO
-- ---------------------------------------------------------------------
CREATE TABLE DOMINIO_ISO (
    id_dominio     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_dominio VARCHAR(10) NOT NULL,
    nombre_dominio VARCHAR(150) NOT NULL,
    descripcion    VARCHAR(500),
    CONSTRAINT uq_dominio_codigo UNIQUE (codigo_dominio)
);

-- ---------------------------------------------------------------------
-- 6. CONTROL
-- ---------------------------------------------------------------------
CREATE TABLE CONTROL (
    id_control     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_dominio     INTEGER NOT NULL REFERENCES DOMINIO_ISO (id_dominio),
    codigo_control VARCHAR(15) NOT NULL,
    nombre_control VARCHAR(150) NOT NULL,
    objetivo       VARCHAR(500),
    descripcion    VARCHAR(1000),
    peso           NUMERIC(4, 2) NOT NULL,
    CONSTRAINT uq_control_codigo UNIQUE (codigo_control),
    CONSTRAINT ck_control_peso CHECK (peso > 0)
);
CREATE INDEX ix_control_dominio ON CONTROL (id_dominio);

-- ---------------------------------------------------------------------
-- 7. DIMENSION_RIESGO
-- ---------------------------------------------------------------------
CREATE TABLE DIMENSION_RIESGO (
    id_dimension INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo       VARCHAR(1) NOT NULL,
    nombre       VARCHAR(30) NOT NULL,
    CONSTRAINT uq_dimension_codigo UNIQUE (codigo),
    CONSTRAINT ck_dimension_codigo CHECK (codigo IN ('C', 'I', 'D'))
);

-- ---------------------------------------------------------------------
-- 8. CONTROL_DIMENSION (tabla asociativa)
-- ---------------------------------------------------------------------
CREATE TABLE CONTROL_DIMENSION (
    id_control    INTEGER NOT NULL REFERENCES CONTROL (id_control),
    id_dimension  INTEGER NOT NULL REFERENCES DIMENSION_RIESGO (id_dimension),
    nivel_impacto SMALLINT NOT NULL,
    PRIMARY KEY (id_control, id_dimension),
    CONSTRAINT ck_control_dim_impacto CHECK (nivel_impacto BETWEEN 0 AND 5)
);
CREATE INDEX ix_control_dim_dimension ON CONTROL_DIMENSION (id_dimension);

-- ---------------------------------------------------------------------
-- 9. PREGUNTA
-- ---------------------------------------------------------------------
CREATE TABLE PREGUNTA (
    id_pregunta    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_control     INTEGER NOT NULL REFERENCES CONTROL (id_control),
    texto_pregunta VARCHAR(500) NOT NULL,
    orden          SMALLINT NOT NULL
);
CREATE INDEX ix_pregunta_control ON PREGUNTA (id_control);

-- ---------------------------------------------------------------------
-- 10. AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE AUDITORIA (
    id_auditoria       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_organizacion    INTEGER NOT NULL REFERENCES ORGANIZACION (id_organizacion),
    id_auditor         INTEGER NOT NULL REFERENCES USUARIO (id_usuario),
    id_contacto_dba    INTEGER REFERENCES CONTACTO_ORGANIZACION (id_contacto),
    area_evaluada      VARCHAR(150) NOT NULL,
    fecha_auditoria    DATE NOT NULL,
    estado             VARCHAR(20) NOT NULL DEFAULT 'EN_PROGRESO',
    fecha_creacion     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_finalizacion TIMESTAMP,
    CONSTRAINT ck_auditoria_estado CHECK (estado IN ('EN_PROGRESO', 'FINALIZADA'))
);
CREATE INDEX ix_auditoria_org ON AUDITORIA (id_organizacion);
CREATE INDEX ix_auditoria_auditor ON AUDITORIA (id_auditor);
CREATE INDEX ix_auditoria_contacto ON AUDITORIA (id_contacto_dba);

-- ---------------------------------------------------------------------
-- 11. RESPUESTA
-- ---------------------------------------------------------------------
CREATE TABLE RESPUESTA (
    id_respuesta    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria    INTEGER NOT NULL REFERENCES AUDITORIA (id_auditoria),
    id_pregunta     INTEGER NOT NULL REFERENCES PREGUNTA (id_pregunta),
    valor_respuesta VARCHAR(2) NOT NULL,
    observaciones   VARCHAR(1000),
    fecha_respuesta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_respuesta_auditoria_pregunta UNIQUE (id_auditoria, id_pregunta),
    CONSTRAINT ck_respuesta_valor CHECK (valor_respuesta IN ('SI', 'NO', 'NA'))
);
CREATE INDEX ix_respuesta_pregunta ON RESPUESTA (id_pregunta);

-- ---------------------------------------------------------------------
-- 12. EVIDENCIA
-- ---------------------------------------------------------------------
CREATE TABLE EVIDENCIA (
    id_evidencia   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_respuesta   INTEGER NOT NULL REFERENCES RESPUESTA (id_respuesta),
    nombre_archivo VARCHAR(200) NOT NULL,
    ruta_archivo   VARCHAR(500) NOT NULL,
    descripcion    VARCHAR(300),
    fecha_carga    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_evidencia_respuesta ON EVIDENCIA (id_respuesta);

-- ---------------------------------------------------------------------
-- 13. RESULTADO_CONTROL
-- ---------------------------------------------------------------------
CREATE TABLE RESULTADO_CONTROL (
    id_resultado_control        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria                INTEGER NOT NULL REFERENCES AUDITORIA (id_auditoria),
    id_control                  INTEGER NOT NULL REFERENCES CONTROL (id_control),
    nivel_madurez                SMALLINT NOT NULL,
    porcentaje_cumplimiento     NUMERIC(5, 2) NOT NULL,
    exposicion_confidencialidad NUMERIC(5, 2) NOT NULL,
    exposicion_integridad       NUMERIC(5, 2) NOT NULL,
    exposicion_disponibilidad   NUMERIC(5, 2) NOT NULL,
    CONSTRAINT uq_resultado_control_aud_ctrl UNIQUE (id_auditoria, id_control),
    CONSTRAINT ck_resultado_control_madurez CHECK (nivel_madurez BETWEEN 0 AND 5)
);
CREATE INDEX ix_resultado_control_control ON RESULTADO_CONTROL (id_control);

-- ---------------------------------------------------------------------
-- 14. RESULTADO_DOMINIO
-- ---------------------------------------------------------------------
CREATE TABLE RESULTADO_DOMINIO (
    id_resultado_dominio        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria                INTEGER NOT NULL REFERENCES AUDITORIA (id_auditoria),
    id_dominio                  INTEGER NOT NULL REFERENCES DOMINIO_ISO (id_dominio),
    porcentaje_cumplimiento     NUMERIC(5, 2) NOT NULL,
    nivel_madurez_promedio      NUMERIC(3, 2) NOT NULL,
    exposicion_confidencialidad NUMERIC(5, 2) NOT NULL,
    exposicion_integridad       NUMERIC(5, 2) NOT NULL,
    exposicion_disponibilidad   NUMERIC(5, 2) NOT NULL,
    CONSTRAINT uq_resultado_dominio_aud_dom UNIQUE (id_auditoria, id_dominio)
);
CREATE INDEX ix_resultado_dominio_dominio ON RESULTADO_DOMINIO (id_dominio);

-- ---------------------------------------------------------------------
-- 15. RESULTADO_AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE RESULTADO_AUDITORIA (
    id_resultado_auditoria      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria                INTEGER NOT NULL UNIQUE REFERENCES AUDITORIA (id_auditoria),
    exposicion_confidencialidad NUMERIC(5, 2) NOT NULL,
    exposicion_integridad       NUMERIC(5, 2) NOT NULL,
    exposicion_disponibilidad   NUMERIC(5, 2) NOT NULL,
    indice_general_riesgo       NUMERIC(5, 2) NOT NULL,
    fecha_calculo                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- Catalogos base del sistema
-- =====================================================================
INSERT INTO ROL (nombre_rol, descripcion) VALUES
('Administrador', 'Administra usuarios, organizaciones y el catalogo de controles'),
('Auditor', 'Ejecuta auditorias y registra respuestas del cuestionario'),
('Consulta', 'Accede unicamente a reportes e indicadores');

INSERT INTO DIMENSION_RIESGO (codigo, nombre) VALUES
('C', 'Confidencialidad'),
('I', 'Integridad'),
('D', 'Disponibilidad');
