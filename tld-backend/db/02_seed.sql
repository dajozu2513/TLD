-- =====================================================================
-- Datos semilla: dominios, controles, preguntas y matriz control-dimension
-- Corresponde a los 15 controles justificados en la seccion 4 del PDF
-- y usados originalmente en el arreglo CONTROLES de js/iso-cuestionario.js
-- =====================================================================

INSERT INTO DOMINIO_ISO (codigo_dominio, nombre_dominio) VALUES
('ORG', 'Organizacional'),
('TEC', 'Tecnológico'),
('FIS', 'Físico');

-- Control ISO 5.9 - Inventario de activos
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.9', 'Inventario de activos', 3
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que el inventario de activos de información se aplica, aunque sea de forma informal?', 1),
    ('¿El inventario de activos de información está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿El inventario de activos de información se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.9';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.9' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.9' AND d.codigo = 'I';

-- Control ISO 5.12 - Clasificación de la información
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.12', 'Clasificación de la información', 3
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la clasificación de la información se aplica, aunque sea de forma informal?', 1),
    ('¿La clasificación de la información está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La clasificación de la información se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.12';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.12' AND d.codigo = 'C';

-- Control ISO 5.16 - Gestión de identidades
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.16', 'Gestión de identidades', 4
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la gestión de identidades de usuario se aplica, aunque sea de forma informal?', 1),
    ('¿La gestión de identidades de usuario está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La gestión de identidades de usuario se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.16';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.16' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.16' AND d.codigo = 'I';

-- Control ISO 5.15 - Control de acceso
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.15', 'Control de acceso', 5
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que el control de acceso a la base de datos se aplica, aunque sea de forma informal?', 1),
    ('¿El control de acceso a la base de datos está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿El control de acceso a la base de datos se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.15';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.15' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.15' AND d.codigo = 'I';

-- Control ISO 8.5 - Autenticación
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.5', 'Autenticación', 5
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la autenticación de usuarios se aplica, aunque sea de forma informal?', 1),
    ('¿La autenticación de usuarios está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La autenticación de usuarios se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.5';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.5' AND d.codigo = 'C';

-- Control ISO 8.15/8.16 - Registro y monitoreo
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.15/8.16', 'Registro y monitoreo', 4
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que el registro y monitoreo de eventos se aplica, aunque sea de forma informal?', 1),
    ('¿El registro y monitoreo de eventos está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿El registro y monitoreo de eventos se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.15/8.16';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.15/8.16' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.15/8.16' AND d.codigo = 'I';

-- Control ISO 8.9 - Gestión de configuraciones
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.9', 'Gestión de configuraciones', 4
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la gestión segura de configuraciones del motor de base de datos se aplica, aunque sea de forma informal?', 1),
    ('¿La gestión segura de configuraciones del motor de base de datos está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La gestión segura de configuraciones del motor de base de datos se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.9';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.9' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.9' AND d.codigo = 'I';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.9' AND d.codigo = 'D';

-- Control ISO 8.13 - Copias de seguridad
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.13', 'Copias de seguridad', 5
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que el respaldo (copias de seguridad) de la información se aplica, aunque sea de forma informal?', 1),
    ('¿El respaldo (copias de seguridad) de la información está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿El respaldo (copias de seguridad) de la información se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.13';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.13' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.13' AND d.codigo = 'I';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.13' AND d.codigo = 'D';

-- Control ISO 5.30 - Recuperación ante desastres
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.30', 'Recuperación ante desastres', 4
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que el plan de recuperación ante desastres se aplica, aunque sea de forma informal?', 1),
    ('¿El plan de recuperación ante desastres está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿El plan de recuperación ante desastres se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.30';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.30' AND d.codigo = 'D';

-- Control ISO 8.24 - Cifrado de la información
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.24', 'Cifrado de la información', 5
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que el cifrado de la información se aplica, aunque sea de forma informal?', 1),
    ('¿El cifrado de la información está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿El cifrado de la información se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.24';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.24' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.24' AND d.codigo = 'I';

-- Control ISO 8.10 - Eliminación segura de la información
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.10', 'Eliminación segura de la información', 3
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la eliminación segura de la información se aplica, aunque sea de forma informal?', 1),
    ('¿La eliminación segura de la información está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La eliminación segura de la información se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.10';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.10' AND d.codigo = 'C';

-- Control ISO 8.12 - Prevención de fuga de datos
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '8.12', 'Prevención de fuga de datos', 4
FROM DOMINIO_ISO WHERE codigo_dominio = 'TEC';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la prevención de fuga de datos (DLP) se aplica, aunque sea de forma informal?', 1),
    ('¿La prevención de fuga de datos (DLP) está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La prevención de fuga de datos (DLP) se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '8.12';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '8.12' AND d.codigo = 'C';

-- Control ISO 7.1 - Seguridad física
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '7.1', 'Seguridad física', 3
FROM DOMINIO_ISO WHERE codigo_dominio = 'FIS';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la seguridad física de los servidores de base de datos se aplica, aunque sea de forma informal?', 1),
    ('¿La seguridad física de los servidores de base de datos está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La seguridad física de los servidores de base de datos se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '7.1';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '7.1' AND d.codigo = 'D';

-- Control ISO 5.19 - Seguridad con proveedores
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.19', 'Seguridad con proveedores', 3
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la seguridad con proveedores externos se aplica, aunque sea de forma informal?', 1),
    ('¿La seguridad con proveedores externos está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La seguridad con proveedores externos se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.19';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.19' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.19' AND d.codigo = 'I';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.19' AND d.codigo = 'D';

-- Control ISO 5.29 - Continuidad del negocio
INSERT INTO CONTROL (id_dominio, codigo_control, nombre_control, peso)
SELECT id_dominio, '5.29', 'Continuidad del negocio', 4
FROM DOMINIO_ISO WHERE codigo_dominio = 'ORG';
INSERT INTO PREGUNTA (id_control, texto_pregunta, orden)
SELECT id_control, v.texto, v.orden
FROM CONTROL c
CROSS JOIN (VALUES
    ('¿Existe evidencia de que la continuidad del negocio se aplica, aunque sea de forma informal?', 1),
    ('¿La continuidad del negocio está documentado(a) y aplicado(a) de forma consistente en la organización?', 2),
    ('¿La continuidad del negocio se supervisa, mide y mejora continuamente?', 3)
) AS v(texto, orden)
WHERE c.codigo_control = '5.29';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.29' AND d.codigo = 'C';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.29' AND d.codigo = 'I';
INSERT INTO CONTROL_DIMENSION (id_control, id_dimension, nivel_impacto)
SELECT c.id_control, d.id_dimension, 1
FROM CONTROL c, DIMENSION_RIESGO d
WHERE c.codigo_control = '5.29' AND d.codigo = 'D';
