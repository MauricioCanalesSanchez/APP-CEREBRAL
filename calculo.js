/* =========================================================================
   App Salud Cerebral — Motor de cálculo de riesgo de demencia
   Unidad de Memoria, Hospital Salvador

   Implementa dos modelos epidemiológicos de fracción atribuible
   poblacional (PAF) combinada:
     - Lancet Commission 2024 (global, 14 factores)
     - Paradela et al. 2024 (Chile, 12 factores)

   Traducido 1:1 desde el manual de bloques de MIT App Inventor
   (Manual_AppInventor_SaludCerebral_v2), incluyendo la corrección
   del bug de doble ponderación documentado en la v0.8.
   ========================================================================= */

// -------------------------------------------------------------------------
// 6.2 — Tabla Lancet 2024 (14 factores, modelo global)
// El orden de las tres listas es crítico: la posición i de cada lista
// describe al mismo factor en las tres.
// -------------------------------------------------------------------------
const LISTA_FACTORES_LANCET = [
  "educacion", "audicion", "ldl", "depresion", "tec", "actividad",
  "tabaco", "diabetes", "hipertension", "obesidad", "alcohol",
  "aislamiento", "contaminacion", "vision"
];

const PAF_LANCET = [
  0.122, 0.191, 0.187, 0.083, 0.078, 0.064,
  0.063, 0.064, 0.059, 0.038, 0.026,
  0.126, 0.070, 0.060
];

const COMUNALIDAD_LANCET = [
  0.608, 0.609, 0.469, 0.452, 0.423, 0.567,
  0.650, 0.493, 0.595, 0.622, 0.772,
  0.408, 0.341, 0.553
];

// -------------------------------------------------------------------------
// 6.3 — Tabla Paradela et al. 2024 (12 factores, modelo Chile)
// Sin LDL ni visión: no están incluidos en este paper.
// -------------------------------------------------------------------------
const LISTA_FACTORES_CHILE = [
  "educacion", "hipertension", "obesidad", "audicion", "tec",
  "alcohol", "tabaco", "depresion", "aislamiento", "actividad",
  "diabetes", "contaminacion"
];

const PAF_CHILE = [
  0.014, 0.083, 0.088, 0.066, 0.038,
  0.020, 0.026, 0.072, 0.050, 0.077,
  0.049, 0.034
];

const COMUNALIDAD_CHILE = [
  0.293, 0.288, 0.468, 0.487, 0.363,
  0.423, 0.462, 0.360, 0.255, 0.284,
  0.284, 0.386
];

// -------------------------------------------------------------------------
// 7.1 — Cut-points clínicos usados para convertir valores numéricos en
// presencia/ausencia (0/1) del factor de riesgo.
// -------------------------------------------------------------------------
const CUTPOINTS = {
  hipertension: { valor: 130, comparador: ">=", unidad: "mmHg sistólica" },
  ldl: { valor: 130, comparador: ">=", unidad: "mg/dL" },
  alcohol: { valor: 12, comparador: ">", unidad: "unidades US/semana" },
  obesidad: { valor: 30, comparador: ">=", unidad: "kg/m² (IMC)" }
};

/**
 * 7.2 — Construye el objeto Estado_x (0/1) de los 14 factores a partir
 * de las respuestas crudas del cuestionario.
 *
 * `respuestas` espera estas claves (mismos nombres que los tags de
 * TinyDB en el manual, sin el prefijo eval_temp_):
 *   educacion (0/1), audicion (0/1), depresion (0/1), tec (0/1),
 *   tabaco (0/1), diabetes (0/1), aislamiento (0/1), vision (0/1),
 *   actividad (0/1 — 1 = SÍ hace ejercicio, se invierte internamente),
 *   presion (número, sistólica), ldl (número, 0 = no lo sé),
 *   alcohol (número, vasos/semana), peso (kg), talla (cm)
 */
