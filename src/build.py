# Build ../index.html from the source files in this folder.
# Run: python3 src/build.py
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'index.html')

def r(p):
    with open(os.path.join(HERE, p), encoding='utf8') as f:
        return f.read()

core = r('core_base.js') + r('core_extra.js') + '}\n'
with open(os.path.join(HERE, 'core.js'), 'w', encoding='utf8') as f:
    f.write(core)
out = (r('head.html') + '\n<script>\n/*CORE_BEGIN*/' + core + '/*CORE_END*/\n</script>\n\n'
       '<script>\n' + r('app2.js') + '</script>\n</body>\n</html>\n')
with open(OUT, 'w', encoding='utf8') as f:
    f.write(out)
print(len(out), 'bytes ->', os.path.normpath(OUT))
