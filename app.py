"""Intake de solicitudes en Plunet · proxy del MVP (FastAPI en Vercel).

Adaptado del proxy del Kit MVP (alternativa LangChain). El backend es el workflow de intake.py (ruta B).

Rutas:
  GET  /api/bandeja          la bandeja simulada de projects@lilt.com y la tabla de clientes
  POST /api/intake           prellena el Request de un correo de la bandeja (message_id) o de uno pegado (mensaje)
  POST /api/estimacion       recalcula volumen y plazo mientras el PM edita el borrador (sin modelo)
  POST /api/plunet/requests  el PM confirma el borrador y se crea el Request en el Plunet sandbox

Cada vez que el PM pulsa «Prellenar Request», /api/intake hace, en orden:

  1. Revisa el código de acceso (solo si definiste ACCESS_CODE en Vercel).
  2. Limita cuántas consultas seguidas puede hacer cada visitante.
  3. Valida la entrada: un message_id de la bandeja, o un correo de 20 a 6000 caracteres.
  4. Ejecuta el workflow de intake.py: una llamada al modelo y reglas en código.
  5. Normaliza la respuesta al contrato (contrato.py): siempre la misma forma hacia el navegador.
  6. Deja en los registros solo lo mínimo (id, estado, tiempo). Nunca el contenido de los correos.

Los secretos (la clave de OpenRouter) viven en las variables de entorno de Vercel: ni el navegador ni el código los ven.
"""
from __future__ import annotations

import hmac
import json
import logging
import os
import sys
import time
import uuid
from collections import defaultdict, deque
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from contrato import VERSION, ErrorContrato, normalizar_salida, respuesta_error, validar_entrada
from datos import BANDEJA, BANDEJA_POR_ID, BUZON, CLIENTES, MODELOS_ID_RESPALDO, texto_correo
from estimacion import estimar_borrador
from plunet import crear_request

# ----------------------------------------------------------------------------- EDITA AQUÍ
BACKEND = "langchain"            # etiqueta que muestra la pantalla: n8n | make | langchain
RUTA = "B"                       # ruta del curso que implementa el backend: A | B | R | C | D
MAX_POR_MINUTO = int(os.getenv("MAX_POR_MINUTO", "8"))   # consultas por minuto y por visitante
# -----------------------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("intake")
# Las líneas del proxy salen por stdout: en los registros de Vercel lo que sale por stderr se marca como «error».
if not any(getattr(h, "_intake", False) for h in log.handlers):
    _salida = logging.StreamHandler(sys.stdout)   # StreamHandler vacía el búfer en cada línea
    _salida._intake = True
    _salida.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_salida)
log.propagate = False
# httpx anota en INFO cada URL que llama, y la URL del webhook es un secreto: se silencia
# (httpx2 y httpcore2 son los nombres que usa el SDK de OpenAI en sus versiones nuevas).
for _nombre in ("httpx", "httpcore", "httpx2", "httpcore2"):
    logging.getLogger(_nombre).setLevel(logging.WARNING)

# Se desactiva la documentación automática de FastAPI: esta API es de uso interno de la pantalla.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


# ----------------------------------------------------------------------------- utilidades
def registrar(**campos: Any) -> None:
    """Una línea JSON por solicitud. Nunca incluyas aquí el correo del cliente ni los campos extraídos."""
    log.info(json.dumps(campos, ensure_ascii=False))


