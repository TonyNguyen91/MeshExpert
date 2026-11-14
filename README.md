# MeshExpert

Công cụ chỉnh sửa mesh STL/OBJ chạy offline trong trình duyệt. Mở trực tiếp `index.html` (Chrome/Edge), không cần cài đặt.

App chạy hoàn toàn trên máy, không kết nối internet hay mạng nội bộ: mọi thư viện đều nằm sẵn trong `index.html`, và chính sách bảo mật (Content-Security-Policy) trong file chặn mọi kết nối mạng.

## Cấu trúc
- `index.html` — file ứng dụng hoàn chỉnh (bản phát hành).
- `src/head.html` — giao diện (HTML/CSS).
- `src/core_base.js`, `src/core_extra.js` — lõi xử lý mesh (đọc/ghi, decimate, tách body, undercut, va chạm, đo, ICP...).
- `src/core_sketch.js` — mô hình sketch tham số (điểm dùng chung, ràng buộc, kích thước) và bộ giải ràng buộc.
- `src/core_dress.js` — hình học cho các lệnh solid: dao cắt fillet / chamfer, dời / thay mặt, shell.
- `src/app2.js` — logic giao diện và thao tác.
- `src/model.js` — môi trường sketch và danh sách sketch; `src/feat.js` — Extrude / Revolve, Boolean, các lệnh solid, phím tắt. Cả hai được chèn vào `app2.js` khi build.
- `src/manifold_embed.js` — thư viện Manifold 3.5.4 (Apache 2.0, xem `src/MANIFOLD_LICENSE.txt`) nhúng sẵn, dùng cho Boolean.
- `src/build.py` — ghép các file trên thành `index.html`: `python3 src/build.py`.
- `src/test_core.js`, `src/test_cmp.js`, `src/test_split.js`, `src/test_repair.js`, `src/test_solid.js`, `src/test_sketch.js`, `src/test_dress.js` — kiểm thử lõi bằng Node.js (chạy `build.py` trước).
- `tests/ui*.py` — kiểm thử giao diện tự động bằng Playwright + Chrome.
- `tests/make_split_meshes.js` — tạo các file STL mẫu cho `tests/ui5.py`, `tests/ui6.py`, `tests/ui7.py`.

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
- "Extrude" / "Revolve": chọn sketch trong hộp thoại (hoặc bấm sketch trên màn hình), bấm từng biên dạng để bỏ / lấy lại, New / Add / Remove / Intersect, xem trước bằng khối mờ.
- Lệnh solid trên thanh trên cùng: Fillet, Chamfer (cạnh, có lấy cạnh nối tiếp tuyến), Move face (mặt phẳng / mặt trụ), Replace face, Shell, Draft. Có xem trước. Với khối ◆ các lệnh được lưu thành lịch sử và áp lại khi sửa sketch / thông số khối (cạnh / mặt được tìm lại theo vị trí; lệnh nào không tìm lại được thì bị bỏ và app báo).
- "Boolean" trên thanh trên cùng: Union / Intersect dùng ô Tools; Subtract có 2 ô Tools và Targets riêng. Chạy bằng thư viện Manifold, chỉ trên lưới kín.
- ⚙ (góc phải trên): đặt phím tắt cho Move, Rotate, Scale, Sketch, Extrude, Revolve, Boolean, các lệnh solid và ẩn / hiện (mặc định Y).
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

## Phiên làm việc (.mrtl)
- Các nút trên cùng có biểu tượng: Phiên mới, Mở file / phiên, Lưu phiên, Lưu thành…, Xóa hết, Lùi, Tiến, Vị trí lúc import. Tên file phiên đang mở hiện ngay cạnh nút lưu.
- Phiên mới: xóa sạch và bắt đầu phiên chưa có tên.
- Lưu phiên (Ctrl+S): lần đầu hỏi tên file; các lần sau (hoặc sau khi mở một file .mrtl bằng nút Mở hay kéo thả) thì ghi đè thẳng vào file đó, không hỏi lại.
- Lưu thành… (Ctrl+Shift+S): luôn hỏi tên file mới, từ đó Lưu phiên ghi vào file mới này.
- Trình duyệt quá cũ không ghi đè được file thì app tải file xuống như trước.

