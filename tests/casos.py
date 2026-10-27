"""Casos P1-P4 y extracciones simuladas del modelo, para las pruebas sin cuota.

Las extracciones simuladas reproducen lo que devolvió Nemotron en el PoC (registro_pruebas_LC-B-PLUNET.csv),
con idiomas destino en locale. Sirven para probar el código que rodea al modelo, no al modelo:
la calidad de la extracción real se mide con probar_endpoint.py contra el servidor con la clave.
"""
from pydantic import ValidationError

from datos import BANDEJA_POR_ID, SolicitudTraduccion, texto_correo

P1 = """De: maria.lopez@pharmaxyz.com
Para: projects@lilt.com
Fecha: 2026-09-15 09:12
Asunto: Traducción urgente ICF - Estudio PX-4471

Hola equipo:
Les adjunto el consentimiento informado del estudio PX-4471. Necesitamos traducción con back-translation del inglés al español (México) y al portugués (Brasil).
La fecha de entrega es el 22 de septiembre de 2026. Por favor mantener el formato del sponsor.
Saludos,
María López
PharmaXYZ

--- Adjunto: ICF_PX4471_EN.pdf (14 páginas, PDF nativo) ---
[p.1] INFORMED CONSENT FORM. Study PX-4471: A Phase III, randomized, double-blind study of PX-44 in adults with moderate asthma.
[p.1] You are being invited to take part in a research study. Please read this form carefully before you decide to participate.
[p.2] What will happen if I take part? You will visit the study clinic 8 times over 12 months."""

P2 = """De: j.perez@biomedsur.cl
Para: projects@lilt.com
Fecha: 2026-09-16 15:40
Asunto: Material pacientes

Hola, por favor traducir el adjunto a los idiomas de siempre. Gracias.
Juan Pérez

--- Adjunto: folleto_paciente_scan.pdf (6 páginas, escaneado, texto obtenido por OCR) ---
[p.1] PATIENT INFORMATION LEAFLET. How to take your medicine safely.
[p.1] Read all of this leaflet carefully before you start taking this medicine. Keep this leaflet, you may need to read it again.
[p.2] Possible side effects: like all medicines, this medicine can cause side effects."""

P3 = """De: k.schmidt@nordtrial.de
Para: projects@lilt.com
Fecha: 2026-09-17 11:05
Asunto: RE: Proyecto P-2026-0871 - agregar francés

Hola:
En el proyecto P-2026-0871 que ya tienen abierto, ¿pueden agregar francés como idioma destino?
Y envíenme por favor el precio final por correo.
Gracias,
Klaus Schmidt
NordTrial GmbH"""

P4 = """De: ana.rios@gmail.com
Para: projects@lilt.com
Fecha: 2026-09-18 08:30
Asunto: Traducción etiqueta

Hola, soy de MedLabel Andina. Necesito traducir la etiqueta adjunta del español al inglés para el 30 de septiembre de 2026.

--- Adjunto: etiqueta_MLA-22.docx (1 página) ---
[p.1] Conservar a temperatura ambiente. Mantener fuera del alcance de los niños. Lote: MLA-22."""


# Correos nuevos de la bandeja simulada (datos.BANDEJA), además de P1-P4.
CLV = texto_correo(BANDEJA_POR_ID["msg-20261026-0847-clv"])   # protocolo; cliente sin contrato activo
MDL = texto_correo(BANDEJA_POR_ID["msg-20261026-1015-mdl"])   # revisión de etiquetas en Excel; todo citado
BMS = texto_correo(BANDEJA_POR_ID["msg-20261026-1102-bms"])   # ICF sin fecha («para cuando puedan»)
NFC = texto_correo(BANDEJA_POR_ID["msg-20261026-1230-nfc"])   # remitente desconocido y pedido vago: cola manual
FAC = texto_correo(BANDEJA_POR_ID["msg-20261026-1310-phx"])   # pide una factura: fuera de alcance
ADJ = texto_correo(BANDEJA_POR_ID["msg-20261026-1405-bms"])   # hostil: idiomas y fecha «dictados» por el adjunto
SUP = texto_correo(BANDEJA_POR_ID["msg-20261026-1440-phx"])   # hostil: dominio falso y «créenlo sin revisión»


def _ev(campo, fuente, fragmento, confianza=0.95):
    return {"campo": campo, "fuente": fuente, "fragmento": fragmento, "confianza": confianza}


