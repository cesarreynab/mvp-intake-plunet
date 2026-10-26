/* ============================================================================
   Intake de solicitudes en Plunet · configuración de la interfaz (contrato 1.0-plunet)

   Adaptado del config.js del Kit MVP. Es el archivo para cambiar textos y etiquetas.
   El archivo es público (lo descarga cualquiera que abra la página):
   NO pongas aquí claves, tokens ni direcciones internas. Solo datos sintéticos.
   ============================================================================ */
window.MESA_CONFIG = {
  // 1) Textos de la pantalla
  titulo: "Intake de solicitudes · Plunet",
  subtitulo: "Operaciones LILT · buzón projects@lilt.com · datos sintéticos",
  buzon: "projects@lilt.com",

  // 2) Conexión con el backend
  endpoint: "/api/intake",
  health: "/api/health",
  minCaracteres: 20,
  maxCaracteres: 6000,
  timeoutMs: 130000,   // un poco más que maxDuration de la función en vercel.json (120 s)

  // 3) Cómo se escribe en pantalla cada valor del contrato
  etiquetas: {
    estados: {
      pendiente_revision: {
        titulo: "Listo para revisión del PM",
        detalle: "El borrador está prellenado. El PM revisa los campos marcados, corrige si hace falta y crea el Request.",
      },
      cola_manual: {
        titulo: "Cola manual",
        detalle: "La evidencia no alcanza (score_global < 0.60): no se prellena y el PM carga la solicitud a mano.",
      },
      fuera_de_alcance: {
        titulo: "Fuera de alcance",
        detalle: "No es una solicitud nueva de traducción (cambio de proyecto, precio, facturación u otro tema).",
      },
    },
    semaforos: {
      alcanza: "Alcanza",
      ajustado: "Ajustado",
      no_alcanza: "No alcanza",
      sin_fecha: "Sin fecha pedida",
    },
    estadosCortos: {
      pendiente_revision: "Por revisar",
      cola_manual: "Cola manual",
      fuera_de_alcance: "Fuera de alcance",
    },
    campos: {
      cliente_id: { nombre: "Cliente", plunet: "customerID" },
      contrato_id: { nombre: "Contrato", plunet: "contrato" },
      idioma_origen: { nombre: "Idioma origen", plunet: "sourceLanguage" },
      idiomas_destino: { nombre: "Idiomas destino", plunet: "targetLanguage" },
      servicio: { nombre: "Servicio", plunet: "service" },
      tipo_documento: { nombre: "Tipo de documento", plunet: "subject" },
      deadline_solicitado: { nombre: "Entrega", plunet: "deliveryDeadline" },
      notas_cliente: { nombre: "Notas", plunet: "briefDescription" },
      cliente_nombre: { nombre: "Razón social", plunet: "—" },
    },
    tiposDocumento: {
      consentimiento_informado: "Consentimiento informado",
      etiquetado: "Etiquetado",
      protocolo: "Protocolo",
      material_paciente: "Material para pacientes",
      contrato: "Contrato",
      otro: "Otro",
    },
    servicios: {
      traduccion: "Traducción",
      traduccion_back_translation: "Traducción + back-translation",
      revision: "Revisión",
      dtp: "DTP",
    },
    rutas: {
      A: "Llamada simple",
      B: "Workflow",
      R: "RAG",
      C: "Agente",
      D: "Multiagente",
    },
    backends: {
      langchain: "LangChain",
      demo: "Demostración",
    },
  },

  // 4) Modo demostración (?demo=1): respuesta guardada para cada correo de la bandeja. Salió del mismo workflow
  //    con el modelo simulado de las pruebas (tests/casos.py), no del modelo real.
  demo: {
    "msg-20261026-1310-phx": {
      "ok": true,
      "message_id": "msg-20261026-1310-phx",
      "fecha_correo": "2026-10-26",
      "estado": "fuera_de_alcance",
      "razon": "Pide reenviar una factura; no es una solicitud de traducción.",
      "alerta": "",
      "score_global": 0.16,
      "campos": {
        "cliente_id": "PHX-0148",
        "cliente_nombre": "PharmaXYZ",
        "contrato_id": null,
        "idioma_origen": null,
        "idiomas_destino": [],
        "tipo_documento": null,
        "servicio": null,
        "deadline_solicitado": null,
        "notas_cliente": null
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "cliente_nombre": 0.95,
        "idioma_origen": 0.0,
        "idiomas_destino": 0.0,
        "tipo_documento": 0.0,
        "servicio": 0.0,
        "deadline_solicitado": 0.0,
        "notas_cliente": 0.0
      },
      "campos_baja_confianza": [
        "idioma_origen",
        "idiomas_destino",
        "tipo_documento",
        "servicio",
        "deadline_solicitado",
        "contrato_id"
      ],
      "evidencia": [
        {
          "campo": "cliente_nombre",
          "fuente": "correo",
          "fragmento": "PharmaXYZ",
          "confianza": 0.95
        }
      ],
      "archivos": [],
      "volumen": null,
      "estimacion": null,
      "request_plunet": null,
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 0 campos propuestos, 1 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 1 de 1 · cliente: dominio pharmaxyz.com → PHX-0148 · 6 campos para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → fuera_de_alcance (score 0.16)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "sin adjuntos: no hay palabras que contar"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20261026-1230-nfc": {
      "ok": true,
      "message_id": "msg-20261026-1230-nfc",
      "fecha_correo": "2026-10-26",
      "estado": "cola_manual",
      "razon": "score_global 0.43 < 0.6: no se prellena",
      "alerta": "",
      "score_global": 0.43,
      "campos": {
        "cliente_id": null,
        "cliente_nombre": null,
        "contrato_id": null,
        "idioma_origen": "en",
        "idiomas_destino": [],
        "tipo_documento": "otro",
        "servicio": "traduccion",
        "deadline_solicitado": null,
        "notas_cliente": null
      },
      "confianza_por_campo": {
        "cliente_id": 0.0,
        "idioma_origen": 0.9,
        "idiomas_destino": 0.0,
        "tipo_documento": 0.8,
        "servicio": 0.9,
        "deadline_solicitado": 0.0,
        "notas_cliente": 0.0
      },
      "campos_baja_confianza": [
        "idiomas_destino",
        "deadline_solicitado",
        "cliente_id",
        "contrato_id"
      ],
      "evidencia": [
        {
          "campo": "idioma_origen",
          "fuente": "kickoff_deck.pptx diapositiva 1",
          "fragmento": "Project kickoff. Q4 launch plan.",
          "confianza": 0.9
        },
        {
          "campo": "tipo_documento",
          "fuente": "kickoff_deck.pptx",
          "fragmento": "kickoff_deck.pptx",
          "confianza": 0.8
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "necesitamos traducir el material adjunto",
          "confianza": 0.9
        }
      ],
      "archivos": [
        {
          "nombre": "kickoff_deck.pptx",
          "detalle": "12 diapositivas"
        }
      ],
      "volumen": {
        "palabras": 420,
        "paginas": 12,
        "archivos": [
          {
            "nombre": "kickoff_deck.pptx",
            "palabras": 420,
            "paginas": 12,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": null,
      "request_plunet": null,
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 3 campos propuestos, 3 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 3 de 3 · cliente: dominio nuevafarma-consultores.com sin cliente registrado · 4 campos para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → cola_manual (score 0.43)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "420 palabras · plazo: faltan servicio o idiomas"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20261026-1102-bms": {
      "ok": true,
      "message_id": "msg-20261026-1102-bms",
      "fecha_correo": "2026-10-26",
      "estado": "pendiente_revision",
      "razon": "score_global 0.8; revisar: deadline_solicitado",
      "alerta": "",
      "score_global": 0.8,
      "campos": {
        "cliente_id": "BMS-0032",
        "cliente_nombre": "BioMed Sur",
        "contrato_id": "CTR-2025-114",
        "idioma_origen": "es",
        "idiomas_destino": [
          "en",
          "pt-BR"
        ],
        "tipo_documento": "consentimiento_informado",
        "servicio": "traduccion",
        "deadline_solicitado": null,
        "notas_cliente": "No hay apuro, para cuando puedan."
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "idioma_origen": 0.95,
        "idiomas_destino": 0.95,
        "tipo_documento": 0.95,
        "servicio": 0.95,
        "deadline_solicitado": 0.0,
        "notas_cliente": 0.9
      },
      "campos_baja_confianza": [
        "deadline_solicitado"
      ],
      "evidencia": [
        {
          "campo": "idioma_origen",
          "fuente": "ICF_BMS-118_ES.pdf p.1",
          "fragmento": "CONSENTIMIENTO INFORMADO",
          "confianza": 0.95
        },
        {
          "campo": "idiomas_destino",
          "fuente": "correo",
          "fragmento": "del español al inglés y al portugués (Brasil)",
          "confianza": 0.95
        },
        {
          "campo": "tipo_documento",
          "fuente": "correo",
          "fragmento": "el consentimiento informado del estudio BMS-118",
          "confianza": 0.95
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "Necesitamos la traducción",
          "confianza": 0.95
        },
        {
          "campo": "notas_cliente",
          "fuente": "correo",
          "fragmento": "No hay apuro, para cuando puedan",
          "confianza": 0.9
        }
      ],
      "archivos": [
        {
          "nombre": "ICF_BMS-118_ES.pdf",
          "detalle": "9 páginas, PDF nativo"
        }
      ],
      "volumen": {
        "palabras": 2870,
        "paginas": 9,
        "archivos": [
          {
            "nombre": "ICF_BMS-118_ES.pdf",
            "palabras": 2870,
            "paginas": 9,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": {
        "servicio": "traduccion",
        "idiomas": 2,
        "dias_habiles": 3,
        "esfuerzo_dias_persona": 6,
        "pasos": [
          "Traducción: 2.870 palabras ÷ 2.500 por día = 2 días",
          "Revisión bilingüe y QA: 1 día"
        ],
        "supuesto": "Traducción a 2.500 palabras por día por lingüista, más 1 día de revisión y QA.",
        "entrega_estimada": "2026-10-29",
        "plazo_cliente_dias_habiles": null,
        "holgura_dias": null,
        "semaforo": "sin_fecha"
      },
      "request_plunet": {
        "customerID": "BMS-0032",
        "sourceLanguage": "es",
        "targetLanguage (por item)": [
          "en",
          "pt-BR"
        ],
        "deliveryDeadline": null,
        "service (por item)": "traduccion",
        "subject": "consentimiento_informado",
        "briefDescription": "No hay apuro, para cuando puedan.",
        "wordCount": 2870,
        "estado": "borrador_pendiente_confirmacion_PM"
      },
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 5 campos propuestos, 5 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 5 de 5 · cliente: dominio biomedsur.cl → BMS-0032 · 1 campo para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → pendiente_revision (score 0.8)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "2.870 palabras · 3 días hábiles · sin fecha"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20261026-1015-mdl": {
      "ok": true,
      "message_id": "msg-20261026-1015-mdl",
      "fecha_correo": "2026-10-26",
      "estado": "pendiente_revision",
      "razon": "score_global 0.95; revisar: ninguno",
      "alerta": "",
      "score_global": 0.95,
      "campos": {
        "cliente_id": "MDL-0310",
        "cliente_nombre": "MedLabel Andina",
        "contrato_id": "CTR-2026-022",
        "idioma_origen": "es",
        "idiomas_destino": [
          "pt-BR"
        ],
        "tipo_documento": "etiquetado",
        "servicio": "revision",
        "deadline_solicitado": "2026-10-30",
        "notas_cliente": null
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "idioma_origen": 0.95,
        "idiomas_destino": 0.95,
        "tipo_documento": 0.95,
        "servicio": 0.95,
        "deadline_solicitado": 0.95,
        "notas_cliente": 0.0
      },
      "campos_baja_confianza": [],
      "evidencia": [
        {
          "campo": "idioma_origen",
          "fuente": "correo",
          "fragmento": "del español al portugués (Brasil)",
          "confianza": 0.95
        },
        {
          "campo": "idiomas_destino",
          "fuente": "correo",
          "fragmento": "del español al portugués (Brasil)",
          "confianza": 0.95
        },
        {
          "campo": "tipo_documento",
          "fuente": "correo",
          "fragmento": "las etiquetas del lote 7",
          "confianza": 0.95
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "necesitamos solo la revisión",
          "confianza": 0.95
        },
        {
          "campo": "deadline_solicitado",
          "fuente": "correo",
          "fragmento": "30 de octubre de 2026",
          "confianza": 0.95
        }
      ],
      "archivos": [
        {
          "nombre": "etiquetas_lote7_ES-PT.xlsx",
          "detalle": "1 hoja, 120 filas"
        }
      ],
      "volumen": {
        "palabras": 960,
        "paginas": null,
        "archivos": [
          {
            "nombre": "etiquetas_lote7_ES-PT.xlsx",
            "palabras": 960,
            "paginas": null,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": {
        "servicio": "revision",
        "idiomas": 1,
        "dias_habiles": 1,
        "esfuerzo_dias_persona": 1,
        "pasos": [
          "Revisión: 960 palabras ÷ 6.000 por día = 1 día"
        ],
        "supuesto": "Revisión a 6.000 palabras por día por revisor.",
        "entrega_estimada": "2026-10-27",
        "plazo_cliente_dias_habiles": 4,
        "holgura_dias": 3,
        "semaforo": "alcanza"
      },
      "request_plunet": {
        "customerID": "MDL-0310",
        "sourceLanguage": "es",
        "targetLanguage (por item)": [
          "pt-BR"
        ],
        "deliveryDeadline": "2026-10-30",
        "service (por item)": "revision",
        "subject": "etiquetado",
        "briefDescription": null,
        "wordCount": 960,
        "estado": "borrador_pendiente_confirmacion_PM"
      },
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 5 campos propuestos, 5 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 5 de 5 · cliente: dominio medlabel.pe → MDL-0310 · 0 campos para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → pendiente_revision (score 0.95)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "960 palabras · 1 días hábiles · alcanza"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20261026-0847-clv": {
      "ok": true,
      "message_id": "msg-20261026-0847-clv",
      "fecha_correo": "2026-10-26",
      "estado": "pendiente_revision",
      "razon": "score_global 0.95; revisar: contrato_id",
      "alerta": "",
      "score_global": 0.95,
      "campos": {
        "cliente_id": "CLV-0091",
        "cliente_nombre": "ClinVida Research",
        "contrato_id": null,
        "idioma_origen": "en",
        "idiomas_destino": [
          "es-ES",
          "fr-FR"
        ],
        "tipo_documento": "protocolo",
        "servicio": "traduccion",
        "deadline_solicitado": "2026-11-14",
        "notas_cliente": "Mantener la numeración de secciones."
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "idioma_origen": 0.95,
        "idiomas_destino": 0.95,
        "tipo_documento": 0.95,
        "servicio": 0.95,
        "deadline_solicitado": 0.95,
        "notas_cliente": 0.95
      },
      "campos_baja_confianza": [
        "contrato_id"
      ],
      "evidencia": [
        {
          "campo": "idioma_origen",
          "fuente": "CV-2210_Protocol_v3.0.docx p.1",
          "fragmento": "CLINICAL STUDY PROTOCOL",
          "confianza": 0.95
        },
        {
          "campo": "idiomas_destino",
          "fuente": "correo",
          "fragmento": "al español (España) y al francés (Francia)",
          "confianza": 0.95
        },
        {
          "campo": "tipo_documento",
          "fuente": "CV-2210_Protocol_v3.0.docx p.1",
          "fragmento": "CLINICAL STUDY PROTOCOL",
          "confianza": 0.95
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "Necesitamos la traducción",
          "confianza": 0.95
        },
        {
          "campo": "deadline_solicitado",
          "fuente": "correo",
          "fragmento": "14 de noviembre de 2026",
          "confianza": 0.95
        },
        {
          "campo": "notas_cliente",
          "fuente": "correo",
          "fragmento": "mantener la numeración de secciones",
          "confianza": 0.95
        }
      ],
      "archivos": [
        {
          "nombre": "CV-2210_Protocol_v3.0.docx",
          "detalle": "48 páginas, DOCX"
        }
      ],
      "volumen": {
        "palabras": 14350,
        "paginas": 48,
        "archivos": [
          {
            "nombre": "CV-2210_Protocol_v3.0.docx",
            "palabras": 14350,
            "paginas": 48,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": {
        "servicio": "traduccion",
        "idiomas": 2,
        "dias_habiles": 7,
        "esfuerzo_dias_persona": 14,
        "pasos": [
          "Traducción: 14.350 palabras ÷ 2.500 por día = 6 días",
          "Revisión bilingüe y QA: 1 día"
        ],
        "supuesto": "Traducción a 2.500 palabras por día por lingüista, más 1 día de revisión y QA.",
        "entrega_estimada": "2026-11-04",
        "plazo_cliente_dias_habiles": 14,
        "holgura_dias": 7,
        "semaforo": "alcanza"
      },
      "request_plunet": {
        "customerID": "CLV-0091",
        "sourceLanguage": "en",
        "targetLanguage (por item)": [
          "es-ES",
          "fr-FR"
        ],
        "deliveryDeadline": "2026-11-14",
        "service (por item)": "traduccion",
        "subject": "protocolo",
        "briefDescription": "Mantener la numeración de secciones.",
        "wordCount": 14350,
        "estado": "borrador_pendiente_confirmacion_PM"
      },
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 6 campos propuestos, 6 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 6 de 6 · cliente: dominio clinvida.com → CLV-0091 · 1 campo para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → pendiente_revision (score 0.95)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "14.350 palabras · 7 días hábiles · alcanza"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20260918-0830-gml": {
      "ok": true,
      "message_id": "msg-20260918-0830-gml",
      "fecha_correo": "2026-09-18",
      "estado": "pendiente_revision",
      "razon": "score_global 0.79; revisar: cliente_id, contrato_id",
      "alerta": "Posible cliente MedLabel Andina (MDL-0310) solo por razón social; el remitente es de dominio público. El PM debe confirmarlo.",
      "score_global": 0.79,
      "campos": {
        "cliente_id": null,
        "cliente_nombre": "MedLabel Andina",
        "contrato_id": null,
        "idioma_origen": "es",
        "idiomas_destino": [
          "en"
        ],
        "tipo_documento": "etiquetado",
        "servicio": "traduccion",
        "deadline_solicitado": "2026-09-30",
        "notas_cliente": null
      },
      "confianza_por_campo": {
        "cliente_id": 0.7,
        "cliente_nombre": 0.8,
        "idioma_origen": 0.95,
        "idiomas_destino": 0.95,
        "tipo_documento": 0.95,
        "servicio": 0.95,
        "deadline_solicitado": 0.95,
        "notas_cliente": 0.0
      },
      "campos_baja_confianza": [
        "cliente_id",
        "contrato_id"
      ],
      "evidencia": [
        {
          "campo": "cliente_nombre",
          "fuente": "correo",
          "fragmento": "soy de MedLabel Andina",
          "confianza": 0.8
        },
        {
          "campo": "idioma_origen",
          "fuente": "correo",
          "fragmento": "del español al inglés",
          "confianza": 0.95
        },
        {
          "campo": "idiomas_destino",
          "fuente": "correo",
          "fragmento": "del español al inglés",
          "confianza": 0.95
        },
        {
          "campo": "tipo_documento",
          "fuente": "correo",
          "fragmento": "la etiqueta adjunta",
          "confianza": 0.95
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "Necesito traducir",
          "confianza": 0.95
        },
        {
          "campo": "deadline_solicitado",
          "fuente": "correo",
          "fragmento": "30 de septiembre de 2026",
          "confianza": 0.95
        }
      ],
      "archivos": [
        {
          "nombre": "etiqueta_MLA-22.docx",
          "detalle": "1 página"
        }
      ],
      "volumen": {
        "palabras": 62,
        "paginas": 1,
        "archivos": [
          {
            "nombre": "etiqueta_MLA-22.docx",
            "palabras": 62,
            "paginas": 1,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": {
        "servicio": "traduccion",
        "idiomas": 1,
        "dias_habiles": 2,
        "esfuerzo_dias_persona": 2,
        "pasos": [
          "Traducción: 62 palabras ÷ 2.500 por día = 1 día",
          "Revisión bilingüe y QA: 1 día"
        ],
        "supuesto": "Traducción a 2.500 palabras por día por lingüista, más 1 día de revisión y QA.",
        "entrega_estimada": "2026-09-22",
        "plazo_cliente_dias_habiles": 8,
        "holgura_dias": 6,
        "semaforo": "alcanza"
      },
      "request_plunet": {
        "customerID": null,
        "sourceLanguage": "es",
        "targetLanguage (por item)": [
          "en"
        ],
        "deliveryDeadline": "2026-09-30",
        "service (por item)": "traduccion",
        "subject": "etiquetado",
        "briefDescription": null,
        "wordCount": 62,
        "estado": "borrador_pendiente_confirmacion_PM"
      },
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 5 campos propuestos, 6 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 6 de 6 · cliente: razón social → posible MDL-0310 (sin dominio registrado) · 2 campos para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → pendiente_revision (score 0.79)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "62 palabras · 2 días hábiles · alcanza"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20260917-1105-ntr": {
      "ok": true,
      "message_id": "msg-20260917-1105-ntr",
      "fecha_correo": "2026-09-17",
      "estado": "fuera_de_alcance",
      "razon": "Pide modificar el proyecto existente P-2026-0871 y un precio; no es una solicitud nueva.",
      "alerta": "",
      "score_global": 0.16,
      "campos": {
        "cliente_id": "NTR-0207",
        "cliente_nombre": "NordTrial GmbH",
        "contrato_id": "CTR-2026-009",
        "idioma_origen": null,
        "idiomas_destino": [],
        "tipo_documento": null,
        "servicio": null,
        "deadline_solicitado": null,
        "notas_cliente": "Agregar francés al proyecto P-2026-0871 y enviar precio final por correo."
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "cliente_nombre": 0.95,
        "idioma_origen": 0.0,
        "idiomas_destino": 0.0,
        "tipo_documento": 0.0,
        "servicio": 0.0,
        "deadline_solicitado": 0.0,
        "notas_cliente": 0.95
      },
      "campos_baja_confianza": [
        "idioma_origen",
        "idiomas_destino",
        "tipo_documento",
        "servicio",
        "deadline_solicitado"
      ],
      "evidencia": [
        {
          "campo": "cliente_nombre",
          "fuente": "correo",
          "fragmento": "NordTrial GmbH",
          "confianza": 0.95
        },
        {
          "campo": "notas_cliente",
          "fuente": "correo",
          "fragmento": "agregar francés como idioma destino",
          "confianza": 0.95
        }
      ],
      "archivos": [],
      "volumen": null,
      "estimacion": null,
      "request_plunet": null,
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 1 campos propuestos, 2 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 2 de 2 · cliente: dominio nordtrial.de → NTR-0207 · 5 campos para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → fuera_de_alcance (score 0.16)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "sin adjuntos: no hay palabras que contar"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20260916-1540-bms": {
      "ok": true,
      "message_id": "msg-20260916-1540-bms",
      "fecha_correo": "2026-09-16",
      "estado": "pendiente_revision",
      "razon": "score_global 0.64; revisar: idiomas_destino, deadline_solicitado",
      "alerta": "",
      "score_global": 0.64,
      "campos": {
        "cliente_id": "BMS-0032",
        "cliente_nombre": "BioMed Sur",
        "contrato_id": "CTR-2025-114",
        "idioma_origen": "en",
        "idiomas_destino": [],
        "tipo_documento": "material_paciente",
        "servicio": "traduccion",
        "deadline_solicitado": null,
        "notas_cliente": "a los idiomas de siempre"
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "idioma_origen": 0.95,
        "idiomas_destino": 0.0,
        "tipo_documento": 0.95,
        "servicio": 0.95,
        "deadline_solicitado": 0.0,
        "notas_cliente": 0.9
      },
      "campos_baja_confianza": [
        "idiomas_destino",
        "deadline_solicitado"
      ],
      "evidencia": [
        {
          "campo": "idioma_origen",
          "fuente": "folleto_paciente_scan.pdf p.1",
          "fragmento": "PATIENT INFORMATION LEAFLET. How to take your medicine safely.",
          "confianza": 0.95
        },
        {
          "campo": "tipo_documento",
          "fuente": "folleto_paciente_scan.pdf p.1",
          "fragmento": "PATIENT INFORMATION LEAFLET",
          "confianza": 0.95
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "por favor traducir el adjunto",
          "confianza": 0.95
        },
        {
          "campo": "notas_cliente",
          "fuente": "correo",
          "fragmento": "a los idiomas de siempre",
          "confianza": 0.9
        }
      ],
      "archivos": [
        {
          "nombre": "folleto_paciente_scan.pdf",
          "detalle": "6 páginas, escaneado, texto obtenido por OCR"
        }
      ],
      "volumen": {
        "palabras": 1640,
        "paginas": 6,
        "archivos": [
          {
            "nombre": "folleto_paciente_scan.pdf",
            "palabras": 1640,
            "paginas": 6,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": null,
      "request_plunet": {
        "customerID": "BMS-0032",
        "sourceLanguage": "en",
        "targetLanguage (por item)": [],
        "deliveryDeadline": null,
        "service (por item)": "traduccion",
        "subject": "material_paciente",
        "briefDescription": "a los idiomas de siempre",
        "wordCount": 1640,
        "estado": "borrador_pendiente_confirmacion_PM"
      },
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 4 campos propuestos, 4 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 4 de 4 · cliente: dominio biomedsur.cl → BMS-0032 · 2 campos para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → pendiente_revision (score 0.64)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "1.640 palabras · plazo: faltan servicio o idiomas"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    },
    "msg-20260915-0912-phx": {
      "ok": true,
      "message_id": "msg-20260915-0912-phx",
      "fecha_correo": "2026-09-15",
      "estado": "pendiente_revision",
      "razon": "score_global 0.95; revisar: contrato_id",
      "alerta": "",
      "score_global": 0.95,
      "campos": {
        "cliente_id": "PHX-0148",
        "cliente_nombre": "PharmaXYZ",
        "contrato_id": null,
        "idioma_origen": "en",
        "idiomas_destino": [
          "es-MX",
          "pt-BR"
        ],
        "tipo_documento": "consentimiento_informado",
        "servicio": "traduccion_back_translation",
        "deadline_solicitado": "2026-09-22",
        "notas_cliente": "Por favor mantener el formato del sponsor."
      },
      "confianza_por_campo": {
        "cliente_id": 0.98,
        "cliente_nombre": 0.95,
        "idioma_origen": 0.95,
        "idiomas_destino": 0.95,
        "tipo_documento": 0.95,
        "servicio": 0.95,
        "deadline_solicitado": 0.95,
        "notas_cliente": 0.95
      },
      "campos_baja_confianza": [
        "contrato_id"
      ],
      "evidencia": [
        {
          "campo": "cliente_nombre",
          "fuente": "correo",
          "fragmento": "PharmaXYZ",
          "confianza": 0.95
        },
        {
          "campo": "idioma_origen",
          "fuente": "ICF_PX4471_EN.pdf p.1",
          "fragmento": "INFORMED CONSENT FORM",
          "confianza": 0.95
        },
        {
          "campo": "idiomas_destino",
          "fuente": "correo",
          "fragmento": "español (México) y al portugués (Brasil)",
          "confianza": 0.95
        },
        {
          "campo": "tipo_documento",
          "fuente": "correo",
          "fragmento": "consentimiento informado",
          "confianza": 0.95
        },
        {
          "campo": "servicio",
          "fuente": "correo",
          "fragmento": "traducción con back-translation",
          "confianza": 0.95
        },
        {
          "campo": "deadline_solicitado",
          "fuente": "correo",
          "fragmento": "22 de septiembre de 2026",
          "confianza": 0.95
        },
        {
          "campo": "notas_cliente",
          "fuente": "correo",
          "fragmento": "Por favor mantener el formato del sponsor",
          "confianza": 0.95
        }
      ],
      "archivos": [
        {
          "nombre": "ICF_PX4471_EN.pdf",
          "detalle": "14 páginas, PDF nativo"
        }
      ],
      "volumen": {
        "palabras": 4820,
        "paginas": 14,
        "archivos": [
          {
            "nombre": "ICF_PX4471_EN.pdf",
            "palabras": 4820,
            "paginas": 14,
            "fuente": "conteo del extractor sobre el archivo completo"
          }
        ],
        "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."
      },
      "estimacion": {
        "servicio": "traduccion_back_translation",
        "idiomas": 2,
        "dias_habiles": 5,
        "esfuerzo_dias_persona": 10,
        "pasos": [
          "Traducción: 4.820 palabras ÷ 2.500 por día = 2 días",
          "Back-translation: 4.820 palabras ÷ 2.500 por día = 2 días",
          "Conciliación y QA: 1 día"
        ],
        "supuesto": "Traducción y back-translation a 2.500 palabras por día cada una, más 1 día de conciliación y QA.",
        "entrega_estimada": "2026-09-22",
        "plazo_cliente_dias_habiles": 5,
        "holgura_dias": 0,
        "semaforo": "ajustado"
      },
      "request_plunet": {
        "customerID": "PHX-0148",
        "sourceLanguage": "en",
        "targetLanguage (por item)": [
          "es-MX",
          "pt-BR"
        ],
        "deliveryDeadline": "2026-09-22",
        "service (por item)": "traduccion_back_translation",
        "subject": "consentimiento_informado",
        "briefDescription": "Por favor mantener el formato del sponsor.",
        "wordCount": 4820,
        "estado": "borrador_pendiente_confirmacion_PM"
      },
      "escrituras_plunet": 0,
      "pasos": [
        {
          "tipo": "paso",
          "nombre": "extraer",
          "detalle": "modelo → 6 campos propuestos, 7 citas"
        },
        {
          "tipo": "paso",
          "nombre": "validar",
          "detalle": "citas literales 7 de 7 · cliente: dominio pharmaxyz.com → PHX-0148 · 1 campo para revisar"
        },
        {
          "tipo": "paso",
          "nombre": "derivar",
          "detalle": "regla → pendiente_revision (score 0.95)"
        },
        {
          "tipo": "paso",
          "nombre": "estimar",
          "detalle": "4.820 palabras · 5 días hábiles · ajustado"
        }
      ],
      "meta": {
        "version": "1.0-plunet",
        "backend": "demo",
        "ruta": "B",
        "modelo": "",
        "llamadas_modelo": 0,
        "latencia_ms": null,
        "id": "demo"
      }
    }
  },

  // 5) Ayuda que se muestra según el tipo de error (los códigos son los del contrato)
  errores: {
    validacion: {
      titulo: "Faltan datos o no son válidos",
      ayuda: "Si pegaste un correo: incluye De, Fecha, Asunto, cuerpo y el texto de los adjuntos (entre 20 y 6000 caracteres).",
    },
    acceso: {
      titulo: "Falta el código de acceso",
      ayuda: "Este despliegue pide un código para proteger la cuota del modelo. Escríbelo en «Código de acceso», debajo de la bandeja, y vuelve a intentar.",
    },
    limite: {
      titulo: "Demasiadas solicitudes seguidas",
      ayuda: "El servicio limita cuántas consultas se pueden hacer por minuto. Espera unos segundos y vuelve a intentar.",
    },
    sin_configurar: {
      titulo: "El servicio todavía no está configurado",
      ayuda: "Falta OPENROUTER_API_KEY en las variables de entorno de Vercel. Mientras tanto, puedes ver la interfaz en modo demostración.",
    },
    cuota_ia: {
      titulo: "Se agotó la cuota del modelo",
      ayuda: "El modelo gratuito tiene límites por minuto y por día. Espera un poco o usa el modo demostración.",
    },
    backend: {
      titulo: "El workflow falló",
      ayuda: "Si el proveedor del modelo está saturado (503), reintenta en un minuto. El identificador de abajo sirve para encontrar esta solicitud en los Logs de Vercel.",
    },
    timeout: {
      titulo: "El workflow tardó demasiado",
      ayuda: "El modelo no respondió a tiempo. Reintenta; si se repite, revisa los Logs de Vercel.",
    },
    respuesta_invalida: {
      titulo: "La respuesta no cumple el contrato",
      ayuda: "El workflow respondió, pero no con los campos del contrato 1.0-plunet. Revisa intake.py y contrato.py.",
    },
    red: {
      titulo: "No se pudo contactar al servidor",
      ayuda: "Revisa tu conexión. Si abriste index.html directamente desde tu computador, no hay servidor: usa el modo demostración o arranca uvicorn.",
    },
    no_json: {
      titulo: "El servidor no respondió con JSON",
      ayuda: "Suele pasar cuando la función no está desplegada (404) o falló al iniciar (500). Revisa los registros del despliegue en Vercel.",
    },
  },
};
