-- =====================================================================
-- EIF402 - Proyecto Integrador (parte 2)
-- Script de creacion de base de datos - Oracle Database (XE u otra edicion)
-- Version original del diseno (Parte 1), ejecutable directamente contra
-- una instancia Oracle local (SQL*Plus, SQLcl o SQL Developer).
--
-- Equivalencias usadas:
--   INTEGER GENERATED ALWAYS AS IDENTITY -> NUMBER GENERATED ALWAYS AS IDENTITY
--   VARCHAR(n)                           -> VARCHAR2(n)
--   NUMERIC(p,s)                         -> NUMBER(p,s)
--   SMALLINT                             -> NUMBER(2)
--   TIMESTAMP / DATE                     -> TIMESTAMP / DATE (igual)
--   DEFAULT CURRENT_TIMESTAMP            -> igual en Oracle
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROL
-- ---------------------------------------------------------------------
CREATE TABLE ROL (
    id_rol      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_rol  VARCHAR2(60) NOT NULL,
    descripcion VARCHAR2(200),
    CONSTRAINT uq_rol_nombre UNIQUE (nombre_rol)
);

-- ---------------------------------------------------------------------
-- 2. USUARIO
-- ---------------------------------------------------------------------
CREATE TABLE USUARIO (
    id_usuario       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_rol           NUMBER NOT NULL REFERENCES ROL (id_rol),
    nombre_completo  VARCHAR2(120) NOT NULL,
    correo           VARCHAR2(120) NOT NULL,
    usuario_login    VARCHAR2(50)  NOT NULL,
    contrasena_hash  VARCHAR2(255) NOT NULL,
    estado           VARCHAR2(15)  DEFAULT 'ACTIVO' NOT NULL,
    fecha_creacion   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_usuario_correo UNIQUE (correo),
    CONSTRAINT uq_usuario_login UNIQUE (usuario_login),
    CONSTRAINT ck_usuario_estado CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);
CREATE INDEX ix_usuario_rol ON USUARIO (id_rol);

-- ---------------------------------------------------------------------
-- 3. ORGANIZACION
-- ---------------------------------------------------------------------
CREATE TABLE ORGANIZACION (
    id_organizacion NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR2(150) NOT NULL,
    sector          VARCHAR2(80),
    ubicacion       VARCHAR2(150),
    estado          VARCHAR2(15) DEFAULT 'ACTIVA' NOT NULL,
    CONSTRAINT ck_organizacion_estado CHECK (estado IN ('ACTIVA', 'INACTIVA'))
);

-- ---------------------------------------------------------------------
-- 4. CONTACTO_ORGANIZACION
-- ---------------------------------------------------------------------
CREATE TABLE CONTACTO_ORGANIZACION (
    id_contacto     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_organizacion NUMBER NOT NULL REFERENCES ORGANIZACION (id_organizacion),
    nombre          VARCHAR2(120) NOT NULL,
    cargo           VARCHAR2(80),
    correo          VARCHAR2(120),
    telefono        VARCHAR2(20)
);
CREATE INDEX ix_contacto_org_org ON CONTACTO_ORGANIZACION (id_organizacion);

-- ---------------------------------------------------------------------
-- 5. DOMINIO_ISO
-- ---------------------------------------------------------------------
CREATE TABLE DOMINIO_ISO (
    id_dominio     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_dominio VARCHAR2(10) NOT NULL,
    nombre_dominio VARCHAR2(150) NOT NULL,
    descripcion    VARCHAR2(500),
    CONSTRAINT uq_dominio_codigo UNIQUE (codigo_dominio)
);