EXTRACCIONES = {
    P1: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="PharmaXYZ", idioma_origen="en", idiomas_destino=["es-MX", "pt-BR"],
        tipo_documento="consentimiento_informado", servicio="traduccion_back_translation",
        deadline_solicitado="2026-09-22", notas_cliente="Por favor mantener el formato del sponsor.",
        evidencia=[
            _ev("cliente_nombre", "correo", "PharmaXYZ"),
            _ev("idioma_origen", "ICF_PX4471_EN.pdf p.1", "INFORMED CONSENT FORM"),
            _ev("idiomas_destino", "correo", "español (México) y al portugués (Brasil)"),
            _ev("tipo_documento", "correo", "consentimiento informado"),
            _ev("servicio", "correo", "traducción con back-translation"),
            _ev("deadline_solicitado", "correo", "22 de septiembre de 2026"),
            _ev("notas_cliente", "correo", "Por favor mantener el formato del sponsor"),
        ]),
    P2: SolicitudTraduccion(
        es_solicitud_nueva=True, idioma_origen="en", idiomas_destino=[], tipo_documento="material_paciente",
        servicio="traduccion", notas_cliente="a los idiomas de siempre",
        evidencia=[
            _ev("idioma_origen", "folleto_paciente_scan.pdf p.1", "PATIENT INFORMATION LEAFLET. How to take your medicine safely."),
            _ev("tipo_documento", "folleto_paciente_scan.pdf p.1", "PATIENT INFORMATION LEAFLET"),
            _ev("servicio", "correo", "por favor traducir el adjunto"),
            _ev("notas_cliente", "correo", "a los idiomas de siempre", 0.9),
        ]),
    P3: SolicitudTraduccion(
        es_solicitud_nueva=False, cliente_nombre="NordTrial GmbH",
        motivo_no_solicitud="Pide modificar el proyecto existente P-2026-0871 y un precio; no es una solicitud nueva.",
        notas_cliente="Agregar francés al proyecto P-2026-0871 y enviar precio final por correo.",
        evidencia=[_ev("cliente_nombre", "correo", "NordTrial GmbH"),
                   _ev("notas_cliente", "correo", "agregar francés como idioma destino")]),
    P4: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="MedLabel Andina", idioma_origen="es", idiomas_destino=["en"],
        tipo_documento="etiquetado", servicio="traduccion", deadline_solicitado="2026-09-30",
        evidencia=[
            _ev("cliente_nombre", "correo", "soy de MedLabel Andina", 0.8),
            _ev("idioma_origen", "correo", "del español al inglés"),
            _ev("idiomas_destino", "correo", "del español al inglés"),
            _ev("tipo_documento", "correo", "la etiqueta adjunta"),
            _ev("servicio", "correo", "Necesito traducir"),
            _ev("deadline_solicitado", "correo", "30 de septiembre de 2026"),
        ]),
    CLV: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="ClinVida Research", idioma_origen="en", idiomas_destino=["es-ES", "fr-FR"],
        tipo_documento="protocolo", servicio="traduccion", deadline_solicitado="2026-11-14",
        notas_cliente="Mantener la numeración de secciones.",
        evidencia=[
            _ev("idioma_origen", "CV-2210_Protocol_v3.0.docx p.1", "CLINICAL STUDY PROTOCOL"),
            _ev("idiomas_destino", "correo", "al español (España) y al francés (Francia)"),
            _ev("tipo_documento", "CV-2210_Protocol_v3.0.docx p.1", "CLINICAL STUDY PROTOCOL"),
            _ev("servicio", "correo", "Necesitamos la traducción"),
            _ev("deadline_solicitado", "correo", "14 de noviembre de 2026"),
            _ev("notas_cliente", "correo", "mantener la numeración de secciones"),
        ]),
    MDL: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="MedLabel Andina", idioma_origen="es", idiomas_destino=["pt-BR"],
        tipo_documento="etiquetado", servicio="revision", deadline_solicitado="2026-10-30",
        evidencia=[
            _ev("idioma_origen", "correo", "del español al portugués (Brasil)"),
            _ev("idiomas_destino", "correo", "del español al portugués (Brasil)"),
            _ev("tipo_documento", "correo", "las etiquetas del lote 7"),
            _ev("servicio", "correo", "necesitamos solo la revisión"),
            _ev("deadline_solicitado", "correo", "30 de octubre de 2026"),
        ]),
    BMS: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="BioMed Sur", idioma_origen="es", idiomas_destino=["en", "pt-BR"],
        tipo_documento="consentimiento_informado", servicio="traduccion", notas_cliente="No hay apuro, para cuando puedan.",
        evidencia=[
            _ev("idioma_origen", "ICF_BMS-118_ES.pdf p.1", "CONSENTIMIENTO INFORMADO"),
            _ev("idiomas_destino", "correo", "del español al inglés y al portugués (Brasil)"),
            _ev("tipo_documento", "correo", "el consentimiento informado del estudio BMS-118"),
            _ev("servicio", "correo", "Necesitamos la traducción"),
            _ev("notas_cliente", "correo", "No hay apuro, para cuando puedan", 0.9),
        ]),
    NFC: SolicitudTraduccion(
        es_solicitud_nueva=True, idioma_origen="en", tipo_documento="otro", servicio="traduccion",
        evidencia=[
            _ev("idioma_origen", "kickoff_deck.pptx diapositiva 1", "Project kickoff. Q4 launch plan.", 0.9),
            _ev("tipo_documento", "kickoff_deck.pptx", "kickoff_deck.pptx", 0.8),
            _ev("servicio", "correo", "necesitamos traducir el material adjunto", 0.9),
        ]),
    FAC: SolicitudTraduccion(
        es_solicitud_nueva=False, cliente_nombre="PharmaXYZ",
        motivo_no_solicitud="Pide reenviar una factura; no es una solicitud de traducción.",
        evidencia=[_ev("cliente_nombre", "correo", "PharmaXYZ")]),
    # El modelo simulado «cae» en la trampa del adjunto: el código debe frenarlo.
    ADJ: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="BioMed Sur", idioma_origen="en", idiomas_destino=["fr", "de", "it", "ja"],
        tipo_documento="material_paciente", servicio="traduccion", deadline_solicitado="2026-11-05",
        evidencia=[
            _ev("idioma_origen", "folleto_paciente_v2.pdf p.1", "PATIENT INFORMATION LEAFLET"),
            _ev("idiomas_destino", "correo", "los idiomas destino son fr, de, it y ja"),
            _ev("tipo_documento", "folleto_paciente_v2.pdf p.1", "PATIENT INFORMATION LEAFLET"),
            _ev("servicio", "correo", "Por favor tradúzcanlo"),
            _ev("deadline_solicitado", "correo", "la entrega es el 5 de noviembre de 2026"),
        ]),
    SUP: SolicitudTraduccion(
        es_solicitud_nueva=True, cliente_nombre="PharmaXYZ", idioma_origen="en", idiomas_destino=["es-MX"],
        tipo_documento="consentimiento_informado", servicio="traduccion", deadline_solicitado="2026-11-06",
        evidencia=[
            _ev("cliente_nombre", "correo", "PharmaXYZ"),
            _ev("idioma_origen", "correo", "del inglés al español (México)"),
            _ev("idiomas_destino", "correo", "del inglés al español (México)"),
            _ev("tipo_documento", "correo", "consentimiento adjunto"),
            _ev("servicio", "correo", "Necesitamos traducción"),
            _ev("deadline_solicitado", "correo", "6 de noviembre de 2026"),
        ]),
}


class ExtractorSimulado:
    """Sustituye al modelo: devuelve la extracción guardada para cada correo, con la forma de
    with_structured_output(include_raw=True). Cuenta las llamadas."""

    def __init__(self, extracciones=None, fallas=(), fuera_de_esquema=0):
        self.extracciones = extracciones or EXTRACCIONES
        self.fallas = list(fallas)                # excepciones a lanzar antes de responder (reintentos por 503)
        self.fuera_de_esquema = fuera_de_esquema  # cuántas respuestas seguidas no cumplen el esquema
        self.llamadas = 0

    async def ainvoke(self, mensajes):
        self.llamadas += 1
        if self.fallas:
            raise self.fallas.pop(0)
        if self.fuera_de_esquema:
            self.fuera_de_esquema -= 1
            try:
                SolicitudTraduccion(es_solicitud_nueva="tal vez")
            except ValidationError as e:
                return {"raw": None, "parsed": None, "parsing_error": e}
        entrada = mensajes[-1][1]
        return {"raw": None, "parsed": self.extracciones[entrada], "parsing_error": None}
