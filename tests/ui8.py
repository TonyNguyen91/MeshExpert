# Replaced by ui9.py (the sketch became parametric: points, constraints, dimensions). Kept so old links still work.
import os, sys, subprocess
sys.exit(subprocess.call([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui9.py')] + sys.argv[1:]))
