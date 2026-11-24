# Build ../index.html from the source files in this folder.
# Run: python3 src/build.py
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'index.html')

def r(p):
    with open(os.path.join(HERE, p), encoding='utf8') as f:
        return f.read()

core = r('core_base.js') + r('core_sketch.js') + r('core_dress.js') + r('core_extra.js') + '}\n'
with open(os.path.join(HERE, 'core.js'), 'w', encoding='utf8') as f:
    f.write(core)
# styles: Pico in its own layer (lowest priority), then the theme, the app's own rules and the drawing workspace
styles = ('<style>\n@layer pico {\n' + r('vendor/pico.min.css') + '\n}\n</style>\n'
          '<style>\n' + r('theme.css') + '</style>\n'
          '<style>\n' + r('app.css') + '</style>\n'
          '<style>\n' + r('dws.css') + '</style>\n')
out = (r('head.html').replace('<!--STYLES-->', styles) + '\n<script>\n/*CORE_BEGIN*/' + core + '/*CORE_END*/\n</script>\n\n'
       '<script>\n' + r('manifold_embed.js') + '</script>\n\n<script>\n' + r('brep_embed.js') + '</script>\n\n<script>\n' + r('app2.js').replace('/*MODEL*/', r('model.js') + r('feat.js') + r('brep.js') + r('geo.js') + r('sla.js') + r('rd.js') + r('pat.js') + r('v6.js') + r('fx.js') + r('shade.js') + r('dws.js') + r('dwupd.js') + r('dwsel.js') + r('dwexp.js')) + '</script>\n</body>\n</html>\n')
with open(OUT, 'w', encoding='utf8') as f:
    f.write(out)
print(len(out), 'bytes ->', os.path.normpath(OUT))
