use serde_json::{Value, json};
use solidcore_record::Vec3;
use solidcraft_kernel as k;
use std::cell::RefCell;
use std::collections::HashMap;

thread_local! {
    static BODIES: RefCell<HashMap<u32, k::Body>> = RefCell::new(HashMap::new());
    static NEXT: RefCell<u32> = const { RefCell::new(1) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn v3(v: &Value) -> Result<Vec3, String> {
    let a = v.as_array().ok_or("vec3")?;
    let g = |i: usize| a.get(i).and_then(Value::as_f64).ok_or("vec3");
    Ok(Vec3::new(g(0)?, g(1)?, g(2)?))
}
fn pts(v: &Value) -> Result<Vec<Vec3>, String> {
    v.as_array().ok_or("points")?.iter().map(v3).collect()
}
fn num(v: &Value, k: &str) -> Result<f64, String> {
    v.get(k).and_then(Value::as_f64).ok_or(format!("missing {k}"))
}
fn put(b: k::Body) -> u32 {
    let id = NEXT.with(|n| { let mut n = n.borrow_mut(); let i = *n; *n += 1; i });
    BODIES.with(|m| m.borrow_mut().insert(id, b));
    id
}
fn get(v: &Value, key: &str) -> Result<k::Body, String> {
    let id = v.get(key).and_then(Value::as_u64).ok_or(format!("missing {key}"))? as u32;
    BODIES.with(|m| m.borrow().get(&id).cloned()).ok_or(format!("no body {id}"))
}
fn e(x: k::KernelError) -> String { x.to_string() }
fn ok(b: k::Body) -> Value { json!({"id": put(b)}) }

pub fn run(cmd: &Value) -> Result<Value, String> {
    let op = cmd.get("op").and_then(Value::as_str).ok_or("missing op")?;
    match op {
        "box" => Ok(ok(k::box_solid(v3(&cmd["a"])?, v3(&cmd["b"])?).map_err(e)?)),
        "cylinder" => Ok(ok(k::cylinder(v3(&cmd["base"])?, v3(&cmd["axis"])?, num(cmd, "r")?, num(cmd, "h")?).map_err(e)?)),
        "sphere" => Ok(ok(k::sphere(v3(&cmd["c"])?, num(cmd, "r")?).map_err(e)?)),
        "bool" => {
            let o = match cmd["kind"].as_str() { Some("union") => k::BoolOp::Union, Some("cut") => k::BoolOp::Cut, _ => k::BoolOp::Intersect };
            match k::boolean(&get(cmd, "a")?, &get(cmd, "b")?, o).map_err(e)? { Some(b) => Ok(ok(b)), None => Ok(json!({"id": 0})) }
        }
        "fillet" => Ok(ok(k::fillet(&get(cmd, "id")?, &pts(&cmd["edges"])?, num(cmd, "r")?).map_err(e)?)),
        "chamfer" => Ok(ok(k::chamfer(&get(cmd, "id")?, &pts(&cmd["edges"])?, num(cmd, "d")?).map_err(e)?)),
        "shell" => Ok(ok(k::shell(&get(cmd, "id")?, &pts(&cmd["open"])?, num(cmd, "t")?).map_err(e)?)),
        "extrude" | "revolve" => {
            let plane: solidcore_record::Plane = serde_json::from_value(cmd["plane"].clone()).map_err(|x| x.to_string())?;
            let regions: Vec<solidcore_record::Region2> = serde_json::from_value(cmd["regions"].clone()).map_err(|x| x.to_string())?;
            let bodies = if op == "extrude" {
                k::extrude(&plane, &regions, num(cmd, "start")?, num(cmd, "end")?).map_err(e)?
            } else {
                let o: solidcore_record::Vec2 = serde_json::from_value(cmd["axisOrigin"].clone()).map_err(|x| x.to_string())?;
                let d: solidcore_record::Vec2 = serde_json::from_value(cmd["axisDir"].clone()).map_err(|x| x.to_string())?;
                k::revolve(&plane, &regions, o, d, num(cmd, "angle")?).map_err(e)?
            };
            let mut it = bodies.into_iter();
            let mut acc = it.next().ok_or("no body")?;
            for b in it { if let Some(u) = k::boolean(&acc, &b, k::BoolOp::Union).map_err(e)? { acc = u; } }
            Ok(ok(acc))
        }
        "extrudeTapered" => {
            let plane: solidcore_record::Plane = serde_json::from_value(cmd["plane"].clone()).map_err(|x| x.to_string())?;
            let regions: Vec<solidcore_record::Region2> = serde_json::from_value(cmd["regions"].clone()).map_err(|x| x.to_string())?;
            let (from, to, dir, taper) = (num(cmd, "from")?, num(cmd, "to")?, num(cmd, "dir")?, num(cmd, "taper")?);
            let mut acc: Option<k::Body> = None;
            for r in &regions {
                let b = k::extrude_tapered_between(&plane, r, from, to, 0.0, dir, taper, k::DraftCorner::PreserveCurvature).map_err(e)?;
                acc = Some(match acc { None => b, Some(a) => k::boolean(&a, &b, k::BoolOp::Union).map_err(e)?.unwrap_or(a) });
            }
            Ok(ok(acc.ok_or("no region")?))
        }
        "transform" => {
            let a = cmd["m"].as_array().ok_or("m")?;
            let mut m = [[0.0f64; 4]; 4];
            for (i, v) in a.iter().enumerate().take(16) { m[i / 4][i % 4] = v.as_f64().unwrap_or(0.0); }
            Ok(ok(k::transform_matrix(&get(cmd, "id")?, m).map_err(e)?))
        }
        "offsetFaces" => Ok(ok(k::offset_faces(&get(cmd, "id")?, &pts(&cmd["at"])?, num(cmd, "d")?).map_err(e)?)),
        "draft" => {
            let plane: solidcore_record::Plane = serde_json::from_value(cmd["neutral"].clone()).map_err(|x| x.to_string())?;
            Ok(ok(k::draft(&get(cmd, "id")?, &pts(&cmd["faces"])?, &plane, v3(&cmd["pull"])?, num(cmd, "angle")?).map_err(e)?))
        }
        "fromMesh" => {
            let p = cmd["pos"].as_array().ok_or("pos")?;
            let pos: Vec<Vec3> = p.chunks(3).map(|c| Vec3::new(c[0].as_f64().unwrap_or(0.0), c[1].as_f64().unwrap_or(0.0), c[2].as_f64().unwrap_or(0.0))).collect();
            let t = cmd["tri"].as_array().ok_or("tri")?;
            let tri: Vec<[u32; 3]> = t.chunks(3).map(|c| [c[0].as_u64().unwrap_or(0) as u32, c[1].as_u64().unwrap_or(0) as u32, c[2].as_u64().unwrap_or(0) as u32]).collect();
            Ok(ok(k::mesh_body(&pos, &tri).map_err(e)?))
        }
        "info" => {
            let b = get(cmd, "id")?;
            let edges: Vec<Value> = b.edges(0.05).map_err(e)?.iter().map(|x| json!({"i": x.index, "mid": [x.mid.x, x.mid.y, x.mid.z], "len": x.length})).collect();
            let (vol, area) = k::measure(&b).map(|m| (m.volume, m.area)).unwrap_or((f64::NAN, f64::NAN));
            Ok(json!({"faces": b.face_count(), "edges": edges, "shells": b.shell_count(), "validity": b.validity(), "volume": vol, "area": area}))
        }
        "mesh" => {
            let b = get(cmd, "id")?;
            let t = k::MeshTolerance::chord(cmd.get("chord").and_then(Value::as_f64).unwrap_or(0.05));
            let m = b.mesh(&t).map_err(e)?;
            let pos: Vec<f64> = m.positions.iter().flat_map(|p| [p.x, p.y, p.z]).collect();
            let tri: Vec<u32> = m.triangles.iter().flatten().copied().collect();
            Ok(json!({"pos": pos, "tri": tri, "face": m.tri_face}))
        }
        "step" => {
            let ids = cmd["ids"].as_array().ok_or("ids")?;
            let bs: Vec<k::Body> = ids.iter().map(|i| BODIES.with(|m| m.borrow().get(&(i.as_u64().unwrap_or(0) as u32)).cloned()).ok_or("no body")).collect::<Result<_, _>>()?;
            let r: Vec<&k::Body> = bs.iter().collect();
            Ok(json!({"step": k::step_export(&r, "MrT MeshExpert").map_err(e)?}))
        }
        "free" => { let id = cmd["id"].as_u64().unwrap_or(0) as u32; BODIES.with(|m| m.borrow_mut().remove(&id)); Ok(json!({})) }
        _ => Err(format!("unknown op {op}")),
    }
}

pub fn run_str(s: &str) -> String {
    let r = serde_json::from_str::<Value>(s).map_err(|x| x.to_string()).and_then(|c| {
        std::panic::catch_unwind(|| run(&c)).unwrap_or_else(|_| Err("internal error".into()))
    });
    match r { Ok(v) => json!({"ok": v}).to_string(), Err(m) => json!({"err": m}).to_string() }
}

#[unsafe(no_mangle)]
pub extern "C" fn mrt_alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}
#[unsafe(no_mangle)]
pub extern "C" fn mrt_free(p: *mut u8, n: usize) {
    if !p.is_null() { drop(unsafe { Vec::from_raw_parts(p, 0, n) }); }
}
#[unsafe(no_mangle)]
pub extern "C" fn mrt_call(p: *const u8, n: usize) -> usize {
    let s = unsafe { std::slice::from_raw_parts(p, n) };
    let out = run_str(&String::from_utf8_lossy(s));
    OUT.with(|o| { let mut o = o.borrow_mut(); *o = out.into_bytes(); o.len() })
}
#[unsafe(no_mangle)]
pub extern "C" fn mrt_out() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
