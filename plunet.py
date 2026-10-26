"""Plunet BusinessManager en modo sandbox: crea el Request que el PM confirmó en la pantalla.

Es el paso RF03: el Request solo se crea después de que el PM revisa y confirma. Aquí no hay un Plunet real; se
validan los campos con las mismas reglas que tendría la API (cliente existente, contrato del cliente, idiomas, servicio,
tipo y fecha) y se devuelve un número de Request. Nada queda guardado: cada despliegue de Vercel empieza vacío.

En producción, crear_request() llamaría a la API de Plunet con un usuario técnico; la validación de abajo se mantiene.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Any

from contrato import SERVICIOS, TIPOS_DOCUMENTO, ErrorContrato, limpiar_texto
from datos import BANDEJA_POR_ID, CLIENTES, IDIOMAS_ISO
from estimacion import estimar_borrador

_CLIENTES = {c["cliente_id"]: c for c in CLIENTES}
_LOCALE = re.compile(r"^([a-z]{2})(?:[-_]([a-z]{2}))?$")
_MESSAGE_ID = re.compile(r"^[A-Za-z0-9._-]{3,80}$")


def _idioma(valor: Any) -> str | None:
    """«pt_br» → «pt-BR», «EN» → «en». None si no es un código ISO 639-1 conocido."""
    m = _LOCALE.match(str(valor or "").strip().lower())
    if not m or m.group(1) not in IDIOMAS_ISO:
        return None
    return f"{m.group(1)}-{m.group(2).upper()}" if m.group(2) else m.group(1)


def crear_request(cuerpo: Any) -> dict:
    """Valida el borrador confirmado por el PM y lo «crea» en el sandbox. Lanza ErrorContrato si falta algo."""
    if not isinstance(cuerpo, dict) or not isinstance(cuerpo.get("request"), dict):
        raise ErrorContrato("validacion", "Falta el borrador del Request.", 400, "falta el campo request")
    r = cuerpo["request"]
    problemas: list[str] = []

    cliente = _CLIENTES.get(str(r.get("customerID") or ""))
    if not cliente:
        problemas.append("customerID: elige un cliente registrado")
    contrato = r.get("contrato") or None
    if contrato and (not cliente or contrato not in cliente["contratos_activos"]):
        problemas.append("contrato: no es un contrato activo de ese cliente")

    origen = _idioma(r.get("sourceLanguage"))
    if not origen:
        problemas.append("sourceLanguage: código de idioma (en, es, pt-BR…)")
    destinos_crudos = r.get("targetLanguage") or []
    if isinstance(destinos_crudos, str):
        destinos_crudos = [x for x in re.split(r"[,\s;]+", destinos_crudos) if x]
    destinos = [_idioma(x) for x in destinos_crudos][:20]
    if not destinos or None in destinos:
        problemas.append("targetLanguage: uno o más códigos de idioma válidos")
    elif origen in destinos:
        problemas.append("targetLanguage: no puede incluir el idioma origen")

    servicio = r.get("service")
    if servicio not in SERVICIOS:
        problemas.append("service: elige un servicio")
    tipo = r.get("subject")
    if tipo not in TIPOS_DOCUMENTO:
        problemas.append("subject: elige un tipo de documento")
    try:
        entrega = date.fromisoformat(str(r.get("deliveryDeadline") or ""))
    except ValueError:
        entrega = None
        problemas.append("deliveryDeadline: fecha de entrega (AAAA-MM-DD)")

    if problemas:
        raise ErrorContrato("validacion", "Faltan datos para crear el Request.", 400, " · ".join(problemas)[:200])

    message_id = str(cuerpo.get("message_id") or "")
    correo = BANDEJA_POR_ID.get(message_id) if _MESSAGE_ID.match(message_id) else None
    try:   # volumen y plazo con lo que confirmó el PM; un correo pegado sin adjuntos no tiene palabras que contar
        calculo = estimar_borrador({"message_id": message_id if correo else None, "palabras": cuerpo.get("palabras"),
                                    "paginas": cuerpo.get("paginas"), "fecha_correo": cuerpo.get("fecha_correo"),
                                    "targetLanguage": destinos, "service": servicio, "deliveryDeadline": entrega.isoformat()})
    except ErrorContrato:
        calculo = {"volumen": None, "estimacion": None}
    ahora = datetime.now(timezone.utc)
    return {
        "ok": True,
        "request_id": f"R-{ahora:%Y%m%d}-{uuid.uuid4().hex[:5].upper()}",
        "estado": "creado_sandbox",
        "creado_en": ahora.isoformat(timespec="seconds"),
        "message_id": message_id if correo else None,
        "request": {
            "customerID": cliente["cliente_id"],
            "cliente": cliente["razon_social"],
            "contrato": contrato,
            "sourceLanguage": origen,
            "targetLanguage": destinos,
            "service": servicio,
            "subject": tipo,
            "deliveryDeadline": entrega.isoformat(),
            "briefDescription": limpiar_texto(r.get("briefDescription"), 300) or None,
            "wordCount": calculo["volumen"]["palabras"] if calculo["volumen"] else None,
        },
        "estimacion": calculo["estimacion"],
        "nota": "Plunet sandbox: el Request no se escribió en un Plunet real.",
    }
