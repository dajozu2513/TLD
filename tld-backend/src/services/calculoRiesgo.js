// =========================================================================
// Motor de cálculo del cuestionario ISO/IEC 27002
// Traduce a Node.js la misma metodología documentada en la Parte 1 (PDF,
// secciones 6 y 7) y que hoy vive solo en el navegador (js/iso-cuestionario.js).
// Ahora corre en el servidor para que el resultado se pueda persistir.
// =========================================================================

/**
 * Calcula el nivel de madurez (0-5) de un control a partir de sus respuestas.
 * @param {Array<{valor_respuesta: 'SI'|'NO'|'NA'}>} respuestas
 * @returns {{estado: string, madurez: number|null, cumplimiento: number|null, exposicion: number|null}}
 */
function calcularControl(respuestas) {
  const respondidas = respuestas.filter((r) => r.valor_respuesta);
  if (respondidas.length < 3) {
    return { estado: "incompleto", madurez: null, cumplimiento: null, exposicion: null };
  }

  const naCount = respondidas.filter((r) => r.valor_respuesta === "NA").length;
  if (naCount === 3) {
    return { estado: "no_aplica", madurez: null, cumplimiento: null, exposicion: null };
  }

  const aplicables = respondidas.filter((r) => r.valor_respuesta === "SI" || r.valor_respuesta === "NO");
  const siCount = respondidas.filter((r) => r.valor_respuesta === "SI").length;

  const madurez = Math.round((siCount / aplicables.length) * 5);
  const cumplimiento = (madurez / 5) * 100;
  const exposicion = 100 - cumplimiento;

  return { estado: "evaluado", madurez, cumplimiento, exposicion };
}

function riesgoDe(exposicion) {
  if (exposicion <= 20) return "Muy bajo";
  if (exposicion <= 40) return "Bajo";
  if (exposicion <= 60) return "Medio";
  if (exposicion <= 80) return "Alto";
  return "Crítico";
}

/**
 * Calcula el reporte completo de una auditoría.
 * @param {Array} controles  catálogo con {id_control, id_dominio, peso, dimensiones:['C','I'], preguntas:[{id_pregunta}]}
 * @param {Array} respuestas  respuestas guardadas [{id_pregunta, valor_respuesta}]
 * @param {Array} dominios   [{id_dominio, nombre_dominio}]
 */
function calcularReporte(controles, respuestas, dominios) {
  const respuestasPorPregunta = new Map(respuestas.map((r) => [r.id_pregunta, r]));

  const resultadosControl = controles.map((c) => {
    const respsControl = c.preguntas.map((p) => respuestasPorPregunta.get(p.id_pregunta) || {});
    const calc = calcularControl(respsControl);
    return { ...c, ...calc };
  });

  const evaluados = resultadosControl.filter((r) => r.estado === "evaluado");

  const exposicionPorDimension = (codigo) => {
    const ctrls = evaluados.filter((r) => r.dimensiones.includes(codigo));
    if (!ctrls.length) return null;
    return ctrls.reduce((acc, c) => acc + c.exposicion, 0) / ctrls.length;
  };

  const expC = exposicionPorDimension("C");
  const expI = exposicionPorDimension("I");
  const expD = exposicionPorDimension("D");
  const validas = [expC, expI, expD].filter((v) => v !== null);
  const indiceGeneral = validas.length ? validas.reduce((a, b) => a + b, 0) / validas.length : null;

  const resultadosDominio = dominios.map((d) => {
    const ctrls = evaluados.filter((r) => r.id_dominio === d.id_dominio);
    if (!ctrls.length) {
      return {
        id_dominio: d.id_dominio,
        nombre_dominio: d.nombre_dominio,
        evaluados: 0,
        nivel_madurez_promedio: null,
        porcentaje_cumplimiento: null,
        exposicion_confidencialidad: null,
        exposicion_integridad: null,
        exposicion_disponibilidad: null,
      };
    }
    const sumPeso = ctrls.reduce((a, c) => a + Number(c.peso), 0);
    const madurezPonderada = ctrls.reduce((a, c) => a + c.madurez * Number(c.peso), 0) / sumPeso;
    return {
      id_dominio: d.id_dominio,
      nombre_dominio: d.nombre_dominio,
      evaluados: ctrls.length,
      nivel_madurez_promedio: madurezPonderada,
      porcentaje_cumplimiento: (madurezPonderada / 5) * 100,
    };
  });

  return {
    resultadosControl,
    resultadosDominio,
    resumen: {
      exposicion_confidencialidad: expC,
      exposicion_integridad: expI,
      exposicion_disponibilidad: expD,
      indice_general_riesgo: indiceGeneral,
      riesgo_general: indiceGeneral !== null ? riesgoDe(indiceGeneral) : null,
      controles_evaluados: evaluados.length,
      controles_totales: controles.length,
    },
  };
}

module.exports = { calcularControl, calcularReporte, riesgoDe };
