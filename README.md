# Salud Cerebral — PWA

Evaluación educativa de factores de riesgo de demencia, para la Unidad de
Memoria del Hospital Salvador. Migración de la versión original en MIT App
Inventor a una **Progressive Web App** (HTML + CSS + JavaScript, sin
frameworks ni build step).

## Por qué PWA en vez de App Inventor

- Lógica de cálculo en JavaScript real, sin las limitaciones de los
  bloques visuales (más fácil de auditar y de corregir, como el bug de
  doble ponderación de la v0.8).
- Funciona offline gracias al *service worker* (cachea el shell de la app).
- Se puede "instalar" en el celular desde el navegador, sin pasar por una
  tienda de apps.
- Un solo código fuente sirve para Android, iOS y escritorio.

## Estructura

```
index.html        → estructura de las 4 pantallas (inicio, pregunta, resultado, historial)
styles.css        → diseño visual
calculo.js         → motor de cálculo PAF (independiente, sin tocar el DOM)
app.js             → wizard, navegación, persistencia (equivalente a TinyDB)
manifest.json      → metadatos de instalación
service-worker.js → cacheo offline
offline.html       → pantalla de respaldo sin conexión
icon-192.png / icon-512.png / favicon.svg → íconos
```

## Modelos epidemiológicos implementados

### Lancet Commission 2024 (global, 14 factores)
PAF no ponderado por factor; al combinar, cada uno se multiplica por su
peso `(1 − comunalidad)` antes de aplicar la fórmula multiplicativa.

### Paradela et al. 2024 (Chile, 12 factores)
El PAF de cada factor que publican los autores **ya viene ponderado**.
Por eso, al combinarlo, **no se vuelve a multiplicar por el peso** — hacerlo
sería ponderar dos veces y subestimaría el riesgo (el bug corregido en la
v0.8 de la documentación del proyecto).

> **Nota de transparencia:** incluso con la corrección, el modelo Chile
> aplicado a un paciente individual no reproduce exactamente el 61.8% que
> Paradela et al. reportan como PAF poblacional combinado total — ese
> número viene del método estadístico completo de los autores, no de esta
> fórmula simplificada. El 61.8% es solo referencia poblacional de contexto,
> no una meta que el cálculo individual deba igualar.

### Fórmula combinada (igual para ambos modelos)

```
producto = 1
para cada factor presente en el paciente:
    si aplicarPeso:  producto *= (1 - peso * PAF)
    si no:           producto *= (1 - PAF)
resultado = (1 - producto) * 100
```

### Cut-points clínicos usados

| Factor | Punto de corte | Fuente |
|---|---|---|
| Hipertensión | Sistólica ≥ 130 mmHg | Lancet 2024 |
| LDL alto | ≥ 130 mg/dL | Corte clínico estándar |
| Alcohol excesivo | > 12 unidades US/semana | Lancet 2024 |
| Obesidad | IMC ≥ 30 kg/m² | OMS |

## Persistencia de datos (Fase 1 — actual)

Se usa `localStorage` del navegador como equivalente directo de TinyDB:

- `paciente_actual_id` — último ID usado
- `historial_<ID>_<fecha>` — un registro JSON por evaluación
- `indice_<ID>` — lista de fechas evaluadas por ese paciente

Los datos quedan **solo en el dispositivo** del paciente; no se envían a
ningún servidor.

**Límites a tener en cuenta:**

- **Espacio:** `localStorage` permite entre 5 y 10 MB por sitio, según el
  navegador. Cada evaluación pesa pocos KB, así que en la práctica esto
  alcanza para miles de registros — no es un límite relevante para este
  proyecto.
- **Tiempo:** este es el límite real. Safari en iOS aplica *Intelligent
  Tracking Prevention*: si el paciente no abre la app durante **7 días
  seguidos**, el sistema puede borrar automáticamente todo lo guardado en
  `localStorage` para ese sitio. Chrome en Android no tiene esta política
  y es mucho más permisivo, pero tampoco garantiza persistencia indefinida
  si el usuario borra datos de navegación o desinstala la PWA.
