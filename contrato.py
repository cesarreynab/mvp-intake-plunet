"""Contrato de interfaz v1 del MVP «Intake de solicitudes en Plunet».

Adaptado del contrato v1 del Kit MVP (Mesa de ayuda Nimbo): misma idea, campos del caso Plunet.
Este módulo es la frontera entre el navegador y el backend. Hace dos cosas, y solo dos:

1. ``validar_entrada``: decide si lo que llega del navegador es aceptable.
2. ``normalizar_salida``: convierte lo que devuelve el workflow en una respuesta con forma fija,
   descartando todo campo que el contrato no conoce. El navegador solo ve esa forma fija.

Regla de diseño: tolerante con lo que recibe del backend y estricto con lo que entrega al navegador.
No contiene lógica de negocio: las reglas del intake viven en intake.py.
"""
from __future__ import annotations

import re
from typing import Any

VERSION = "1.0-plunet"
MIN_CARACTERES = 20
MAX_CARACTERES = 6000      # un correo con el texto de sus adjuntos supera con facilidad los 1000 del kit

ESTADOS = ("pendiente_revision", "cola_manual", "fuera_de_alcance")
RUTAS = ("A", "B", "R", "C", "D")
TIPOS_DOCUMENTO = ("consentimiento_informado", "etiquetado", "protocolo", "material_paciente", "contrato", "otro")
SERVICIOS = ("traduccion", "traduccion_back_translation", "revision", "dtp")
CAMPOS = ("cliente_id", "cliente_nombre", "contrato_id", "idioma_origen", "idiomas_destino", "tipo_documento",
          "servicio", "deadline_solicitado", "notas_cliente")
CAMPOS_PLUNET = ("customerID", "sourceLanguage", "targetLanguage (por item)", "deliveryDeadline", "service (por item)",
                 "subject", "briefDescription", "estado")

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LOCALE = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")


class ErrorContrato(Exception):
    """Error con forma conocida: se convierte tal cual en la respuesta de error del contrato."""

    def __init__(self, codigo: str, mensaje: str, status: int = 400, detalle: str = "", reintentable: bool = False):
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje
        self.status = status
        self.detalle = detalle
        self.reintentable = reintentable


def limpiar_texto(valor: Any, maximo: int) -> str:
    """Convierte a texto, quita caracteres de control y recorta. Nunca devuelve None."""
    if valor is None:
        return ""
    texto = valor if isinstance(valor, str) else str(valor)
    texto = _CONTROL.sub("", texto).replace("\r\n", "\n").strip()
    return texto[:maximo]


def validar_entrada(cuerpo: Any) -> str:
    """Devuelve el mensaje limpio o lanza ErrorContrato('validacion')."""
    if not isinstance(cuerpo, dict) or not isinstance(cuerpo.get("mensaje"), str):
        raise ErrorContrato("validacion", "Pega el correo de la solicitud.", 400, "falta el campo mensaje")
    bruto = cuerpo["mensaje"]
    if len(bruto) > MAX_CARACTERES * 2:  # corta antes de limpiar mensajes absurdamente largos
        raise ErrorContrato("validacion", f"El correo supera los {MAX_CARACTERES} caracteres.", 400, "mensaje demasiado largo")
    mensaje = limpiar_texto(bruto, MAX_CARACTERES * 2)
    if len(mensaje) < MIN_CARACTERES:
        raise ErrorContrato("validacion", f"Escribe al menos {MIN_CARACTERES} caracteres.", 400, "mensaje muy corto")
    if len(mensaje) > MAX_CARACTERES:
        raise ErrorContrato("validacion", f"El correo supera los {MAX_CARACTERES} caracteres.", 400, "mensaje demasiado largo")
    return mensaje


def _entero(valor: Any) -> int | None:
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return None


def _numero(valor: Any) -> float | None:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    return round(min(max(float(valor), 0.0), 1.0), 2)


def _campos(crudo: Any) -> dict:
    c = crudo if isinstance(crudo, dict) else {}
    idiomas = [i for i in (c.get("idiomas_destino") or []) if isinstance(i, str) and _LOCALE.match(i)][:20]
    origen = c.get("idioma_origen") if isinstance(c.get("idioma_origen"), str) and _LOCALE.match(c["idioma_origen"]) else None
    fecha = c.get("deadline_solicitado") if isinstance(c.get("deadline_solicitado"), str) and _FECHA.match(c["deadline_solicitado"]) else None
    return {
        "cliente_id": limpiar_texto(c.get("cliente_id"), 40) or None,
        "cliente_nombre": limpiar_texto(c.get("cliente_nombre"), 120) or None,
        "contrato_id": limpiar_texto(c.get("contrato_id"), 40) or None,
        "idioma_origen": origen,
        "idiomas_destino": idiomas,
        "tipo_documento": c.get("tipo_documento") if c.get("tipo_documento") in TIPOS_DOCUMENTO else None,
        "servicio": c.get("servicio") if c.get("servicio") in SERVICIOS else None,
        "deadline_solicitado": fecha,
        "notas_cliente": limpiar_texto(c.get("notas_cliente"), 300) or None,
    }


def _confianzas(crudo: Any) -> dict:
    if not isinstance(crudo, dict):
        return {}
    return {k: v for k, v in ((k, _numero(crudo.get(k))) for k in CAMPOS) if v is not None}


