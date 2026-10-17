/* ============================================================================
   Intake de solicitudes en Plunet · configuración de la interfaz (contrato 1.0-plunet)

   Adaptado del config.js del Kit MVP. Es el archivo para cambiar textos, etiquetas y ejemplos.
   El archivo es público (lo descarga cualquiera que abra la página):
   NO pongas aquí claves, tokens ni direcciones internas. Solo datos sintéticos.
   ============================================================================ */
window.MESA_CONFIG = {
  // 1) Textos de la pantalla
  titulo: "Intake de solicitudes · Plunet",
  subtitulo: "Prellena el Request de Plunet BusinessManager desde el correo del cliente · LILT Operaciones (datos sintéticos)",

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
        detalle: "El borrador del Request está prellenado. El PM revisa los campos marcados y crea el Request en Plunet.",
      },
      cola_manual: {
        titulo: "Cola manual",
        detalle: "La evidencia no alcanza (score_global < 0.60): no se prellena y el PM carga la solicitud a mano.",
      },
      fuera_de_alcance: {
        titulo: "Fuera de alcance",
        detalle: "No es una solicitud nueva (cambio de proyecto, precio u otro tema). No se prellena ningún Request.",
      },
    },
    campos: {
      cliente_id: { nombre: "Cliente", plunet: "customerID" },
      contrato_id: { nombre: "Contrato", plunet: "—" },
      idioma_origen: { nombre: "Idioma origen", plunet: "sourceLanguage" },
      idiomas_destino: { nombre: "Idiomas destino", plunet: "targetLanguage (por item)" },
      servicio: { nombre: "Servicio", plunet: "service (por item)" },
      tipo_documento: { nombre: "Tipo de documento", plunet: "subject" },
      deadline_solicitado: { nombre: "Entrega solicitada", plunet: "deliveryDeadline" },
      notas_cliente: { nombre: "Notas del cliente", plunet: "briefDescription" },
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

  // 4) Ejemplos: P1-P3 del PoC más el remitente gmail. «demo» es la respuesta guardada para el modo demostración
  //    (?demo=1): salió del mismo workflow con el modelo simulado de las pruebas, no del modelo real.
  ejemplos: [
    {
      "id": "p1",
      "etiqueta": "P1 · PharmaXYZ, ICF",
      "tipo": "camino feliz",
      "mensaje": "De: maria.lopez@pharmaxyz.com\nPara: projects@lilt.com\nFecha: 2026-09-15 09:12\nAsunto: Traducción urgente ICF - Estudio PX-4471\n\nHola equipo:\nLes adjunto el consentimiento informado del estudio PX-4471. Necesitamos traducción con back-translation del inglés al español (México) y al portugués (Brasil).\nLa fecha de entrega es el 22 de septiembre de 2026. Por favor mantener el formato del sponsor.\nSaludos,\nMaría López\nPharmaXYZ\n\n--- Adjunto: ICF_PX4471_EN.pdf (14 páginas, PDF nativo) ---\n[p.1] INFORMED CONSENT FORM. Study PX-4471: A Phase III, randomized, double-blind study of PX-44 in adults with moderate asthma.\n[p.1] You are being invited to take part in a research study. Please read this form carefully before you decide to participate.\n[p.2] What will happen if I take part? You will visit the study clinic 8 times over 12 months.",
      "demo": {
        "ok": true,
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
            "detalle": "citas literales 7 de 7 · cliente: dominio pharmaxyz.com → PHX-0148 · 1 campos para revisar"
          },
          {
            "tipo": "paso",
            "nombre": "derivar",
            "detalle": "regla → pendiente_revision (score 0.95)"
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
    {
      "id": "p2",
      "etiqueta": "P2 · «Los idiomas de siempre»",
      "tipo": "incertidumbre",
      "mensaje": "De: j.perez@biomedsur.cl\nPara: projects@lilt.com\nFecha: 2026-09-16 15:40\nAsunto: Material pacientes\n\nHola, por favor traducir el adjunto a los idiomas de siempre. Gracias.\nJuan Pérez\n\n--- Adjunto: folleto_paciente_scan.pdf (6 páginas, escaneado, texto obtenido por OCR) ---\n[p.1] PATIENT INFORMATION LEAFLET. How to take your medicine safely.\n[p.1] Read all of this leaflet carefully before you start taking this medicine. Keep this leaflet, you may need to read it again.\n[p.2] Possible side effects: like all medicines, this medicine can cause side effects.",
      "demo": {
        "ok": true,
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
        "request_plunet": {
          "customerID": "BMS-0032",
          "sourceLanguage": "en",
          "targetLanguage (por item)": [],
          "deliveryDeadline": null,
          "service (por item)": "traduccion",
          "subject": "material_paciente",
          "briefDescription": "a los idiomas de siempre",
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
    {
      "id": "p3",
      "etiqueta": "P3 · Agregar francés y precio",
      "tipo": "fuera de alcance",
      "mensaje": "De: k.schmidt@nordtrial.de\nPara: projects@lilt.com\nFecha: 2026-09-17 11:05\nAsunto: RE: Proyecto P-2026-0871 - agregar francés\n\nHola:\nEn el proyecto P-2026-0871 que ya tienen abierto, ¿pueden agregar francés como idioma destino?\nY envíenme por favor el precio final por correo.\nGracias,\nKlaus Schmidt\nNordTrial GmbH",
      "demo": {
        "ok": true,
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
    {
      "id": "p4",
      "etiqueta": "P4 · Remitente gmail",
      "tipo": "cliente dudoso",
      "mensaje": "De: ana.rios@gmail.com\nPara: projects@lilt.com\nFecha: 2026-09-18 08:30\nAsunto: Traducción etiqueta\n\nHola, soy de MedLabel Andina. Necesito traducir la etiqueta adjunta del español al inglés para el 30 de septiembre de 2026.\n\n--- Adjunto: etiqueta_MLA-22.docx (1 página) ---\n[p.1] Conservar a temperatura ambiente. Mantener fuera del alcance de los niños. Lote: MLA-22.",
      "demo": {
        "ok": true,
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
    }
  ],

  // 5) Ayuda que se muestra según el tipo de error (los códigos son los del contrato)
  errores: {
    validacion: {
      titulo: "El correo no es válido",
      ayuda: "Pega el correo completo (De, Fecha, Asunto, cuerpo) y el texto de los adjuntos: entre 20 y 6000 caracteres.",
    },
    acceso: {
      titulo: "Falta el código de acceso",
      ayuda: "Este despliegue pide un código para proteger la cuota del modelo. Escríbelo en el campo «Código de acceso» y vuelve a intentar.",
    },
    limite: {
      titulo: "Demasiadas solicitudes seguidas",
      ayuda: "El servicio limita cuántas consultas se pueden hacer por minuto. Espera unos segundos y vuelve a intentar.",
    },
    sin_configurar: {
      titulo: "El servicio todavía no está configurado",
      ayuda: "Falta OPENROUTER_API_KEY en las variables de entorno de Vercel. Después de definirla hay que volver a desplegar. Mientras tanto, puedes ver la interfaz en modo demostración.",
    },
    cuota_ia: {
      titulo: "Se agotó la cuota del modelo",
      ayuda: "El modelo gratuito tiene límites por minuto y por día. Espera un poco o intenta mañana.",
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
      ayuda: "Suele pasar cuando la función /api/intake no está desplegada (404) o falló al iniciar (500). Revisa los registros del despliegue en Vercel.",
    },
  },
};
