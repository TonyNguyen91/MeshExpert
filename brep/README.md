# B-rep engine wrapper

`src/lib.rs` is a small wrapper around the SolidCraft kernel (solidcore B-rep), compiled to WebAssembly and
embedded in `index.html` (`src/brep_embed.js`). It takes JSON commands (box, extrude, revolve, fillet, chamfer,
shell, boolean, transform, mesh, step) and keeps bodies in a table by id.

Licences: solidcore is Apache-2.0, the SolidCraft kernel crates are MIT OR Apache-2.0. See `src/LICENSES-BREP.txt`.
No SolidCraft brand or interface material is used.

## Rebuild

1. Get the SolidCraft source (github.com/tangency-labs/solidcraft) and copy this folder to `apps/mrtbrep`.
2. Add a size profile to the workspace `Cargo.toml`:

   ```toml
   [profile.mrtw2]
   inherits = "release"
   debug = false
   lto = false
   codegen-units = 256
   opt-level = "z"
   panic = "abort"
   incremental = false
   ```
3. Build (Rust with the `wasm32-unknown-unknown` target; `-j1` keeps memory use under about 6 GB):

   ```sh
   RUSTFLAGS="-C link-arg=-zstack-size=8388608" cargo build --profile mrtw2 -j1 -p mrtbrep --lib --target wasm32-unknown-unknown
   wasm-bindgen --target no-modules --no-typescript --remove-name-section --remove-producers-section \
     --out-dir out target/wasm32-unknown-unknown/mrtw2/mrtbrep.wasm
   ```
   (wasm-bindgen-cli must match the wasm-bindgen version in Cargo.lock.)
4. In the MeshExpert `src` folder: `python3 mk_brep.py <path to out>` then `python3 build.py`.
