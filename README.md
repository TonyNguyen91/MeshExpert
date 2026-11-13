# MrT MeshExpert

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
- Ràng buộc: Kích thước (dài, ngang, dọc, điểm–đường, góc, bán kính, đường kính), Trùng, Đồng tâm, Song song, Vuông góc, Tiếp tuyến, Ngang, Dọc, Bằng, Trung điểm, Đối xứng, Cố định. Khi vẽ, app tự thêm ngang / dọc / trùng điểm / điểm trên nét / trung điểm.
- Nét xanh = còn bậc tự do, nét trắng = đã ràng buộc đủ. Kéo điểm / nét để di chuyển phần còn tự do; nhấp đúp kích thước để sửa số. Ràng buộc xung đột hoặc thừa bị từ chối.
- Sketch xong nằm trong "Danh sách sketch" bên trái: ẩn / hiện (Y), sửa (nhấp đúp), đổi tên, xóa. Sửa sketch thì các khối tạo từ nó tự dựng lại.

## Khối solid, lệnh solid và Boolean
- "Extrude" / "Revolve": chọn sketch trong hộp thoại (hoặc bấm sketch trên màn hình), bấm từng biên dạng để bỏ / lấy lại, New / Add / Remove / Intersect, xem trước bằng khối mờ.
- Lệnh solid trên thanh trên cùng: Fillet, Chamfer (cạnh, có lấy cạnh nối tiếp tuyến), Move face (mặt phẳng / mặt trụ), Replace face, Shell, Draft. Có xem trước. Với khối ◆ các lệnh được lưu thành lịch sử và áp lại khi sửa sketch / thông số khối (cạnh / mặt được tìm lại theo vị trí; lệnh nào không tìm lại được thì bị bỏ và app báo).
- "Boolean" trên thanh trên cùng: Union / Intersect dùng ô Tools; Subtract có 2 ô Tools và Targets riêng. Chạy bằng thư viện Manifold, chỉ trên lưới kín.
- ⚙ (góc phải trên): đặt phím tắt cho Move, Rotate, Scale, Sketch, Extrude, Revolve, Boolean, các lệnh solid và ẩn / hiện (mặc định Y).
- Lõi B-rep (khối chính xác): khối dựng từ sketch (Extrude / Revolve không draft, không bo / vát / vỏ trong hộp thoại) và các lệnh Fillet, Chamfer, Shell, Move face, Draft được dựng bằng lõi B-rep nhúng trong file (solidcore / SolidCraft kernel, Apache-2.0 / MIT, xem `src/LICENSES-BREP.txt`). Mặt cong, fillet, lỗ tròn là hình học chính xác; lưới hiển thị chia với dung sai 0,02 mm.
- "STEP (solid)" trong nhóm Xuất file: tải các khối solid đang tick thành file STEP (mở được bằng CATIA, NX, Onshape...). Body chỉ là lưới (STL nhập vào, sau Boolean, hoặc có Replace face) không xuất STEP được.
- Lệnh nào lõi B-rep không làm được (ví dụ Move face mặt trên đang tiếp xúc fillet, Replace face) thì app tự dựng lại khối bằng cách cũ trên lưới, như trước khi có B-rep.
- Lõi B-rep nạp lần đầu mất khoảng 1–2 giây (khi mở Extrude / Revolve hoặc một lệnh solid). File index.html nặng khoảng 10,7 MB vì có lõi này.
- Mã nguồn lớp bọc lõi B-rep ở thư mục `brep/` (cách biên dịch lại xem `brep/README.md`).
