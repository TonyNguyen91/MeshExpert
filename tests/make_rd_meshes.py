# Writes the test meshes for ui17.py: a sphere (R 10 at 50,0,10) and a cone frustum (R 10 -> 4, height 20, at -50,0,0), binary STL.
import struct, math, sys, os
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
def write(path, tris):
    with open(path, 'wb') as f:
        f.write(b'\0' * 80); f.write(struct.pack('<I', len(tris)))
        for a, b, c in tris:
            f.write(struct.pack('<3f', 0, 0, 0))
            for p in (a, b, c): f.write(struct.pack('<3f', *p))
            f.write(b'\0\0')
def sphere(c, R, nu=48, nv=24):
    P = lambda i, j: (c[0] + R * math.sin(math.pi * j / nv) * math.cos(2 * math.pi * i / nu), c[1] + R * math.sin(math.pi * j / nv) * math.sin(2 * math.pi * i / nu), c[2] + R * math.cos(math.pi * j / nv))
    T = []
    for j in range(nv):
        for i in range(nu):
            a, b, cc, d = P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)
            if j > 0: T.append((a, cc, b))
            if j < nv - 1: T.append((a, d, cc))
    return T
def frustum(c, r0, r1, h, n=64, rings=6):
    T = []
    ring = lambda k, i: (c[0] + (r0 + (r1 - r0) * k / rings) * math.cos(2 * math.pi * i / n), c[1] + (r0 + (r1 - r0) * k / rings) * math.sin(2 * math.pi * i / n), c[2] + h * k / rings)
    for k in range(rings):
        for i in range(n):
            a, b, cc, d = ring(k, i), ring(k, i + 1), ring(k + 1, i + 1), ring(k + 1, i)
            T.append((a, b, cc)); T.append((a, cc, d))
    bc, tc = (c[0], c[1], c[2]), (c[0], c[1], c[2] + h)
    for i in range(n):
        T.append((bc, ring(0, i + 1), ring(0, i))); T.append((tc, ring(rings, i), ring(rings, i + 1)))
    return T
write(os.path.join(out, 'rd_sphere.stl'), sphere((50, 0, 10), 10))
write(os.path.join(out, 'rd_cone.stl'), frustum((-50, 0, 0), 10, 4, 20))
print('ok')
