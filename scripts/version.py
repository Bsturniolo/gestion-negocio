#!/usr/bin/env python3
"""Cambia el número de versión en todos lados: package.json, app/version.js,
los ?v= de index.html y la caché del service worker (para que el navegador
tome la versión nueva sin tener que borrar nada). Uso: python3 scripts/version.py 1.3.4"""
import json, re, sys, pathlib

v = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
pkg = root / 'package.json'
data = json.loads(pkg.read_text()); data['version'] = v
pkg.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
(root / 'app' / 'version.js').write_text(f"window.APP_VERSION = '{v}';\n")
idx = root / 'app' / 'index.html'
s = idx.read_text()
s = re.sub(r'(src|href)="(styles\.css|config\.js|cloud\.js|app\.js|turnos\.js|catering\.js|extras\.js|evento\.js|ejemplos\.js|asistente\.js|ventas\.js|version\.js)(\?v=[^"]*)?"', lambda m: f'{m.group(1)}="{m.group(2)}?v={v}"', s)
idx.write_text(s)
sw = root / 'app' / 'sw.js'
sw.write_text(re.sub(r"const CACHE = '[^']*';", f"const CACHE = 'negocio-{v}';", sw.read_text()))
print('versión', v)