def responder(cuerpo: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(cuerpo, status_code=status, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


def milisegundos(inicio: float) -> int:
    return int((time.perf_counter() - inicio) * 1000)


def ip_de(request: Request) -> str:
    """IP del visitante. En Vercel llega en x-real-ip / x-forwarded-for."""
    directa = request.headers.get("x-real-ip")
    if directa:
        return directa.strip()
    reenviada = request.headers.get("x-forwarded-for", "")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


# ----------------------------------------------------------------------------- 1. código de acceso
def revisar_acceso(request: Request) -> None:
    esperado = os.getenv("ACCESS_CODE", "").strip()
    if not esperado:
        return  # sin código: el despliegue es abierto
    recibido = request.headers.get("x-access-code", "").strip()
    if not hmac.compare_digest(recibido.encode(), esperado.encode()):
        raise ErrorContrato("acceso", "El código de acceso no es correcto.", 401, "falta o no coincide x-access-code")


# ----------------------------------------------------------------------------- 2. límite por visitante
# Es un límite «de mejor esfuerzo»: la memoria es de cada instancia de la función, y Vercel puede crear varias.
# Sirve para frenar errores (un bucle, un botón pulsado mil veces), no a un atacante decidido.
_visitas: dict[str, deque] = defaultdict(deque)


def limitar(visitante: str) -> None:
    ahora = time.monotonic()
    marcas = _visitas[visitante]
    while marcas and ahora - marcas[0] > 60:
        marcas.popleft()
    if len(marcas) >= MAX_POR_MINUTO:
        raise ErrorContrato("limite", "Hay demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.", 429,
                            f"máximo {MAX_POR_MINUTO} por minuto", True)
    marcas.append(ahora)
    if len(_visitas) > 2000:  # no dejar que el diccionario crezca sin límite
        for clave in [k for k, v in _visitas.items() if not v or ahora - v[-1] > 60]:
            del _visitas[clave]


# ----------------------------------------------------------------------------- 3. lectura del cuerpo
async def leer_json(request: Request) -> Any:
    declarado = request.headers.get("content-length", "")
    if declarado.isdigit() and int(declarado) > 40_000:
        raise ErrorContrato("validacion", "La solicitud es demasiado grande.", 413, "cuerpo mayor a 40 KB")
    crudo = await request.body()
    if len(crudo) > 40_000:
        raise ErrorContrato("validacion", "La solicitud es demasiado grande.", 413, "cuerpo mayor a 40 KB")
    try:
        return json.loads(crudo)
    except ValueError:
        raise ErrorContrato("validacion", "Pega el correo de la solicitud.", 400, "el cuerpo no es JSON") from None


# ----------------------------------------------------------------------------- 4. backend: workflow de intake (LangGraph)
import asyncio

TIMEOUT_S = float(os.getenv("BACKEND_TIMEOUT_S", "110"))   # menos que maxDuration (120 s) de vercel.json


def configurado() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY", "").strip())


async def llamar_backend(mensaje: str, adjuntos: list | None = None) -> Any:
    if not configurado():
        raise ErrorContrato("sin_configurar", "Falta la variable de entorno OPENROUTER_API_KEY en Vercel.", 503,
                            "define OPENROUTER_API_KEY y vuelve a desplegar")
    # Se importa aquí (y no arriba) para que /api/health responda al instante: LangChain tarda en cargar.
    try:
        from intake import ejecutar_intake
    except ImportError as e:  # falta una librería o un archivo en el despliegue: el detalle nombra cuál
        raise ErrorContrato("backend", "No se pudo cargar el workflow: falta una librería o un archivo del proyecto.", 500,
                            f"{type(e).__name__}: {str(e)[:100]}") from None
    try:
        return await asyncio.wait_for(ejecutar_intake(mensaje, adjuntos), timeout=TIMEOUT_S)
    except asyncio.TimeoutError:
        raise ErrorContrato("timeout", "El workflow tardó demasiado en responder.", 504, f"sin respuesta en {int(TIMEOUT_S)} s", True) from None


# ----------------------------------------------------------------------------- rutas
@app.get("/api/health")
async def salud() -> JSONResponse:
    """La pantalla pregunta aquí si hay backend y si pide código. No revela ningún secreto."""
    return responder({"ok": True, "version": VERSION, "backend": BACKEND, "ruta": RUTA,
                      "configurado": configurado(), "requiere_codigo": bool(os.getenv("ACCESS_CODE", "").strip()),
                      "respaldo": respaldo_activo()})


def respaldo_activo() -> bool:
    """Si hay un modelo de respaldo configurado (misma regla que intake.py, sin cargar LangChain)."""
    valor = os.getenv("MODEL_ID_RESPALDO", "").strip()
    return valor.lower() not in ("ninguno", "none") and bool(valor or MODELOS_ID_RESPALDO)


@app.get("/api/bandeja")
async def bandeja() -> JSONResponse:
    """La bandeja simulada de projects@lilt.com (en producción, Microsoft Graph) y la tabla de clientes para el PM."""
    return responder({"ok": True, "buzon": BUZON,
                      "correos": [{k: c[k] for k in ("id", "de_nombre", "de", "fecha", "asunto", "cuerpo", "adjuntos")}
                                  for c in BANDEJA],
                      "clientes": [{k: c[k] for k in ("cliente_id", "razon_social", "contratos_activos")} for c in CLIENTES]})


@app.post("/api/intake")
async def intake(request: Request) -> JSONResponse:
    inicio = time.perf_counter()
    id_solicitud = uuid.uuid4().hex[:8]
    try:
        revisar_acceso(request)
        limitar(ip_de(request))
        mensaje, message_id = validar_entrada(await leer_json(request))
        adjuntos = None
        if message_id:
            correo = BANDEJA_POR_ID.get(message_id)
            if correo is None:
                raise ErrorContrato("validacion", "Ese correo no está en la bandeja.", 404, "message_id desconocido")
            mensaje, adjuntos = texto_correo(correo), correo["adjuntos"]
        crudo = await llamar_backend(mensaje, adjuntos)
        resultado = normalizar_salida(crudo, backend=BACKEND, ruta=RUTA, message_id=message_id)
        resultado["meta"]["latencia_ms"] = milisegundos(inicio)
        resultado["meta"]["id"] = id_solicitud
        registrar(id=id_solicitud, backend=BACKEND, ok=True, estado=resultado["estado"], message_id=message_id,
                  llamadas_modelo=resultado["meta"]["llamadas_modelo"], ms=resultado["meta"]["latencia_ms"])
        return responder(resultado)
    except ErrorContrato as e:
        registrar(id=id_solicitud, backend=BACKEND, ok=False, codigo=e.codigo, detalle=e.detalle, ms=milisegundos(inicio))
        return responder(respuesta_error(e, id_solicitud, BACKEND), e.status)
    except Exception as e:  # noqa: BLE001  nunca se le devuelve al navegador un traceback
        registrar(id=id_solicitud, backend=BACKEND, ok=False, codigo="backend", error=type(e).__name__, ms=milisegundos(inicio))
        error = ErrorContrato("backend", "Error inesperado en la función de Vercel.", 500, type(e).__name__)
        return responder(respuesta_error(error, id_solicitud, BACKEND), 500)


@app.post("/api/estimacion")
async def estimacion(request: Request) -> JSONResponse:
    """Recalcula volumen y plazo mientras el PM edita servicio, idiomas o fecha. No usa el modelo."""
    id_solicitud = uuid.uuid4().hex[:8]
    try:
        revisar_acceso(request)
        return responder(estimar_borrador(await leer_json(request)))
    except ErrorContrato as e:
        return responder(respuesta_error(e, id_solicitud, BACKEND), e.status)
    except Exception as e:  # noqa: BLE001
        registrar(id=id_solicitud, accion="estimacion", ok=False, error=type(e).__name__)
        error = ErrorContrato("backend", "Error inesperado al estimar.", 500, type(e).__name__)
        return responder(respuesta_error(error, id_solicitud, BACKEND), 500)


@app.post("/api/plunet/requests")
async def crear_request_plunet(request: Request) -> JSONResponse:
    """El PM confirmó el borrador: se crea el Request en el Plunet sandbox (RF03). No usa el modelo."""
    id_solicitud = uuid.uuid4().hex[:8]
    try:
        revisar_acceso(request)
        limitar(ip_de(request))
        creado = crear_request(await leer_json(request))
        registrar(id=id_solicitud, accion="crear_request", ok=True, request_id=creado["request_id"],
                  message_id=creado["message_id"])
        return responder(creado, 201)
    except ErrorContrato as e:
        registrar(id=id_solicitud, accion="crear_request", ok=False, codigo=e.codigo, detalle=e.detalle)
        return responder(respuesta_error(e, id_solicitud, BACKEND), e.status)
    except Exception as e:  # noqa: BLE001
        registrar(id=id_solicitud, accion="crear_request", ok=False, error=type(e).__name__)
        error = ErrorContrato("backend", "Error inesperado al crear el Request.", 500, type(e).__name__)
        return responder(respuesta_error(error, id_solicitud, BACKEND), 500)


# En tu computador no hay CDN que sirva la carpeta public/, así que la servimos nosotros.
# En Vercel (variable VERCEL definida) esto no se ejecuta: public/ sale directo de la red de Vercel.
if not os.getenv("VERCEL"):
    from pathlib import Path

    from fastapi.staticfiles import StaticFiles

    _public = Path(__file__).parent / "public"
    if _public.is_dir():
        app.mount("/", StaticFiles(directory=str(_public), html=True), name="public")
