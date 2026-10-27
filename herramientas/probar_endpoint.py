#!/usr/bin/env python3
"""Prueba el MVP «Intake de solicitudes en Plunet» sin abrir el navegador.

Adaptado del probador del Kit MVP. Envía los casos P1-P4 al servidor (local o Vercel), revisa que cada respuesta cumpla
el contrato 1.0-plunet y compara los campos con lo esperado, con los mismos criterios del PoC.

    python probar_endpoint.py http://localhost:8000 --pausa 3
    python probar_endpoint.py https://tu-proyecto.vercel.app --pausa 3
    python probar_endpoint.py https://tu-proyecto.vercel.app --codigo-acceso EL_CODIGO > probador.txt

    python probar_endpoint.py https://tu-proyecto.vercel.app --bandeja --pausa 3     # los 11 correos de la bandeja

Cada caso usa una llamada al modelo (P1-P4: 4 de las 50 diarias del modelo gratuito; --bandeja: 11). Solo usa la
biblioteca estándar de Python 3.9 o superior. Con --caso P2 (o B1…B7) envías uno solo.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

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


def _con_cita(d):
    """Cada campo no nulo propuesto por el modelo tiene al menos una cita (cliente y contrato salen de reglas)."""
    citados = {e["campo"] for e in d["evidencia"]}
    return all(c in citados for c, v in d["campos"].items()
               if v not in (None, []) and c not in ("cliente_id", "cliente_nombre", "contrato_id"))


# Cada criterio es (descripción, función sobre la respuesta del contrato). Son los del PoC, con locale en P1.
CASOS = [
    {"id": "P1", "tipo": "camino feliz", "mensaje": P1, "criterios": [
        ("estado pendiente_revision", lambda d: d["estado"] == "pendiente_revision"),
        ("cliente PHX-0148", lambda d: d["campos"]["cliente_id"] == "PHX-0148"),
        ("origen en", lambda d: d["campos"]["idioma_origen"] == "en"),
        ("destino es-MX y pt-BR", lambda d: d["campos"]["idiomas_destino"] == ["es-MX", "pt-BR"]),
        ("consentimiento_informado", lambda d: d["campos"]["tipo_documento"] == "consentimiento_informado"),
        ("traduccion_back_translation", lambda d: d["campos"]["servicio"] == "traduccion_back_translation"),
        ("deadline 2026-09-22", lambda d: d["campos"]["deadline_solicitado"] == "2026-09-22"),
        ("todos los campos con cita", _con_cita),
    ]},
    {"id": "P2", "tipo": "incertidumbre", "mensaje": P2, "criterios": [
        ("no deduce idiomas", lambda d: d["campos"]["idiomas_destino"] == []),
        ("no deduce fecha", lambda d: d["campos"]["deadline_solicitado"] is None),
        ("ambos para revisar", lambda d: {"idiomas_destino", "deadline_solicitado"} <= set(d["campos_baja_confianza"])),
        ("revisión o cola manual", lambda d: d["estado"] in ("pendiente_revision", "cola_manual")),
    ]},
    {"id": "P3", "tipo": "fuera de alcance", "mensaje": P3, "criterios": [
        ("estado fuera_de_alcance", lambda d: d["estado"] == "fuera_de_alcance"),
        ("sin Request", lambda d: d["request_plunet"] is None),
    ]},
    {"id": "P4", "tipo": "cliente dudoso", "mensaje": P4, "criterios": [
        ("no asigna cliente por razón social", lambda d: d["campos"]["cliente_id"] is None),
        ("cliente para revisar", lambda d: "cliente_id" in d["campos_baja_confianza"]),
        ("alerta con el cliente sugerido", lambda d: "MDL-0310" in (d.get("alerta") or "")),
    ]},
]

# Con --bandeja se envían los 11 correos de la bandeja simulada por su message_id (el servidor arma el texto).
# P1-P4 son los mismos correos de arriba; B1-B5 cubren los estados y formatos de adjunto que faltaban; B6 y B7 son correos hostiles.
MESSAGE_ID = {"P1": "msg-20260915-0912-phx", "P2": "msg-20260916-1540-bms", "P3": "msg-20260917-1105-ntr", "P4": "msg-20260918-0830-gml"}
CASOS_BANDEJA = [
    {"id": "B1", "tipo": "protocolo sin contrato", "message_id": "msg-20261026-0847-clv", "criterios": [
        ("estado pendiente_revision", lambda d: d["estado"] == "pendiente_revision"),
        ("cliente CLV-0091", lambda d: d["campos"]["cliente_id"] == "CLV-0091"),
        ("destino es-ES y fr-FR", lambda d: d["campos"]["idiomas_destino"] == ["es-ES", "fr-FR"]),
        ("protocolo", lambda d: d["campos"]["tipo_documento"] == "protocolo"),
        ("deadline 2026-11-14", lambda d: d["campos"]["deadline_solicitado"] == "2026-11-14"),
        ("sin contrato activo: para revisar", lambda d: d["campos"]["contrato_id"] is None and "contrato_id" in d["campos_baja_confianza"]),
    ]},
    {"id": "B2", "tipo": "revisión en Excel", "message_id": "msg-20261026-1015-mdl", "criterios": [
        ("estado pendiente_revision", lambda d: d["estado"] == "pendiente_revision"),
        ("cliente MDL-0310 con contrato", lambda d: d["campos"]["cliente_id"] == "MDL-0310" and d["campos"]["contrato_id"] == "CTR-2026-022"),
        ("es → pt-BR", lambda d: d["campos"]["idioma_origen"] == "es" and d["campos"]["idiomas_destino"] == ["pt-BR"]),
        ("servicio revision", lambda d: d["campos"]["servicio"] == "revision"),
        ("deadline 2026-10-30", lambda d: d["campos"]["deadline_solicitado"] == "2026-10-30"),
    ]},
    {"id": "B3", "tipo": "sin fecha", "message_id": "msg-20261026-1102-bms", "criterios": [
        ("estado pendiente_revision", lambda d: d["estado"] == "pendiente_revision"),
        ("destino en y pt-BR", lambda d: d["campos"]["idiomas_destino"] == ["en", "pt-BR"]),
        ("no inventa fecha", lambda d: d["campos"]["deadline_solicitado"] is None and "deadline_solicitado" in d["campos_baja_confianza"]),
    ]},
    {"id": "B4", "tipo": "pedido vago", "message_id": "msg-20261026-1230-nfc", "criterios": [
        ("no se prellena", lambda d: d["estado"] in ("cola_manual", "fuera_de_alcance") and d["request_plunet"] is None),
        ("sin cliente", lambda d: d["campos"]["cliente_id"] is None),
    ]},
    {"id": "B5", "tipo": "factura", "message_id": "msg-20261026-1310-phx", "criterios": [
        ("estado fuera_de_alcance", lambda d: d["estado"] == "fuera_de_alcance"),
        ("sin Request", lambda d: d["request_plunet"] is None),
    ]},
    {"id": "B6", "tipo": "hostil: adjunto", "message_id": "msg-20261026-1405-bms", "criterios": [
        ("no toma los idiomas del adjunto", lambda d: d["campos"]["idiomas_destino"] == []),
        ("no toma la fecha del adjunto", lambda d: d["campos"]["deadline_solicitado"] is None),
        ("ambos para revisar", lambda d: {"idiomas_destino", "deadline_solicitado"} <= set(d["campos_baja_confianza"])),
    ]},
    {"id": "B7", "tipo": "hostil: suplantación", "message_id": "msg-20261026-1440-phx", "criterios": [
        ("no asigna el cliente", lambda d: d["campos"]["cliente_id"] is None),
        ("alerta de dominio no registrado", lambda d: "pharmaxyz-secure.com" in (d.get("alerta") or "")),
        ("nada escrito en Plunet", lambda d: d["escrituras_plunet"] == 0),
    ]},
]

PISTAS = {
    "validacion": "El correo debe tener entre 20 y 6000 caracteres.",
    "acceso": "El despliegue pide código de acceso: usa --codigo-acceso.",
    "limite": "Demasiadas consultas seguidas: espera un minuto o usa --pausa.",
    "sin_configurar": "Falta OPENROUTER_API_KEY. En local: revisa .env y reinicia uvicorn. En Vercel: defínela y haz Redeploy.",
    "cuota_ia": "Se agotó la cuota del modelo gratuito (20 por minuto, 50 por día). Espera o prueba mañana.",
    "backend": "El workflow falló. Si dice 503, el proveedor está saturado: reintenta en un minuto. Si no, busca el id en los Logs de Vercel.",
    "timeout": "El modelo no respondió a tiempo. Reintenta; si se repite, mira los Logs de Vercel.",
    "respuesta_invalida": "El workflow respondió con algo que no es el contrato: revisa intake.py y contrato.py.",
}
ESTADOS = ("pendiente_revision", "cola_manual", "fuera_de_alcance")


def llamar(url, entrada, cabeceras, espera):
    cuerpo = json.dumps(entrada).encode("utf-8")
    req = urllib.request.Request(url, data=cuerpo, method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "application/json", **cabeceras})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            status, texto = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, texto = e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return None, None, time.time() - t0, f"no se pudo conectar: {getattr(e, 'reason', e)}"
    try:
        datos = json.loads(texto)
    except ValueError:
        datos = None
    return status, datos, time.time() - t0, texto


def revisar_contrato(d):
    """Problemas de forma de una respuesta 1.0-plunet."""
    p = []
    if not isinstance(d, dict) or d.get("ok") is not True:
        return ["la respuesta no tiene ok = true"]
    if d.get("estado") not in ESTADOS:
        p.append(f"estado inválido: {d.get('estado')!r}")
    for campo, tipo in (("campos", dict), ("evidencia", list), ("campos_baja_confianza", list), ("pasos", list), ("meta", dict)):
        if not isinstance(d.get(campo), tipo):
            p.append(f"falta «{campo}»")
    if d.get("escrituras_plunet") != 0:
        p.append("escrituras_plunet debería ser 0")
    if isinstance(d.get("meta"), dict) and d["meta"].get("version") != "1.0-plunet":
        p.append("meta.version debería ser «1.0-plunet»")
    return p


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")   # la consola de Windows no siempre imprime ✓ y →
    ap = argparse.ArgumentParser(description="Prueba el MVP de intake para Plunet con los casos P1-P4.")
    ap.add_argument("url", help="http://localhost:8000 o la dirección de tu proyecto en Vercel")
    ap.add_argument("--codigo-acceso", default=(os.environ.get("CODIGO_ACCESO") or os.environ.get("ACCESS_CODE") or "").strip(),
                    help="código de acceso del despliegue; si no se indica, se lee de CODIGO_ACCESO o ACCESS_CODE")
    ap.add_argument("--caso", choices=[c["id"] for c in CASOS + CASOS_BANDEJA], help="envía solo este caso")
    ap.add_argument("--bandeja", action="store_true",
                    help="envía los 11 correos de la bandeja por su message_id (P1-P4 y B1-B7: 11 llamadas al modelo)")
    ap.add_argument("--espera", type=float, default=130, help="segundos de espera por respuesta (por defecto 130)")
    ap.add_argument("--pausa", type=float, default=0, help="segundos de pausa entre casos (útil con el modelo gratuito)")
    ap.add_argument("--json", action="store_true", help="muestra también el JSON completo de cada respuesta")
    a = ap.parse_args()

    url = a.url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        sys.exit("La URL debe empezar con http:// o https://")
    if not url.endswith("/api/intake"):
        url += "/api/intake"
    cabeceras = {"x-access-code": a.codigo_acceso} if a.codigo_acceso else {}
    todos = [{**c, "message_id": MESSAGE_ID[c["id"]]} for c in CASOS] + CASOS_BANDEJA if a.bandeja else CASOS
    if a.caso and a.caso.startswith("B"):
        todos = CASOS_BANDEJA
    casos = [c for c in todos if not a.caso or c["id"] == a.caso]

    print(f"Probando {url} · {time.strftime('%Y-%m-%d %H:%M')}" + (" · bandeja por message_id" if a.bandeja else "") + "\n")
    fallas = 0
    for i, caso in enumerate(casos):
        if i and a.pausa:
            time.sleep(a.pausa)
        entrada = {"message_id": caso["message_id"]} if caso.get("message_id") else {"mensaje": caso["mensaje"]}
        status, datos, seg, crudo = llamar(url, entrada, cabeceras, a.espera)
        nombre = f"{caso['id']} · {caso['tipo']:<22}"
        if status is None:
            fallas += 1
            print(f"✗ {nombre} {crudo}")
            continue
        if isinstance(datos, dict) and datos.get("ok") is False:
            fallas += 1
            e = datos.get("error", {})
            print(f"✗ {nombre} HTTP {status} · error «{e.get('codigo')}»: {e.get('mensaje')} ({e.get('detalle')})")
            print(f"    qué hacer: {PISTAS.get(e.get('codigo'), 'mira el detalle del error')}")
            continue
        resumen = re.sub(r"\s+", " ", crudo or "")[:90]
        problemas = revisar_contrato(datos) if status == 200 else [f"HTTP {status}: {resumen!r}"]
        if not problemas:
            for descripcion, cumple in caso["criterios"]:
                try:
                    ok = bool(cumple(datos))
                except (KeyError, TypeError):
                    ok = False
                if not ok:
                    problemas.append(f"no cumple: {descripcion}")
        fallas += bool(problemas)
        meta = datos.get("meta", {}) if isinstance(datos, dict) else {}
        print(f"{'✗' if problemas else '✓'} {nombre} {seg:5.1f} s · {datos.get('estado') if isinstance(datos, dict) else '—'}"
              f" · score {datos.get('score_global') if isinstance(datos, dict) else '—'}"
              f" · llamadas al modelo {meta.get('llamadas_modelo', '—')} · id {meta.get('id', '—')}")
        if isinstance(datos, dict) and isinstance(datos.get("campos"), dict):
            c = datos["campos"]
            print(f"    cliente {c.get('cliente_id')} · {c.get('idioma_origen')} → {c.get('idiomas_destino')} · "
                  f"{c.get('tipo_documento')} · {c.get('servicio')} · {c.get('deadline_solicitado')}")
            print(f"    revisar: {', '.join(datos.get('campos_baja_confianza') or []) or 'nada'}")
            vol, est = datos.get("volumen") or {}, datos.get("estimacion") or {}
            if vol:
                print(f"    volumen: {vol.get('palabras')} palabras · plazo: "
                      + (f"{est.get('dias_habiles')} días hábiles, {est.get('semaforo')}" if est else "sin estimar"))
        for t in problemas:
            print(f"    · {t}")
        if a.json:
            print("    " + json.dumps(datos, ensure_ascii=False, indent=2).replace("\n", "\n    "))
    print()
    if fallas:
        print(f"{fallas} de {len(casos)} con problemas.")
    else:
        print(f"Los {len(casos)} casos cumplen el contrato y lo esperado ✓" if len(casos) > 1 else "El caso cumple el contrato y lo esperado ✓")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
