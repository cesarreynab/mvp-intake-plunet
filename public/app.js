/* ============================================================================
   Intake de solicitudes en Plunet · lógica de la interfaz (contrato 1.0-plunet)

   Adaptado del app.js del Kit MVP. Qué hace este archivo, en orden:
     1. Lee la configuración (config.js) y prepara la pantalla.
     2. Comprueba si el backend responde (GET /api/health). Con ?demo=1 usa respuestas guardadas.
     3. Valida el correo y lo envía (POST /api/intake).
     4. Dibuja el borrador del Request, la evidencia de cada campo y los pasos del workflow.

   Regla de seguridad: todo texto que viene del backend entra a la página con textContent
   (la función el() de abajo), nunca con innerHTML. Si el correo o el modelo traen etiquetas HTML
   o scripts, se ven como texto y no se ejecutan.
   ============================================================================ */
(function () {
  'use strict';

  const C = window.MESA_CONFIG;
  if (!C) {
    document.body.textContent = 'Falta config.js: la interfaz no puede iniciar.';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RUTAS = ['A', 'B', 'R', 'C', 'D'];
  const ESTADOS = ['pendiente_revision', 'cola_manual', 'fuera_de_alcance'];
  // Las insignias reutilizan los colores del kit: verde, humano (naranja) y neutro.
  const CLASE_ESTADO = { pendiente_revision: 'respondida', cola_manual: 'requiere_humano', fuera_de_alcance: 'fuera_de_alcance' };
  const ICONO_ESTADO = { pendiente_revision: 'check', cola_manual: 'persona', fuera_de_alcance: 'prohibido' };
  // Orden de las filas del borrador: el del formulario del Request en Plunet.
  const FILAS_REQUEST = ['cliente_id', 'contrato_id', 'idioma_origen', 'idiomas_destino', 'servicio', 'tipo_documento',
    'deadline_solicitado', 'notas_cliente'];
  const params = new URLSearchParams(location.search);

  const estado = {
    demo: params.get('demo') === '1',
    salud: null,
    codigo: leer('intake_codigo'),
    enCurso: null,
    temporizadores: [],
  };

  /* ------------------------------------------------------------------ utilidades */
  function leer(clave) {
    try { return sessionStorage.getItem(clave) || ''; } catch (_) { return ''; }
  }
  function guardar(clave, valor) {
    try { if (valor) sessionStorage.setItem(clave, valor); else sessionStorage.removeItem(clave); } catch (_) { /* sin almacenamiento: no pasa nada */ }
  }

  // el('div', {clase: 'x', title: 'y'}, 'texto', otroNodo): crea un elemento. Los textos entran como nodos de texto.
  function el(etiqueta, atributos, ...hijos) {
    const nodo = document.createElement(etiqueta);
    if (atributos) {
      for (const [k, v] of Object.entries(atributos)) {
        if (v === null || v === undefined || v === false || v === '' || k.startsWith('on')) continue;
        if (k === 'clase') nodo.className = v;
        else nodo.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const h of hijos.flat(Infinity)) {
      if (h === null || h === undefined || h === false) continue;
      nodo.append(typeof h === 'object' && h.nodeType ? h : document.createTextNode(String(h)));
    }
    return nodo;
  }

  function icono(nombre, clase) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icono' + (clase ? ' ' + clase : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const uso = document.createElementNS(SVG_NS, 'use');
    uso.setAttribute('href', '#i-' + nombre);
    svg.append(uso);
    return svg;
  }

  function humanizar(texto) {
    const t = String(texto).replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function etiqueta(grupo, clave) {
    const g = (C.etiquetas && C.etiquetas[grupo]) || {};
    const v = g[clave];
    return typeof v === 'string' ? v : humanizar(clave);
  }
  function campoInfo(clave) {
    const g = (C.etiquetas && C.etiquetas.campos) || {};
    return g[clave] || { nombre: humanizar(clave), plunet: '—' };
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : (iso || '—');
  }
  function duracion(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '—';
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} s`;
  }
  function porcentaje(x) {
    return typeof x === 'number' ? x.toFixed(2) : '—';
  }
  const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function anunciar(texto) {
    const nodo = $('anuncio');
    nodo.textContent = '';
    window.setTimeout(() => { nodo.textContent = texto; }, 60);
  }

  /* ------------------------------------------------------------------ piezas de la pantalla */
  function chipRuta(ruta) {
    const r = RUTAS.includes(ruta) ? ruta : '';
    if (!r) return null;
    return el('span', { clase: 'ruta-chip ruta-' + r, title: 'Ruta ' + r + ' · ' + etiqueta('rutas', r) }, `${r} · ${etiqueta('rutas', r)}`);
  }

  function ponerConexion(tipo, texto, ruta) {
    const caja = $('conexion');
    caja.dataset.estado = tipo;
    $('conexion-texto').textContent = texto;
    caja.querySelectorAll('.ruta-chip').forEach((n) => n.remove());
    const chip = ruta ? chipRuta(ruta) : null;
    if (chip) caja.append(chip);
  }

  function mostrarAviso(tipo, ...contenido) {
    const caja = $('aviso');
    caja.className = 'aviso' + (tipo === 'demo' ? ' aviso-demo' : '');
    caja.replaceChildren(icono(tipo === 'demo' ? 'play' : 'alerta'), ...contenido);
    caja.hidden = false;
  }

  function enlaceDemo(texto) {
    const url = new URL(location.href);
    url.searchParams.set('demo', '1');
    return el('a', { clase: 'boton boton-secundario boton-mini', href: url.pathname + url.search }, texto || 'Ver en modo demostración');
  }

  function avisoDemo() {
    const salir = el('a', { clase: 'boton boton-secundario boton-mini', href: location.pathname }, 'Salir del modo demostración');
    mostrarAviso('demo',
      el('p', { clase: 'aviso-texto' },
        el('strong', null, 'Modo demostración. '),
        'Las respuestas son ejemplos guardados en config.js, generados por el mismo workflow con un modelo simulado: no hay ningún modelo conectado ni se gasta cuota. Solo responden los ejemplos.'),
      salir);
  }

  /* ------------------------------------------------------------------ vistas del panel de resultado */
  function mostrar(nodo) {
    $('resultado').replaceChildren(nodo);
  }

  function vistaVacia() {
    mostrar(el('div', { clase: 'vacio' },
      el('div', { clase: 'vacio-icono' }, icono('cola')),
      el('h3', null, 'Aquí aparecerá el borrador del Request'),
      el('p', null, 'Elige un ejemplo o pega un correo y pulsa «Prellenar Request». Verás cada campo con la cita que lo respalda, los campos que el PM debe revisar y lo que hizo el sistema.')));
  }

  function vistaCargando() {
    const detalle = el('span', { clase: 'cargando-detalle', id: 'detalle-carga' },
      estado.demo ? 'Simulando la espera de un backend real.' : 'Una llamada al modelo gratuito suele tardar entre 15 y 30 segundos.');
    const cancelar = el('button', { type: 'button', clase: 'boton boton-secundario boton-mini' }, icono('cerrar', 'icono-peq'), el('span', null, 'Cancelar'));
    cancelar.addEventListener('click', () => { if (estado.enCurso) estado.enCurso.control.abort(); });
    mostrar(el('div', { clase: 'cargando' },
      el('div', { clase: 'cargando-cabecera' },
        el('span', { clase: 'girar', 'aria-hidden': 'true' }),
        el('p', { clase: 'cargando-texto' }, 'Leyendo el correo y sus adjuntos…', detalle),
        cancelar),
      el('div', { clase: 'esqueleto', 'aria-hidden': 'true' },
        el('div', { clase: 'barra barra-100' }), el('div', { clase: 'barra barra-90' }), el('div', { clase: 'barra barra-75' }), el('div', { clase: 'barra barra-40' }))));
    if (!estado.demo) {
      estado.temporizadores.push(window.setTimeout(() => { detalle.textContent = 'Sigue trabajando. El modelo gratuito a veces demora más.'; }, 20000));
      estado.temporizadores.push(window.setTimeout(() => { detalle.textContent = 'Está tardando más de lo normal; puede estar reintentando por un 503 del proveedor. Si pasa de 2 minutos, la pantalla deja de esperar sola.'; }, 45000));
    }
  }

  function vistaInfo(titulo, texto, ...acciones) {
    mostrar(el('div', { clase: 'vacio' },
      el('div', { clase: 'vacio-icono' }, icono('info')),
      el('h3', null, titulo),
      el('p', null, texto),
      acciones.length ? el('div', { clase: 'acciones acciones-centro' }, ...acciones) : null));
  }

  function vistaError(datos) {
    const e = datos.error || {};
    const catalogo = C.errores || {};
    const codigo = catalogo[e.codigo] ? e.codigo : 'backend';
    const cfg = catalogo[codigo] || { titulo: 'No se pudo completar el análisis', ayuda: '' };
    const reintentable = e.reintentable === true || ['timeout', 'red', 'limite', 'cuota_ia', 'backend'].includes(codigo);
    const tecnico = [codigo, e.detalle, datos.meta && datos.meta.id ? 'id ' + datos.meta.id : ''].filter(Boolean).join(' · ');

    const acciones = [];
    if (reintentable) {
      const b = el('button', { type: 'button', clase: 'boton boton-secundario' }, icono('reintentar'), 'Reintentar');
      b.addEventListener('click', () => $('formulario').requestSubmit());
      acciones.push(b);
    }
    if (['sin_configurar', 'red', 'no_json'].includes(codigo) && !estado.demo) acciones.push(enlaceDemo());

    mostrar(el('div', { clase: 'res-error', role: 'alert' },
      el('div', { clase: 'res-error-cabecera' }, icono('alerta'), el('h3', null, cfg.titulo)),
      e.mensaje && e.mensaje !== cfg.titulo ? el('p', { clase: 'res-error-mensaje' }, e.mensaje) : null,
      cfg.ayuda ? el('p', { clase: 'res-error-ayuda' }, cfg.ayuda) : null,
      el('p', { clase: 'res-error-tecnico' }, tecnico),
      acciones.length ? el('div', { clase: 'acciones' }, ...acciones) : null));

    if (codigo === 'acceso') {
      $('bloque-codigo').hidden = false;
      $('codigo').setAttribute('aria-invalid', 'true');
      $('codigo').focus();
    }
  }

  /* ---- respuesta correcta ---- */
  async function copiarTexto(texto, boton, aviso) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch (_) {
      const auxiliar = el('textarea', { clase: 'solo-lectura', tabindex: '-1', 'aria-hidden': 'true' });
      auxiliar.value = texto;
      document.body.append(auxiliar);
      auxiliar.select();
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      auxiliar.remove();
    }
    const rotulo = boton.querySelector('span');
    const original = rotulo.textContent;
    rotulo.textContent = ok ? 'Copiado' : 'No se pudo copiar';
    anunciar(ok ? aviso : 'No se pudo copiar');
    window.setTimeout(() => { rotulo.textContent = original; }, 2000);
  }

  function chipDato(nombre, valor, clase) {
    return el('span', { clase: 'dato-chip' + (clase ? ' ' + clase : '') }, nombre + ':', el('strong', null, valor));
  }

  function lista(filas) {
    const dl = el('dl', { clase: 'datos' });
    for (const [nombre, valor] of filas) dl.append(el('dt', null, nombre), el('dd', null, valor));
    return dl;
  }
  const mono = (t) => el('span', { clase: 'mono' }, t);

  // Texto que se muestra para el valor de un campo del borrador.
  function valorCampo(clave, campos) {
    const v = campos[clave];
    if (v === null || v === undefined || (Array.isArray(v) && !v.length)) return null;
    if (clave === 'cliente_id') return [mono(v), campos.cliente_nombre ? ' · ' + campos.cliente_nombre : ''];
    if (clave === 'idiomas_destino') return v.map((x) => mono(x)).reduce((acc, n, i) => (i ? acc.concat(', ', n) : [n]), []);
    if (clave === 'idioma_origen' || clave === 'contrato_id') return mono(v);
    if (clave === 'tipo_documento') return etiqueta('tiposDocumento', v);
    if (clave === 'servicio') return etiqueta('servicios', v);
    if (clave === 'deadline_solicitado') return [fechaLarga(v), ' ', mono('(' + v + ')')];
    return v;
  }

  function bloqueRequest(d) {
    const campos = d.campos || {};
    const baja = new Set(Array.isArray(d.campos_baja_confianza) ? d.campos_baja_confianza : []);
    const conf = d.confianza_por_campo || {};
    const filas = FILAS_REQUEST.map((clave) => {
      const info = campoInfo(clave);
      const valor = valorCampo(clave, campos);
      const revisar = baja.has(clave);
      const pista = clave === 'cliente_id' && !valor && campos.cliente_nombre ? 'sugerido: ' + campos.cliente_nombre : '';
      return el('tr', { clase: revisar ? 'fila-revisar' : '' },
        el('th', { scope: 'row' }, info.nombre, el('span', { clase: 'campo-plunet' }, info.plunet)),
        el('td', null, valor || el('span', { clase: 'vacio-campo' }, pista ? '— completar (' + pista + ')' : '— completar')),
        el('td', { clase: 'col-conf' }, typeof conf[clave] === 'number' && valor ? porcentaje(conf[clave]) : '—'),
        el('td', { clase: 'col-revisar' }, revisar ? el('span', { clase: 'marca-revisar' }, icono('alerta', 'icono-peq'), 'Revisar') : el('span', { clase: 'marca-ok' }, icono('check', 'icono-peq'), 'Citado')));
    });
    const cabecera = el('div', { clase: 'bloque-cabecera' }, el('h3', { id: 'h-request' }, icono('politica'), 'Borrador del Request en Plunet'));
    if (d.request_plunet) {
      const copiar = el('button', { type: 'button', clase: 'boton boton-mini' }, icono('copiar', 'icono-peq'), el('span', null, 'Copiar JSON'));
      copiar.addEventListener('click', () => copiarTexto(JSON.stringify(d.request_plunet, null, 2), copiar, 'Borrador del Request copiado'));
      cabecera.append(copiar);
    }
    return el('section', { clase: 'bloque', 'aria-labelledby': 'h-request' },
      cabecera,
      el('div', { clase: 'tabla-envoltura' },
        el('table', { clase: 'tabla-request' },
          el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Campo · Plunet'), el('th', { scope: 'col' }, 'Valor'), el('th', { scope: 'col' }, 'Confianza'), el('th', { scope: 'col' }, 'Estado'))),
          el('tbody', null, ...filas))),
      el('p', { clase: 'ayuda' }, d.request_plunet
        ? 'El sistema no escribe en Plunet (escrituras: ' + (d.escrituras_plunet || 0) + '). El PM revisa los campos marcados y crea el Request.'
        : 'No se generó borrador: la solicitud no se prellena en este estado.'));
  }

  function bloqueEvidencia(evidencia) {
    const items = evidencia.map((e) => el('li', null, el('details', { clase: 'politica' },
      el('summary', null, el('span', { clase: 'politica-id' }, campoInfo(e.campo).nombre), el('span', null, e.fuente)),
      el('p', { clase: 'politica-texto' }, '«' + e.fragmento + '»', typeof e.confianza === 'number' ? ' · confianza ' + porcentaje(e.confianza) : ''))));
    return el('section', { clase: 'bloque', 'aria-labelledby': 'h-evidencia' },
      el('h3', { id: 'h-evidencia' }, icono('info'), 'Evidencia (' + evidencia.length + ' citas literales)'),
      el('p', { clase: 'ayuda' }, 'Solo se aceptan citas que aparecen tal cual en el correo o en los adjuntos. Una cita que no aparece deja su campo vacío.'),
      el('ul', { clase: 'politicas' }, ...items));
  }

  function tarjetaArchivos(archivos) {
    if (!Array.isArray(archivos) || !archivos.length) return null;
    return el('section', { clase: 'tarjeta', 'aria-labelledby': 'h-archivos' },
      el('h3', { id: 'h-archivos' }, icono('pedido'), 'Adjuntos detectados'),
      lista(archivos.map((a) => [mono(a.nombre), a.detalle || '—'])));
  }

  function bloquePasos(pasos) {
    const items = pasos.map((p) => el('li', { clase: p.tipo === 'herramienta' ? 'paso-herramienta' : 'paso-simple' },
      el('span', { clase: 'paso-icono' }, icono(p.tipo === 'herramienta' ? 'herramienta' : 'paso')),
      el('span', { clase: 'paso-nombre' }, p.nombre),
      p.detalle ? el('p', { clase: 'paso-detalle' }, p.detalle) : null));
    return el('section', { clase: 'bloque', 'aria-labelledby': 'h-pasos' },
      el('h3', { id: 'h-pasos' }, icono('herramienta'), 'Qué hizo el sistema'),
      el('p', { clase: 'ayuda' }, 'Siempre los mismos tres pasos. Solo «extraer» usa el modelo; «validar» y «derivar» son reglas en código.'),
      el('ol', { clase: 'pasos' }, ...items));
  }

  function bloqueTecnico(d, msNavegador) {
    const m = d.meta || {};
    const filas = [
      ['Backend', m.backend ? etiqueta('backends', m.backend) : '—'],
      ['Ruta', chipRuta(m.ruta) || '—'],
      ['Modelo', m.modelo ? mono(m.modelo) : (m.backend === 'demo' ? 'Ninguno (demostración)' : '—')],
      ['Llamadas al modelo', typeof m.llamadas_modelo === 'number' ? String(m.llamadas_modelo) : '—'],
      ['Tiempo en el navegador', duracion(msNavegador)],
    ];
    if (typeof m.latencia_ms === 'number') filas.push(['Tiempo en el servidor', duracion(m.latencia_ms)]);
    filas.push(['ID de solicitud', mono(m.id || '—')], ['Contrato', m.version ? 'v' + m.version : '—']);
    return el('details', { clase: 'tecnico' },
      el('summary', null, 'Detalles técnicos'),
      el('div', { clase: 'tecnico-cuerpo' },
        lista(filas),
        el('details', { clase: 'json' },
          el('summary', null, icono('codigo', 'icono-peq'), 'Ver la respuesta JSON del contrato'),
          el('pre', { tabindex: '0', 'aria-label': 'Respuesta JSON del contrato' }, JSON.stringify(d, null, 2)))));
  }

  function vistaResultado(d, msNavegador) {
    const estadoOk = ESTADOS.includes(d.estado) ? d.estado : 'cola_manual';
    const info = ((C.etiquetas && C.etiquetas.estados) || {})[estadoOk] || { titulo: humanizar(estadoOk), detalle: '' };
    const nRevisar = Array.isArray(d.campos_baja_confianza) ? d.campos_baja_confianza.length : 0;

    const partes = [
      el('div', { clase: 'res-estado' },
        el('span', { clase: 'insignia insignia-' + CLASE_ESTADO[estadoOk] }, icono(ICONO_ESTADO[estadoOk]), info.titulo),
        chipDato('score_global', porcentaje(d.score_global)),
        estadoOk !== 'fuera_de_alcance' ? chipDato('Campos a revisar', String(nRevisar), nRevisar ? 'urgencia-media' : '') : null,
        chipDato('Escrituras en Plunet', String(d.escrituras_plunet || 0))),
      info.detalle ? el('p', { clase: 'res-explica' }, info.detalle) : null,
      d.razon ? el('p', { clase: 'res-explica' }, el('strong', null, 'Razón: '), d.razon) : null,
      d.alerta ? el('div', { clase: 'alerta-res', role: 'note' }, icono('alerta'), el('p', null, el('strong', null, 'Alerta: '), d.alerta)) : null,
    ];
    if (estadoOk !== 'fuera_de_alcance') partes.push(bloqueRequest(d));
    if (Array.isArray(d.evidencia) && d.evidencia.length) partes.push(bloqueEvidencia(d.evidencia));
    const tarjeta = tarjetaArchivos(d.archivos);
    if (tarjeta) partes.push(el('div', { clase: 'rejilla' }, tarjeta));
    if (Array.isArray(d.pasos) && d.pasos.length) partes.push(bloquePasos(d.pasos));
    partes.push(bloqueTecnico(d, msNavegador));
    return el('article', { clase: 'res' }, ...partes);
  }

  /* ------------------------------------------------------------------ llamada al backend */
  function errorLocal(codigo, detalle) {
    return { ok: false, error: { codigo, mensaje: '', detalle: detalle || '', reintentable: ['red', 'timeout'].includes(codigo) }, meta: {} };
  }

  async function analizarReal(mensaje, control) {
    let vencio = false;
    const reloj = window.setTimeout(() => { vencio = true; control.abort(); }, C.timeoutMs);
    try {
      const cabeceras = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (estado.codigo) cabeceras['x-access-code'] = estado.codigo;
      const res = await fetch(C.endpoint, { method: 'POST', headers: cabeceras, body: JSON.stringify({ mensaje }), signal: control.signal, cache: 'no-store' });
      const crudo = await res.text();
      let datos = null;
      try { datos = JSON.parse(crudo); } catch (_) { /* no era JSON */ }
      if (datos && typeof datos === 'object' && typeof datos.ok === 'boolean') return datos;
      return errorLocal('no_json', 'HTTP ' + res.status);
    } catch (e) {
      if (control.signal.aborted) return errorLocal(vencio ? 'timeout' : 'cancelado', vencio ? 'la pantalla dejó de esperar' : '');
      return errorLocal('red', String((e && e.message) || e));
    } finally {
      window.clearTimeout(reloj);
    }
  }

  async function analizarDemo(mensaje, control) {
    await new Promise((resolver) => {
      const t = window.setTimeout(resolver, 700 + Math.random() * 500);
      control.signal.addEventListener('abort', () => { window.clearTimeout(t); resolver(); }, { once: true });
    });
    if (control.signal.aborted) return errorLocal('cancelado');
    const ej = C.ejemplos.find((x) => x.mensaje.trim() === mensaje);
    if (!ej || !ej.demo) return { ok: false, sinEjemplo: true };
    return JSON.parse(JSON.stringify(ej.demo));
  }

  /* ------------------------------------------------------------------ formulario */
  function validar(mensaje) {
    if (mensaje.length < C.minCaracteres) return `Escribe al menos ${C.minCaracteres} caracteres.`;
    if (mensaje.length > C.maxCaracteres) return `El correo supera los ${C.maxCaracteres} caracteres.`;
    return '';
  }
  function errorCampo(texto) {
    const caja = $('error-mensaje');
    caja.textContent = texto;
    caja.hidden = !texto;
    if (texto) $('mensaje').setAttribute('aria-invalid', 'true'); else $('mensaje').removeAttribute('aria-invalid');
  }
  function actualizarContador() {
    const n = $('mensaje').value.length;
    const caja = $('contador');
    caja.textContent = `${n} / ${C.maxCaracteres}`;
    caja.classList.toggle('cerca', n >= C.maxCaracteres * 0.9 && n < C.maxCaracteres);
    caja.classList.toggle('lleno', n >= C.maxCaracteres);
  }
  function marcarEjemplo(id) {
    document.querySelectorAll('.ejemplo').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  }
  function usarEjemplo(ej) {
    $('mensaje').value = ej.mensaje;
    actualizarContador();
    errorCampo('');
    marcarEjemplo(ej.id);
    anunciar('Ejemplo «' + ej.etiqueta + '» cargado');
  }
  function crearEjemplos() {
    const ul = $('lista-ejemplos');
    for (const ej of C.ejemplos) {
      const b = el('button', { type: 'button', clase: 'ejemplo', 'aria-pressed': 'false', 'data-id': ej.id },
        el('span', { clase: 'ejemplo-titulo' }, ej.etiqueta), el('span', { clase: 'ejemplo-tipo' }, ej.tipo));
      b.addEventListener('click', () => usarEjemplo(ej));
      ul.append(el('li', null, b));
    }
  }

  function fijarCargando(activo) {
    $('enviar').setAttribute('aria-disabled', String(activo));   // aria-disabled y no «disabled»: así el foco del teclado no se pierde
    $('enviar-texto').textContent = activo ? 'Prellenando…' : 'Prellenar Request';
    $('resultado').setAttribute('aria-busy', String(activo));
    if (!activo) {
      estado.temporizadores.forEach((t) => window.clearTimeout(t));
      estado.temporizadores = [];
    }
  }

  function revelarResultado() {
    const titulo = $('t-resultado');
    const arriba = titulo.getBoundingClientRect().top;
    if (arriba > window.innerHeight * 0.55 || arriba < 0) titulo.scrollIntoView({ behavior: reducirMovimiento() ? 'auto' : 'smooth', block: 'start' });
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (estado.enCurso) return;
    const mensaje = $('mensaje').value.trim();
    const problema = validar(mensaje);
    if (problema) {
      errorCampo(problema);
      $('mensaje').focus();
      return;
    }
    errorCampo('');
    $('codigo').removeAttribute('aria-invalid');

    const control = new AbortController();
    estado.enCurso = { control };
    fijarCargando(true);
    vistaCargando();
    anunciar('Prellenando el Request');
    const inicio = performance.now();
    const datos = estado.demo ? await analizarDemo(mensaje, control) : await analizarReal(mensaje, control);
    const ms = performance.now() - inicio;
    estado.enCurso = null;
    fijarCargando(false);

    if (datos.sinEjemplo) {
      vistaInfo('En modo demostración solo responden los ejemplos',
        'Elige uno de los ejemplos tal como está, sin editarlo. Para analizar correos libres hace falta conectar el backend.',
        el('a', { clase: 'boton boton-secundario', href: location.pathname }, 'Salir del modo demostración'));
      anunciar('En modo demostración solo responden los ejemplos');
    } else if (datos.ok) {
      mostrar(vistaResultado(datos, ms));
      const nombreEstado = (((C.etiquetas && C.etiquetas.estados) || {})[datos.estado] || {}).titulo || humanizar(datos.estado || '');
      const n = Array.isArray(datos.campos_baja_confianza) ? datos.campos_baja_confianza.length : 0;
      anunciar(`Listo: ${nombreEstado}. ${n} ${n === 1 ? 'campo' : 'campos'} para revisar.`);
    } else if (datos.error && datos.error.codigo === 'cancelado') {
      vistaInfo('Consulta cancelada', 'La pantalla dejó de esperar. Si la consulta ya había salido hacia el backend, puede que siga corriendo: revisa los Logs de Vercel si necesitas confirmarlo.');
      anunciar('Consulta cancelada');
    } else {
      vistaError(datos);
      anunciar('No se pudo completar el análisis');
    }
    revelarResultado();
  }

  /* ------------------------------------------------------------------ conexión con el backend */
  async function comprobarSalud() {
    const control = new AbortController();
    const reloj = window.setTimeout(() => control.abort(), 8000);
    try {
      const res = await fetch(C.health, { cache: 'no-store', signal: control.signal });
      const datos = await res.json();
      if (!res.ok || !datos || datos.ok !== true) throw new Error('health');
      estado.salud = datos;
      const nombre = datos.backend ? etiqueta('backends', datos.backend) : 'backend';
      if (datos.configurado === false) {
        ponerConexion('sin-configurar', 'Falta configurar el backend', datos.ruta);
        mostrarAviso('info',
          el('p', { clase: 'aviso-texto' }, el('strong', null, 'El servicio todavía no está configurado. '),
            'La función responde, pero falta OPENROUTER_API_KEY en Vercel. Defínela, vuelve a desplegar y recarga esta página.'),
          enlaceDemo());
      } else {
        ponerConexion('conectado', 'Conectado · ' + nombre, datos.ruta);
      }
      if (datos.requiere_codigo) $('bloque-codigo').hidden = false;
    } catch (_) {
      ponerConexion('sin-backend', 'Sin backend (solo interfaz)');
      mostrarAviso('info',
        el('p', { clase: 'aviso-texto' }, el('strong', null, 'No se encontró el backend. '),
          'Esta página funciona como interfaz, pero ' + C.health + ' no responde.'),
        enlaceDemo());
    } finally {
      window.clearTimeout(reloj);
    }
  }

  /* ------------------------------------------------------------------ inicio */
  function iniciar() {
    document.title = C.titulo + ' · MVP';
    $('titulo').textContent = C.titulo;
    $('subtitulo').textContent = C.subtitulo;
    $('mensaje').maxLength = C.maxCaracteres;
    crearEjemplos();
    vistaVacia();
    actualizarContador();

    $('formulario').addEventListener('submit', enviar);
    $('mensaje').addEventListener('input', () => {
      actualizarContador();
      errorCampo('');
      const actual = $('mensaje').value.trim();
      const coincide = C.ejemplos.find((e) => e.mensaje.trim() === actual);
      marcarEjemplo(coincide ? coincide.id : '');
    });
    $('mensaje').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('formulario').requestSubmit(); }
    });
    $('limpiar').addEventListener('click', () => {
      $('mensaje').value = '';
      actualizarContador();
      errorCampo('');
      marcarEjemplo('');
      vistaVacia();
      $('mensaje').focus();
    });
    $('codigo').value = estado.codigo;
    $('codigo').addEventListener('input', () => {
      estado.codigo = $('codigo').value.trim();
      guardar('intake_codigo', estado.codigo);
      $('codigo').removeAttribute('aria-invalid');
    });

    if (estado.demo) {
      ponerConexion('demo', 'Modo demostración', 'B');
      avisoDemo();
    } else {
      comprobarSalud();
    }
  }

  iniciar();
})();
