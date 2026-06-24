/* =========================================================================
   App Salud Cerebral — Lógica de la aplicación (wizard + persistencia)

   Equivale a las 16 pantallas de App Inventor del manual, pero como una
   sola página con pantallas que se muestran/ocultan (sin recargas).
   TinyDB se reemplaza por localStorage (mismo concepto: persistencia
   simple por clave, ahora también disponible en cualquier navegador).
   ========================================================================= */

(function () {
  "use strict";

  const { evaluarRiesgo, CUTPOINTS } = window.SaludCerebralCalculo;

  // -----------------------------------------------------------------------
  // 1.2 — Definición de las 13 preguntas, en el orden del wizard.
  // Cada pregunta sabe su propio tipo (sino | numero | pesotalla) y su tag.
  // -----------------------------------------------------------------------
  const PREGUNTAS = [
    {
      tag: "edad", tipo: "numero", categoria: "Datos generales",
      texto: "¿Cuál es tu edad?", unidad: "años", placeholder: "Ej: 68"
    },
    {
      tag: "educacion", tipo: "sino-invertido", categoria: "Educación",
      texto: "¿Completaste la educación secundaria?",
      ayuda: "Si respondes Sí, este factor no se considera de riesgo."
    },
    {
      tag: "audicion", tipo: "sino", categoria: "Audición",
      texto: "¿Tienes dificultad para escuchar?"
    },
    {
      tag: "presion", tipo: "numero", categoria: "Presión arterial",
      texto: "¿Cuál es tu presión arterial sistólica?", unidad: "mmHg",
      placeholder: "Ej: 130",
      ayuda: `Se considera hipertensión desde ${CUTPOINTS.hipertension.valor} mmHg.`
    },
    {
      tag: "ldl", tipo: "numero", categoria: "Colesterol",
      texto: "¿Cuál es tu colesterol LDL?", unidad: "mg/dL",
      placeholder: "Si no lo sabes, escribe 0",
      ayuda: `Se considera LDL alto desde ${CUTPOINTS.ldl.valor} mg/dL. Si no lo sabes, escribe 0.`
    },
    {
      tag: "depresion", tipo: "sino", categoria: "Salud mental",
      texto: "¿Un médico te ha diagnosticado depresión?"
    },
    {
      tag: "tec", tipo: "sino", categoria: "Antecedentes",
      texto: "¿Has tenido un golpe fuerte en la cabeza con pérdida de conciencia?"
    },
    {
      tag: "actividad", tipo: "sino", categoria: "Actividad física",
      texto: "¿Caminas o haces ejercicio varias veces por semana?",
      ayuda: "Responder Sí es protector frente al riesgo de demencia."
    },
    {
      tag: "tabaco", tipo: "sino", categoria: "Tabaco",
      texto: "¿Fumas actualmente?"
    },
    {
      tag: "diabetes", tipo: "sino", categoria: "Diabetes",
      texto: "¿Tienes diabetes?"
    },
    {
      tag: "alcohol", tipo: "numero", categoria: "Alcohol",
      texto: "¿Cuántos vasos de alcohol tomas por semana?", unidad: "vasos/semana",
      placeholder: "Ej: 4",
      ayuda: `Se considera consumo excesivo sobre ${CUTPOINTS.alcohol.valor} unidades US/semana.`
    },
    {
      tag: "aislamiento", tipo: "sino", categoria: "Vida social",
      texto: "¿Vives solo/a?"
    },
    {
      tag: "vision", tipo: "sino", categoria: "Visión",
      texto: "¿Tienes problemas para ver que no estén corregidos con lentes?"
    },
    {
      tag: "pesotalla", tipo: "pesotalla", categoria: "Peso y talla",
      texto: "Para calcular tu IMC, necesitamos tu peso y talla",
      ayuda: `Se considera obesidad desde un IMC de ${CUTPOINTS.obesidad.valor} kg/m².`
    }
  ];

  const TOTAL_PREGUNTAS = PREGUNTAS.length;

  // -----------------------------------------------------------------------
  // Estado en memoria del recorrido actual
  // -----------------------------------------------------------------------
  let indicePreguntaActual = 0;
  let respuestasTemp = {};
  let pacienteActualId = "";

  // -----------------------------------------------------------------------
  // Persistencia (equivalente a TinyDB1.GetValue / StoreValue)
  // -----------------------------------------------------------------------
  const DB = {
    get(tag, valorPorDefecto) {
      const v = localStorage.getItem(tag);
      return v === null ? valorPorDefecto : v;
    },
    set(tag, valor) {
      localStorage.setItem(tag, valor);
    },
    getJSON(tag, valorPorDefecto) {
      const v = localStorage.getItem(tag);
      if (v === null) return valorPorDefecto;
      try { return JSON.parse(v); } catch { return valorPorDefecto; }
    },
    setJSON(tag, valor) {
      localStorage.setItem(tag, JSON.stringify(valor));
    }
  };

  // -----------------------------------------------------------------------
  // Referencias DOM
  // -----------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const pantallas = {
    inicio: $("pantallaInicio"),
    pregunta: $("pantallaPregunta"),
    resultado: $("pantallaResultado"),
    historial: $("pantallaHistorial")
  };

  const topbar = $("topbar");
  const progresoRelleno = $("progresoRelleno");
  const progresoPie = $("progresoPie");
  const progresoTexto = $("progresoTexto");
  const progresoCamino = $("progresoCamino");

  function mostrarPantalla(nombre) {
    Object.values(pantallas).forEach(p => p.classList.remove("activa"));
    pantallas[nombre].classList.add("activa");
    topbar.hidden = nombre !== "pregunta";
    window.scrollTo(0, 0);
  }

  function actualizarProgreso() {
    const pct = (indicePreguntaActual / (TOTAL_PREGUNTAS - 1)) * 100;
    progresoRelleno.style.width = pct + "%";
    progresoPie.style.left = `calc(14px + (100% - 28px) * ${indicePreguntaActual / (TOTAL_PREGUNTAS - 1)})`;
    progresoTexto.textContent = `Pregunta ${indicePreguntaActual + 1} de ${TOTAL_PREGUNTAS}`;
    progresoCamino.setAttribute("aria-valuenow", String(indicePreguntaActual + 1));
  }

  // -----------------------------------------------------------------------
  // PASO 2 — Pantalla de inicio
  // -----------------------------------------------------------------------
  const campoId = $("campoId");
  const errorInicio = $("errorInicio");

  function validarId() {
    if (campoId.value.trim() === "") {
      errorInicio.textContent = "Por favor ingresa tu ID";
      return false;
    }
    errorInicio.textContent = "";
    return true;
  }

  $("btnNuevaEvaluacion").addEventListener("click", () => {
    if (!validarId()) return;
    pacienteActualId = campoId.value.trim();
    DB.set("paciente_actual_id", pacienteActualId);
    iniciarWizard();
  });

  $("btnVerHistorial").addEventListener("click", () => {
    if (!validarId()) return;
    pacienteActualId = campoId.value.trim();
    DB.set("paciente_actual_id", pacienteActualId);
    mostrarHistorial();
  });

  // -----------------------------------------------------------------------
  // PASO 3-5 — Wizard de preguntas (genérico para los 13 tipos)
  // -----------------------------------------------------------------------
  const preguntaCategoria = $("preguntaCategoria");
  const preguntaTexto = $("preguntaTexto");
  const preguntaAyuda = $("preguntaAyuda");
  const opcionesSiNo = $("opcionesSiNo");
  const opcionesNumero = $("opcionesNumero");
  const opcionesPesoTalla = $("opcionesPesoTalla");
  const errorPregunta = $("errorPregunta");

  const campoNumero = $("campoNumero");
  const numeroEtiqueta = $("numeroEtiqueta");
  const numeroUnidad = $("numeroUnidad");
  const campoPeso = $("campoPeso");
  const campoTalla = $("campoTalla");

  function iniciarWizard() {
    indicePreguntaActual = 0;
    respuestasTemp = {};
    mostrarPantalla("pregunta");
    renderizarPregunta();
  }

  function renderizarPregunta() {
    const p = PREGUNTAS[indicePreguntaActual];
    errorPregunta.textContent = "";

    preguntaCategoria.textContent = p.categoria;
    preguntaTexto.textContent = p.texto;
    preguntaAyuda.textContent = p.ayuda || "";
    preguntaAyuda.style.display = p.ayuda ? "block" : "none";

    opcionesSiNo.hidden = true;
    opcionesNumero.hidden = true;
    opcionesPesoTalla.hidden = true;

    if (p.tipo === "sino" || p.tipo === "sino-invertido") {
      opcionesSiNo.hidden = false;
    } else if (p.tipo === "numero") {
      opcionesNumero.hidden = false;
      numeroEtiqueta.textContent = p.placeholder || "Valor";
      numeroUnidad.textContent = p.unidad || "";
      campoNumero.value = respuestasTemp[p.tag] ?? "";
      setTimeout(() => campoNumero.focus({ preventScroll: true }), 50);
    } else if (p.tipo === "pesotalla") {
      opcionesPesoTalla.hidden = false;
      campoPeso.value = respuestasTemp.peso ?? "";
      campoTalla.value = respuestasTemp.talla ?? "";
    }

    actualizarProgreso();
  }

  function avanzarPregunta() {
    if (indicePreguntaActual < TOTAL_PREGUNTAS - 1) {
      indicePreguntaActual++;
      renderizarPregunta();
    } else {
      finalizarEvaluacion();
    }
  }

  function retrocederPregunta() {
    if (indicePreguntaActual > 0) {
      indicePreguntaActual--;
      renderizarPregunta();
    } else {
      mostrarPantalla("inicio");
    }
  }

  $("btnAtras").addEventListener("click", retrocederPregunta);

  // --- Sí/No ---
  $("btnSi").addEventListener("click", () => {
    const p = PREGUNTAS[indicePreguntaActual];
    // 4.2 — ScreenEducacion es el caso invertido: Sí = 0 (no es factor)
    respuestasTemp[p.tag] = p.tipo === "sino-invertido" ? 0 : 1;
    avanzarPregunta();
  });

  $("btnNo").addEventListener("click", () => {
    const p = PREGUNTAS[indicePreguntaActual];
    respuestasTemp[p.tag] = p.tipo === "sino-invertido" ? 1 : 0;
    avanzarPregunta();
  });

  // --- Numérico ---
  $("btnSiguienteNumero").addEventListener("click", () => {
    const p = PREGUNTAS[indicePreguntaActual];
    const valor = campoNumero.value.trim();
    if (valor === "" || isNaN(Number(valor))) {
      errorPregunta.textContent = "Por favor ingresa un número";
      return;
    }
    respuestasTemp[p.tag] = Number(valor);
    avanzarPregunta();
  });

  campoNumero.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btnSiguienteNumero").click();
  });

  // --- Peso/Talla ---
  $("btnSiguientePesoTalla").addEventListener("click", () => {
    if (campoPeso.value.trim() === "" || campoTalla.value.trim() === "") {
      errorPregunta.textContent = "Completa ambos datos";
      return;
    }
    respuestasTemp.peso = Number(campoPeso.value);
    respuestasTemp.talla = Number(campoTalla.value);
    avanzarPregunta();
  });

  // -----------------------------------------------------------------------
  // PASO 6-9 — Calcular resultado al llegar al final del wizard
  // -----------------------------------------------------------------------
  const valorLancet = $("valorLancet");
  const valorChile = $("valorChile");
  const anilloLancetCirculo = $("anilloLancetCirculo");
  const anilloChileCirculo = $("anilloChileCirculo");
  const listaFactoresDetectados = $("listaFactoresDetectados");

  const CIRCUNFERENCIA = 2 * Math.PI * 52; // r=52, igual que el SVG

  const NOMBRES_LEGIBLES = {
    educacion: "Baja escolaridad", audicion: "Pérdida auditiva", ldl: "LDL alto",
    depresion: "Depresión", tec: "Trauma craneal", actividad: "Inactividad física",
    tabaco: "Tabaquismo", diabetes: "Diabetes", hipertension: "Hipertensión",
    obesidad: "Obesidad", alcohol: "Alcohol excesivo", aislamiento: "Aislamiento social",
    contaminacion: "Contaminación ambiental", vision: "Visión no corregida"
  };

  function finalizarEvaluacion() {
    const resultado = evaluarRiesgo(respuestasTemp);
    mostrarResultado(resultado);
    guardarEnHistorial(resultado);
    mostrarPantalla("resultado");
  }

  function mostrarResultado(resultado) {
    valorLancet.textContent = resultado.pafLancet + "%";
    valorChile.textContent = resultado.pafChile + "%";

    const offsetLancet = CIRCUNFERENCIA * (1 - resultado.pafLancet / 100);
    const offsetChile = CIRCUNFERENCIA * (1 - resultado.pafChile / 100);
    anilloLancetCirculo.style.strokeDasharray = CIRCUNFERENCIA;
    anilloLancetCirculo.style.strokeDashoffset = CIRCUNFERENCIA;
    anilloChileCirculo.style.strokeDasharray = CIRCUNFERENCIA;
    anilloChileCirculo.style.strokeDashoffset = CIRCUNFERENCIA;
    requestAnimationFrame(() => {
      anilloLancetCirculo.style.strokeDashoffset = offsetLancet;
      anilloChileCirculo.style.strokeDashoffset = offsetChile;
    });

    const factoresUnicos = [...new Set([
      ...resultado.factoresPresentesLancet,
      ...resultado.factoresPresentesChile
    ])].filter(f => f !== "contaminacion");

    listaFactoresDetectados.innerHTML = factoresUnicos.length
      ? factoresUnicos.map(f => `<span class="factor-chip">${NOMBRES_LEGIBLES[f] || f}</span>`).join("")
      : `<span class="factor-chip">No se detectaron factores modificables presentes</span>`;
  }

  // -----------------------------------------------------------------------
  // PASO 10 — Guardar evaluación en historial + índice de fechas
  // -----------------------------------------------------------------------
  function fechaHoyFormateada() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function guardarEnHistorial(resultado) {
    const fechaHoy = fechaHoyFormateada();
    const claveHistorial = `historial_${pacienteActualId}_${fechaHoy}`;

    const registroCompleto = {
      idPaciente: pacienteActualId,
      fecha: fechaHoy,
      pafLancet: resultado.pafLancet,
      pafChile: resultado.pafChile,
      estados: resultado.estados
    };

    DB.setJSON(claveHistorial, registroCompleto);

    const claveIndice = `indice_${pacienteActualId}`;
    const indiceActual = DB.getJSON(claveIndice, []);
    indiceActual.push(fechaHoy);
    DB.setJSON(claveIndice, indiceActual);
  }

  $("btnVolverInicio").addEventListener("click", () => {
    mostrarPantalla("inicio");
  });

  // -----------------------------------------------------------------------
  // PASO 11 — Historial
  // -----------------------------------------------------------------------
  const listaHistorial = $("listaHistorial");
  const historialVacio = $("historialVacio");
  const historialIdPaciente = $("historialIdPaciente");

  function mostrarHistorial() {
    historialIdPaciente.textContent = `Paciente: ${pacienteActualId}`;
    const claveIndice = `indice_${pacienteActualId}`;
    const fechas = DB.getJSON(claveIndice, []);

    listaHistorial.innerHTML = "";

    if (fechas.length === 0) {
      historialVacio.hidden = false;
    } else {
      historialVacio.hidden = true;
      // más recientes primero
      [...fechas].reverse().forEach(fecha => {
        const claveReg = `historial_${pacienteActualId}_${fecha}`;
        const registro = DB.getJSON(claveReg, null);
        if (!registro) return;

        const item = document.createElement("div");
        item.className = "historial-item";
        item.innerHTML = `
          <div class="historial-fecha">${fecha}</div>
          <div class="historial-valores">
            <span>Lancet: ${registro.pafLancet}%</span>
            <span>Chile: ${registro.pafChile}%</span>
          </div>
        `;
        listaHistorial.appendChild(item);
      });
    }

    mostrarPantalla("historial");
  }

  $("btnVolverDesdeHistorial").addEventListener("click", () => {
    mostrarPantalla("inicio");
  });

  // -----------------------------------------------------------------------
  // Restaurar último ID de paciente usado, si existe
  // -----------------------------------------------------------------------
  const idGuardado = DB.get("paciente_actual_id", "");
  if (idGuardado) {
    campoId.value = idGuardado;
    pacienteActualId = idGuardado;
  }

  // -----------------------------------------------------------------------
  // PWA: registrar service worker + banner de instalación
  // -----------------------------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        // si falla el registro (p.ej. en file://), la app sigue funcionando online
      });
    });
  }

  let eventoInstalacionDiferido = null;
  const instalarBanner = $("instalarBanner");
  const instalarTexto = $("instalarTexto");
  const btnInstalar = $("btnInstalar");

  // iOS/iPadOS (Safari) no dispara "beforeinstallprompt" y no tiene forma
  // de instalar con un solo botón desde la página, así que en iPhone/iPad
  // no se muestra ningún aviso de instalación.
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Ya instalada como app standalone: no mostrar nada.
  const yaInstalada = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  // Si el usuario ya cerró el aviso antes en este dispositivo, no insistir.
  const avisoYaCerrado = DB.get("aviso_instalar_cerrado", null) === "1";

  function mostrarBannerInstalacion() {
    if (esIOS || yaInstalada || avisoYaCerrado) return;

    instalarTexto.textContent = "Instala Salud Cerebral en tu celular para usarla sin conexión.";
    btnInstalar.hidden = false;
    instalarBanner.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoInstalacionDiferido = e;
    mostrarBannerInstalacion();
  });

  btnInstalar.addEventListener("click", async () => {
    if (!eventoInstalacionDiferido) return;
    eventoInstalacionDiferido.prompt();
    await eventoInstalacionDiferido.userChoice;
    eventoInstalacionDiferido = null;
    instalarBanner.hidden = true;
  });

  $("btnCerrarInstalar").addEventListener("click", () => {
    instalarBanner.hidden = true;
    DB.set("aviso_instalar_cerrado", "1");
  });

})();
