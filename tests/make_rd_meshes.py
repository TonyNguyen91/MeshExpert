# Writes the test meshes for ui17.py / ui18.py / ui19.py: a cylinder R 10 x 20 with a 2 mm chamfer on top (at 0,0,0), a sphere (R 10 at 50,0,10), a cone frustum (R 10 -> 4, height 20, at -50,0,0)
# and a 40 x 40 x 10 plate with a 10 x 10 square through hole (at 0,100,0), binary STL.
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
def quad(T, a, b, c, d): T.append((a, b, c)); T.append((a, c, d))
def plate_hole(o, W=40, H=10, h=10):
    x0, y0, x1, y1 = o[0], o[1], o[0] + W, o[1] + W
    hx0, hy0, hx1, hy1 = o[0] + (W - h) / 2, o[1] + (W - h) / 2, o[0] + (W + h) / 2, o[1] + (W + h) / 2
    T = []
    for z, up in ((H, True), (0, False)):
        rects = [(x0, y0, x1, hy0), (x0, hy1, x1, y1), (x0, hy0, hx0, hy1), (hx1, hy0, x1, hy1)]
        for (a0, b0, a1, b1) in rects:
            q = [(a0, b0, z), (a1, b0, z), (a1, b1, z), (a0, b1, z)]
            quad(T, *(q if up else q[::-1]))
    def wall(p, q, out):   # vertical wall from p to q (2D), normal to the left of p->q when out
        a, b, c, d = (p[0], p[1], 0), (q[0], q[1], 0), (q[0], q[1], H), (p[0], p[1], H)
        quad(T, a, b, c, d)
    for p, q in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))): wall(p, q, True)
    for p, q in (((hx0, hy0), (hx0, hy1)), ((hx0, hy1), (hx1, hy1)), ((hx1, hy1), (hx1, hy0)), ((hx1, hy0), (hx0, hy0))): wall(p, q, False)
    return T
def revolve(prof, n=48):   # closed solid of revolution about Z from a (r, z) profile, bottom to top
    T, m = [], len(prof)
    P = lambda i, j: (prof[j][0] * math.cos(2 * math.pi * (i % n) / n), prof[j][0] * math.sin(2 * math.pi * (i % n) / n), prof[j][1])
    bc, tc = (0, 0, prof[0][1]), (0, 0, prof[-1][1])
    for i in range(n):
        T.append((bc, P(i + 1, 0), P(i, 0))); T.append((tc, P(i, m - 1), P(i + 1, m - 1)))
        for j in range(m - 1):
            a, b, c, d = P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)
            T.append((a, b, c)); T.append((a, c, d))
    return T
write(os.path.join(out, 'rd_chamf.stl'), revolve([(10, 0), (10, 18), (8, 20)]))
write(os.path.join(out, 'rd_sphere.stl'), sphere((50, 0, 10), 10))
write(os.path.join(out, 'rd_plate_hole.stl'), plate_hole((0, 100, 0)))
write(os.path.join(out, 'rd_cone.stl'), frustum((-50, 0, 0), 10, 4, 20))
print('ok')
