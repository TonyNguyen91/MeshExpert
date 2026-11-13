# makes brep_embed.js from the wasm-bindgen output folder (argv[1])
import base64, gzip, re, sys
d = sys.argv[1]
glue = open(d + '/mrtbrep.js', encoding='utf8').read()
glue = glue.replace('script_src = new URL(document.currentScript.src, location.href).toString();', 'try { script_src = new URL(document.currentScript.src, location.href).toString(); } catch (e) {}')
glue = glue.replace('let wasm_bindgen = (function', 'var wasm_bindgen = (function')
assert 'try { script_src' in glue and 'var wasm_bindgen' in glue
w = open(d + '/mrtbrep_bg.wasm', 'rb').read()
b = base64.b64encode(gzip.compress(w, 9)).decode()
hdr = '// B-rep engine: solidcore / SolidCraft kernel (Apache-2.0, MIT OR Apache-2.0), see LICENSES-BREP.txt\n'
open('brep_embed.js', 'w', encoding='utf8').write(hdr + 'const BREP_GZ="' + b + '";\n' + glue + '\n')
print(len(b) / 1e6, 'MB base64')
