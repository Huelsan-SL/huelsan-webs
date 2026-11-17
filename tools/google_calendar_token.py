#!/usr/bin/env python3
"""Huelsan · obtiene el GOOGLE_REFRESH_TOKEN para la función «calendario» de Supabase.

Se ejecuta UNA vez, en un ordenador con navegador, entrando con la cuenta de Google cuyo calendario se quiere usar:

  python3 tools/google_calendar_token.py CLIENT_ID CLIENT_SECRET

Antes, en https://console.cloud.google.com (con la misma cuenta de Huelsan):
  1. Proyecto nuevo «Huelsan» → API y servicios → Biblioteca → activar «Google Calendar API».
  2. Pantalla de consentimiento de OAuth → tipo «Externo» → añadir como usuario de prueba la cuenta de Google y,
     al terminar, PULSAR «Publicar aplicación» (en modo «Prueba» el permiso caduca a los 7 días).
     Saldrá un aviso de «app no verificada» al autorizar: es normal (solo la usáis vosotros); «Avanzado» → «Ir a Huelsan».
  3. Credenciales → Crear credenciales → ID de cliente de OAuth → tipo «Aplicación de escritorio». Copiar ID y secreto.

El script imprime el token. Guardad en Supabase → Edge Functions → Secrets:
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (el calendario «Subastas Huelsan» se crea solo la primera vez).
No se guarda nada en ningún archivo.
"""
import http.server
import json
import secrets
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser

PUERTO = 8765
ALCANCE = "https://www.googleapis.com/auth/calendar.app.created"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    cid, secreto = sys.argv[1], sys.argv[2]
    redir = f"http://127.0.0.1:{PUERTO}"
    estado = secrets.token_urlsafe(16)
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redir, "response_type": "code", "scope": ALCANCE,
        "access_type": "offline", "prompt": "consent", "state": estado,
    })
    recibido = {}
    hecho = threading.Event()

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in q and q.get("state", [""])[0] == estado:
                recibido["code"] = q["code"][0]
            elif "error" in q:
                recibido["error"] = q["error"][0]
            else:
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>Listo. Ya puedes cerrar esta pestaña.</h2>".encode())
            hecho.set()

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", PUERTO), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print("Abriendo el navegador para autorizar el acceso al calendario…\nSi no se abre, copia esta dirección:\n" + url)
    webbrowser.open(url)
    hecho.wait(300)
    srv.shutdown()
    if "code" not in recibido:
        sys.exit("No se ha recibido la autorización: " + recibido.get("error", "tiempo agotado"))
    datos = urllib.parse.urlencode({
        "code": recibido["code"], "client_id": cid, "client_secret": secreto,
        "redirect_uri": redir, "grant_type": "authorization_code",
    }).encode()
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", datos)))
    except urllib.error.HTTPError as e:
        sys.exit("Google ha rechazado el código: " + e.read().decode()[:300])
    if not r.get("refresh_token"):
        sys.exit("Google no ha devuelto refresh_token. Quita el acceso de «Huelsan» en https://myaccount.google.com/permissions y repite.")
    print("\nGOOGLE_REFRESH_TOKEN=" + r["refresh_token"])


if __name__ == "__main__":
    main()