## Danh sách body và hiển thị
- Danh sách body có thanh cuộn ngang; kéo mép phải của tiêu đề cột (Tên, Tam giác, K.lượng) để nới rộng / thu hẹp, bấm đúp mép để về độ rộng mặc định. Độ rộng được nhớ cho lần sau.
- Nút Edges (cạnh lưới) trong nhóm Hiển thị mặc định tắt.

## Undercut: góc draft dưới con trỏ
- Sau khi bấm "Phân tích" trong Tooling analysis (undercut), rê chuột lên body đã phân tích sẽ hiện nhãn góc draft của mặt dưới con trỏ (so với hướng mở khuôn), cho biết mặt thoát về phía + hay −, và cảnh báo vàng khi nhỏ hơn "Góc thoát khuôn tối thiểu". Xóa màu phân tích thì nhãn tắt.

## Bàn in SLA
- Nhóm "Bàn in" trên ribbon: nút "SLA control panel" mở bảng điều khiển; nút "SLA table" (sáng lên khi bật) hiện khung bàn in trong suốt (viền, lưới 50 mm, lề, tâm, dao gạt) ngay cả khi bảng đóng.
- Bảng SLA nổi trên màn hình 3D, mặc định nằm sát bên trái; kéo thanh tiêu đề để dời, bấm đúp thanh tiêu đề để đưa về chỗ cũ.
- Bàn in mặc định 400 × 400 mm, gốc bàn trùng gốc tọa độ, mặt in là mặt XY phía X, Y dương; dao gạt nằm dọc trục X và chạy theo chiều Y.
- Xoay tối ưu: tìm hộp bao sát nhất của từng body; cạnh dài nhất dựng đứng theo Z (vật in cao nhất), cạnh trung bình theo Y (chiều dao chạy), cạnh mỏng nhất theo X (dọc lưỡi dao) để mỗi lớp dao chỉ chạm một bề rộng nhỏ nhất, gần như vuông góc 90°. Đầu có nhiều diện tích bề mặt hơn được quay xuống phía bàn.
- Xoay nghiêng (tick, 10–45°): sau khi dựng đứng, nghiêng thêm quanh trục X, đỉnh part ngả về phía +Y; bề mỏng theo X giữ nguyên.
- Mọi body được nâng để điểm thấp nhất cao hơn mặt bàn đúng "Nâng khỏi bàn" (mặc định 5 mm). Nút "Nâng body đang chọn" chỉ đặt lại độ cao Z cho các body đang tick theo số này.
- Dàn đều: part nhỏ ở góc khối gần gốc tọa độ, càng xa càng to; xếp kín một hàng dọc theo X rồi mới sang hàng tiếp theo (theo +Y); các part to như nhau giữ chung một hàng. Cả khối part luôn được đặt giữa tâm bàn. Thanh "Độ dàn đều": 0 % = khe nhỏ nhất ("Khe tối thiểu"), 100 % = khe lớn nhất mà vẫn vừa bàn (chừa "Lề mép bàn" và chỗ cho khối chắn); kéo thanh là thấy ngay. Không đủ chỗ thì app báo và xếp sát nhất có thể.
- Khối chắn 2 đầu (tick, mặc định 20 × 20 × 2 mm): tự tạo 2 tấm SLA_guard_1 / SLA_guard_2 ở hai góc chéo của bàn, luôn nằm ngoài cùng theo chiều dao gạt (một tấm trước tất cả part, một tấm sau tất cả part), cách part ngoài cùng "Cách part ngoài cùng" (mặc định 30 mm, có thanh kéo). Tấm dày 2 mm được nâng lên để mặt trên ngang với part cao nhất. Mỗi lần dàn lại, nâng hoặc đổi khoảng cách, 2 tấm tự cập nhật; bỏ tick thì xóa.
- Mỗi thao tác đều Lùi (Ctrl+Z) được.