-- ---------------------------------------------------------------------
-- 6. CONTROL
-- ---------------------------------------------------------------------
CREATE TABLE CONTROL (
    id_control     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_dominio     NUMBER NOT NULL REFERENCES DOMINIO_ISO (id_dominio),
    codigo_control VARCHAR2(15) NOT NULL,
    nombre_control VARCHAR2(150) NOT NULL,
    objetivo       VARCHAR2(500),
    descripcion    VARCHAR2(1000),
    peso           NUMBER(4, 2) NOT NULL,
    CONSTRAINT uq_control_codigo UNIQUE (codigo_control),
    CONSTRAINT ck_control_peso CHECK (peso > 0)
);
CREATE INDEX ix_control_dominio ON CONTROL (id_dominio);

-- ---------------------------------------------------------------------
-- 7. DIMENSION_RIESGO
-- ---------------------------------------------------------------------
CREATE TABLE DIMENSION_RIESGO (
    id_dimension NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo       VARCHAR2(1) NOT NULL,
    nombre       VARCHAR2(30) NOT NULL,
    CONSTRAINT uq_dimension_codigo UNIQUE (codigo),
    CONSTRAINT ck_dimension_codigo CHECK (codigo IN ('C', 'I', 'D'))
);

-- ---------------------------------------------------------------------
-- 8. CONTROL_DIMENSION (tabla asociativa)
-- ---------------------------------------------------------------------
CREATE TABLE CONTROL_DIMENSION (
    id_control    NUMBER NOT NULL REFERENCES CONTROL (id_control),
    id_dimension  NUMBER NOT NULL REFERENCES DIMENSION_RIESGO (id_dimension),
    nivel_impacto NUMBER(2) NOT NULL,
    PRIMARY KEY (id_control, id_dimension),
    CONSTRAINT ck_control_dim_impacto CHECK (nivel_impacto BETWEEN 0 AND 5)
);
CREATE INDEX ix_control_dim_dimension ON CONTROL_DIMENSION (id_dimension);

-- ---------------------------------------------------------------------
-- 9. PREGUNTA
-- ---------------------------------------------------------------------
CREATE TABLE PREGUNTA (
    id_pregunta    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_control     NUMBER NOT NULL REFERENCES CONTROL (id_control),
    texto_pregunta VARCHAR2(500) NOT NULL,
    orden          NUMBER(2) NOT NULL
);
CREATE INDEX ix_pregunta_control ON PREGUNTA (id_control);

-- ---------------------------------------------------------------------
-- 10. AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE AUDITORIA (
    id_auditoria       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_organizacion    NUMBER NOT NULL REFERENCES ORGANIZACION (id_organizacion),
    id_auditor         NUMBER NOT NULL REFERENCES USUARIO (id_usuario),
    id_contacto_dba    NUMBER REFERENCES CONTACTO_ORGANIZACION (id_contacto),
    area_evaluada      VARCHAR2(150) NOT NULL,
    fecha_auditoria    DATE NOT NULL,
    estado             VARCHAR2(20) DEFAULT 'EN_PROGRESO' NOT NULL,
    fecha_creacion     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
    id_respuesta    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria    NUMBER NOT NULL REFERENCES AUDITORIA (id_auditoria),
    id_pregunta     NUMBER NOT NULL REFERENCES PREGUNTA (id_pregunta),
    valor_respuesta VARCHAR2(2) NOT NULL,
    observaciones   VARCHAR2(1000),
    fecha_respuesta TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_respuesta_auditoria_pregunta UNIQUE (id_auditoria, id_pregunta),
    CONSTRAINT ck_respuesta_valor CHECK (valor_respuesta IN ('SI', 'NO', 'NA'))
);
CREATE INDEX ix_respuesta_pregunta ON RESPUESTA (id_pregunta);

