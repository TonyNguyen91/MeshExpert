# MeshExpert

Công cụ chỉnh sửa mesh STL/OBJ chạy offline trong trình duyệt. Mở trực tiếp `index.html` (Chrome/Edge), không cần cài đặt.

App chạy hoàn toàn trên máy, không kết nối internet hay mạng nội bộ: mọi thư viện đều nằm sẵn trong `index.html`, và chính sách bảo mật (Content-Security-Policy) trong file chặn mọi kết nối mạng.

## Phiên bản
Phiên bản hiện tại: **v1.6.0** — hiện cạnh tên app (góc trên trái), trên tiêu đề cửa sổ và ở đầu Drawing Workspace. Mỗi bản vá tăng số cuối (v1.0.1, v1.0.2…), mỗi đợt tính năng mới tăng số giữa; số phiên bản nằm ở `APP_VER` trong `src/app2.js` và ở đầu dòng mô tả của commit tương ứng.

### Nhật ký thay đổi
- **v1.6.0** (25/11/2026) — Drawing Workspace sắp lại. Mặc định mới: **Viền part 0.05 mm** (màu #111111), **DPI 600**. Tab Hiệu ứng: bỏ nhóm Xuất, thêm palette **Mặc định** (đưa mọi hiệu ứng về thiết lập mặc định). Tab Export chỉ còn 2 nhóm **Thông tin** (khổ, ảnh, mô hình, tỉ lệ, dung lượng; dạng bảng, không bị cắt chữ) và **Xuất** (Sheet này: PNG / JPG / PDF · Từng Sheet: PNG / JPG / PDF · Tất cả Sheet: PDF gộp · Clipboard: Chép ảnh). Các nhóm còn lại của tab Export (Sheet, Hướng nhìn, Hiển thị, Nét & chữ, Ghi chú, Ảnh xuất) chuyển sang tab **Drawing**, có ở cả 6 Views và Exploded View. Thanh công cụ không bao giờ tràn ngang: khi thiếu chỗ, từng nhóm thu lại thành một nút có ▾, bấm để mở các lệnh của nhóm ngay bên dưới (thứ tự thu: Ảnh xuất, Ghi chú, Nét & chữ, Hiển thị, Hướng nhìn, Sheet, rồi tới các nhóm riêng của từng loại bản vẽ); bấm ra ngoài hoặc Esc để đóng. Lần đầu mở Drawing từ 3D Workspace tự tạo 2 Sheet: **Dimension** (6 Views) và **Exploded** (Exploded View). Exploded view: **mọi linh kiện đang chọn đều sáng cam** cùng khung cam nét đứt (trước chỉ linh kiện bấm sau cùng sáng cam); bấm chỗ trống tắt cả hai. Test: `ui36` (mới); `ui35` thêm palette Mặc định; `ui32`–`ui34` số phiên bản.
- **v1.5.0** (24/11/2026) — Drawing / Exploded view: bấm lần lượt nhiều linh kiện để chọn cùng lúc (Ctrl+bấm để bỏ một cái), bấm đúp để gán **một vật liệu cho tất cả** linh kiện đang chọn; bấm chỗ trống bỏ chọn hết; kéo chuột trái ở chỗ trống là **quét chọn** (trái → phải: nằm trọn trong khung, phải → trái: chạm khung, như 3D Workspace), dời tờ giấy bằng chuột giữa hoặc Space + kéo; góc trống trong khung bao của linh kiện là chỗ trống (bắt theo đúng hình). **Xoay riêng từng linh kiện** (nhóm *Xoay linh kiện* trong tab Drawing, ngay sau *Góc nhìn*): Xoay / Nghiêng / Lăn theo trục màn hình, nút Xoay 90°, Lật 90°, Về hướng gốc; áp cho mọi linh kiện đang chọn, lưu theo Sheet. Khung: **tên khung đặt trong hoặc ngoài khung, ở 4 góc** (Tên ở). Xếp tự động: cụm Tổng khối lượng không còn chiếm một dải của trang, các linh kiện dàn trên cả trang rồi cụm chữ được đặt vào góc trống. Tab Hiệu ứng thiết kế lại theo kiểu **ZBrush**: mỗi hiệu ứng là một palette có công tắc bật / tắt, thanh trượt ZBrush (tên bên trái, số bên phải, kéo bất kỳ chỗ nào, Shift = mịn, bấm đúp để gõ số, phím ←/→), quả cầu đèn cho bóng đổ. **Viền part** sửa lại: trước chỉ vẽ 1 px ở chỗ hai body chạm nhau (trùng nét cạnh, Exploded không bao giờ có) nên không thấy tác dụng; nay là đường viền quanh từng part (đường bao + chỗ hai body gặp nhau) với bề dày (mm) và màu riêng, mặc định 0.2 mm. Test: `ui35` (mới); `ui32`–`ui34` số phiên bản.
- **v1.4.0** (24/11/2026) — Tận dụng phần cứng và Drawing mượt với mesh nặng. Card đồ hoạ: cả màn hình 3D và bộ vẽ bản vẽ xin card mạnh (`powerPreference: 'high-performance'`). CPU: thay 1 luồng nền bằng **nhóm worker** theo số nhân máy (tối đa 8, `src/app2.js`); các lệnh chạy song song; deviation / undercut / va chạm được chia phần cho nhiều worker rồi ghép lại đúng thứ tự (kết quả giống hệt chạy một luồng, có kiểm thử); Boolean (Manifold) chạy trong worker riêng nên trang không đứng; nhận diện mặt (`core.features`) được nhớ theo nội dung mesh (lần gọi thứ hai ~10 ms thay vì ~1 s) và với máy từ 4 nhân thì body nặng được nhận diện sẵn ở nền. Drawing (`src/v6.js`, `src/fx.js`): chuẩn bị body (hàn đỉnh, pháp tuyến, cạnh) chạy trong worker (`core.drawPrep`), nhiều body cùng lúc; mỗi view vẽ trong **một lượt GPU** ra 4 ảnh (độ sâu, màu, số body, pháp tuyến) thay vì 3–5 lượt; mỗi view giữ lại ảnh GPU / hiệu ứng / nét: đổi thông số Hiệu ứng chỉ chạy lại hiệu ứng, đổi nét chỉ vẽ lại nét; đổi thông số nào cũng hiện ngay ở khung hình kế tiếp (sắp lại khổ giấy từ ảnh đã có), ảnh mới đến sau, view nào xong hiện view đó, giữa các view trang được trả quyền nên không đứng; kéo thanh trượt liên tục vẫn có bản xem trước mới mỗi ~¼ s; ước lượng dung lượng file chỉ tính khi thông số đứng yên. Ảnh xuất PNG / PDF giống hệt bản cũ (so từng pixel). Đo trên STL 4 × 240 000 tam giác (máy test 2 nhân, GPU giả lập): khựng dài nhất khi chỉnh thông số 2.9–4.1 s → 0.1–0.4 s; từ lúc thả chuột đến bản xem trước cuối 3.1–4.3 s → 0.4–2.2 s. Test: `ui34` (mới), `ui26` đếm số lần render xong (thay cho số lần đổi đối tượng xem trước), `ui32` / `ui33` số phiên bản; `tests/make_heavy_meshes.py` + `tests/perf_bench.py` để đo lại trên máy thật.
- **v1.3.2** (24/11/2026) — Hiệu năng bản vẽ (`src/v6.js`): body đã chuẩn bị được giữ lại giữa các lần xem trước (chỉ dựng lại khi hình học, vị trí, góc hoặc kiểu ánh sáng đổi); buffer GPU không upload lại mỗi lần; hàn đỉnh bằng hash số; cạnh và pháp tuyến dùng mảng phẳng; bỏ cấp phát mảng nhỏ theo từng đỉnh/cạnh; chọn body trong 3D không còn dựng lại bản vẽ. Trên STL 960 000 tam giác: xem trước đầu tiên 2.3 s → 1.8 s, các lần sau 1.4–1.9 s → 0.4–0.5 s; hình vẽ 6 Views, Exploded và các trạng thái ẩn/di chuyển/xoá body giống hệt bản cũ. Giao diện: tích hợp **Pico CSS v2.1.1** (MIT) làm nền cho control, nhúng trong `@layer pico` để style của app luôn đứng trên; `src/theme.css` (mới) chứa token theme tối (màu gốc của app) và style base cho button, input, label, bảng, scrollbar; `src/app.css` (mới) là stylesheet cũ tách khỏi `head.html`, màu hard-code đổi sang token; Drawing Workspace (`dws.css`) dùng cùng token; panel nổi có nền đặc; checkbox/radio giữ kiểu gốc và tắt transition để trạng thái đổi ngay như trước. Build: `src/build.py` chèn style vào `<!--STYLES-->` trong `head.html`. Test: `ui32`, `ui33` cập nhật số phiên bản.
- **v1.3.1** (21/11/2026) — Mặc định mới: bàn in SLA (dàn đều 30 %, khe tối thiểu 10 mm, khối chắn bật, lề mép bàn 30 mm); bản vẽ (Một màu xám 153/158/163, chữ đậm); tab Hiệu ứng (ngưỡng bậc 5 mm, nét bậc 0.01 mm, dải tối rộng 5 mm đậm 4 %, AO bán kính 0.2 mm, bóng đổ hướng 0° cao 5°); Hiển thị 3D (màu body 100 %, cavity rãnh 6 % / gờ 8 %, AO 15 % bán kính 21 px, bóng đổ 12 % dài 16 % mềm 100 %). Nút **Xếp tự động** giống nhau ở 6 Views và Exploded View, nằm ngay cạnh nút 2D Type (nhóm "Bố trí & loại bản vẽ").
- **v1.3.0** (21/11/2026) — Hiển thị 3D kiểu ZBrush (bật sẵn, tắt được trong ⚙ Cài đặt ▸ tab **Hiển thị 3D**): ánh sáng MatCap (4 kiểu: Đất sét mềm, Sculpt, Xám, Trắng), bóng mượt qua cạnh theo góc làm mượt (cạnh sắc của chi tiết CAD vẫn sắc), cavity trên màn hình (rãnh tối, gờ sáng), Ambient Occlusion, bóng đổ theo hướng đèn; xoay đèn ngang / dọc; mỗi mức có thanh kéo + ô số; thiết lập được nhớ sau khi mở lại app.
- **v1.2.0** (20/11/2026) — Hiệu ứng ảnh Drawing (tab **Hiệu ứng** mới): nét bậc theo độ sâu (nét ở chỗ độ sâu nhảy, nằm về phía mặt thấp hơn, dày theo độ cao bậc), dải tối chân bậc, viền part (chỗ body này gặp body khác), Ambient Occlusion, bóng đổ với đèn gắn màn hình, độ cong (gờ sáng, rãnh tối). Áp dụng cho 6 Views và Exploded, xem trước và PNG / JPG / PDF; lưu theo từng Sheet.
- **v1.1.0** (20/11/2026) — Sheet bản vẽ luôn theo mô hình 3D mới nhất: bỏ cột Source Bodies, bỏ body "mất" / Thay thế, bỏ Kiểm tra / Cập nhật và hình cũ (snapshot) trong file phiên, bỏ Save / Discard và trạng thái Đã lưu / Đã sửa / Cần cập nhật của Sheet (thay đổi được giữ ngay; Ctrl+S lưu phiên). Body của Sheet = mọi body của mô hình, ẩn / hiện riêng từng Sheet (thêm "Chỉ hiện body này", "Hiện mọi body"). Bấm body trong danh sách → sáng cam ngay, không dựng lại hình.
- **v1.0.0** (20/11/2026) — Bắt đầu đánh số phiên bản. Sửa lỗi không bỏ được body đã bị xoá khỏi mô hình 3D ("✖ Mất") khỏi Source Bodies: câu hỏi xác nhận nay là hộp thoại của app (hộp xác nhận của trình duyệt có thể bị tắt cho trang và tự trả lời "Huỷ"); phím Delete bỏ body đang chọn (chọn ở cột Source Bodies → bỏ khỏi Source Bodies; chọn ở "Body của Sheet" → bỏ khỏi Sheet); Sheet chỉ còn một body đã mất vẫn bỏ được body đó; menu chuột phải của body đã mất trong cây có "Bỏ khỏi Source Bodies"; menu cột trái có "Bỏ mọi body đang mất (n)"; hộp Kiểm tra / Cập nhật có nút "Bỏ body bị mất khỏi Source Bodies".

## Cấu trúc
- `index.html` — file ứng dụng hoàn chỉnh (bản phát hành).
- `src/head.html` — giao diện (HTML/CSS).
- `src/core_base.js`, `src/core_extra.js` — lõi xử lý mesh (đọc/ghi, decimate, tách body, undercut, va chạm, đo, ICP...).
- `src/core_sketch.js` — mô hình sketch tham số (điểm dùng chung, ràng buộc, kích thước) và bộ giải ràng buộc.
- `src/core_dress.js` — hình học cho các lệnh solid: dao cắt fillet / chamfer, dời / thay mặt, shell.
- `src/app2.js` — logic giao diện và thao tác.
- `src/model.js` — môi trường sketch và danh sách sketch; `src/feat.js` — Extrude / Revolve, Boolean, các lệnh solid, phím tắt. Cả hai được chèn vào `app2.js` khi build.
- `src/v6.js` — bộ máy vẽ bản vẽ: 6 view và Exploded view.
- `src/dws.js`, `src/dws.css` — Drawing Workspace (Ribbon, Drawing Tree, Sheet, lưu phiên); `src/dwupd.js` — body của bản vẽ (luôn theo 3D) + hoàn tác; `src/dwsel.js` — ẩn / hiện body theo Sheet, Tạo Drawing Sheet; `src/dwexp.js` — xuất PDF; `src/fx.js` — hiệu ứng ảnh Drawing (nét bậc, chân bậc, viền part, AO, bóng đổ, độ cong).
- `src/shade.js` — hiển thị 3D kiểu ZBrush (MatCap, pháp tuyến mượt theo góc, cavity / AO / bóng đổ trên màn hình) và tab Hiển thị 3D trong Cài đặt.
- `src/manifold_embed.js` — thư viện Manifold 3.5.4 (Apache 2.0, xem `src/MANIFOLD_LICENSE.txt`) nhúng sẵn, dùng cho Boolean.
- `src/build.py` — ghép các file trên thành `index.html`: `python3 src/build.py`.
- `src/test_core.js`, `src/test_cmp.js`, `src/test_split.js`, `src/test_repair.js`, `src/test_solid.js`, `src/test_sketch.js`, `src/test_dress.js` — kiểm thử lõi bằng Node.js (chạy `build.py` trước).
- `tests/ui*.py` — kiểm thử giao diện tự động bằng Playwright + Chrome.
- `tests/make_split_meshes.js` — tạo các file STL mẫu cho `tests/ui5.py`, `tests/ui6.py`, `tests/ui7.py`.
- `tests/make_heavy_meshes.py`, `tests/perf_bench.py` — đo hiệu năng với mesh nặng (~1 triệu tam giác): `python3 tests/make_heavy_meshes.py <thư mục>` rồi `python3 tests/perf_bench.py <thư mục> index.html ketqua.json [core,draw] [--gpu]` (`--gpu`: dùng card đồ hoạ thật của máy).

## Hiệu năng và phần cứng
- **Card đồ hoạ**: app xin card mạnh. Trên laptop có 2 card, nên đặt thêm trong Windows: Cài đặt ▸ Hệ thống ▸ Màn hình ▸ Đồ hoạ ▸ chọn Chrome / Edge ▸ **Hiệu năng cao**, và bật "Dùng tăng tốc phần cứng" trong cài đặt trình duyệt.
- **CPU**: nhóm worker = số nhân logic của máy (tối đa 8). Deviation, undercut, va chạm chia phần theo số worker; phần dựng cây BVH (~0.5 s với 1 triệu tam giác) mỗi worker vẫn tự làm, nên máy 8 nhân nhanh khoảng 2.5–3 lần so với một luồng. ICP vẫn chạy một luồng (các vòng lặp phụ thuộc nhau).
- **Drawing**: thông số chia 3 mức: bố cục (cỡ chữ, tỉ lệ, kích thước, ghi chú, vị trí) → chỉ sắp lại; Hiệu ứng → chạy lại hiệu ứng trên ảnh GPU đã có; nét (độ dày nét, nét khuất) → vẽ lại nét; còn lại (góc cạnh, ánh sáng, màu, hướng nhìn, body) → vẽ lại view đó. Đổi góc nhìn iso chỉ vẽ lại view iso.
- **Giới hạn**: app chạy từ file nên trình duyệt không cho bộ nhớ dùng chung giữa các luồng (SharedArrayBuffer); mỗi worker nhận một bản sao mesh. Muốn WASM đa luồng (Manifold, B-rep) phải đóng gói app khác (Electron / Tauri hoặc server trên máy).

## Tách body: các phương án
"Tách body" bắt đầu từ phương án 1; "Phương án kế ▶", "◀ Phương án trước" hoặc thanh trượt làm lại đúng lần tách đó với phương án khác.
1. Các mảnh rời nhau (không chung đỉnh).
2. Tách cả chỗ chỉ chạm nhau tại 1 điểm.
3. Tách cả chỗ chạm nhau theo cạnh hoặc mặt (mỗi vỏ kín thành 1 body).
4. – 7. Cắt thêm tại khe lõm gấp từ 70°, 50°, 35°, 22° (chỗ các phần dính liền nhau); mảnh hở tại đường cắt.
8. – 10. Cắt tại mọi cạnh gấp từ 60°, 35°, 20° (tách thành từng mặt).

## Ghi chú
- `src/core.js` được sinh tự động khi chạy `build.py`.
- `app.js` cũ đã được thay bằng `app2.js` và không còn dùng.

## Thao tác trên màn hình 3D
- Chuột phải vào body: menu lệnh có biểu tượng cho từng dòng.
- Bấm lần lượt vào các body để tick thêm, bấm lại để bỏ tick; bấm khoảng trống hoặc nhấn Space để bỏ chọn hết.
- Giữ chuột phải kéo: xoay hướng nhìn quanh đúng điểm vừa bấm trên mesh.
- Công cụ Xoay: kéo mũi tên cong cùng màu với trục để xoay quanh trục đó; giữ Shift để xoay theo bước 1°.
- Bảng "Thông tin": ô tick ở dòng "Kích thước bao" hiện hộp bao kèm 3 kích thước; ô tick ở dòng "Trọng tâm" hiện trọng tâm, các công cụ đo bắt được điểm này.

## Vá lưới hở và đo theo hình dạng
- Viền hở của mọi mesh được vẽ màu đỏ sáng (ô "Viền hở" ở hàng Hiển thị).
- Mục "Vá lưới hở": 3 kiểu vá (phẳng; chia lưới đều; chia lưới và uốn theo mặt cong xung quanh), giới hạn chu vi lỗ, khâu khe hở.
- Công cụ đo tự nhận mặt phẳng, mặt trụ, mặt cầu, cạnh thẳng, cung tròn và đỉnh: bấm 1 cạnh để lấy chiều dài, 1 cung / mặt trụ / mặt cầu để lấy R, 2 đối tượng để đo khoảng cách hoặc góc. Giữ Alt để lấy điểm tự do.

## Sketch tham số
- Nút "✏ Sketch": chọn mặt phẳng (Top / Front / Right hoặc một mặt phẳng trên mesh) rồi vẽ trong môi trường riêng.
- Vẽ: Line, Rectangle, Rect. tâm, Circle, Arc 3 điểm, Cung tiếp tuyến, Polygon, Slot, Điểm; sửa: Fillet, Trim, Offset, Mirror, Nét dựng (construction), Xóa.
- Thanh công cụ sketch dạng biểu tượng như Onshape; rê chuột vào nút để xem tên và phím tắt. Hàng dưới có nút bật / tắt bắt lưới và bộ lọc chọn (Body, Điểm, Tâm, Thẳng...).
- Bắt điểm ngoài sketch: khi vẽ, ngoài điểm của chính sketch, con trỏ còn bắt được điểm geometry (point, đầu / giữa line, gốc O) và trên mesh theo bộ lọc: đỉnh (Điểm), tâm cung / lỗ (Tâm), điểm trên cạnh (Thẳng / Tròn). Điểm bắt được chiếu thẳng xuống mặt phẳng sketch (chấm hồng, nét đứt nối tới điểm 3D gốc nếu nó không nằm trên mặt vẽ). Tắt loại nào trong bộ lọc thì không bắt loại đó.
- Ràng buộc: Kích thước (dài, ngang, dọc, điểm–đường, góc, bán kính, đường kính), Trùng, Đồng tâm, Song song, Vuông góc, Tiếp tuyến, Ngang, Dọc, Bằng, Trung điểm, Đối xứng, Cố định. Khi vẽ, app tự thêm ngang / dọc / trùng điểm / điểm trên nét / trung điểm.
- Nét xanh = còn bậc tự do, nét trắng = đã ràng buộc đủ. Kéo điểm / nét để di chuyển phần còn tự do; nhấp đúp kích thước để sửa số. Ràng buộc xung đột hoặc thừa bị từ chối.
- Sketch xong nằm trong "Danh sách sketch" bên trái: ẩn / hiện (Y), sửa (nhấp đúp), đổi tên, xóa. Sửa sketch thì các khối tạo từ nó tự dựng lại.

## Khối solid, lệnh solid và Boolean
- Mở file STEP (.step / .stp): bấm "Mở file / phiên" hoặc kéo thả. Lõi B-rep đọc file trong một worker riêng, từng khối một (như SolidCraft bản web): app không bị treo, thanh tiến độ báo "dựng khối x / y" rồi "chia lưới x / y", khối nào xong hiện khối đó. Mỗi khối thành một body B-rep (cạnh thật, tên và màu lấy từ file, vị trí theo lắp ráp, đơn vị mm), lưới hiển thị theo dung sai của SolidCraft (1/1000 cỡ khối, có giới hạn góc). Thông báo cuối ghi thời gian đọc và chia lưới. File có lỗi dung sai vẫn mở được, cảnh báo ghi trong Console (F12). Khối mở từ STEP hiện chưa dùng được các lệnh solid (Fillet, Shell...) và chưa xuất lại STEP (solid).
- "Extrude" / "Revolve": chọn sketch trong hộp thoại (hoặc bấm sketch trên màn hình), bấm từng biên dạng để bỏ / lấy lại, New / Add / Remove / Intersect, xem trước bằng khối mờ.
- Lệnh solid trên thanh trên cùng: Fillet, Chamfer (cạnh, có lấy cạnh nối tiếp tuyến), Move face (mặt phẳng / mặt trụ), Replace face, Shell, Draft. Có xem trước. Với khối ◆ các lệnh được lưu thành lịch sử và áp lại khi sửa sketch / thông số khối (cạnh / mặt được tìm lại theo vị trí; lệnh nào không tìm lại được thì bị bỏ và app báo).
- "Boolean" trên thanh trên cùng: Union / Intersect dùng ô Tools; Subtract có 2 ô Tools và Targets riêng. Chạy bằng thư viện Manifold, chỉ trên lưới kín.
- ⚙ (góc phải trên), tab **Hiển thị 3D**: bật / tắt hiển thị kiểu ZBrush và chỉnh vật liệu MatCap, màu body, cường độ đèn, ánh sáng nền, xoay đèn, góc làm mượt, cavity rãnh / gờ, AO (cường độ, bán kính), bóng đổ (cường độ, độ dài, độ mềm). Tắt = hiển thị phẳng như các bản trước. Rê chuột lên từng dòng để xem giải thích.
- ⚙, tab **Phím tắt**: đặt phím tắt cho Move, Rotate, Scale, Sketch, Extrude, Revolve, Boolean, các lệnh solid và ẩn / hiện (mặc định Y).
- Lõi B-rep (khối chính xác): khối dựng từ sketch (Extrude kể cả draft, bo / vát cạnh đầu và vỏ trong hộp thoại; Revolve) và các lệnh Fillet, Chamfer, Shell, Move face, Draft được dựng bằng lõi B-rep nhúng trong file (solidcore / SolidCraft kernel, Apache-2.0 / MIT, xem `src/LICENSES-BREP.txt`). Mặt cong, fillet, lỗ tròn là hình học chính xác; lưới hiển thị chia với dung sai 0,02 mm.
- Phân biệt B-rep / lưới: trong danh sách body có nhãn xanh "B-rep" hoặc nhãn xám "Lưới"; trên màn hình 3D khối B-rep chỉ hiện các cạnh thật (như CAD), khối lưới hiện tam giác. Sau mỗi lệnh solid thanh trạng thái báo khối là B-rep hay lưới (kèm lý do).
- Thanh "Lọc" (cạnh nhóm Chọn / Di chuyển / Xoay...): bật / tắt loại đối tượng được chọn hoặc bắt điểm: Body, Điểm (đỉnh), Tâm (tâm đường tròn / cung / cầu), Thẳng (cạnh thẳng), Tròn (cạnh tròn / cung), Trục (trục mặt trụ), Phẳng (mặt phẳng), Cong (mặt trụ / cầu). Áp dụng cho chọn body, các lệnh đo, Ghép mặt / trục và chọn tâm xoay. Nhấp đúp một nút: chỉ lọc loại đó; nhấp đúp lần nữa: bật lại tất cả. Lựa chọn được nhớ cho lần mở sau.
- Số đo trên màn hình 3D là các nhãn kéo thả được: bấm giữ chuột trái vào nhãn và kéo tới chỗ không vướng hình (có đường dẫn nét đứt về điểm đo). Bấm vào nhãn để chọn, phím Delete để xóa. Nhãn luôn bấm được dù đang dùng công cụ nào hay bộ lọc đặt thế nào.
- Đo 2 đường tròn / cạnh: nhãn có 3 dòng Min, Max, Tâm. Đường min luôn hiện; trỏ chuột vào dòng Max hoặc Tâm thì đường đó mới hiện trong 3D (nét đứt), rời chuột thì tắt.
- Đo góc: vẽ cung góc tô mờ giữa hai nhánh; với 2 mặt phẳng, đỉnh góc nằm trên đường giao của 2 mặt. Nhãn có góc và góc bù (trỏ vào dòng "bù" để thấy cung góc bù).
- Nút "STEP (solid)" sáng lên khi có khối B-rep đang được tick. Chuột phải vào khối → "Chuyển solid → mesh" đổi khối đó thành lưới thường (nhãn đổi thành Lưới).
- Nhóm Geometry (cạnh nhóm Sketch) tạo hình tham chiếu trực tiếp trên màn hình 3D, theo bộ lọc:
  - Point: bấm đỉnh, tâm đường tròn, điểm trên cạnh hoặc điểm trên mặt mesh.
  - Line có 3 kiểu, chọn ở bảng nhỏ: Điểm – Điểm, Điểm – Mặt (vuông góc với mặt), Điểm – Vector (theo hướng một cạnh thẳng / trục / pháp tuyến mặt). Mỗi kiểu có các ô chọn đánh số; ô viền cam là ô nhận cú bấm tiếp theo (bấm vào ô để đổi, ✕ để bỏ). Đủ ô thì hiện line xem trước nét đứt kèm độ dài; bấm "Tạo line" hoặc Enter để tạo. Ô Dài (thanh kéo / số): 0 = tới điểm cuối / tới mặt phẳng, số khác 0 = dài đúng số đó; Đảo chiều. Chọn line trong danh sách rồi đổi Dài / Đảo chiều là line cập nhật.
  - Bảng nhỏ của các lệnh Point / Line / Plane / Axis, Di chuyển / Xoay / Tỉ lệ / Ghép có thanh tiêu đề: kéo thanh này để đưa bảng đi chỗ khác, nút ✕ đóng bảng và quay về lệnh Chọn, bấm đúp thanh tiêu đề để đưa bảng về góc trên trái. Vị trí bảng được nhớ cho lần mở sau.
  - Gốc tọa độ (khi bật hiện trục ở nhóm Hiển thị) là geometry để bắt: điểm gốc O, trục X / Y / Z và 3 mặt gốc XY (Top), XZ (Front), YZ (Right) vẽ nhỏ cạnh gốc. Trục và mặt gốc luôn giữ cùng kích thước trên màn hình khi zoom, và bấm chọn được xuyên qua vật thể (Point, Line, Plane, Mate, chọn tâm xoay, mặt vẽ Sketch, Snap mặt cắt, hướng Undercut). Riêng các lệnh đo vẫn ưu tiên body ở phía trước.
  - Bắt điểm: mọi lệnh cần một điểm (Point, ô điểm của Line, chọn tâm xoay / pick centre, Mate...) bắt được điểm geometry, điểm đầu / cuối / giữa của line và trục, điểm gốc O, hoặc snap trên mesh (đỉnh, tâm cung, điểm trên mặt theo bộ lọc). Ở chỗ cần hướng (vector của Line, trục X tay nắm, hướng Undercut) thì bấm vào điểm giữa / đầu line vẫn lấy hướng của line đó.
  - Chọn geometry ngay trên màn hình 3D (công cụ Chọn): bấm hoặc quét chuột trái ưu tiên body; chỗ không có body thì mới lấy geometry. Delete để xóa, Y để ẩn, chuột phải để Ẩn / Đổi tên / Xóa.
  - Plane: Theo mặt (bấm mặt phẳng, chỉnh Offset bằng thanh kéo / ô số, Đảo chiều; áp cho mặt đang chọn trong danh sách) hoặc 3 điểm.
  - Axis: từ mặt trụ, cạnh tròn, cạnh thẳng hoặc 2 điểm.
  - Các geometry nằm trong danh sách "Sketches / Geos" (ẩn / hiện, đổi tên, xóa bằng chuột phải hoặc phím Delete), dùng được làm đối tượng đo, đích của Mate, trục X của tay nắm, và xuất ra STEP bằng nút "STEP" ngay trên đầu danh sách Sketches / Geos (khung dây: điểm, đường thẳng dạng LINE cắt đoạn, viền mặt phẳng, cùng các nét của sketch đang hiện: đường thẳng, đường tròn, cung tròn; nét construction không xuất). Ô "+" cạnh đó (Điểm dạng +, cho Onshape): mỗi điểm xuất thêm dấu + gồm 3 đoạn ngắn, vì Onshape không đọc điểm rời (CATIA vẫn nhận điểm thật). Nút con mắt bên cạnh ẩn / hiện toàn bộ sketch và geometry một lần.
  - Lệnh Sketch → "Bấm vào mặt phẳng": rê chuột tới đâu thì mặt phẳng ở đó sáng vàng (kèm mũi tên pháp tuyến) để thấy đang bắt đúng mặt; bắt được cả mặt phẳng của mesh lẫn Plane tạo bằng nhóm Geometry. Rê vào mặt cong thì báo "Không phải mặt phẳng".
- Mate face / axis có thêm điểm: điểm (đỉnh, tâm theo bộ lọc, hoặc điểm geometry) ghép vào điểm, mặt phẳng hoặc trục; mặt / trục ghép vào điểm. Lần bấm đầu phải trên body cần dời; đích có thể là geometry.
- Move / Rotate / Scale: dòng "Trục X" trong bảng nhỏ đặt trục X của tay nắm theo cạnh thẳng, trục (mặt trụ / cạnh tròn), pháp tuyến mặt phẳng, 2 điểm hoặc vector nhập tay ("Thế giới" để về trục gốc). Số nhập ở Move / Rotate / Scale tính theo hệ trục này. Dòng "Tâm" chọn tâm (vùng chọn, gốc tọa độ, hoặc điểm bấm chọn) cho cả 3 lệnh.
- Hộp "Xuất file" cố định ở đầu cột trái (không bị cuộn mất): Tải STL tick, Tất cả (.zip), Gộp 1 STL, STEP (solid). Mở file bằng nút "Mở file / phiên" trên cùng hoặc kéo thả file vào bất cứ đâu trên cửa sổ. Nhân bản / Xóa body: Ctrl+C, Ctrl+V, phím Delete hoặc chuột phải.
- Mặt cắt (Section): Hướng mặt cắt chọn được trục X / Y / Z, hướng nhìn, hoặc "Snap (mặt mesh / plane)": rê chuột thấy mặt sáng lên, bấm vào mặt trên mesh, Plane của Geometry hoặc mặt gốc XY / XZ / YZ.
- Tooling analysis (undercut): Hướng mở khuôn chọn được trục X / Y / Z, hướng nhìn, hoặc "Chọn trên màn hình": bấm một mặt phẳng (lấy pháp tuyến), cạnh thẳng, line hoặc trục (kể cả trục gốc); có Đảo chiều và mũi tên cam chỉ hướng trên màn hình. Ô "Ẩn các body không được phân tích" ẩn tạm các body khác để dễ nhìn, bỏ tick (hoặc Xóa màu phân tích) là hiện lại.
- "STEP (solid)": tải các khối solid đang tick thành file STEP (mở được bằng CATIA, NX, Onshape...). Body chỉ là lưới (STL nhập vào, sau Boolean, hoặc có Replace face) không xuất STEP được.
- Lệnh nào lõi B-rep không làm được (ví dụ Move face mặt trên đang tiếp xúc fillet, Replace face) thì app tự dựng lại khối bằng cách cũ trên lưới, như trước khi có B-rep.
- Lõi B-rep nạp lần đầu mất khoảng 1–2 giây (khi mở Extrude / Revolve hoặc một lệnh solid). File index.html nặng khoảng 10,7 MB vì có lõi này.
- Mã nguồn lớp bọc lõi B-rep ở thư mục `brep/` (cách biên dịch lại xem `brep/README.md`).

## Biểu tượng app
- App có biểu tượng riêng (khối lưới tam giác) hiện trên tab Chrome. Biểu tượng được nhúng thẳng trong index.html (không cần mạng); bản gốc để chỉnh là src/icon.svg (sửa xong chạy lại build và cập nhật dữ liệu nhúng trong src/head.html).
- Tạo lối tắt ra màn hình có biểu tượng: mở index.html bằng Chrome → menu ⋮ → Truyền, lưu và chia sẻ (Cast, save and share) → Tạo lối tắt… (Create shortcut…), tick "Mở dưới dạng cửa sổ" nếu muốn app chạy cửa sổ riêng.

## Phiên làm việc (.mrtl)
- Các nút trên cùng có biểu tượng: Phiên mới, Mở file / phiên, Lưu phiên, Lưu thành…, Xóa hết, Lùi, Tiến, Vị trí lúc import. Tên file phiên đang mở hiện ngay cạnh nút lưu.
- Phiên mới: xóa sạch và bắt đầu phiên chưa có tên.
- Lưu phiên (Ctrl+S): lần đầu hỏi tên file; các lần sau (hoặc sau khi mở một file .mrtl bằng nút Mở hay kéo thả) thì ghi đè thẳng vào file đó, không hỏi lại.
- Lưu thành… (Ctrl+Shift+S): luôn hỏi tên file mới, từ đó Lưu phiên ghi vào file mới này.
- Trình duyệt quá cũ không ghi đè được file thì app tải file xuống như trước.

## Danh sách body và hiển thị
- Cột body (bên trái) mặc định rộng 364 px (1,3 lần trước), cột tên body rộng hơn; kéo mép phải của cột để đổi bề rộng (được nhớ), bấm đúp mép để về mặc định.
- Lệnh trên ribbon mở hộp thoại (Sketch, Extrude, Revolve, Boolean, Fillet, Chamfer, Shell, Draft, Pattern, Mirror, Move / Replace face, các bảng nổi, công cụ đo / Geometry) sáng cam khi hộp thoại đang mở; đóng bằng X thì tắt cam và về chuột Chọn.
- Danh sách body có thanh cuộn ngang; kéo mép phải của tiêu đề cột (Tên, Tam giác, K.lượng) để nới rộng / thu hẹp, bấm đúp mép để về độ rộng mặc định. Độ rộng được nhớ cho lần sau.
- Nút Edges (cạnh lưới) trong nhóm Hiển thị mặc định tắt.

## Undercut: góc draft dưới con trỏ
- Sau khi bấm "Phân tích" trong Tooling analysis (undercut), rê chuột lên body đã phân tích sẽ hiện nhãn góc draft của mặt dưới con trỏ (so với hướng mở khuôn), cho biết mặt thoát về phía + hay −, và cảnh báo vàng khi nhỏ hơn "Góc thoát khuôn tối thiểu". Xóa màu phân tích thì nhãn tắt.

## Drawing Workspace (Chụp → Drawing)
- Nút **Drawing** chuyển sang **Drawing Workspace**: một màn hình làm việc riêng che toàn cửa sổ. Mô hình 3D, danh sách body, lựa chọn và góc nhìn vẫn giữ nguyên bên dưới; nút **3D Workspace** (góc trên phải) để quay lại.
- Bố cục: **Ribbon** phía trên (tab **Drawing**, **Export** và **Hiệu ứng**), **Sheet Canvas** ở giữa, **Drawing Tree** bên phải (kéo mép cột để đổi bề rộng), **thanh Sheet** phía dưới (các tab Sheet + nút Duplicate). Bảng thuộc tính cũ đã bỏ — mọi thiết lập nằm trên ribbon.
- Tab **Drawing** gộp 6 Views và Exploded View: nút **2D Type** (ngoài cùng bên phải) chọn loại bản vẽ của Sheet — 6 Views hoặc Exploded View (hỏi xác nhận trước khi đổi; thiết lập mỗi loại vẫn giữ) — và ribbon hiện các nhóm của loại đó.
- Loại 6 Views: Tạo view (bật/tắt Trước/Trên/Dưới/Trái/Phải/Sau, Isometric — nút sáng khi view đang hiện), Isometric (góc xoay, góc nghiêng, cỡ hình iso — chỉ dùng được khi bật Isometric), Tỉ lệ & bố trí (tỉ lệ + tỉ lệ tuỳ chọn a : b, **Xếp tự động**: các hình chiếu cách đều nhau và cách đều viền, giữ nguyên cỡ; tính cả tên view, kích thước bao, dòng ghi tỉ lệ; hình iso vào ô trống cho khoảng cách lớn nhất, ưu tiên góc trên phải), Chú thích (tên view, ghi tỉ lệ, kích thước bao tách 3 loại bật / tắt riêng: **Dài**, **Rộng**, **Cao**; Dimension). Đường gióng của kích thước bao bắt đầu sát điểm ngoài cùng thật của vật thể (vd. góc vát), kéo đường kích thước để dời xa / gần (được lưu theo mm trên giấy).
- Loại Exploded View: Explode (thanh **Explode** — mặc định 0 = cụm lắp nguyên, kéo để tách các linh kiện —, bỏ vị trí kéo tay, **Xếp tự động**, Combine, Tách ra), Góc nhìn (góc xoay / nghiêng cả cụm), Xoay linh kiện (xoay riêng các linh kiện đang chọn), Thông tin (tên linh kiện, vật liệu + khối lượng, tổng khối lượng; tên / vật liệu / khối lượng linh kiện đang chọn), **Khung** (kẻ khung chữ nhật chia khu vực các part rời của một cụm: bấm Khung rồi kéo trên bản vẽ, bấm một điểm = khung mặc định; tên cụm mặc định ở ngoài, trên trái; *Tên ở* đặt tên trong hoặc ngoài khung, ở góc trên / dưới, trái / phải; bấm đúp hoặc chuột phải để sửa; kéo cạnh / tên để dời, kéo góc để đổi cỡ — cạnh tự bắt thẳng hàng (ngang và dọc) với cạnh các khung khác, có đường gióng xanh; màu mặc định đỏ, đổi được; cỡ chữ tên, bề dày nét; Delete hoặc chuột phải → Xoá; có trong PDF dạng nét vector).
- **Xếp tự động (Exploded)**: linh kiện nằm trong hoặc đè lên khung được xếp đều trong khung đó; linh kiện ngoài khung xếp đều ở vùng trống lớn nhất không chạm khung (và không chạm ô tổng khối lượng, dòng tỉ lệ); không linh kiện nào chồng nhau hay sát viền; giữ cỡ hình.
- Bấm tab 6 Views ↔ Exploded View khi Sheet đang ở loại kia: hỏi xác nhận trước khi chuyển (thiết lập của mỗi loại vẫn giữ). Tab Export không đổi loại bản vẽ.
- Ribbon Export (chức năng chung, áp dụng cho loại bản vẽ đang mở): Sheet (Sheet mới, khổ, hướng, W × H khi khổ Tùy chọn, vừa khung), Hướng nhìn (xoay ±90°, lật 90°, cỡ hình), Hiển thị (nét cạnh, nét khuất, B-rep mịn, màu + màu đơn, ánh sáng, góc nét), Nét & chữ (bề dày nét, cỡ chữ, đơn vị, chữ đậm), Ghi chú (thêm chữ, font, cỡ, màu, đậm, nghiêng, gạch chân; **căn trái / giữa / phải bằng chuột phải lên ghi chú**), Ảnh xuất (DPI, khử răng cưa, nền PNG, chất lượng JPG — gọn), Thông tin (khổ / ảnh / mô hình / tỉ lệ / dung lượng, rê chuột để xem đủ), Xuất (luôn hiện đủ chữ: PNG, JPG, PDF, PNG / JPG / PDF từng Sheet — mỗi Sheet một file, tên = tên Sheet —, PDF gộp, Chép ảnh cỡ gửi mail).
- Mặc định bản vẽ mới: nét 0,01 mm, cỡ chữ kích thước 5 mm, 300 DPI.
- Bản xem trước mượt: lăn chuột / kéo / rê chuột chỉ phóng ảnh đã dựng của tờ giấy; dừng tay khoảng 3 giây thì chữ và hình chiếu mới được vẽ sắc lại (đỡ khựng); phóng to nhiều thì dựng ảnh mới trước 1,8 lần nên ít phải dựng lại.
- Bấm một body trong "Body của Sheet" → body đó sáng màu cam trên bản vẽ (6 Views và Exploded) ngay lập tức, không phải dựng lại hình (màu cam lấy từ mặt nạ từng body của lần dựng hình trước); ở Exploded bấm một linh kiện trên bản vẽ → body đó sáng trong danh sách. Bấm lại để bỏ.
- Drawing Tree: mũi tên ▾ / ▸ cạnh Sheet để thu gọn / mở các view và body của Sheet.
- **Drawing Tree**: gốc `Drawing of "<tên model>"` (tên lấy từ tên phiên, hoặc tên body đầu tiên) và các Sheet. Bấm để mở Sheet; Sheet đang mở được tô sáng; mỗi Sheet ghi **Đã lưu** / **Đã sửa**. Bấm đúp để đổi tên; kéo thả để đổi thứ tự (cả trong cây lẫn trên thanh Sheet). Chuột phải gốc: Sheet mới, Đổi tên bản vẽ. Chuột phải Sheet: Mở, Đổi tên, Nhân bản, Xoá (có hỏi lại), Xuất PNG, Xuất JPG.
- Mỗi **Sheet** là một bản vẽ độc lập với cấu hình riêng (khổ giấy, hướng, tỉ lệ, view, vị trí, hiển thị, ghi chú; trong mỗi Sheet tab 6 Views và Exploded View vẫn là hai bản vẽ riêng). Chuyển Sheet không làm mất cấu hình của Sheet trước.
- **Không có Save / Discard theo Sheet**: mọi thay đổi trên Sheet được giữ ngay. **Duplicate** (Ctrl+D) nhân bản Sheet. **Ctrl+S** trong Drawing Workspace lưu cả phiên (.mrtl) như ở vùng 3D.
- **Lưu tài liệu** (nút trên cùng) ghi cả phiên .mrtl gồm mọi Sheet (Ctrl+Shift+S: lưu thành file khác). Mở lại file .mrtl khôi phục đủ: tên bản vẽ, thứ tự, Sheet đang mở, thiết lập từng Sheet, trạng thái Đã lưu / Đã sửa. Phiên lưu từ bản cũ (chưa có Workspace) mở ra thành Sheet 1.
- Trong Drawing Workspace các phím tắt của vùng 3D không tác dụng (Delete, Ctrl+Z… không đụng tới mô hình). **Ctrl+Z / Ctrl+Y** hoàn tác / làm lại thay đổi của Sheet đang mở.

### Hiệu ứng (tab Hiệu ứng)
Giúp phân biệt hai mặt phẳng cùng hướng nhưng khác độ cao (khi nhìn thẳng, vách đứng của bậc không có bề rộng trên ảnh). Mọi hiệu ứng chạy trên ảnh độ sâu của từng view (WebGL2, không thư viện ngoài), áp dụng cho cả 6 Views lẫn Exploded, cho bản xem trước và ảnh / PDF xuất ra; thiết lập lưu theo từng Sheet (và từng loại bản vẽ). Mức 0 = tắt.
- **Nét bậc** — *Ngưỡng*: độ cao bậc nhỏ nhất được vẽ nét (mm trên vật); *Nét*: bề dày trên giấy (mm). Nét nằm về phía mặt thấp hơn và dày hơn khi bậc cao hơn (đường bao ngoài dày nhất). Vách nghiêng liên tục (chamfer, mặt cong) không bị coi là bậc.
- **Chân bậc** — dải tối mờ dần trên mặt thấp, sát chân bậc: *Rộng* (mm trên giấy), *Đậm* (%).
- **AO** (Ambient Occlusion) — chân bậc, khe, lỗ tối dần: *Bán kính* (mm trên vật), *Đậm* (%). Mặc định tắt.
- **Bóng đổ** — đèn gắn với màn hình (mọi view sáng cùng một kiểu, không phải xoay đèn theo view): *Đậm* (%), *Xoay* (hướng đèn trên màn hình, 0° = từ phải, 90° = từ trên), *Nghiêng* (độ cao đèn, thấp = bóng dài). Mặt quay lưng với đèn cũng tối. Mặc định tắt.
- **Độ cong** — gờ sáng, rãnh tối theo độ cong bề mặt (%). Không bắt được bậc phẳng nên chỉ bổ trợ. Mặc định tắt.
- **Viền part** — đường viền quanh từng part: đường bao của part và chỗ hai body gặp nhau (mỗi bên một nửa bề dày); *Nét* (mm trên giấy) và *Màu viền* riêng.
- Giao diện kiểu ZBrush: mỗi hiệu ứng một palette, công tắc ở thanh tiêu đề tắt hiệu ứng (giữ mức cũ để bật lại). Thanh trượt: kéo bất kỳ chỗ nào (giá trị nhảy theo chuột), Shift + kéo để chỉnh mịn, bấm đúp để gõ số, ←/→ khi đang chọn thanh. Bóng đổ có quả cầu đèn: kéo đốm sáng (giữa = đèn chiếu thẳng xuống, sát mép = đèn thấp, bóng dài).
- Xuất ảnh ở DPI cao với AO / bóng đổ cần card đồ hoạ; các bước được vẽ và đọc về theo từng ô 1024 px.

### Body của từng Sheet (luôn theo mô hình 3D)
- Sheet luôn vẽ **đúng các body hiện có trong mô hình 3D, ở trạng thái mới nhất**: sửa hình, di chuyển, thêm hay xoá body trong 3D Workspace thì quay lại Drawing là thấy ngay — không cần bấm Cập nhật, không có body "mất" hay "thay thế". Body bị xoá trong 3D tự biến khỏi mọi Sheet; body mới tự có trong mọi Sheet.
- Bên phải, Drawing Tree → Sheet đang mở → **Body của Sheet**: liệt kê mọi body của mô hình; **◉ / ◌** ẩn / hiện body trong riêng Sheet đó. Chuột phải body: Ẩn / Hiện trong Sheet này, Chỉ hiện body này, Hiện mọi body.
- Trong vùng 3D: chọn body → chuột phải → **Tạo Drawing Sheet**: mở Drawing Workspace, tạo Sheet chỉ hiện các body đó (các body khác ẩn trong Sheet).
- Body được nhận bằng **ID bền** (lưu trong file .mrtl), không theo tên: đổi tên body vẫn giữ liên kết.
- Bản vẽ lưu từ bản cũ (có cột Source Bodies / danh sách body riêng): body nằm ngoài danh sách được chuyển thành body ẩn của Sheet; hình cũ và trạng thái Cập nhật không còn dùng.

### View độc lập
- Bấm một view trên bản vẽ để chọn (viền cam), **Delete** để xoá riêng view đó; các view khác giữ nguyên vị trí đã kéo. Chuột phải view: Xoá view, Về vị trí tự động.

### Dimension (ghi kích thước bằng cách chọn điểm)
- Tab 6 Views → **Dimension**: rê chuột lên view, điểm bắt (đầu cạnh nhìn thấy) hiện vòng cam; bấm điểm 1, bấm điểm 2 (cùng view), rồi bấm chỗ đặt đường kích thước: đặt phía trên/dưới → kích thước ngang, bên trái/phải → dọc, ở giữa → theo hướng 2 điểm. Tool vẫn bật để ghi tiếp; Esc để thôi.
- Mỗi đầu kích thước gắn với **đỉnh của body** (ID body + toạ độ trong body), giá trị tự tính lại khi hình thay đổi mà đỉnh vẫn còn. Đỉnh không còn → kích thước hiện **đỏ, "? mất tham chiếu"**, không bao giờ hiện như còn đúng; chuột phải → **Chọn lại điểm** hoặc Xoá. Bấm chọn kích thước rồi kéo để dời đường kích thước; Delete để xoá.

### Xuất PDF
- Nhóm **Xuất**: **PDF** (Sheet đang mở) và **PDF tất cả** (mọi Sheet, mỗi Sheet một trang, theo thứ tự Drawing Tree); cũng có trong menu chuột phải của Sheet / gốc bản vẽ. Trang PDF đúng khổ giấy.
- Nét cạnh, nét khuất, đường kích thước, mũi tên và chữ là **vector** (phóng to vẫn sắc); phần tô màu / bóng của view là ảnh nhúng theo DPI của Sheet. Chữ dùng font Helvetica của PDF; chữ có dấu tiếng Việt ngoài bảng mã của font đó (ư, ơ, ộ…) được in vào lớp ảnh ở độ phân giải đầy đủ.
- Mỗi Sheet có 2 bản vẽ (6 view / Exploded view) với thiết lập và vị trí riêng (xoay mô hình, chỗ các view / hình iso / linh kiện / ô tổng khối lượng, ghi chú).
- **Tỉ lệ**: Vừa khổ, 5:1 … 1:10 hoặc **Tùy chọn** — nhập a : b bất kỳ (ví dụ 3 : 2) hoặc kéo thanh trượt (1:100 … 100:1).
- **Xem trước nhẹ, zoom được**: lăn chuột trên bản vẽ để phóng to / thu nhỏ quanh con trỏ (hoặc thanh kéo % trên đầu cửa sổ xem trước); giữ chuột giữa (hoặc Space + kéo) để dời — kéo chuột trái ở chỗ trống là quét chọn; bấm đúp chỗ trống hoặc nút ⤢ để vừa khung. Khi zoom chỉ vẽ lại hình sẵn có nên rất mượt; nét sắc hơn được dựng lại sau khi dừng lăn một chút.

## Bản vẽ 6 view
- Hình chiếu Trên / Trước / Trái / Phải / Sau / Dưới (tick chọn), xếp theo hình chiếu góc thứ ba, trục Z hướng lên. Lấy các body đang tick; không tick body nào thì lấy tất cả body đang hiện.
- **Sắp xếp bằng chuột trong bản xem trước**, luôn giữ đúng gióng hình chiếu: kéo view Trước thì cả bản vẽ đi theo; Trái / Phải / Sau chỉ trượt ngang (cùng độ cao với view Trước); Trên / Dưới chỉ trượt dọc (cùng cột với view Trước). "Xếp tự động" để căn các view cách đều nhau và cách đều viền, giữ nguyên cỡ.
- **Xoay**: ⟳ 90° / ⟲ 90° xoay mô hình quanh trục đứng (đổi mặt nào là mặt Trước), ⤵ 90° lật mô hình (đổi mặt Trên); các view luôn đồng bộ với nhau.
- **Màu**: Như 3D view (màu từng body), Một màu (chọn màu cho toàn bộ mô hình), Trắng (nét vẽ kỹ thuật). **Ánh sáng**: Studio (mượt — pháp tuyến làm mượt trong góc cạnh, 2 nguồn sáng + bóng loáng nhẹ) hoặc Như 3D view.
- Nét cạnh (cạnh B-rep, cạnh mesh gãy hơn "Góc", đường bao), nét khuất (nét đứt), kích thước bao ghi song song **mm và inch** (ví dụ `188.5 mm (7.42 in)`), hoặc chỉ mm / chỉ in; tên view; ghi tỉ lệ ở góc.
- **Độ sắc nét**: DPI 72–1200; khổ A4 / A3 / A2 / A1 ngang / dọc hoặc số pixel tùy chọn; tỉ lệ Vừa khổ hoặc cố định 5:1 … 1:10 (đúng kích thước thật khi in ở DPI đã chọn); độ dày nét theo mm (kèm inch); khử răng cưa 1×–4× (dựng ảnh lớn hơn rồi thu nhỏ); "B-rep mịn" chia lưới lại khối B-rep theo độ phân giải ảnh nên mặt cong tròn đều.
- Ô thông tin: khổ giấy (mm | in), số pixel, DPI, kích thước mô hình (mm | in), tỉ lệ, **dung lượng dự kiến** của file.
- Lưu PNG (nền trắng / trong suốt) hoặc JPG (chỉnh chất lượng); DPI được ghi vào file nên in ra đúng kích thước. "Chép ảnh" đưa ảnh PNG vào clipboard. Ảnh tối đa khoảng 150 triệu pixel.
- **Hình chiếu iso**: tick "Hình chiếu iso", chỉnh Góc xoay (quanh trục đứng) và Góc nghiêng (nhìn từ trên xuống); hình iso kéo được tới bất kỳ đâu trên bản vẽ. **Cỡ iso** (10–500 %) phóng to / thu nhỏ riêng hình iso; hoặc rê chuột lên hình iso rồi kéo ô vuông xanh ở góc dưới phải (tâm hình giữ nguyên).
- **Cỡ hình**: phóng to / thu nhỏ toàn bộ hình vẽ (20–300 %) khi tỉ lệ là Vừa khổ. **Cỡ chữ** (mm) và **Đậm** cho kích thước, tên view, tên linh kiện, ghi tỉ lệ.
- **Ghi chú chữ**: "+ Thêm chữ" đặt một dòng chữ và mở ô sửa; kéo để dời, bấm đúp để sửa (Shift+Enter xuống dòng), Delete để xoá; cỡ (mm), font, màu, đậm, nghiêng, gạch chân của ghi chú đang chọn chỉnh ở nhóm Ghi chú (tab Export); chuột phải lên ghi chú: **căn khung chữ theo khổ giấy** — trái / giữa / phải (đồng thời căn các dòng) và trên / giữa dọc / dưới (lề bằng lề dòng ghi tỉ lệ) —, đậm, nghiêng, gạch chân, sao chép / dán, sửa chữ, xoá. **Chọn nhiều ghi chú**: bấm chuột trái lần lượt lên từng ghi chú; bấm ra chỗ trống để bỏ chọn; kéo một ghi chú là dời cả nhóm; font / cỡ / màu / kiểu chữ, căn lề, Delete áp dụng cho cả nhóm. **Ctrl+C / Ctrl+V** chép / dán ghi chú đang chọn (mỗi lần dán lệch xuống phải một chút; dán được sang Sheet hoặc loại bản vẽ khác).

## Exploded view
- Chọn "Exploded view" ở đầu bảng Drawing: chế độ tách linh kiện, một hình iso cho từng body (Góc xoay / Góc nghiêng tùy ý), các body tách ra khỏi tâm cụm theo "Độ tách"; kéo từng linh kiện tới chỗ dễ nhìn. "Xếp tự động" đưa về vị trí tách mặc định.
- Dưới chân mỗi linh kiện: tên body và (tuỳ chọn) vật liệu · khối lượng (g, tính từ thể tích × khối lượng riêng).
- **Chọn linh kiện**: mỗi lần bấm thêm một linh kiện vào nhóm đang chọn (Ctrl+bấm để bỏ ra), bấm chỗ trống hoặc Esc để bỏ chọn hết; kéo chuột trái ở chỗ trống để quét chọn (trái → phải: nằm trọn trong khung, phải → trái: chạm khung). Kéo một linh kiện đang chọn thì cả nhóm đi theo. Dời tờ giấy: chuột giữa hoặc Space + kéo. Đang chọn nhiều linh kiện, bấm đúp lên một trong số đó để gán cùng một vật liệu cho cả nhóm (ô Vật liệu trên Ribbon cũng gán cho cả nhóm).
- **Xoay linh kiện** (tab Drawing, nhóm Xoay linh kiện): Xoay quanh trục đứng của màn hình, Nghiêng quanh trục ngang, Lăn trong mặt giấy (°), nút Xoay 90°, Lật 90°, Về hướng gốc; chỉ xoay các linh kiện đang chọn, quanh tâm của chúng, các linh kiện khác giữ hướng cả cụm. Lưu theo Sheet.
- Bấm đúp vào tên (hoặc hình) linh kiện để sửa tên và chọn vật liệu ngay trên bản vẽ; hoặc bấm chọn linh kiện rồi sửa ở dòng "Linh kiện" của bảng. Thay đổi ghi thẳng vào body: cây body, Properties (vật liệu, khối lượng) cập nhật theo; đổi tên / vật liệu trong cây body thì bản vẽ cũng tự cập nhật. Undo được.
- **Tổng khối lượng** (tick trong bảng): mỗi vật liệu một dòng, ví dụ `Tổng ABS 100 g` / `Tổng PVC mềm 120 g` (cộng tất cả linh kiện cùng tên vật liệu — mọi loại PVC gộp thành một dòng PVC; vật liệu Tùy chọn gom theo khối lượng riêng). Mặc định ở góc dưới bên phải bản vẽ, kéo để dời đi chỗ khác. Xếp tự động dàn linh kiện trên cả trang rồi đặt cụm này vào góc trống đầu tiên (dưới phải, dưới trái, trên phải, trên trái, giữa cạnh dưới / trên).
- **Combine**: chuột phải lên hình của một linh kiện → "Combine"; các body cùng khối lượng (lệch ≤ 0,5 %; body chưa có vật liệu thì so thể tích) sáng màu cam, bấm vào từng hình để gộp. Các body đã gộp chỉ còn một hình, tên có thêm `x2`, `x3`…; dòng vật liệu · khối lượng là của một chiếc; tổng khối lượng vẫn tính đủ. Esc, chuột phải hoặc bấm chỗ khác để thôi. Chuột phải lên hình đã gộp → "Tách ra". Nhóm gộp được lưu cùng phiên.
- Cùng các tùy chọn màu, ánh sáng, nét, khổ giấy, DPI, khử răng cưa, định dạng, ghi chú chữ như 6 view (nhưng là bộ thiết lập riêng).

## Vật liệu
- Có nhiều loại PVC (khối lượng riêng 1.20 / 1.25 / 1.30 / 1.35 / 1.40 g/cm³), tên đều ghi là PVC; danh sách chọn hiện khối lượng riêng trong ngoặc để phân biệt.

## Thanh công cụ chính
- Thanh công cụ ngang không có thanh cuộn: khi cửa sổ hẹp, các nhóm tự co lại theo từng bước (giảm khoảng cách, chữ nút lớn xuống 2 dòng, nút nhỏ chỉ còn icon, nút lớn chỉ còn icon — tên vẫn hiện khi rê chuột), cuối cùng mới thu nhỏ cả hàng cho vừa.

## Pattern (nhóm Feature)
- Một nút "Pattern" mở bảng Pattern, chọn kiểu Linear hoặc Circular ngay trong bảng. Áp dụng cho các body đang tick; màn 3D hiện bản xem trước trong suốt màu xanh.
- Linear: chọn hướng, số lượng và khoảng cách (thanh kéo + ô số).
- Circular: chọn trục, số lượng và tổng góc (360° = chia đều cả vòng; nhỏ hơn thì bản cuối nằm đúng ở tổng góc).
- Hướng / trục chọn tùy ý: trục X / Y / Z, một Line / Axis geometry, hoặc bấm nút mũi tên cạnh ô rồi bấm trên màn hình vào một cạnh thẳng (hướng của cạnh), một mặt phẳng (pháp tuyến của mặt) hoặc một mặt trụ (trục của mặt trụ). Esc để thôi chọn.
- "Đảo chiều" lật hướng / chiều quay. Khối solid B-rep được nhân bản vẫn là B-rep (xuất STEP được). "Gộp thành 1 body" nối bản gốc và các bản sao bằng Boolean union (kết quả là mesh). Lùi (Ctrl+Z) được.

## Mirror (nhóm Feature)
- Nút "Mirror" (dưới Pattern) mở bảng Mirror, áp dụng cho các body đang tick; màn 3D hiện bản xem trước trong suốt màu xanh.
- Mặt đối xứng: YZ (Right) / XZ (Front) / XY (Top) qua gốc, một Plane geometry đã tạo, hoặc bấm nút cạnh ô rồi bấm vào một mặt phẳng của body. "Dời mặt" dời mặt đối xứng theo pháp tuyến của nó.
- "Giữ bản gốc": tạo thêm body "<tên>_mirror"; bỏ tick thì đối xứng ngay body gốc. "Gộp thành một khối": nửa đối xứng nhập vào body gốc (dựng nửa chi tiết rồi đối xứng ra cả chi tiết).
- Khối solid B-rep giữ công thức gốc và thêm bước "mirror" (gộp thì là mirror + union bằng lõi B-rep): vẫn là B-rep, dùng tiếp Fillet / Shell..., xuất STEP được, sửa sketch gốc thì phần đối xứng dựng lại theo. Mesh và khối mở từ STEP: lưới được đối xứng và đảo chiều tam giác (mặt ngoài vẫn là mặt ngoài); gộp thì dùng Boolean union (kết quả là mesh).

## Remove face (nhóm Synchronous Modeling)
- Mở bảng Remove face, chọn mặt giống Surface Recognition: bấm vào mặt (app tự loang theo vùng trơn, dừng ở cạnh gãy; Shift thêm, Ctrl bỏ) hoặc dùng bút bôi; mặt chọn tô đỏ. Bấm "Xoá mặt".
- Body mesh: xoá các tam giác đã chọn rồi vá kín lỗ, "Kiểu vá" Phẳng (hợp với lỗ xuyên, mặt phẳng) hoặc Theo mặt xung quanh (uốn theo bề mặt). Ví dụ xoá 4 vách của một lỗ vuông xuyên tấm → tấm đặc kín.
- Khối solid B-rep: lõi B-rep xoá mặt rồi kéo dài các mặt phẳng kề để vá (lỗ, boss, fillet, chamfer trên chi tiết vuông vức) — giữ nguyên B-rep, vẫn xuất STEP. Khi mặt kề là mặt cong (ví dụ mặt đầu của trụ) lõi không vá được: khối được vá trên mesh và chuyển thành mesh, app báo rõ.

## Replace face (nhóm Synchronous Modeling)
- "Mặt cần thay" nhận cả mặt phẳng và mặt cong (chamfer, fillet, mặt bo bất kỳ); "Mặt đích" là một mặt phẳng.
- Mặt cong được làm phẳng nằm lên mặt đích: đỉnh nằm trên mặt phẳng kề trượt trong mặt đó, đỉnh nằm trên mặt trụ kề trượt dọc trục trụ. Ví dụ: chamfer ở đầu trụ + mặt đích là mặt đầu → trụ thẳng, hết chamfer. Offset dời mặt đích ra / vào.

## Boolean
- Khi đưa body vào ô của lệnh Boolean, body đó sáng lên: ô Tools màu đỏ, ô Targets màu xanh (ô trong bảng có ô màu tương ứng).

## Reverse Design: Basic Surface Recognition
- Nhóm "Reverse Design" trên ribbon → nút "Surface Recognition" mở bảng Basic Surface Recognition (giống CATIA). Khi bảng mở, chuột trái dùng để chọn mesh (xoay / kéo màn hình bằng chuột phải / giữa như thường).
- Chọn mesh — các tam giác được chọn tô đỏ:
  - Bấm chọn (tự nhận): bấm vào mesh, app tự loang ra cả vùng trơn liền nhau và dừng ở cạnh gãy ("Góc nhận vùng", mặc định 15°). Bấm lại vùng đã chọn hoặc Ctrl+bấm để bỏ; Shift+bấm để thêm.
  - Bút bôi: giữ chuột trái bôi lên mesh; "Cỡ bút" tính bằng pixel màn hình nên vòng bút giữ nguyên cỡ khi zoom. Vòng bút chạm vào tam giác nào là chọn tam giác đó (kể cả tam giác to hơn vòng bút). Ctrl+bôi để xóa. Chỉ chọn mặt đang quay về phía người nhìn, không xuyên ra mặt sau.
  - "Bỏ chọn" xóa vùng chọn.
- Kiểu mặt: Plane, Sphere, Cylinder, Cone hoặc Tự động (app thử cả 4, chọn mặt khớp nhất mà pháp tuyến các tam giác cũng khớp). "Bán kính =" cố định bán kính cho Sphere / Cylinder.
- Khung kết quả cho thông số mặt (bán kính, trục, nửa góc cone...), sai lệch RMS / lớn nhất và độ lệch pháp tuyến; chuyển vàng khi vượt "Sai lệch tối đa". Màn 3D vẽ nét xem trước của mặt (xanh) và trục (tím).
- Tạo:
  - Cylinder / Cone / Sphere → khối solid B-rep chính xác (xuất được STEP solid, boolean, fillet...) dài đúng bằng vùng đã chọn; kèm trục (Cylinder, Cone), tâm (Sphere) và đỉnh nón (Cone) dạng geometry nếu tick "Trục / tâm".
  - Plane → Plane geometry (cỡ bằng vùng đã chọn).
  - Bỏ tick "Tạo solid B-rep" nếu chỉ cần geometry. Lùi (Ctrl+Z) được.

## Bàn in SLA
- Nhóm "Bàn in" trên ribbon: nút "SLA control panel" mở bảng điều khiển; nút "SLA table" (sáng lên khi bật) hiện khung bàn in trong suốt (viền, lưới 50 mm, lề, tâm, dao gạt) ngay cả khi bảng đóng.
- Bảng SLA nổi trên màn hình 3D, mặc định nằm sát bên trái; kéo thanh tiêu đề để dời, bấm đúp thanh tiêu đề để đưa về chỗ cũ.
- Mọi chức năng trong bảng SLA (xoay tối ưu, dàn đều, nâng, khối chắn) chỉ áp dụng cho các body đang được chọn (tick); các body khác giữ nguyên.
- Bàn in mặc định 400 × 400 mm, gốc bàn trùng gốc tọa độ, mặt in là mặt XY phía X, Y dương; dao gạt nằm dọc trục X và chạy theo chiều Y.
- Xoay tối ưu: tìm hộp bao sát nhất của từng body; cạnh dài nhất dựng đứng theo Z (vật in cao nhất), cạnh trung bình theo Y (chiều dao chạy), cạnh mỏng nhất theo X (dọc lưỡi dao) để mỗi lớp dao chỉ chạm một bề rộng nhỏ nhất, gần như vuông góc 90°. Đầu có nhiều diện tích bề mặt hơn được quay xuống phía bàn.
- Xoay nghiêng (tick, 10–45°): sau khi dựng đứng, nghiêng thêm quanh trục X, đỉnh part ngả về phía +Y; bề mỏng theo X giữ nguyên.
- Mọi body được nâng để điểm thấp nhất cao hơn mặt bàn đúng "Nâng khỏi bàn" (mặc định 5 mm). Nút "Nâng body đang chọn" chỉ đặt lại độ cao Z cho các body đang tick theo số này.
- Dàn đều: part nhỏ ở góc khối gần gốc tọa độ, càng xa càng to; xếp kín một hàng dọc theo X rồi mới sang hàng tiếp theo (theo +Y); các part to như nhau giữ chung một hàng. Cả khối part luôn được đặt giữa tâm bàn. Thanh "Độ dàn đều": 0 % = khe nhỏ nhất ("Khe tối thiểu"), 100 % = khe lớn nhất mà vẫn vừa bàn (chừa "Lề mép bàn" và chỗ cho khối chắn); kéo thanh là thấy ngay. Không đủ chỗ thì app báo và xếp sát nhất có thể.
- Khối chắn 2 đầu (tick, mặc định 20 × 20 × 2 mm): tự tạo 2 tấm SLA_guard_1 / SLA_guard_2 ở hai góc chéo của bàn, luôn nằm ngoài cùng theo chiều dao gạt (một tấm trước tất cả part, một tấm sau tất cả part), cách part ngoài cùng "Cách part ngoài cùng" (mặc định 30 mm, có thanh kéo). Tấm dày 2 mm được nâng lên để mặt trên ngang với part cao nhất. Mỗi lần dàn lại, nâng hoặc đổi khoảng cách, 2 tấm tự cập nhật; bỏ tick thì xóa.
- Mỗi thao tác đều Lùi (Ctrl+Z) được.
