/* ============================================================================
   Intake de solicitudes en Plunet · lógica de la interfaz (contrato 1.0-plunet)

   Adaptado del app.js del Kit MVP. Qué hace este archivo, en orden:
     1. Lee la configuración (config.js), comprueba el backend (GET /api/health) y carga la bandeja
        simulada de projects@lilt.com (GET /api/bandeja). Con ?demo=1 usa respuestas guardadas.
     2. El PM abre un correo y pulsa «Prellenar Request» (POST /api/intake con su message_id),
        o pega un correo propio (POST /api/intake con el texto).
     3. Dibuja el borrador del Request con la cita de cada campo; el PM corrige lo marcado.
     4. El PM confirma y se crea el Request en el Plunet sandbox (POST /api/plunet/requests).

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
  const CLASE_ESTADO = { pendiente_revision: 'respondida', cola_manual: 'requiere_humano', fuera_de_alcance: 'fuera_de_alcance', creado: 'respondida' };
  const ICONO_ESTADO = { pendiente_revision: 'check', cola_manual: 'persona', fuera_de_alcance: 'prohibido' };
  const PEGADO = '__pegado';
  const CLAVE_PROGRESO = 'intake_progreso_v1';
  const params = new URLSearchParams(location.search);

  const estado = {
    demo: params.get('demo') === '1',
    salud: null,
    codigo: leer(sessionStorage, 'intake_codigo'),
    enCurso: null,
    temporizadores: [],
    bandeja: [],
    clientes: [],
    seleccionado: null,
    resultados: {},                                        // última respuesta por correo, mientras la página siga abierta
    progreso: leerJSON(localStorage, CLAVE_PROGRESO),      // estado de cada correo en la bandeja de este navegador
  };

  /* ------------------------------------------------------------------ utilidades */
  function leer(almacen, clave) {
    try { return almacen.getItem(clave) || ''; } catch (_) { return ''; }
  }
  function leerJSON(almacen, clave) {
    try { return JSON.parse(almacen.getItem(clave) || '{}') || {}; } catch (_) { return {}; }
  }
  function guardar(almacen, clave, valor) {
    try { if (valor) almacen.setItem(clave, valor); else almacen.removeItem(clave); } catch (_) { /* sin almacenamiento: no pasa nada */ }
  }
  function guardarProgreso() {
    guardar(localStorage, CLAVE_PROGRESO, JSON.stringify(estado.progreso));
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
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : (iso || '—');
  }
  function duracion(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '—';
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} s`;
  }
  const dosDecimales = (x) => (typeof x === 'number' ? x.toFixed(2) : '—');
  const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function anunciar(texto) {
    const nodo = $('anuncio');
    nodo.textContent = '';
    window.setTimeout(() => { nodo.textContent = texto; }, 60);
  }

  /* ------------------------------------------------------------------ cabecera y avisos */
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
        'Las respuestas de la bandeja son ejemplos guardados, generados por el mismo workflow con un modelo simulado: no se llama a ningún modelo ni se gasta cuota.'),
      salir);
  }

  /* ------------------------------------------------------------------ bandeja */
  function hoyDeLaBandeja() {
    return estado.bandeja.reduce((max, c) => (c.fecha > max ? c.fecha : max), '').slice(0, 10);
  }
  function fechaCorta(fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(fecha || '');
    if (!m) return fecha || '';
    return fecha.slice(0, 10) === hoyDeLaBandeja() ? m[4] : `${Number(m[3])} ${MESES[Number(m[2]) - 1].slice(0, 3)}`;
  }

  function chipProgreso(id) {
    const p = estado.progreso[id];
    if (!p) return el('span', { clase: 'chip-correo chip-nuevo' }, 'Nuevo');
    if (p.estado === 'creado') return el('span', { clase: 'chip-correo chip-creado' }, icono('check', 'icono-peq'), p.request_id);
    return el('span', { clase: 'chip-correo chip-' + p.estado }, etiqueta('estadosCortos', p.estado));
  }

  function pintarBandeja() {
    const ul = $('lista-correos');
    const items = estado.bandeja.map((c) => {
      const primera = (c.cuerpo || '').replace(/\s+/g, ' ').trim();   // el CSS la corta en una línea
      const b = el('button', { type: 'button', clase: 'correo-item', 'data-id': c.id, 'aria-current': c.id === estado.seleccionado ? 'true' : null },
        el('span', { clase: 'correo-fila' },
          el('span', { clase: 'correo-de' }, c.de_nombre || c.de),
          el('span', { clase: 'correo-fecha' }, fechaCorta(c.fecha))),
        el('span', { clase: 'correo-asunto' }, c.asunto),
        el('span', { clase: 'correo-preview' }, primera),
        el('span', { clase: 'correo-fila' },
          c.adjuntos && c.adjuntos.length
            ? el('span', { clase: 'correo-adjuntos' }, icono('clip', 'icono-peq'), `${c.adjuntos.length} ${c.adjuntos.length === 1 ? 'adjunto' : 'adjuntos'}`)
            : el('span', { clase: 'correo-adjuntos' }, 'Sin adjuntos'),
          chipProgreso(c.id)));
      b.addEventListener('click', () => seleccionar(c.id));
      return el('li', null, b);
    });
    ul.replaceChildren(...items);
    const pendientes = estado.bandeja.filter((c) => !estado.progreso[c.id]).length;
    $('contador-bandeja').textContent = estado.bandeja.length ? `${pendientes} sin procesar` : '';
  }

  async function cargarBandeja() {
    try {
      const res = await fetch('/api/bandeja', { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error('bandeja');
      estado.bandeja = d.correos || [];
      estado.clientes = d.clientes || [];
      pintarBandeja();
    } catch (_) {
      $('lista-correos').replaceChildren(el('li', { clase: 'ayuda' }, 'No se pudo leer la bandeja: el servidor no responde.'));
    }
  }

  /* ------------------------------------------------------------------ vista del correo */
  function vistaCorreo(c) {
    const adjuntos = (c.adjuntos || []).map((a) => el('details', { clase: 'adjunto', open: true },
      el('summary', null, icono('clip', 'icono-peq'), el('span', { clase: 'adjunto-nombre' }, a.nombre), el('span', { clase: 'adjunto-detalle' }, a.detalle)),
      el('pre', { clase: 'adjunto-texto' }, (a.contenido || []).join('\n'))));
    const boton = el('button', { type: 'button', id: 'enviar', clase: 'boton boton-primario' },
      icono('enviar'), el('span', { id: 'enviar-texto' }, 'Prellenar Request'));
    boton.addEventListener('click', () => procesar({ message_id: c.id }, c.id));
    const yaProcesado = estado.progreso[c.id];
    return el('article', { clase: 'correo', 'aria-labelledby': 'h-correo' },
      el('h2', { id: 'h-correo', clase: 'correo-titulo' }, c.asunto),
      el('dl', { clase: 'correo-meta' },
        el('dt', null, 'De'), el('dd', null, c.de_nombre ? `${c.de_nombre} <${c.de}>` : c.de),
        el('dt', null, 'Para'), el('dd', null, C.buzon || 'projects@lilt.com'),
        el('dt', null, 'Fecha'), el('dd', null, `${fechaLarga(c.fecha)}, ${c.fecha.slice(11)}`)),
      el('p', { clase: 'correo-cuerpo' }, c.cuerpo),
      adjuntos.length ? el('div', { clase: 'adjuntos' }, el('p', { clase: 'etiqueta-peq' }, 'Adjuntos · texto extraído por archivo y página'), ...adjuntos) : null,
      el('div', { clase: 'acciones' }, boton,
        el('span', { clase: 'nota-cuota' }, yaProcesado ? 'Ya se procesó: puedes volver a hacerlo.' : 'Una llamada al modelo · 15 a 60 s')));
  }

  function seleccionar(id) {
    const c = estado.bandeja.find((x) => x.id === id);
    if (!c || estado.enCurso) return;
    estado.seleccionado = id;
    pintarBandeja();
    $('correo').replaceChildren(vistaCorreo(c));
    const previo = estado.resultados[id];
    if (previo) mostrar(vistaResultado(previo, previo.__ms));
    else $('resultado').replaceChildren();
    if (window.matchMedia('(max-width: 56rem)').matches) $('correo').scrollIntoView({ behavior: reducirMovimiento() ? 'auto' : 'smooth', block: 'start' });
  }

  function vistaInicial() {
    $('correo').replaceChildren(el('div', { clase: 'vacio' },
      el('div', { clase: 'vacio-icono' }, icono('correo')),
      el('h3', null, 'Elige un correo de la bandeja'),
      el('p', null, 'Ábrelo y pulsa «Prellenar Request». El sistema propone cada campo del Request de Plunet con la cita que lo respalda; tú revisas lo marcado, corriges si hace falta y confirmas.')));
    $('resultado').replaceChildren();
  }

  /* ------------------------------------------------------------------ panel de resultado */
  function mostrar(nodo) {
    $('resultado').replaceChildren(nodo);
  }

  function vistaCargando() {
    const detalle = el('span', { clase: 'cargando-detalle' },
      estado.demo ? 'Simulando la espera de un backend real.' : 'Una llamada al modelo gratuito suele tardar entre 15 y 60 segundos.');
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
      estado.temporizadores.push(window.setTimeout(() => { detalle.textContent = 'Sigue trabajando. El modelo gratuito a veces demora más.'; }, 25000));
      estado.temporizadores.push(window.setTimeout(() => { detalle.textContent = 'Está tardando más de lo normal; puede estar reintentando. Si pasa de 2 minutos, la pantalla deja de esperar sola.'; }, 60000));
    }
  }

  function vistaInfo(titulo, texto) {
    mostrar(el('div', { clase: 'vacio' }, el('div', { clase: 'vacio-icono' }, icono('info')), el('h3', null, titulo), el('p', null, texto)));
  }

  function vistaError(datos, reintentar) {
    const e = datos.error || {};
    const catalogo = C.errores || {};
    const codigo = catalogo[e.codigo] ? e.codigo : 'backend';
    const cfg = catalogo[codigo] || { titulo: 'No se pudo completar', ayuda: '' };
    const reintentable = e.reintentable === true || ['timeout', 'red', 'limite', 'cuota_ia', 'backend'].includes(codigo);
    const tecnico = [codigo, e.detalle, datos.meta && datos.meta.id ? 'id ' + datos.meta.id : ''].filter(Boolean).join(' · ');
    const acciones = [];
    if (reintentable && reintentar) {
      const b = el('button', { type: 'button', clase: 'boton boton-secundario' }, icono('reintentar'), 'Reintentar');
      b.addEventListener('click', reintentar);
      acciones.push(b);
    }
    if (['sin_configurar', 'red', 'no_json'].includes(codigo) && !estado.demo) acciones.push(enlaceDemo());
    if (codigo === 'acceso') {
      $('bloque-codigo').hidden = false;
      $('codigo').setAttribute('aria-invalid', 'true');
      $('codigo').focus();
    }
    return el('div', { clase: 'res-error', role: 'alert' },
      el('div', { clase: 'res-error-cabecera' }, icono('alerta'), el('h3', null, cfg.titulo)),
      e.mensaje && e.mensaje !== cfg.titulo ? el('p', { clase: 'res-error-mensaje' }, e.mensaje) : null,
      cfg.ayuda ? el('p', { clase: 'res-error-ayuda' }, cfg.ayuda) : null,
      el('p', { clase: 'res-error-tecnico' }, tecnico),
      acciones.length ? el('div', { clase: 'acciones' }, ...acciones) : null);
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

  /* ---- el borrador editable del Request ---- */
  function opciones(select, pares, elegido) {
    select.replaceChildren(...pares.map(([valor, texto]) => {
      const o = el('option', null, texto);
      o.value = valor;   // explícito: el() omite atributos vacíos y la opción «— Elige —» debe valer ''
      if (valor === (elegido || '')) o.selected = true;
      return o;
    }));
  }

  function formRequest(d) {
    const manual = d.estado === 'cola_manual';
    const campos = manual ? {} : (d.campos || {});
    const baja = new Set(manual ? [] : (d.campos_baja_confianza || []));
    const conf = d.confianza_por_campo || {};
    const citados = new Set((d.evidencia || []).map((e) => e.campo));

    const cliente = el('select', { id: 'f-cliente', name: 'customerID' });
    opciones(cliente, [['', '— Elige el cliente —'], ...estado.clientes.map((c) => [c.cliente_id, `${c.cliente_id} · ${c.razon_social}`])], campos.cliente_id);
    const contrato = el('select', { id: 'f-contrato', name: 'contrato' });
    const pintarContratos = (elegido) => {
      const c = estado.clientes.find((x) => x.cliente_id === cliente.value);
      const lista = c ? c.contratos_activos : [];
      opciones(contrato, [['', lista.length ? '— Sin contrato —' : 'Sin contrato activo'], ...lista.map((x) => [x, x])], elegido);
    };
    pintarContratos(campos.contrato_id);
    cliente.addEventListener('change', () => pintarContratos(''));

    const origen = el('input', { id: 'f-origen', name: 'sourceLanguage', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'en', maxlength: '10' });
    origen.value = campos.idioma_origen || '';
    const destinos = el('input', { id: 'f-destinos', name: 'targetLanguage', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'es-MX, pt-BR', maxlength: '120' });
    destinos.value = (campos.idiomas_destino || []).join(', ');
    const servicio = el('select', { id: 'f-servicio', name: 'service' });
    opciones(servicio, [['', '— Elige —'], ...Object.entries(C.etiquetas.servicios)], campos.servicio);
    const tipo = el('select', { id: 'f-tipo', name: 'subject' });
    opciones(tipo, [['', '— Elige —'], ...Object.entries(C.etiquetas.tiposDocumento)], campos.tipo_documento);
    const entrega = el('input', { id: 'f-entrega', name: 'deliveryDeadline', type: 'date' });
    entrega.value = campos.deadline_solicitado || '';
    const notas = el('textarea', { id: 'f-notas', name: 'briefDescription', rows: '2', maxlength: '300' });
    notas.value = campos.notas_cliente || '';

    const filas = [
      ['cliente_id', cliente], ['contrato_id', contrato], ['idioma_origen', origen], ['idiomas_destino', destinos],
      ['servicio', servicio], ['tipo_documento', tipo], ['deadline_solicitado', entrega], ['notas_cliente', notas],
    ].map(([clave, control]) => {
      const info = campoInfo(clave);
      const tieneValor = !manual && campos[clave] !== null && campos[clave] !== undefined && !(Array.isArray(campos[clave]) && !campos[clave].length);
      const marca = el('span', { clase: 'marca-campo' });
      const ponerMarca = (tipoMarca) => {
        const textos = { revisar: 'Revisar', citado: 'Citado', regla: 'Por regla', editado: 'Editado por el PM', vacio: 'Completar', opcional: 'Opcional', manual: 'Carga manual' };
        const iconos = { revisar: 'alerta', citado: 'check', regla: 'check', editado: 'persona', vacio: 'info', opcional: 'info', manual: 'persona' };
        marca.className = 'marca-campo marca-' + tipoMarca;
        marca.replaceChildren(icono(iconos[tipoMarca], 'icono-peq'), textos[tipoMarca]);
      };
      // cliente y contrato salen de reglas (dominio y contratos activos), el resto de una cita del correo
      const inicial = manual ? 'manual' : baja.has(clave) ? 'revisar'
        : tieneValor ? (citados.has(clave) ? 'citado' : 'regla')
        : (clave === 'notas_cliente' || clave === 'contrato_id') ? 'opcional' : 'vacio';
      ponerMarca(inicial);
      control.addEventListener('input', () => ponerMarca('editado'));
      control.addEventListener('change', () => ponerMarca('editado'));
      const pista = clave === 'cliente_id' && !campos.cliente_id && d.campos && d.campos.cliente_nombre && !manual
        ? el('span', { clase: 'pista-campo' }, 'El correo menciona «' + d.campos.cliente_nombre + '»') : null;
      return el('div', { clase: 'campo-request' + (inicial === 'revisar' ? ' campo-revisar' : '') },
        el('label', { for: control.id, clase: 'campo-etiqueta' }, info.nombre, el('span', { clase: 'campo-plunet' }, info.plunet)),
        el('div', { clase: 'campo-control' }, control, pista),
        el('div', { clase: 'campo-estado' },
          marca, typeof conf[clave] === 'number' && tieneValor ? el('span', { clase: 'campo-conf' }, 'confianza ' + dosDecimales(conf[clave])) : null));
    });

    const error = el('p', { clase: 'error-campo', role: 'alert', hidden: true });
    const boton = el('button', { type: 'submit', clase: 'boton boton-primario' }, icono('check'), el('span', null, 'Crear Request en Plunet'));
    const form = el('form', { clase: 'form-request', novalidate: true, 'aria-labelledby': 'h-request' },
      el('div', { clase: 'bloque-cabecera' },
        el('h3', { id: 'h-request' }, icono('politica'), manual ? 'Carga manual del Request' : 'Borrador del Request en Plunet')),
      el('p', { clase: 'ayuda' }, manual
        ? 'La evidencia no alcanzó para prellenar (score_global < 0.60). El PM completa el Request a mano.'
        : 'Revisa los campos marcados, corrige lo que haga falta y confirma. Hasta que confirmes, no se crea nada en Plunet.'),
      ...filas, error,
      el('div', { clase: 'acciones' }, boton, el('span', { clase: 'nota-cuota' }, 'Plunet sandbox: no escribe en un Plunet real · no usa el modelo')));

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (estado.enCurso) return;
      const request = {
        customerID: cliente.value, contrato: contrato.value || null, sourceLanguage: origen.value.trim(),
        targetLanguage: destinos.value.split(/[,;\s]+/).filter(Boolean), service: servicio.value, subject: tipo.value,
        deliveryDeadline: entrega.value, briefDescription: notas.value.trim() || null,
      };
      const faltan = [['customerID', 'cliente'], ['sourceLanguage', 'idioma origen'], ['service', 'servicio'], ['subject', 'tipo de documento'], ['deliveryDeadline', 'fecha de entrega']]
        .filter(([k]) => !request[k]).map(([, t]) => t);
      if (!request.targetLanguage.length) faltan.splice(2, 0, 'idiomas destino');
      if (faltan.length) {
        error.textContent = 'Falta completar: ' + faltan.join(', ') + '.';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      boton.setAttribute('aria-disabled', 'true');
      const creado = await confirmar(d.message_id, request);
      boton.removeAttribute('aria-disabled');
      if (creado.ok) {
        form.replaceWith(vistaCreado(creado));
        if (d.message_id) {
          estado.progreso[d.message_id] = { estado: 'creado', request_id: creado.request_id };
          guardarProgreso();
          pintarBandeja();
        }
        anunciar('Request ' + creado.request_id + ' creado en Plunet sandbox');
      } else if (creado.error && creado.error.codigo === 'validacion') {
        error.textContent = (creado.error.mensaje || 'Faltan datos.') + ' ' + (creado.error.detalle || '');
        error.hidden = false;
      } else {
        form.prepend(vistaError(creado, () => form.requestSubmit()));
      }
    });
    return form;
  }

  function vistaCreado(r) {
    const req = r.request || {};
    return el('section', { clase: 'creado', role: 'status', 'aria-labelledby': 'h-creado' },
      el('div', { clase: 'creado-cabecera' }, icono('check'),
        el('h3', { id: 'h-creado' }, 'Request ', mono(r.request_id), ' creado en Plunet')),
      el('p', { clase: 'ayuda' }, (r.nota || 'Plunet sandbox.') + ' Confirmado por el PM el ' + fechaLarga(r.creado_en) + '.'),
      lista([
        ['Cliente', [mono(req.customerID), ' · ', req.cliente || '']],
        ['Contrato', req.contrato ? mono(req.contrato) : 'Sin contrato'],
        ['Idiomas', [mono(req.sourceLanguage), ' → ', (req.targetLanguage || []).join(', ')]],
        ['Servicio', etiqueta('servicios', req.service)],
        ['Tipo de documento', etiqueta('tiposDocumento', req.subject)],
        ['Entrega', fechaLarga(req.deliveryDeadline)],
        ['Notas', req.briefDescription || '—'],
      ]));
  }

  async function confirmar(messageId, request) {
    if (estado.demo) {
      await new Promise((ok) => window.setTimeout(ok, 500));
      const c = estado.clientes.find((x) => x.cliente_id === request.customerID) || {};
      return { ok: true, request_id: 'R-DEMO-' + Math.random().toString(16).slice(2, 7).toUpperCase(), estado: 'creado_sandbox',
        creado_en: new Date().toISOString(), message_id: messageId,
        request: { ...request, cliente: c.razon_social }, nota: 'Modo demostración: el Request no se envió al servidor.' };
    }
    return pedir('/api/plunet/requests', { message_id: messageId, request }, 20000);
  }

  /* ---- evidencia, adjuntos, pasos y detalles ---- */
  function bloqueEvidencia(evidencia) {
    const items = evidencia.map((e) => el('li', { clase: 'evidencia-item' },
      el('span', { clase: 'politica-id' }, campoInfo(e.campo).nombre),
      el('span', { clase: 'evidencia-fuente' }, e.fuente),
      el('q', { clase: 'evidencia-cita' }, e.fragmento),
      typeof e.confianza === 'number' ? el('span', { clase: 'campo-conf' }, dosDecimales(e.confianza)) : null));
    return el('details', { clase: 'tecnico' },
      el('summary', null, `Evidencia · ${evidencia.length} ${evidencia.length === 1 ? 'cita literal' : 'citas literales'}`),
      el('div', { clase: 'tecnico-cuerpo' },
        el('p', { clase: 'ayuda' }, 'Solo se aceptan citas que aparecen tal cual en el correo o en los adjuntos. Un campo sin cita queda vacío.'),
        el('ul', { clase: 'evidencias' }, ...items)));
  }

  function bloquePasos(pasos) {
    const items = pasos.map((p) => el('li', { clase: p.tipo === 'herramienta' ? 'paso-herramienta' : 'paso-simple' },
      el('span', { clase: 'paso-icono' }, icono(p.tipo === 'herramienta' ? 'herramienta' : 'paso')),
      el('span', { clase: 'paso-nombre' }, p.nombre),
      p.detalle ? el('p', { clase: 'paso-detalle' }, p.detalle) : null));
    return el('details', { clase: 'tecnico' },
      el('summary', null, 'Qué hizo el sistema'),
      el('div', { clase: 'tecnico-cuerpo' },
        el('p', { clase: 'ayuda' }, 'Siempre los mismos tres pasos. Solo «extraer» usa el modelo; «validar» y «derivar» son reglas en código.'),
        el('ol', { clase: 'pasos' }, ...items)));
  }

  function bloqueTecnico(d, msNavegador) {
    const m = d.meta || {};
    const filas = [
      ['message_id', d.message_id ? mono(d.message_id) : 'Correo pegado'],
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
        chipDato('score_global', dosDecimales(d.score_global)),
        estadoOk === 'pendiente_revision' ? chipDato('Campos a revisar', String(nRevisar), nRevisar ? 'urgencia-media' : '') : null),
      info.detalle ? el('p', { clase: 'res-explica' }, info.detalle) : null,
      d.razon ? el('p', { clase: 'res-explica' }, el('strong', null, 'Razón: '), d.razon) : null,
      d.alerta ? el('div', { clase: 'alerta-res', role: 'note' }, icono('alerta'), el('p', null, el('strong', null, 'Alerta: '), d.alerta)) : null,
    ];
    if (estadoOk !== 'fuera_de_alcance') partes.push(formRequest(d));
    else partes.push(el('div', { clase: 'alerta-res', role: 'note' }, icono('info'),
      el('p', null, 'No se crea ningún Request. Según el caso, el PM lo deriva (cambio de proyecto, cotización, facturación) o lo responde fuera de este sistema.')));
    if (Array.isArray(d.evidencia) && d.evidencia.length) partes.push(bloqueEvidencia(d.evidencia));
    if (Array.isArray(d.pasos) && d.pasos.length) partes.push(bloquePasos(d.pasos));
    partes.push(bloqueTecnico(d, msNavegador));
    return el('article', { clase: 'res' }, ...partes);
  }

  /* ------------------------------------------------------------------ llamadas al backend */
  function errorLocal(codigo, detalle) {
    return { ok: false, error: { codigo, mensaje: '', detalle: detalle || '', reintentable: ['red', 'timeout'].includes(codigo) }, meta: {} };
  }

  async function pedir(url, cuerpo, timeoutMs, control) {
    control = control || new AbortController();
    let vencio = false;
    const reloj = window.setTimeout(() => { vencio = true; control.abort(); }, timeoutMs);
    try {
      const cabeceras = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (estado.codigo) cabeceras['x-access-code'] = estado.codigo;
      const res = await fetch(url, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo), signal: control.signal, cache: 'no-store' });
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

  async function analizarDemo(cuerpo, control) {
    await new Promise((ok) => {
      const t = window.setTimeout(ok, 900 + Math.random() * 600);
      control.signal.addEventListener('abort', () => { window.clearTimeout(t); ok(); }, { once: true });
    });
    if (control.signal.aborted) return errorLocal('cancelado');
    const guardada = cuerpo.message_id && C.demo && C.demo[cuerpo.message_id];
    return guardada ? JSON.parse(JSON.stringify(guardada)) : { ok: false, sinEjemplo: true };
  }

  function fijarCargando(activo) {
    document.querySelectorAll('#enviar, #enviar-pegado').forEach((b) => b.setAttribute('aria-disabled', String(activo)));
    const texto = $('enviar-texto');
    if (texto) texto.textContent = activo ? 'Prellenando…' : 'Prellenar Request';
    $('resultado').setAttribute('aria-busy', String(activo));
    if (!activo) {
      estado.temporizadores.forEach((t) => window.clearTimeout(t));
      estado.temporizadores = [];
    }
  }

  async function procesar(cuerpo, clave) {
    if (estado.enCurso) return;
    const control = new AbortController();
    estado.enCurso = { control };
    fijarCargando(true);
    vistaCargando();
    anunciar('Prellenando el Request');
    $('resultado').scrollIntoView({ behavior: reducirMovimiento() ? 'auto' : 'smooth', block: 'nearest' });
    const inicio = performance.now();
    const datos = estado.demo ? await analizarDemo(cuerpo, control) : await pedir(C.endpoint, cuerpo, C.timeoutMs, control);
    const ms = performance.now() - inicio;
    estado.enCurso = null;
    fijarCargando(false);

    if (datos.sinEjemplo) {
      vistaInfo('En modo demostración solo responden los correos de la bandeja',
        'Para analizar un correo pegado hace falta el backend conectado. Sal del modo demostración para usar el modelo.');
    } else if (datos.ok) {
      datos.__ms = ms;
      estado.resultados[clave] = datos;
      if (clave !== PEGADO) {
        estado.progreso[clave] = { estado: datos.estado };
        guardarProgreso();
        pintarBandeja();
      }
      mostrar(vistaResultado(datos, ms));
      const nombreEstado = (((C.etiquetas && C.etiquetas.estados) || {})[datos.estado] || {}).titulo || humanizar(datos.estado || '');
      anunciar('Listo: ' + nombreEstado);
    } else if (datos.error && datos.error.codigo === 'cancelado') {
      vistaInfo('Consulta cancelada', 'La pantalla dejó de esperar. Si la consulta ya había salido hacia el servidor, puede que siga corriendo.');
    } else {
      mostrar(vistaError(datos, () => procesar(cuerpo, clave)));
      anunciar('No se pudo completar el análisis');
    }
  }

  /* ------------------------------------------------------------------ pestañas y correo pegado */
  function cambiarPestana(modo) {
    const bandeja = modo === 'bandeja';
    $('tab-bandeja').setAttribute('aria-selected', String(bandeja));
    $('tab-pegar').setAttribute('aria-selected', String(!bandeja));
    $('vista-bandeja').hidden = !bandeja;
    $('vista-pegar').hidden = bandeja;
    if (bandeja) {
      if (estado.seleccionado) seleccionar(estado.seleccionado); else vistaInicial();
    } else {
      $('correo').replaceChildren(el('div', { clase: 'vacio vacio-compacto' },
        el('h3', null, 'Correo pegado'),
        el('p', null, 'Pega el correo con sus cabeceras (De, Fecha, Asunto) y el texto de los adjuntos, y pulsa «Prellenar Request».')));
      const previo = estado.resultados[PEGADO];
      if (previo) mostrar(vistaResultado(previo, previo.__ms)); else $('resultado').replaceChildren();
    }
  }

  function validarPegado(mensaje) {
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
        ponerConexion('sin-configurar', 'Falta configurar el modelo', datos.ruta);
        mostrarAviso('info',
          el('p', { clase: 'aviso-texto' }, el('strong', null, 'El servicio todavía no está configurado. '),
            'La bandeja funciona, pero falta OPENROUTER_API_KEY en Vercel para prellenar con el modelo.'),
          enlaceDemo());
      } else {
        ponerConexion('conectado', 'Conectado · ' + nombre, datos.ruta);
      }
      if (datos.requiere_codigo) $('bloque-codigo').hidden = false;
    } catch (_) {
      ponerConexion('sin-backend', 'Sin backend (solo interfaz)');
      mostrarAviso('info', el('p', { clase: 'aviso-texto' }, el('strong', null, 'No se encontró el backend. '), C.health + ' no responde.'), enlaceDemo());
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
    actualizarContador();
    vistaInicial();

    $('tab-bandeja').addEventListener('click', () => cambiarPestana('bandeja'));
    $('tab-pegar').addEventListener('click', () => cambiarPestana('pegar'));
    $('reiniciar').addEventListener('click', () => {
      estado.progreso = {};
      estado.resultados = {};
      estado.seleccionado = null;
      guardarProgreso();
      pintarBandeja();
      vistaInicial();
      anunciar('Bandeja reiniciada');
    });

    $('formulario').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const mensaje = $('mensaje').value.trim();
      const problema = validarPegado(mensaje);
      if (problema) { errorCampo(problema); $('mensaje').focus(); return; }
      errorCampo('');
      procesar({ mensaje }, PEGADO);
    });
    $('mensaje').addEventListener('input', () => { actualizarContador(); errorCampo(''); });
    $('mensaje').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('formulario').requestSubmit(); }
    });
    $('limpiar').addEventListener('click', () => {
      $('mensaje').value = '';
      actualizarContador();
      errorCampo('');
      delete estado.resultados[PEGADO];
      $('resultado').replaceChildren();
      $('mensaje').focus();
    });
    $('codigo').value = estado.codigo;
    $('codigo').addEventListener('input', () => {
      estado.codigo = $('codigo').value.trim();
      guardar(sessionStorage, 'intake_codigo', estado.codigo);
      $('codigo').removeAttribute('aria-invalid');
    });

    if (estado.demo) {
      ponerConexion('demo', 'Modo demostración', 'B');
      avisoDemo();
    } else {
      comprobarSalud();
    }
    cargarBandeja();
  }

  iniciar();
})();