-- ---------------------------------------------------------------------
-- 12. EVIDENCIA
-- ---------------------------------------------------------------------
CREATE TABLE EVIDENCIA (
    id_evidencia   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_respuesta   NUMBER NOT NULL REFERENCES RESPUESTA (id_respuesta),
    nombre_archivo VARCHAR2(200) NOT NULL,
    ruta_archivo   VARCHAR2(500) NOT NULL,
    descripcion    VARCHAR2(300),
    fecha_carga    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX ix_evidencia_respuesta ON EVIDENCIA (id_respuesta);

-- ---------------------------------------------------------------------
-- 13. RESULTADO_CONTROL
-- ---------------------------------------------------------------------
CREATE TABLE RESULTADO_CONTROL (
    id_resultado_control        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria                NUMBER NOT NULL REFERENCES AUDITORIA (id_auditoria),
    id_control                  NUMBER NOT NULL REFERENCES CONTROL (id_control),
    nivel_madurez                NUMBER(2) NOT NULL,
    porcentaje_cumplimiento     NUMBER(5, 2) NOT NULL,
    exposicion_confidencialidad NUMBER(5, 2) NOT NULL,
    exposicion_integridad       NUMBER(5, 2) NOT NULL,
    exposicion_disponibilidad   NUMBER(5, 2) NOT NULL,
    CONSTRAINT uq_resultado_control_aud_ctrl UNIQUE (id_auditoria, id_control),
    CONSTRAINT ck_resultado_control_madurez CHECK (nivel_madurez BETWEEN 0 AND 5)
);
CREATE INDEX ix_resultado_control_control ON RESULTADO_CONTROL (id_control);

-- ---------------------------------------------------------------------
-- 14. RESULTADO_DOMINIO
-- ---------------------------------------------------------------------
CREATE TABLE RESULTADO_DOMINIO (
    id_resultado_dominio        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria                NUMBER NOT NULL REFERENCES AUDITORIA (id_auditoria),
    id_dominio                  NUMBER NOT NULL REFERENCES DOMINIO_ISO (id_dominio),
    porcentaje_cumplimiento     NUMBER(5, 2) NOT NULL,
    nivel_madurez_promedio      NUMBER(3, 2) NOT NULL,
    exposicion_confidencialidad NUMBER(5, 2) NOT NULL,
    exposicion_integridad       NUMBER(5, 2) NOT NULL,
    exposicion_disponibilidad   NUMBER(5, 2) NOT NULL,
    CONSTRAINT uq_resultado_dominio_aud_dom UNIQUE (id_auditoria, id_dominio)
);
CREATE INDEX ix_resultado_dominio_dominio ON RESULTADO_DOMINIO (id_dominio);

-- ---------------------------------------------------------------------
-- 15. RESULTADO_AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE RESULTADO_AUDITORIA (
    id_resultado_auditoria      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_auditoria                NUMBER NOT NULL UNIQUE REFERENCES AUDITORIA (id_auditoria),
    exposicion_confidencialidad NUMBER(5, 2) NOT NULL,
    exposicion_integridad       NUMBER(5, 2) NOT NULL,
    exposicion_disponibilidad   NUMBER(5, 2) NOT NULL,
    indice_general_riesgo       NUMBER(5, 2) NOT NULL,
    fecha_calculo                TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- =====================================================================
-- Catalogos base del sistema
-- (Oracle no soporta INSERT ... VALUES (a),(b),(c) multi-fila: una
-- sentencia por fila)
-- =====================================================================
INSERT INTO ROL (nombre_rol, descripcion) VALUES
    ('Administrador', 'Administra usuarios, organizaciones y el catalogo de controles');
INSERT INTO ROL (nombre_rol, descripcion) VALUES
    ('Auditor', 'Ejecuta auditorias y registra respuestas del cuestionario');
INSERT INTO ROL (nombre_rol, descripcion) VALUES
    ('Consulta', 'Accede unicamente a reportes e indicadores');

INSERT INTO DIMENSION_RIESGO (codigo, nombre) VALUES ('C', 'Confidencialidad');
INSERT INTO DIMENSION_RIESGO (codigo, nombre) VALUES ('I', 'Integridad');
INSERT INTO DIMENSION_RIESGO (codigo, nombre) VALUES ('D', 'Disponibilidad');

COMMIT;