function calcularEstados(respuestas) {
  const r = respuestas;

  const estados = {
    // --- Factores Sí/No directos ---
    educacion: Number(r.educacion) || 0,
    audicion: Number(r.audicion) || 0,
    depresion: Number(r.depresion) || 0,
    tec: Number(r.tec) || 0,
    tabaco: Number(r.tabaco) || 0,
    diabetes: Number(r.diabetes) || 0,
    aislamiento: Number(r.aislamiento) || 0,
    vision: Number(r.vision) || 0,

    // --- Actividad es inversa: Sí hace ejercicio = NO inactividad ---
    actividad: Number(r.actividad) === 1 ? 0 : 1,

    // --- Contaminación: fija, constante para Santiago ---
    contaminacion: 1
  };

  // --- Presión arterial: cut-point 130 mmHg ---
  estados.hipertension = (Number(r.presion) || 0) >= CUTPOINTS.hipertension.valor ? 1 : 0;

  // --- LDL: cut-point 130 mg/dL (0 = "no lo sé", nunca activa el factor) ---
  estados.ldl = (Number(r.ldl) || 0) >= CUTPOINTS.ldl.valor ? 1 : 0;

  // --- Alcohol: cut-point > 12 unidades US/semana ---
  estados.alcohol = (Number(r.alcohol) || 0) > CUTPOINTS.alcohol.valor ? 1 : 0;

  // --- Obesidad: IMC = peso / (talla en metros)^2 ---
  const pesoKg = Number(r.peso) || 0;
  const tallaCm = Number(r.talla) || 0;
  let imc = 0;
  if (tallaCm > 0) {
    const tallaM = tallaCm / 100;
    imc = pesoKg / (tallaM * tallaM);
  }
  estados.obesidad = imc >= CUTPOINTS.obesidad.valor ? 1 : 0;
  estados.imcCalculado = Math.round(imc * 10) / 10;

  return estados;
}

/**
 * 8.2 — CalcularPAF: fórmula multiplicativa combinada.
 *
 * result = (1 - producto de (1 - peso*PAF) para cada factor presente) * 100
 *
 * aplicarPeso = true  → multiplica cada PAF por (1 - comunalidad) antes
 *                        de combinar. Usar SOLO con PAF no ponderado
 *                        (Lancet).
 * aplicarPeso = false → usa el PAF tal cual viene (ya ponderado por los
 *                        propios autores). Usar con Chile/Paradela.
 *
 * Aplicar peso a un PAF que YA viene ponderado (Chile) sería ponderar
 * dos veces y subestimaría el riesgo — ese es el bug que se corrigió
 * en la v0.8 del proyecto.
 */
function calcularPAF(listaNombres, listaPAF, listaComunalidad, estados, aplicarPeso) {
  let producto = 1;

  for (let i = 0; i < listaNombres.length; i++) {
    const nombreFactor = listaNombres[i];
    const pafFactor = listaPAF[i];
    const comFactor = listaComunalidad[i];
    const pesoFactor = 1 - comFactor;
    const estadoFactor = estados[nombreFactor] ?? 0;

    if (estadoFactor === 1) {
      if (aplicarPeso) {
        producto *= (1 - (pesoFactor * pafFactor));
      } else {
        producto *= (1 - pafFactor);
      }
    }
    // si estadoFactor === 0, producto no cambia: el factor no está presente
  }

  return (1 - producto) * 100;
}

/**
 * Punto de entrada principal: recibe las respuestas crudas del
 * cuestionario y devuelve ambos resultados PAF más el detalle de
 * estados, listo para mostrar y guardar en el historial.
 */
function evaluarRiesgo(respuestas) {
  const estados = calcularEstados(respuestas);

  const pafLancet = calcularPAF(
    LISTA_FACTORES_LANCET, PAF_LANCET, COMUNALIDAD_LANCET,
    estados, /* aplicarPeso = */ true
  );

  const pafChile = calcularPAF(
    LISTA_FACTORES_CHILE, PAF_CHILE, COMUNALIDAD_CHILE,
    estados, /* aplicarPeso = */ false
  );

  return {
    pafLancet: Math.round(pafLancet * 10) / 10,
    pafChile: Math.round(pafChile * 10) / 10,
    estados,
    factoresPresentesLancet: LISTA_FACTORES_LANCET.filter(f => estados[f] === 1),
    factoresPresentesChile: LISTA_FACTORES_CHILE.filter(f => estados[f] === 1)
  };
}

// Exponer en window para uso desde app.js (sin módulos ES para máxima
// compatibilidad offline con el service worker)
window.SaludCerebralCalculo = {
  LISTA_FACTORES_LANCET,
  PAF_LANCET,
  COMUNALIDAD_LANCET,
  LISTA_FACTORES_CHILE,
  PAF_CHILE,
  COMUNALIDAD_CHILE,
  CUTPOINTS,
  calcularEstados,
  calcularPAF,
  evaluarRiesgo
};