def _lista_campos(crudo: Any) -> list[str]:
    if not isinstance(crudo, list):
        return []
    vistos: list[str] = []
    for c in crudo:
        if c in CAMPOS and c not in vistos:
            vistos.append(c)
    return vistos


def _evidencia(crudo: Any) -> list[dict]:
    salida: list[dict] = []
    if not isinstance(crudo, list):
        return salida
    for e in crudo[:30]:
        if not isinstance(e, dict) or e.get("campo") not in CAMPOS:
            continue
        fragmento = limpiar_texto(e.get("fragmento"), 300)
        if not fragmento:
            continue
        salida.append({"campo": e["campo"], "fuente": limpiar_texto(e.get("fuente"), 120) or "correo",
                       "fragmento": fragmento, "confianza": _numero(e.get("confianza"))})
    return salida


def _archivos(crudo: Any) -> list[dict]:
    if not isinstance(crudo, list):
        return []
    return [{"nombre": limpiar_texto(a.get("nombre"), 160), "detalle": limpiar_texto(a.get("detalle"), 160)}
            for a in crudo[:20] if isinstance(a, dict) and limpiar_texto(a.get("nombre"), 160)]


def _request(crudo: Any) -> dict | None:
    if not isinstance(crudo, dict):
        return None
    salida = {}
    for k in CAMPOS_PLUNET:
        v = crudo.get(k)
        if isinstance(v, list):
            salida[k] = [limpiar_texto(x, 20) for x in v if isinstance(x, str)][:20]
        else:
            salida[k] = limpiar_texto(v, 300) or None
    return salida


def _pasos(crudo: Any) -> list[dict]:
    pasos: list[dict] = []
    if not isinstance(crudo, list):
        return pasos
    for p in crudo[:10]:
        if not isinstance(p, dict):
            continue
        nombre = limpiar_texto(p.get("nombre"), 60)
        if not nombre:
            continue
        tipo = p.get("tipo") if p.get("tipo") in ("herramienta", "paso") else "paso"
        pasos.append({"tipo": tipo, "nombre": nombre, "detalle": limpiar_texto(p.get("detalle"), 240)})
    return pasos


def normalizar_salida(crudo: Any, *, backend: str, ruta: str = "", modelo: str = "") -> dict:
    """Convierte la salida cruda del workflow en la respuesta v1. Lanza ErrorContrato si no se puede."""
    if not isinstance(crudo, dict):
        raise ErrorContrato("respuesta_invalida", "El backend devolvió algo que no es un objeto JSON.", 502, "tipo inesperado")
    if crudo.get("estado") not in ESTADOS:
        raise ErrorContrato("respuesta_invalida", "El backend no devolvió un estado del contrato.", 502,
                            f"estado = {limpiar_texto(crudo.get('estado'), 40)!r}")
    estado = crudo["estado"]
    request = _request(crudo.get("request_plunet")) if estado == "pendiente_revision" else None
    ruta_final = (crudo.get("ruta") or ruta or "").upper()
    return {
        "ok": True,
        "estado": estado,
        "razon": limpiar_texto(crudo.get("razon"), 300),
        "alerta": limpiar_texto(crudo.get("alerta"), 300),
        "score_global": _numero(crudo.get("score_global")),
        "campos": _campos(crudo.get("campos")),
        "confianza_por_campo": _confianzas(crudo.get("confianza_por_campo")),
        "campos_baja_confianza": _lista_campos(crudo.get("campos_baja_confianza")),
        "evidencia": _evidencia(crudo.get("evidencia")),
        "archivos": _archivos(crudo.get("archivos")),
        "request_plunet": request,
        "escrituras_plunet": 0,   # el MVP nunca escribe en Plunet, diga lo que diga el backend
        "pasos": _pasos(crudo.get("pasos")),
        "meta": {
            "version": VERSION,
            "backend": backend,
            "ruta": ruta_final if ruta_final in RUTAS else "",
            "modelo": limpiar_texto(crudo.get("modelo") or modelo, 80),
            "llamadas_modelo": _entero(crudo.get("llamadas_modelo")),
        },
    }


CODIGOS_ERROR = (
    "validacion", "acceso", "limite", "sin_configurar", "cuota_ia", "backend", "timeout", "respuesta_invalida",
)

MENSAJES_ERROR = {
    "validacion": "El correo no es válido.",
    "acceso": "El código de acceso no es correcto.",
    "limite": "Hay demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.",
    "sin_configurar": "El servicio todavía no está configurado.",
    "cuota_ia": "El modelo gratuito alcanzó su límite de uso. Reintenta en un minuto o mañana.",
    "backend": "El backend no respondió correctamente.",
    "timeout": "El backend tardó demasiado en responder.",
    "respuesta_invalida": "El backend respondió con un formato que el contrato no reconoce.",
}


def respuesta_error(error: ErrorContrato, id_solicitud: str, backend: str = "") -> dict:
    codigo = error.codigo if error.codigo in CODIGOS_ERROR else "backend"
    return {
        "ok": False,
        "error": {
            "codigo": codigo,
            "mensaje": limpiar_texto(error.mensaje, 200) or MENSAJES_ERROR.get(codigo, "Error inesperado."),
            "detalle": limpiar_texto(error.detalle, 200),
            "reintentable": bool(error.reintentable),
        },
        "meta": {"version": VERSION, "backend": limpiar_texto(backend, 40), "id": limpiar_texto(id_solicitud, 40)},
    }