- Por esto, **el historial actual debe entenderse como una conveniencia de
  corto/mediano plazo para el propio paciente**, no como un registro
  clínico permanente. Para evaluaciones espaciadas por meses (el caso de
  uso real de la Unidad de Memoria), conviene migrar a la Fase 2 antes de
  usarlo en producción.

## Fase 2 — Historial en la nube (futuro, no implementado aún)

La meta a futuro es que el historial no viva solo en el celular del
paciente, sino en una base de datos accesible para el equipo clínico de
la Unidad de Memoria, que pueda revisar la evolución de cualquier
paciente desde cualquier dispositivo.

### Por qué la arquitectura actual ya está lista para esto

Todo el acceso a datos en `app.js` pasa por un único objeto, `DB`:

```javascript
const DB = {
  get(tag, valorPorDefecto)     { ... },
  set(tag, valor)                { ... },
  getJSON(tag, valorPorDefecto) { ... },
  setJSON(tag, valor)            { ... }
};
```

El wizard, el cálculo PAF y las pantallas de historial **nunca llaman a
`localStorage` directamente** — siempre pasan por `DB.get()` / `DB.set()`.
Esto significa que migrar a la nube no requiere reescribir la app: solo
hay que cambiar **qué hacen esas cuatro funciones por dentro** (que en vez
de leer/escribir en el navegador, hagan una petición a un servidor). El
resto del código queda igual.

### Qué se necesita agregar para dar el salto

1. **Backend + base de datos.** Opciones razonables para un proyecto de
   este tamaño, sin tener que programar ni mantener un servidor desde
   cero: **Supabase** o **Firebase** (ambos ofrecen base de datos,
   autenticación y un nivel gratuito suficiente para pilotos clínicos).
2. **Autenticación real.** Hoy el "ID de paciente" es un texto libre sin
   validación — cualquiera podría escribir el ID de otra persona y ver
   sus datos. En la nube esto deja de ser aceptable; se necesita login
   (aunque sea simple, tipo código de acceso por paciente) antes de
   exponer datos de salud reales.
3. **Panel separado para el equipo clínico**, con su propio login, que
   consulte evaluaciones de todos los pacientes en vez de uno solo (la
   app actual está pensada desde la perspectiva del paciente, no del
   médico).
4. **Reescribir el objeto `DB`** para que hable con ese backend en lugar
   de `localStorage`. El resto de `app.js` y `calculo.js` no cambia.
5. Revisar implicancias de **datos de salud y privacidad** (anonimización
   del ID, cifrado en tránsito, quién puede acceder a qué) antes de
   manejar pacientes reales, no solo datos de prueba.

### Lo que NO cambia en esta migración

- `calculo.js` completo (motor de cálculo PAF) — es independiente del
  almacenamiento.
- El wizard de 13 preguntas y su lógica de navegación.
- El diseño visual y la experiencia del paciente.

## Cómo probarla localmente

No se puede abrir `index.html` directamente con doble clic (el service
worker requiere `http://` o `https://`). Hay que servirla con cualquier
servidor estático, por ejemplo:

```bash
cd app-salud-cerebral
python3 -m http.server 8080
# abrir http://localhost:8080 en el navegador
```

## Cómo publicarla (para que puedas instalarla en tu celular)

La opción más simple es **GitHub Pages**, ya que el proyecto ya vive en un
repo de GitHub:

1. Sube esta carpeta al repo `mobile-dev-demos` (o a uno nuevo).
2. En GitHub → Settings → Pages → Source: selecciona la rama y carpeta.
3. GitHub te da una URL `https://<usuario>.github.io/<repo>/`.
4. Abre esa URL desde el celular → aparece el aviso "Instalar Salud
   Cerebral" → queda como ícono en la pantalla de inicio, funcionando
   offline.

## Advertencia clínica

Esta herramienta entrega estimaciones poblacionales de fracción atribuible
(PAF), **no un diagnóstico ni una probabilidad individual exacta** de
desarrollar demencia. Debe presentarse al paciente como herramienta
educativa e indicativa, para conversar con su equipo de salud — no como
sustituto de evaluación clínica.
